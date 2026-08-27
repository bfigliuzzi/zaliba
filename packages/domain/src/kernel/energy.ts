import type { BuildingTypeId } from '@zaliba/catalogs'
import type { Catalogs } from './catalogs.js'
import { layoutOf } from './catalogs.js'
import { evaluateCurve } from './curves.js'
import type { BuildingId } from './effects.js'
import type { PlanetSnapshot } from './snapshot.js'

/**
 * L'énergie : une grandeur **instantanée**, ni stockée ni accumulée (FR-021).
 *
 * Elle ne figure donc dans aucun instantané, ne se consolide pas et ne se
 * plafonne pas. Elle se recalcule à chaque projection depuis les seuls bâtiments
 * posés — même discipline que les taux, et pour la même raison : une valeur
 * dérivable et stockée devient fausse au premier rééquilibrage, et fausse en
 * silence.
 *
 * Toute la mécanique tient en trois lignes, et c'est une exigence — SC-002
 * promet au joueur de pouvoir refaire n'importe quel chiffre affiché :
 *
 * ```
 * E₊      = énergie de base du Berceau + Σ centrales
 * E₋      = Σ tous les autres bâtiments, l'entrepôt compris
 * rapport = 1 si E₋ ≤ E₊, sinon E₊ ÷ E₋
 * ```
 *
 * **Deux asymétries, toutes deux délibérées.**
 *
 * La première est au dénominateur : l'entrepôt y figure alors qu'il ne produit
 * rien (FR-022, R21). Poser un entrepôt sans centrale se paie donc, simplement
 * le prix est payé par les extracteurs.
 *
 * La seconde est à l'application : le rapport ne multiplie **que** des taux de
 * production (FR-023b). La capacité d'un entrepôt reste entière en déficit —
 * un plafond qui rétrécit pourrait passer sous la quantité détenue, état que
 * l'invariant I-1 interdit, et il faudrait alors choisir entre confisquer le
 * surplus et tolérer l'interdit.
 *
 * Enfin, **la production de base du Berceau n'est jamais touchée** (FR-018) :
 * elle s'ajoute *après* le rapport, dans `rates.ts`. C'est ce qui garantit
 * qu'aucun état de jeu n'est définitivement bloquant — même à zéro énergie, la
 * planète produit et le joueur peut repartir.
 */

/** Le rapport d'énergie, en fraction entière — jamais un flottant (R5). */
export interface EnergyRatio {
  readonly numerator: number
  readonly denominator: number
}

export const NO_DEFICIT: EnergyRatio = { numerator: 1, denominator: 1 }

/**
 * Applique le rapport à un taux, avec **une seule troncature** (R5).
 *
 * Elle porte sur le taux, une fois, et non sur le gain. C'est ce qui préserve
 * l'additivité : `⌊a⌋ + ⌊b⌋ ≠ ⌊a+b⌋`, mais un taux entier constant sur un
 * segment se multiplie exactement par la durée. Tronquer le gain serait plus
 * fin — et rendrait la fortune du joueur dépendante de sa fréquence d'action.
 *
 * L'ordre des opérations est celui de la formule publiée : **multiplier, puis
 * diviser**. Diviser d'abord donnerait un flottant, donc une valeur dépendante
 * de sa représentation binaire, donc un chiffre que le joueur ne pourrait pas
 * refaire à la main.
 */
export function applyEnergyRatio(nominal: number, ratio: EnergyRatio): number {
  if (ratio.numerator >= ratio.denominator) return nominal
  return Math.floor((nominal * ratio.numerator) / ratio.denominator)
}

/**
 * Ce qu'un bâtiment consomme, nommé.
 *
 * Le détail est publié, et non seulement la somme : FR-024 exige que le joueur
 * puisse voir *qui* consomme quoi. Une planète qui n'annoncerait qu'un total
 * laisserait deviner quel bâtiment démolir — c'est-à-dire ferait de la lecture
 * du jeu une affaire d'essais successifs.
 */
