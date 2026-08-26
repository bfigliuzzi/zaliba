import type { ObstacleId, ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from './catalogs.js'
import { layoutOf } from './catalogs.js'
import type { BuildingId, Cell } from './effects.js'
import type { PlacedBuilding, PlanetSnapshot } from './snapshot.js'
import { sameCell } from './snapshot.js'

/**
 * La grille : ce que la disposition du catalogue **moins** les déblaiements, plus
 * les bâtiments, donne à voir.
 *
 * Rien de tout cela n'est stocké. L'état obstrué d'une case est la disposition
 * du catalogue *moins* `clearedCells` ; les cases d'un bâtiment se déduisent de
 * sa variante, de son orientation et de son ancre. Une seule de ces valeurs
 * persistée deviendrait fausse au premier rééquilibrage — et fausse en silence.
 *
 * La validation de placement arrive avec US2 : ici, on décrit ce qui est, pas
 * ce qui est permis.
 */

export type CellState = 'free' | 'obstructed' | 'occupied'

export interface CellView {
  readonly x: number
  readonly y: number
  readonly state: CellState
  /** Le type d'obstacle, tant que la case n'est pas déblayée. */
  readonly obstacleId: ObstacleId | null
  /**
   * Le gisement, **conservé même sous un bâtiment** (FR-020).
   *
   * C'est la seule information que recouvrir ne doit pas effacer : un joueur qui
   * a posé une mine sur sa veine doit continuer à voir *pourquoi* elle est là,
   * sans quoi la décision qu'il a prise devient indéchiffrable un mois plus tard.
   */
  readonly depositOf: ResourceId | null
  readonly buildingId: BuildingId | null
}

/** Les cases qu'occupe un bâtiment, dérivées de son empreinte orientée (R6). */
export function cellsOf(building: PlacedBuilding, catalogs: Catalogs): readonly Cell[] {
  const footprint = catalogs.footprints[building.variantId]
  if (footprint === undefined) {
    throw new RangeError(`Empreinte inconnue : ${building.variantId}.`)
  }

  const oriented = footprint.orientations[building.orientation % footprint.orientations.length]
  if (oriented === undefined) {
    throw new RangeError(`Orientation invalide : ${building.orientation}.`)
  }

  return oriented.map(({ x, y }) => ({ x: building.anchor.x + x, y: building.anchor.y + y }))
}

/**
 * Les trente-six vues de case d'une planète.
 *
 * L'ordre est celui de la lecture — ligne par ligne, de gauche à droite — pour
 * qu'un `role="grid"` puisse s'en servir directement, et qu'un test qui compare
 * deux grilles compare des choses comparables.
 */
export function gridView(snapshot: PlanetSnapshot, catalogs: Catalogs): readonly CellView[] {
  const layout = layoutOf(catalogs, snapshot.layoutId)

  const cleared = new Set(snapshot.clearedCells.map((cell) => `${cell.x},${cell.y}`))

  /** Quelle case appartient à quel bâtiment. */
  const occupancy = new Map<string, BuildingId>()
  for (const building of snapshot.buildings) {
    for (const cell of cellsOf(building, catalogs)) {
      occupancy.set(`${cell.x},${cell.y}`, building.id)
    }
  }

  return layout.cells.map((cell) => {
    const key = `${cell.x},${cell.y}`
    const isCleared = cleared.has(key)
    const obstacleId = cell.obstacleId !== null && !isCleared ? cell.obstacleId : null
    const buildingId = occupancy.get(key) ?? null

    return {
      x: cell.x,
      y: cell.y,
      state: stateOf(obstacleId, buildingId),
      obstacleId,
      depositOf: depositOf(cell.depositOf, cell.obstacleId, isCleared, catalogs),
      buildingId,
    }
  })
}

function stateOf(obstacleId: ObstacleId | null, buildingId: BuildingId | null): CellState {
  if (obstacleId !== null) return 'obstructed'
  return buildingId === null ? 'free' : 'occupied'
}

/**
 * Le gisement d'une case : celui qui affleure, ou celui que le déblaiement a
 * révélé.
 *
 * Ce que révèle un déblaiement appartient au **type d'obstacle** et non à la
 * case : c'est ce qui rend la planète lisible — qui a déblayé un `filon-enfoui`
 * sait ce que le prochain donnera.
 */
function depositOf(
  surface: ResourceId | null,
  obstacleId: ObstacleId | null,
  isCleared: boolean,
  catalogs: Catalogs,
): ResourceId | null {
  if (surface !== null) return surface
  if (!isCleared || obstacleId === null) return null

  const reveals = catalogs.obstacles[obstacleId]?.reveals
  return reveals?.kind === 'deposit' ? reveals.resourceId : null
}

/** Le nombre de gisements de sa ressource qu'un extracteur recouvre (FR-017). */
export function coveredDeposits(
  building: PlacedBuilding,
  grid: readonly CellView[],
  catalogs: Catalogs,
): number {
  const extracted = catalogs.buildings[building.typeId]?.extracts ?? null
  if (extracted === null) return 0

  const own = cellsOf(building, catalogs)
  return grid.filter(
    (view) => view.depositOf === extracted && own.some((cell) => sameCell(cell, view)),
  ).length
}
