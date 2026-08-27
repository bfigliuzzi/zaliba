import type { BuildingTypeId } from '@zaliba/catalogs'
import type { Catalogs } from './catalogs.js'
import { evaluateCurve } from './curves.js'
import { applyEnergyRatio, type EnergyRatio } from './energy.js'

/**
 * **La décomposition d'une production en ses facteurs** (FR-053, US8-1).
 *
 * L'exigence est plus forte qu'elle n'en a l'air : « toute production affichée MUST
 * être décomposable en ses facteurs, **dont le produit redonne la valeur
 * affichée** ». Une décomposition approximative ne vaudrait rien — elle donnerait au
 * joueur un calcul qui *presque* tombe juste, ce qui est pire que pas de calcul du
 * tout : il croirait s'être trompé.
 *
 * **Toute la difficulté est dans les troncatures.** Il y en a exactement deux, et
 * elles ne sont pas au même endroit :
 *
 * ```
 * parGisement = ⌊base × num^(n−1) ÷ den^(n−1)⌋     ← une seule troncature (R19)
 * nominal     = parGisement × gisements             ← exacte, aucun arrondi
 * effectif    = ⌊nominal × E₊ ÷ E₋⌋                 ← une seule troncature (R5)
 * ```
 *
 * Publier « base × facteur de niveau × gisements × rapport » sans dire *où* tombent
 * les deux planchers donnerait un produit faux d'une unité une fois sur deux. Cette
 * décomposition publie donc les valeurs intermédiaires **déjà tronquées** — et c'est
 * précisément ce qui la rend refaisable à la main.
 *
 * **Ce fichier ne recalcule rien de neuf.** Il nomme les étapes d'un calcul qui vit
 * dans `rates.ts` et `energy.ts`, et il les nomme *sans les réimplémenter* : le
 * plancher du niveau vient d'`evaluateCurve`, celui du rapport d'`applyEnergyRatio`.
 * Une seconde implémentation « pour l'affichage » finirait par arrondir autrement, et
 * la page de règles publierait alors une formule que le jeu ne suit pas — ce qui est
 * exactement l'inverse de ce qu'US8 promet.
 */

/** Le facteur de niveau, en **fraction entière** — jamais un flottant (R19). */
export interface LevelFactor {
  readonly num: number
  readonly den: number
  /** `niveau − 1`. Zéro au niveau 1, où le facteur est neutre. */
  readonly exponent: number
}

export interface ProductionBreakdown {
  readonly typeId: BuildingTypeId
  readonly level: number
  /** La production au niveau 1, **par gisement recouvert**. */
  readonly base: number
  readonly levelFactor: LevelFactor
  /**
   * La production par gisement au niveau demandé, **déjà tronquée**.
   *
   * Publiée en tant que valeur et pas seulement en tant que fraction : un joueur qui
   * multiplierait `base × (11/10)^4` obtiendrait 21,96 là où le jeu compte 21. Le
   * plancher tombe *avant* la multiplication par les gisements, et le taire donnerait
   * un produit faux dès deux gisements.
   *
   * Elle reste publiée même quand aucun gisement n'est recouvert : c'est elle qui dit
   * au joueur ce qu'il gagnerait à déplacer son extracteur.
   */
  readonly perDeposit: number
  readonly coveredDeposits: number
  /** `perDeposit × coveredDeposits` — exact, aucun arrondi (I-13). */
  readonly nominal: number
  readonly ratio: EnergyRatio
  /** `⌊nominal × E₊ ÷ E₋⌋` — le chiffre que l'écran affiche. */
  readonly effective: number
}

/**
 * La décomposition de la production d'un type à un niveau, sous un rapport.
 *
 * `null` pour un type qui n'extrait rien. Rendre une décomposition à zéro pour une
 * centrale ferait chercher au joueur une production qui n'existe pas — et lui
 * laisserait croire qu'un gisement sous sa centrale la ferait produire.
 *
 * La fonction est **pure** et ne prend aucun instantané : elle décrit une règle du
 * catalogue, pas l'état d'une planète. C'est ce qui permet à la page de règles de
 * publier la table complète des niveaux sans qu'aucune planète n'existe.
 */
export function productionBreakdown(
  typeId: BuildingTypeId,
  level: number,
  coveredDeposits: number,
  ratio: EnergyRatio,
  catalogs: Catalogs,
): ProductionBreakdown | null {
  const curve = catalogs.buildings[typeId]?.production ?? null
  if (curve === null) return null

  // La courbe de production est géométrique pour les trois extracteurs. Les autres
  // formes n'ont pas de facteur de niveau à publier : leur valeur *est* le facteur,
  // et la fraction neutre le dit sans mentir.
  const levelFactor: LevelFactor =
    curve.kind === 'geometric'
      ? { num: curve.num, den: curve.den, exponent: level - 1 }
      : { num: 1, den: 1, exponent: 0 }

  const base = evaluateCurve(curve, 1)
  // Le plancher du niveau vient d'`evaluateCurve`, jamais d'un calcul refait ici.
  const perDeposit = evaluateCurve(curve, level)
  const nominal = perDeposit * coveredDeposits
  // Et celui du rapport d'`applyEnergyRatio`, pour la même raison.
  const effective = applyEnergyRatio(nominal, ratio)

  return {
    typeId,
    level,
    base,
    levelFactor,
    perDeposit,
    coveredDeposits,
    nominal,
    ratio,
    effective,
  }
}

/**
 * Refait le calcul **depuis les seuls facteurs publiés**, comme un joueur le ferait
 * avec un papier et un crayon.
 *
 * C'est la fonction qui donne son sens à FR-053, et c'est pourquoi elle n'appelle
 * ni `evaluateCurve` ni le catalogue : elle n'a droit qu'à ce que la page de règles
 * montre. Si elle devait consulter le catalogue pour tomber juste, c'est que la
 * décomposition ne suffisait pas — et le test qui l'emploie ne prouverait rien.
 *
 * L'exponentiation passe par `bigint`, comme dans `curves.ts` : `3^29` dépasse déjà
 * soixante-huit millions de milliards, et un `number` y perdrait des bits de poids
 * faible — donc des unités de ressource, silencieusement.
 */
export function recomposeBreakdown(breakdown: ProductionBreakdown): number {
  const { base, levelFactor, coveredDeposits, ratio } = breakdown

  // Étape 1 : le facteur de niveau, une seule troncature. Élever puis diviser,
  // jamais diviser puis élever — l'ordre est celui de la formule publiée.
  const exponent = BigInt(levelFactor.exponent)
  const perDeposit = Number(
    (BigInt(base) * BigInt(levelFactor.num) ** exponent) / BigInt(levelFactor.den) ** exponent,
  )

  // Étape 2 : les gisements, exactement.
  const nominal = perDeposit * coveredDeposits

  // Étape 3 : le rapport, une seule troncature, sur le taux total.
  if (ratio.numerator >= ratio.denominator) return nominal
  return Math.floor((nominal * ratio.numerator) / ratio.denominator)
}