export interface EnergyConsumer {
  /** `null` pour un bâtiment seulement **envisagé**, dans un aperçu. */
  readonly buildingId: BuildingId | null
  readonly typeId: BuildingTypeId
  readonly level: number
  readonly amount: number
}

export interface EnergyReport {
  /** L'énergie de base du Berceau, non nulle (FR-022). */
  readonly base: number
  /** Ce que les centrales ajoutent. Distinct de la base, et FR-024 l'exige. */
  readonly fromPlants: number
  /** `base + fromPlants` — le `E₊` de la formule. */
  readonly produced: number
  /** Le détail, dans l'ordre des bâtiments de l'instantané. */
  readonly consumers: readonly EnergyConsumer[]
  /** `Σ consumers` — le `E₋` de la formule. */
  readonly consumed: number
  readonly ratio: EnergyRatio
  /** Vrai quand `E₋ > E₊`. L'égalité **n'est pas** un déficit (FR-023). */
  readonly deficit: boolean
}

/** Ce qu'un bâtiment de ce type et de ce niveau produit. Zéro s'il n'en produit pas. */
export function energyProduction(
  typeId: BuildingTypeId,
  level: number,
  catalogs: Catalogs,
): number {
  const curve = catalogs.buildings[typeId]?.energyProduction ?? null
  return curve === null ? 0 : evaluateCurve(curve, level)
}

/** Ce qu'un bâtiment de ce type et de ce niveau consomme. Zéro pour la centrale. */
export function energyConsumption(
  typeId: BuildingTypeId,
  level: number,
  catalogs: Catalogs,
): number {
  const curve = catalogs.buildings[typeId]?.energyConsumption ?? null
  return curve === null ? 0 : evaluateCurve(curve, level)
}

/**
 * Le rapport d'énergie d'une planète, avec son détail.
 *
 * Fonction **pure** de l'instantané et du catalogue, et d'eux seuls : elle
 * n'appelle pas l'horloge, parce que l'énergie ne dépend pas du temps. C'est ce
 * qui la rend calculable identiquement par le client et par le serveur, et ce
 * qui permet à l'aperçu d'annoncer un déficit à venir sans aller-retour réseau.
 */
export function energyReport(snapshot: PlanetSnapshot, catalogs: Catalogs): EnergyReport {
  const layout = layoutOf(catalogs, snapshot.layoutId)

  let fromPlants = 0
  const consumers: EnergyConsumer[] = []

  for (const building of snapshot.buildings) {
    fromPlants += energyProduction(building.typeId, building.level, catalogs)

    const amount = energyConsumption(building.typeId, building.level, catalogs)
    // Un bâtiment qui ne consomme rien n'est pas listé : une ligne « centrale,
    // 0 » dans le détail de la consommation ferait chercher au joueur ce qu'elle
    // consomme, alors qu'elle est justement le type qui n'en consomme pas.
    if (amount > 0) {
      consumers.push({
        buildingId: building.id,
        typeId: building.typeId,
        level: building.level,
        amount,
      })
    }
  }

  return report(layout.baseEnergy, fromPlants, consumers)
}

/**
 * Le rapport tel qu'il serait **après** la pose d'un bâtiment (US3-3).
 *
 * C'est ce qui permet à l'aperçu d'annoncer « cette action fera basculer la
 * planète en déficit » **avant** paiement, et de dire de combien. Le bâtiment
 * envisagé entre dans le détail avec un identifiant `null` : il n'en a pas
 * encore, et lui en inventer un ferait croire que le client peut en proposer.
 */
export function energyAfterBuilding(
  current: EnergyReport,
  typeId: BuildingTypeId,
  level: number,
  catalogs: Catalogs,
): EnergyReport {
  const produced = energyProduction(typeId, level, catalogs)
  const amount = energyConsumption(typeId, level, catalogs)

  const consumers =
    amount > 0
      ? [...current.consumers, { buildingId: null, typeId, level, amount }]
      : current.consumers

  return report(current.base, current.fromPlants + produced, consumers)
}

