import type { ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from './catalogs.js'
import { layoutOf } from './catalogs.js'
import type { RatePerHour } from './resources.js'
import { ratePerHour } from './resources.js'
import type { PlanetSnapshot } from './snapshot.js'

/**
 * Les taux de production, dérivés de l'instantané.
 *
 * Deux grandeurs sont publiées par ressource, et les confondre serait perdre
 * l'information que FR-024 exige :
 *
 * - le **taux nominal**, avant rapport d'énergie ;
 * - le **taux effectif**, après.
 *
 * Un joueur qui voit les deux sait s'il produit peu ou s'il est bridé. Un joueur
 * qui n'en voit qu'un ne peut pas distinguer les deux situations, alors qu'elles
 * appellent des décisions opposées — poser un extracteur, ou poser une centrale.
 *
 * **La production de base du Berceau s'ajoute après le rapport** et n'en est
 * jamais touchée (FR-018, R5). C'est ce qui garantit qu'aucun état de jeu n'est
 * définitivement bloquant : même à zéro énergie, la planète produit.
 *
 * Les taux d'extracteur arrivent avec US2. Ce qui est écrit ici est la moitié
 * dont US1 a besoin — et la place où l'autre viendra se brancher.
 */

export interface ResourceRate {
  /** Avant rapport d'énergie (FR-024). */
  readonly nominal: RatePerHour
  /** Après rapport. Égal au nominal hors déficit. */
  readonly effective: RatePerHour
}

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
 */
export function applyEnergyRatio(nominal: number, ratio: EnergyRatio): number {
  if (ratio.numerator >= ratio.denominator) return nominal
  return Math.floor((nominal * ratio.numerator) / ratio.denominator)
}

export function productionRates(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  ratio: EnergyRatio,
): Readonly<Record<ResourceId, ResourceRate>> {
  const layout = layoutOf(catalogs, snapshot.layoutId)

  return Object.fromEntries(
    catalogs.resourceIds.map((resourceId) => {
      // Les extracteurs contribuent au nominal à partir d'US2 ; ici, personne.
      const fromBuildings = 0
      const base = layout.baseProductionPerHour[resourceId] ?? 0

      return [
        resourceId,
        {
          nominal: ratePerHour(fromBuildings + base),
          // Le rapport ne mord que sur la part des bâtiments ; la base du
          // Berceau s'ajoute après, intacte.
          effective: ratePerHour(applyEnergyRatio(fromBuildings, ratio) + base),
        },
      ]
    }),
  ) as Record<ResourceId, ResourceRate>
}

/** Le plafond de stockage par ressource, en grains (FR-025). */
export function storageCaps(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
): Readonly<Record<ResourceId, number>> {
  const layout = layoutOf(catalogs, snapshot.layoutId)

  // La capacité des entrepôts s'ajoute avec US7 — et **n'est pas** dégradée par
  // le déficit d'énergie (R21) : un plafond qui rétrécit pourrait passer sous la
  // quantité détenue, ce que l'invariant I-1 interdit.
  return Object.fromEntries(
    catalogs.resourceIds.map((resourceId) => [
      resourceId,
      layout.baseCapacityGrains[resourceId] ?? 0,
    ]),
  ) as Record<ResourceId, number>
}
