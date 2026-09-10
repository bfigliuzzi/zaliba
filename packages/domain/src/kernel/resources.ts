import { GRAINS_PER_UNIT } from '@zaliba/catalogs'
import { type Instant, instant } from './time.js'

/**
 * Les grandeurs de ressource (R1, R4).
 *
 * Une quantité est un **entier de grains**, où `1 grain = 1/3600 unité`. Un
 * taux est un **entier d'unités par heure**. Le choix du diviseur n'est pas
 * arbitraire : il fait tomber la division. Le gain sur `s` secondes vaut
 * `taux × s` grains — un entier, toujours, sans reste à arrondir.
 *
 * C'est de là que vient l'**additivité**, qui est la propriété la plus
 * importante du modèle de temps : consolider deux fois donne exactement le même
 * résultat que consolider une fois. Sans elle, la fortune d'un joueur
 * dépendrait du nombre de fois où il a ouvert le jeu, ce qui est un exploit ou
 * une injustice selon le sens de l'arrondi.
 */

declare const grainsBrand: unique symbol
declare const rateBrand: unique symbol

/** Une quantité, en sous-unités de 1/3600 d'unité. */
export type Grains = number & { readonly [grainsBrand]: true }

/**
 * Un taux de production, en unités par heure — soit, numériquement, un **grain
 * par seconde** : `GRAINS_PER_UNIT = 3600` fait tomber la division (R1).
 *
 * **Ce type n'a pas changé avec 003, et c'est voulu.** Le catalogue déclare
 * désormais ses productions en **grains par gong**, mais un catalogue déclaré
 * n'atteint jamais ce fichier : `resolveCatalogs` divise par la longueur du gong
 * et ne produit que des entiers de grains par seconde — une longueur qui ne le
 * permettrait pas refuse le démarrage. Ce que la projection multiplie par des
 * secondes est donc exactement ce qu'il a toujours été.
 *
 * Renommer ce type aurait suivi le catalogue au lieu de suivre l'arithmétique,
 * et aurait rouvert `projection.ts` pour un changement de mot.
 */
export type RatePerHour = number & { readonly [rateBrand]: true }

/**
 * Le nombre de grains dans une unité.
 *
 * Sa valeur est aussi le nombre de secondes dans une heure, et ce n'est pas une
 * coïncidence : c'est précisément ce qui fait qu'un taux d'une unité par heure
 * produit exactement un grain par seconde.
 *
 * La constante est **détenue par `catalogs`** et réexportée ici. C'est le sens
 * de la dépendance qui l'impose : `catalogs` est la feuille du graphe et ne
 * peut rien importer, alors que toutes ses quantités sont libellées en grains.
 * La redéclarer des deux côtés créerait deux vérités à tenir d'accord — et le
 * jour où elles divergeraient, le catalogue et la projection compteraient dans
 * des unités différentes sans qu'aucune compilation ne s'en aperçoive.
 */
export { GRAINS_PER_UNIT }

/** @throws RangeError si la valeur n'est pas un entier ≥ 0. */
export function grains(value: number): Grains {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Quantité invalide : ${value}. Une quantité est un entier de grains ≥ 0.`)
  }
  return value as Grains
}

/** @throws RangeError si la valeur n'est pas un entier ≥ 0. */
export function ratePerHour(value: number): RatePerHour {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Taux invalide : ${value}. Un taux est un entier d'unités par heure ≥ 0.`)
  }
  return value as RatePerHour
}

/**
 * Le gain brut sur `seconds` secondes, en grains.
 *
 * Aucune division, aucun arrondi : c'est tout l'intérêt du grain.
 */
export function gainOver(rate: RatePerHour, seconds: number): number {
  return rate * seconds
}

/** La partie entière d'unités qu'une quantité représente — ce que le joueur voit. */
export function toDisplayUnits(amount: Grains): number {
  return Math.floor(amount / GRAINS_PER_UNIT)
}