/**
 * Le rapport tel qu'il serait **après** l'amélioration d'un bâtiment posé.
 *
 * Même promesse que pour la pose, et même raison de la tenir : entre le lancement
 * d'un chantier et son échéance, aucune autre transition ne peut survenir (FR-033,
 * R3), donc l'état énergétique à l'échéance est connu dès le lancement.
 *
 * La différence avec `energyAfterBuilding` est ce qui compte : le bâtiment est
 * **remplacé** dans le détail, jamais ajouté. L'ajouter compterait deux fois un
 * seul bâtiment, donc annoncerait un déficit qui n'arrivera pas — et ferait
 * renoncer le joueur à une amélioration que le jeu lui accordait.
 *
 * Il est remplacé **à sa place**, et non déplacé en fin de liste : le détail suit
 * l'ordre des bâtiments de l'instantané, et un aperçu qui réordonnerait le tableau
 * ferait chercher au joueur la ligne qu'il regardait.
 */
export function energyAfterUpgrade(
  current: EnergyReport,
  buildingId: BuildingId,
  typeId: BuildingTypeId,
  levelAfter: number,
  catalogs: Catalogs,
): EnergyReport {
  const gained =
    energyProduction(typeId, levelAfter, catalogs) -
    energyProduction(typeId, levelAfter - 1, catalogs)
  const amount = energyConsumption(typeId, levelAfter, catalogs)

  // Un type qui ne consomme rien n'est pas listé — la centrale (R20). Pour lui,
  // seule la production change, et le détail reste tel quel.
  const consumers = current.consumers.some((one) => one.buildingId === buildingId)
    ? current.consumers.map((one) =>
        one.buildingId === buildingId ? { ...one, level: levelAfter, amount } : one,
      )
    : amount > 0
      ? [...current.consumers, { buildingId, typeId, level: levelAfter, amount }]
      : current.consumers

  return report(current.base, current.fromPlants + gained, consumers)
}

/**
 * Le rapport tel qu'il serait **après** le retrait d'un bâtiment posé (US6).
 *
 * Même promesse que pour la pose et l'amélioration, et même raison de la tenir :
 * entre le lancement d'un chantier et son échéance, aucune autre transition ne peut
 * survenir (FR-033, R3), donc l'état énergétique à l'échéance est connu dès le
 * lancement.
 *
 * L'information est utile dans les deux sens, et c'est ce qui la rend nécessaire :
 * démolir un extracteur **soulage** le déficit et fait remonter la production des
 * autres, tandis que démolir une centrale l'aggrave. Un joueur qui ne verrait que la
 * production perdue par le bâtiment démoli manquerait la moitié du calcul — celle
 * qui peut rendre la démolition rentable.
 *
 * Le bâtiment est **retiré** du détail, jamais laissé avec un montant nul : une
 * ligne « mine, 0 » ferait chercher un consommateur qui n'existe plus.
 */
export function energyAfterRemoval(
  current: EnergyReport,
  buildingId: BuildingId,
  typeId: BuildingTypeId,
  level: number,
  catalogs: Catalogs,
): EnergyReport {
  const lost = energyProduction(typeId, level, catalogs)
  const consumers = current.consumers.filter((one) => one.buildingId !== buildingId)

  return report(current.base, current.fromPlants - lost, consumers)
}

/** La formule, en un seul endroit : les quatre constructeurs ci-dessus y passent. */
function report(
  base: number,
  fromPlants: number,
  consumers: readonly EnergyConsumer[],
): EnergyReport {
  const produced = base + fromPlants
  const consumed = consumers.reduce((total, one) => total + one.amount, 0)
  const deficit = consumed > produced

  return {
    base,
    fromPlants,
    produced,
    consumers,
    consumed,
    // L'égalité n'est pas un déficit (FR-023) : « en dessous ou égal, rien ne
    // change » se dit en une phrase, ce qu'exige SC-002.
    ratio: deficit ? { numerator: produced, denominator: consumed } : NO_DEFICIT,
    deficit,
  }
}
