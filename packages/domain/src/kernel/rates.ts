import type { BuildingTypeId, ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from './catalogs.js'
import { layoutOf } from './catalogs.js'
import { evaluateCurve } from './curves.js'
import type { BuildingId } from './effects.js'
import { applyEnergyRatio, type EnergyRatio } from './energy.js'
import { cellsOf, depositsUnder, gridView } from './grid.js'
import type { RatePerHour } from './resources.js'
import { ratePerHour } from './resources.js'
import type { PlacedBuilding, PlanetSnapshot } from './snapshot.js'

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
 * **Le rapport lui-même vit dans `energy.ts`**, avec la grandeur qu'il décrit.
 * Ce fichier ne fait que l'appliquer : il sait multiplier un taux, il ne sait pas
 * d'où vient le déficit — et c'est ce qui permet d'éprouver les deux moitiés
 * séparément.
 *
 * La règle de production tient en une ligne, et c'est une exigence : SC-002
 * promet au joueur de pouvoir refaire n'importe quel chiffre affiché.
 *
 * ```
 * taux nominal d'un extracteur = courbeProduction(niveau) × gisements recouverts
 * taux effectif                = ⌊ nominal × E₊ ÷ E₋ ⌋ en déficit, nominal sinon
 * taux de la planète           = Σ extracteurs (effectifs) + production de base
 * plafond                       = capacité de base + Σ entrepôts posés
 * ```
 */

export interface ResourceRate {
  /** Avant rapport d'énergie (FR-024). */
  readonly nominal: RatePerHour
  /** Après rapport. Égal au nominal hors déficit. */
  readonly effective: RatePerHour
}

/**
 * Le taux nominal d'un extracteur : `courbeProduction(niveau) × gisements` (R5).
 *
 * Zéro pour un type qui n'extrait rien, et zéro pour un extracteur qui ne
 * recouvre aucun gisement de sa ressource (I-12, FR-017). Ce second zéro est le
 * cœur de la mécanique : il fait de la géométrie une décision, là où une
 * production forfaitaire aurait rendu le placement indifférent.
 */
export function extractorRate(
  typeId: BuildingTypeId,
  level: number,
  coveredDeposits: number,
  catalogs: Catalogs,
): number {
  const curve = catalogs.buildings[typeId]?.production ?? null
  if (curve === null) return 0
  return evaluateCurve(curve, level) * coveredDeposits
}

/** Ce que produit un bâtiment posé, avant et après le rapport d'énergie. */
export interface BuildingRate {
  readonly buildingId: BuildingId
  /** La ressource extraite, ou `null` pour un bâtiment qui n'extrait rien. */
  readonly resourceId: ResourceId | null
  readonly coveredDeposits: number
  /** Avant rapport d'énergie (FR-024). */
  readonly nominal: RatePerHour
  /** Après rapport. Égal au nominal hors déficit. */
  readonly effective: RatePerHour
}

/**
 * Les taux de chaque bâtiment posé.
 *
 * Calculés **une fois** et partagés entre le taux de la planète et la vue par
 * bâtiment. Deux parcours séparés donneraient deux chiffres justes séparément et
 * incohérents ensemble — le pire des deux, parce que le joueur voit les deux sur
 * le même écran et ne peut pas savoir lequel croire.
 */
export function buildingRates(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  ratio: EnergyRatio,
): readonly BuildingRate[] {
  const grid = gridView(snapshot, catalogs)

  return snapshot.buildings.map((building: PlacedBuilding) => {
    const resourceId = catalogs.buildings[building.typeId]?.extracts ?? null
    const covered = depositsUnder(grid, cellsOf(building, catalogs), resourceId)
    const nominal = extractorRate(building.typeId, building.level, covered, catalogs)

    return {
      buildingId: building.id,
      resourceId,
      coveredDeposits: covered,
      nominal: ratePerHour(nominal),
      effective: ratePerHour(applyEnergyRatio(nominal, ratio)),
    }
  })
}

export function productionRates(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  ratio: EnergyRatio,
): Readonly<Record<ResourceId, ResourceRate>> {
  const layout = layoutOf(catalogs, snapshot.layoutId)
  const rates = buildingRates(snapshot, catalogs, ratio)

  return Object.fromEntries(
    catalogs.resourceIds.map((resourceId) => {
      const own = rates.filter((rate) => rate.resourceId === resourceId)
      const nominal = own.reduce((total, rate) => total + rate.nominal, 0)
      const effective = own.reduce((total, rate) => total + rate.effective, 0)
      const base = layout.baseProductionPerHour[resourceId] ?? 0

      return [
        resourceId,
        {
          nominal: ratePerHour(nominal + base),
          // Le rapport ne mord que sur la part des bâtiments ; la base du
          // Berceau s'ajoute après, intacte (FR-018, R5). C'est ce qui garantit
          // qu'aucun état de jeu n'est définitivement bloquant : même à zéro
          // énergie, la planète produit.
          effective: ratePerHour(effective + base),
        },
      ]
    }),
  ) as Record<ResourceId, ResourceRate>
}

/**
 * Ce qu'un bâtiment **posé** ajoute au plafond, par ressource, en grains (FR-025).
 *
 * Zéro pour tout type qui ne stocke rien. L'entrepôt est le seul à porter une courbe
 * de capacité, et il relève **les trois** plafonds du même montant : c'est la
 * spécification qui le tranche — un type unique plutôt que trois entrepôts
 * spécialisés.
 *
 * La fonction est publique parce que la démolition en a besoin : démolir un entrepôt
 * réduit la capacité à l'instant même où il rembourse, et l'aperçu doit annoncer
 * l'écrêtement contre le plafond **d'après retrait** (FR-049).
 */
export function storageContribution(
  building: PlacedBuilding,
  catalogs: Catalogs,
): Readonly<Record<ResourceId, number>> {
  const curve = catalogs.buildings[building.typeId]?.capacity ?? null
  const amount = curve === null ? 0 : evaluateCurve(curve, building.level)

  return Object.fromEntries(
    catalogs.resourceIds.map((resourceId) => [resourceId, amount]),
  ) as Record<ResourceId, number>
}

/**
 * Le plafond de stockage par ressource, en grains (FR-025) :
 *
 * ```
 * plafond = capacité de base de la disposition + Σ entrepôts posés
 * ```
 *
 * **Le rapport d'énergie n'est pas un argument de cette fonction**, et c'est la
 * forme qui tient FR-023b : ce qu'on ne reçoit pas, on ne peut pas l'appliquer par
 * mégarde. La capacité d'un entrepôt reste entière en déficit (R21) — un plafond qui
 * rétrécit pourrait passer sous la quantité détenue, ce que l'invariant I-1
 * interdit, et il faudrait alors choisir entre confisquer le surplus et tolérer
 * l'interdit.
 */
export function storageCaps(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
): Readonly<Record<ResourceId, number>> {
  const layout = layoutOf(catalogs, snapshot.layoutId)

  const added = snapshot.buildings.map((building) => storageContribution(building, catalogs))

  return Object.fromEntries(
    catalogs.resourceIds.map((resourceId) => [
      resourceId,
      added.reduce(
        (total, one) => total + (one[resourceId] ?? 0),
        layout.baseCapacityGrains[resourceId] ?? 0,
      ),
    ]),
  ) as Record<ResourceId, number>
}