export interface SegmentInput {
  /** L'instant d'ouverture du segment. C'est lui qui date la saturation. */
  readonly from: Instant
  readonly amount: Grains
  readonly lost: Grains
  /**
   * L'instant d'entrée en saturation **reporté du segment précédent**, ou `null`.
   *
   * Il n'est retenu que si la ressource était déjà saturée à l'ouverture du
   * segment. Sinon il est périmé — une dépense l'a fait redescendre — et le
   * laisser courir daterait la saturation d'avant cette dépense.
   */
  readonly saturatedSince: Instant | null
  readonly rate: RatePerHour
  readonly seconds: number
  readonly cap: Grains
}

export interface SegmentResult {
  readonly amount: number
  readonly lost: number
  /** `null` si la ressource n'est pas saturée à la fermeture du segment. */
  readonly saturatedSince: Instant | null
}

/**
 * Fait avancer une ressource d'un segment, plafond compris (R4) :
 *
 * ```
 * brut    = q₀ + r × s
 * q       = min(brut, P)
 * perdu  += max(0, brut − P)
 * depuis  = q₀ ≥ P ? report ?? t₀ : (brut ≥ P ? t₀ + ⌈(P − q₀) ÷ r⌉ : null)
 * ```
 *
 * **Le cumul de la perte est ce qui rend l'opération additive.** Le
 * plafonnement seul ne l'est pas : deux segments successifs plafonnés
 * donneraient la même quantité qu'un segment unique, mais on aurait perdu la
 * trace de ce qui a débordé. En cumulant, la somme des pertes de deux segments
 * vaut exactement la perte du segment unique équivalent.
 *
 * **L'instant d'entrée en saturation obéit à la même logique, et pour la même
 * raison** (US1/AC5). Il ne se déduit ni de la quantité — au plafond, elle ne
 * dit plus depuis quand — ni de la perte : `perdu ÷ taux` serait faux dès que le
 * taux a changé depuis, ce qu'une pose ou une bascule en déficit d'énergie
 * suffisent à provoquer. Il faut donc le **reporter**, et c'est ce report qui
 * fait de l'état complet `(quantité, perte, saturée depuis)` une fonction du
 * seul temps écoulé.
 */
export function advanceSegment({
  from,
  amount,
  lost,
  saturatedSince,
  rate,
  seconds,
  cap,
}: SegmentInput): SegmentResult {
  const raw = amount + gainOver(rate, seconds)

  // Déjà saturée à l'ouverture : on garde la date reportée. Son absence — une
  // planète fondée le réservoir plein, un instantané antérieur à cette
  // grandeur — se répare en datant de l'ouverture, qui est la borne la plus
  // récente dont on puisse répondre.
  const carried = amount >= cap ? (saturatedSince ?? from) : null

  return {
    amount: Math.min(raw, cap),
    lost: lost + Math.max(0, raw - cap),
    saturatedSince: raw < cap ? null : (carried ?? saturationAt(from, amount, cap, rate)),
  }
}

/**
 * L'instant où la ressource atteindra son plafond au rythme courant (FR-027) :
 * `t₀ + ⌈(P − q₀) ÷ r⌉`.
 *
 * Retourne `null` quand la saturation n'arrivera pas — taux nul, ou plafond
 * déjà atteint. Ce `null` est une **information utile, pas un cas d'erreur** :
 * il dit au joueur soit qu'il ne produit rien, soit qu'il perd déjà.
 *
 * L'arrondi va vers le haut parce que la saturation survient à la seconde où
 * elle est atteinte, pas à celle qui la précède.
 */
export function saturationAt(
  from: Instant,
  amount: Grains,
  cap: Grains,
  rate: RatePerHour,
): Instant | null {
  if (rate === 0 || amount >= cap) {
    return null
  }
  return instant(from + Math.ceil((cap - amount) / rate))
}
