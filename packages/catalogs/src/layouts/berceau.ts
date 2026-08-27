import type { ObstacleId } from '../obstacles.js'
import type { ResourceId } from '../resources.js'
import { GRAINS_PER_UNIT } from '../units.js'

/**
 * Le Berceau : la disposition unique, **identique pour tous** (R7, FR-003).
 *
 * Aucun tirage au sort, aucune graine (SC-008). Le document de conception fonde
 * l'équité sur la permutation d'un ensemble fixe, jamais sur la calibration d'un
 * générateur — deux joueurs, la même grille, à la case près.
 *
 * ```
 *       x=0   x=1   x=2   x=3   x=4   x=5
 *  y=0    .     .     .     ▓     .     .
 *  y=1    .    ~J~    .     .     .     ▓
 *  y=2    ▓     ▓     .     ▓     ▓     ▓
 *  y=3    .     ▓     ▓     .     .     .
 *  y=4   =C=    .     ▓     .    *B*    .
 *  y=5    .     .     .     .     .     .
 * ```
 *
 * **La forme a une intention, et elle n'est pas chiffrée.** La bande d'obstacles
 * de la ligne `y=2` coupe la planète en deux, ce qui donne au déblaiement un
 * enjeu topologique et non seulement comptable. La case (2,2), libre mais
 * accessible seulement par le haut, est un recoin que seules la case unique et
 * les deux cases en ligne exploitent : c'est la démonstration du vocabulaire
 * d'empreintes dès le premier écran. La disposition ne porte **aucun bonus**,
 * seulement de la géométrie (document de conception § 2.1).
 */

export interface LayoutCell {
  readonly x: number
  readonly y: number
  /** L'obstacle qui l'obstrue, ou `null` si la case est libre. */
  readonly obstacleId: ObstacleId | null
  /**
   * Le gisement affleurant, ou `null`. Un obstacle peut en **cacher** un : ce
   * n'est pas dit ici mais par son type, ce qui rend la planète lisible — qui a
   * déblayé un `filon-enfoui` sait ce que le prochain donnera.
   */
  readonly depositOf: ResourceId | null
}

export interface Layout {
  readonly id: LayoutId
  readonly archetypeId: ArchetypeId
  readonly width: number
  readonly height: number
  readonly cells: readonly LayoutCell[]
  /**
   * Production de base, en **unités par heure** — pas en grains.
   *
   * L'unité est dans le nom parce que la confusion est facile et silencieuse :
   * un taux se multiplie par des secondes pour donner des grains (une unité par
   * heure vaut exactement un grain par seconde), tandis qu'un stock est déjà en
   * grains. Les deux sont des nombres entiers, et rien dans le type ne les
   * distingue. Non nulle partout (FR-018).
   */
  readonly baseProductionPerHour: Readonly<Record<ResourceId, number>>
  /** Plafond de base, en **grains**. Non nul partout (FR-025). */
  readonly baseCapacityGrains: Readonly<Record<ResourceId, number>>
  /** Énergie de base, non nulle (FR-022). Sans elle, la première pose punirait. */
  readonly baseEnergy: number
  /** Stock initial, en **grains**. Paie une centrale et un extracteur (FR-019). */
  readonly startingStockGrains: Readonly<Record<ResourceId, number>>
}

/** Les dix obstacles, à la case et au type que R7 publie. */
const OBSTRUCTIONS: Readonly<Record<string, ObstacleId>> = {
  '3,0': 'eboulis',
  '5,1': 'rocher',
  '0,2': 'filon-enfoui',
  '1,2': 'eboulis',
  '3,2': 'poche-scellee',
  '4,2': 'eboulis',
  '5,2': 'croute-calcifiee',
  '1,3': 'rocher',
  '2,3': 'filon-enfoui',
  '2,4': 'eboulis',
}

/** Les trois gisements affleurants, un par ressource. */
const DEPOSITS: Readonly<Record<string, ResourceId>> = {
  '0,4': 'camelote',
  '1,1': 'jus',
  '4,4': 'bave-etoiles',
}

const WIDTH = 6
const HEIGHT = 6

function buildCells(): readonly LayoutCell[] {
  const cells: LayoutCell[] = []
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const key = `${x},${y}`
      cells.push({
        x,
        y,
        obstacleId: OBSTRUCTIONS[key] ?? null,
        depositOf: DEPOSITS[key] ?? null,
      })
    }
  }
  // Gelée : la disposition est identique pour tous, y compris pour le code qui
  // la lit. Une mutation accidentelle en mémoire donnerait à un joueur une
  // planète que personne d'autre n'a — exactement ce que FR-003 interdit.
  return Object.freeze(cells.map((cell) => Object.freeze(cell)))
}

/**
 * En unités par heure, et **non converties** : c'est déjà l'unité d'un taux.
 * Une unité par heure vaut exactement un grain par seconde (R1).
 */
const BASE_PRODUCTION_PER_HOUR = { camelote: 20, jus: 10, 'bave-etoiles': 5 } as const

/** En unités affichées, converties en grains à la construction. */
const BASE_CAPACITY_UNITS = { camelote: 5_000, jus: 5_000, 'bave-etoiles': 2_000 } as const

/**
 * De quoi poser une centrale **et** l'extracteur de son choix, tout de suite.
 *
 * L'exigence FR-019 ne demande qu'« au moins un » extracteur. Le catalogue va
 * plus loin, délibérément : ne pouvoir s'offrir que le moins cher ferait du
 * premier choix du jeu une décision déjà prise pour le joueur.
 */
const STARTING_STOCK_UNITS = { camelote: 400, jus: 0, 'bave-etoiles': 120 } as const

function toGrains(units: Readonly<Record<ResourceId, number>>): Record<ResourceId, number> {
  return Object.fromEntries(
    Object.entries(units).map(([id, value]) => [id, value * GRAINS_PER_UNIT]),
  ) as Record<ResourceId, number>
}

export const BERCEAU: Layout = {
  id: 'berceau-v1',
  archetypeId: 'berceau',
  width: WIDTH,
  height: HEIGHT,
  cells: buildCells(),
  baseProductionPerHour: BASE_PRODUCTION_PER_HOUR,
  baseCapacityGrains: toGrains(BASE_CAPACITY_UNITS),
  baseEnergy: 20,
  startingStockGrains: toGrains(STARTING_STOCK_UNITS),
}

export const LAYOUTS = { 'berceau-v1': BERCEAU } as const

export type LayoutId = keyof typeof LAYOUTS

export const LAYOUT_IDS = Object.keys(LAYOUTS) as readonly LayoutId[]

export const ARCHETYPES = { berceau: { id: 'berceau', layoutId: 'berceau-v1' } } as const

export type ArchetypeId = keyof typeof ARCHETYPES

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as readonly ArchetypeId[]

/**
 * La case aux coordonnées données, ou `undefined` hors grille.
 *
 * `undefined` plutôt qu'une exception : « hors de la planète » est une réponse
 * normale à une question de placement, pas une faute de programmation.
 */
export function cellAt(layout: Layout, x: number, y: number): LayoutCell | undefined {
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) return undefined
  return layout.cells[y * layout.width + x]
}
