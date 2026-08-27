import type { FootprintId, ObstacleId, ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from './catalogs.js'
import { layoutOf } from './catalogs.js'
import type { BuildingId, Cell } from './effects.js'
import type { PlacedBuilding, PlanetSnapshot } from './snapshot.js'

/**
 * La grille : ce que la disposition du catalogue **moins** les déblaiements, plus
 * les bâtiments, donne à voir.
 *
 * Rien de tout cela n'est stocké. L'état obstrué d'une case est la disposition
 * du catalogue *moins* `clearedCells` ; les cases d'un bâtiment se déduisent de
 * sa variante, de son orientation et de son ancre. Une seule de ces valeurs
 * persistée deviendrait fausse au premier rééquilibrage — et fausse en silence.
 *
 * Ce fichier dit **ce qui est** — les vues de case — et **ce qui est permis** —
 * la validité d'un placement. Les deux vont ensemble : la validité se lit sur
 * les vues, et rien d'autre. Une seconde source pour l'une des deux ferait
 * refuser au joueur un placement que l'écran lui montrait comme libre.
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

/**
 * Le nombre d'orientations **distinctes** d'une empreinte (R6).
 *
 * De 1 à 4. C'est cette valeur qui fait qu'une rotation de carré de quatre
 * n'annonce rien : le compteur du curseur va de 0 à 3, mais la forme n'a qu'un
 * état, donc il n'y a rien à énoncer à un lecteur d'écran.
 */
export function orientationCount(variantId: FootprintId, catalogs: Catalogs): number {
  return footprintOf(variantId, catalogs).orientations.length
}

function footprintOf(variantId: FootprintId, catalogs: Catalogs) {
  const footprint = catalogs.footprints[variantId]
  if (footprint === undefined) {
    throw new RangeError(`Empreinte inconnue : ${variantId}.`)
  }
  return footprint
}

/**
 * Les offsets d'une empreinte à l'orientation demandée (R6).
 *
 * L'orientation est **repliée** sur le nombre d'orientations distinctes. Ce
 * repli est la règle et non le cas limite : le curseur compte les quarts de tour
 * modulo quatre sans savoir quelle empreinte il porte, et c'est ici que le
 * compteur rencontre la géométrie. Lever sur un compteur à 3 pour un carré
 * obligerait l'interface à connaître la table des orientations — c'est-à-dire à
 * dupliquer une règle du catalogue.
 *
 * **Il n'y a pas de fonction de symétrie à côté de celle-ci**, et c'est ainsi
 * que FR-011 est tenu : le retournement n'est pas interdit, il est
 * indemandable.
 */
export function orientedCells(
  variantId: FootprintId,
  orientation: number,
  catalogs: Catalogs,
): readonly Cell[] {
  const footprint = footprintOf(variantId, catalogs)
  const count = footprint.orientations.length

  if (!Number.isInteger(orientation) || orientation < 0) {
    throw new RangeError(
      `Orientation invalide : ${orientation}. Une orientation est un entier ≥ 0 de quarts de tour.`,
    )
  }

  const oriented = footprint.orientations[orientation % count]
  if (oriented === undefined) {
    throw new RangeError(`Orientation invalide : ${orientation}.`)
  }
  return oriented.map(({ x, y }) => ({ x, y }))
}

/**
 * Les cases qu'occuperait une empreinte orientée, ancrée en `anchor`.
 *
 * L'ancre est le coin haut-gauche de l'empreinte **normalisée**, donc la
 * translation est une simple addition. Rien ici ne vérifie la contiguïté : les
 * sept empreintes du vocabulaire sont contiguës par définition, et une
 * translation la conserve. Une vérification aurait l'air prudente et serait du
 * code mort.
 */
export function placementCells(
  variantId: FootprintId,
  orientation: number,
  anchor: Cell,
  catalogs: Catalogs,
): readonly Cell[] {
  return orientedCells(variantId, orientation, catalogs).map((cell) => ({
    x: anchor.x + cell.x,
    y: anchor.y + cell.y,
  }))
}

/** Les cases qu'occupe un bâtiment, dérivées de son empreinte orientée (R6). */
export function cellsOf(building: PlacedBuilding, catalogs: Catalogs): readonly Cell[] {
  return placementCells(building.variantId, building.orientation, building.anchor, catalogs)
}

/**
 * Le verdict d'un placement (data-model § 1.4).
 *
 * Une **union fermée**, parce que FR-013 exige le motif exact et non un booléen.
 * La différence n'est pas de confort : « refusé » n'apprend rien, « la case
 * (5,2) est obstruée » dit au joueur quoi faire ensuite — et c'est la même
 * information qui remonte jusqu'à l'annonce du lecteur d'écran (FR-059).
 */
export type PlacementCheck =
  | { readonly kind: 'ok' }
  | { readonly kind: 'out-of-grid'; readonly cells: readonly Cell[] }
  | { readonly kind: 'obstructed'; readonly cells: readonly Cell[] }
  | { readonly kind: 'occupied'; readonly cells: readonly Cell[] }

export type PlacementRefusal = Exclude<PlacementCheck, { kind: 'ok' }>

const PLACEMENT_OK: PlacementCheck = { kind: 'ok' }

/**
 * Un placement est valide si et seulement si **toutes** ses cases sont dans la
 * grille, non obstruées et non occupées (FR-012).
 *
 * L'ordre des motifs n'est pas arbitraire. « Hors de la grille » vient d'abord
 * parce qu'une case absente de la grille n'a aucun état à examiner : dire
 * d'elle qu'elle est obstruée serait inventer une réponse. Vient ensuite
 * l'obstruction, qui est un fait de terrain, puis l'occupation, qui est une
 * conséquence des décisions du joueur — de la cause la plus fondamentale à la
 * plus circonstancielle.
 *
 * Les cases fautives sont **énumérées**, toutes, et non seulement la première :
 * un fantôme d'empreinte doit pouvoir marquer chacune d'elles, sans quoi le
 * joueur corrige une case pour en découvrir une autre.
 */
export function validatePlacement(
  grid: readonly CellView[],
  cells: readonly Cell[],
): PlacementCheck {
  const byKey = new Map(grid.map((view) => [`${view.x},${view.y}`, view]))

  const outside = cells.filter((cell) => !byKey.has(`${cell.x},${cell.y}`))
  if (outside.length > 0) return { kind: 'out-of-grid', cells: outside }

  const views = cells.map((cell) => byKey.get(`${cell.x},${cell.y}`) as CellView)

  const obstructed = views.filter((view) => view.obstacleId !== null)
  if (obstructed.length > 0) {
    return { kind: 'obstructed', cells: obstructed.map(({ x, y }) => ({ x, y })) }
  }

  const occupied = views.filter((view) => view.buildingId !== null)
  if (occupied.length > 0) {
    return { kind: 'occupied', cells: occupied.map(({ x, y }) => ({ x, y })) }
  }

  return PLACEMENT_OK
}

/**
 * Le nombre de gisements de `resourceId` que couvriraient ces cases.
 *
 * Sert à l'aperçu, **avant** que le bâtiment n'existe (R8, FR-050). C'est la
 * même lecture de grille que `coveredDeposits`, mais sur un placement projeté
 * plutôt que sur un bâtiment posé : ce sont les deux moments où la question se
 * pose, et il n'y a qu'une réponse.
 */
export function depositsUnder(
  grid: readonly CellView[],
  cells: readonly Cell[],
  resourceId: ResourceId | null,
): number {
  if (resourceId === null) return 0
  const wanted = new Set(cells.map((cell) => `${cell.x},${cell.y}`))
  return grid.filter((view) => view.depositOf === resourceId && wanted.has(`${view.x},${view.y}`))
    .length
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

/**
 * Ce que la grille contient, compté par état.
 *
 * Sert le cas limite que la spécification pose : « la grille est entièrement
 * occupée : seules la démolition et le déblaiement peuvent libérer de la place,
 * **et le jeu le dit** ». Le dire suppose de le savoir.
 *
 * **Les deux issues sont comptées séparément**, et ce n'est pas du détail : une
 * planète pleine de bâtiments et une planète pleine d'obstacles appellent des
 * décisions opposées, et une seule des deux se paie en bâtiment perdu. Un
 * booléen « pleine » les confondrait, et laisserait le joueur chercher par où
 * sortir.
 */
export interface GridOccupancy {
  readonly total: number
  readonly free: number
  readonly obstructed: number
  readonly occupied: number
  /**
   * Vrai quand **aucune** case n'est libre.
   *
   * C'est bien « aucune case libre » et non « toutes bâties » : une grille
   * couverte d'obstacles est tout aussi impraticable, et se libère par le
   * déblaiement plutôt que par la démolition.
   */
  readonly full: boolean
}

export function gridOccupancy(grid: readonly CellView[]): GridOccupancy {
  const free = grid.filter((cell) => cell.state === 'free').length

  return {
    total: grid.length,
    free,
    obstructed: grid.filter((cell) => cell.state === 'obstructed').length,
    occupied: grid.filter((cell) => cell.state === 'occupied').length,
    full: free === 0,
  }
}

/**
 * Le nombre de gisements de sa ressource qu'un extracteur recouvre (FR-017).
 *
 * La même lecture que `depositsUnder`, sur un bâtiment posé plutôt que sur un
 * placement projeté. Les deux passent par la même fonction : si l'aperçu et le
 * constat comptaient différemment, le joueur découvrirait après paiement une
 * production qu'on ne lui avait pas annoncée (FR-051).
 */
export function coveredDeposits(
  building: PlacedBuilding,
  grid: readonly CellView[],
  catalogs: Catalogs,
): number {
  const extracted = catalogs.buildings[building.typeId]?.extracts ?? null
  return depositsUnder(grid, cellsOf(building, catalogs), extracted)
}
