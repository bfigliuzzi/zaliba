/**
 * Les formes de persistance, et **rien d'autre**.
 *
 * Ce module n'importe rien. Il existe parce que les dépôts se partagent ces
 * formes : le dépôt d'instantané écrit un `PlanetWrite` qui contient des
 * `BuildingWrite`, et le dépôt de bâtiments a besoin de `BuildingRecord` et de
 * `CellRecord`. Les laisser dans `snapshot.ts` créait un cycle — que
 * `dependency-cruiser` a refusé, et qu'il avait raison de refuser : un cycle
 * rend l'ordre d'initialisation indéterminé, et il n'aurait été visible qu'au
 * premier chargement qui aurait mal tourné.
 *
 * Des **types**, pas des classes ni des fonctions : ce sont des descriptions de
 * lignes, et une ligne ne se comporte pas.
 */

export interface HoldingRecord {
  readonly resourceId: string
  readonly amountGrains: number
  readonly lostGrains: number
}

export interface BuildingRecord {
  readonly id: string
  readonly typeId: string
  readonly variantId: string
  readonly orientation: number
  readonly anchorX: number
  readonly anchorY: number
  readonly level: number
}

export interface CellRecord {
  readonly x: number
  readonly y: number
}

export interface WorkRecord {
  readonly id: string
  readonly nature: string
  readonly startedAt: number
  readonly dueAt: number
  readonly targetBuildingId: string | null
  readonly targetX: number | null
  readonly targetY: number | null
  readonly typeId: string | null
  readonly variantId: string | null
  readonly orientation: number | null
}

export interface PlanetRecord {
  readonly id: string
  readonly ownerId: string
  readonly occupantId: string
  readonly archetypeId: string
  readonly layoutId: string
  readonly consolidatedAt: number
  readonly holdings: readonly HoldingRecord[]
  readonly buildings: readonly BuildingRecord[]
  readonly clearedCells: readonly CellRecord[]
  /** Le chantier **non résolu**, s'il y en a un. Au plus un (FR-033). */
  readonly work: WorkRecord | null
}
