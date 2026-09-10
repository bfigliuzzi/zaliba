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

/**
 * Ce qu'une disposition a de commun entre sa forme déclarée et sa forme
 * résolue : sa géométrie, ses plafonds, son énergie et son stock de départ.
 *
 * Aucune de ces grandeurs n'a de dimension de temps — un plafond et un stock se
 * comparent à une quantité, une énergie est un rapport —, donc aucune n'est
 * touchée par la résolution (G13).
 */
interface LayoutCommon {
  readonly id: LayoutId
  readonly archetypeId: ArchetypeId
  readonly width: number
  readonly height: number
  readonly cells: readonly LayoutCell[]
  /** Plafond de base, en **grains**. Non nul partout (FR-025). */
  readonly baseCapacityGrains: Readonly<Record<ResourceId, number>>
  /** Énergie de base, non nulle (FR-022). Sans elle, la première pose punirait. */
  readonly baseEnergy: number
  /** Stock initial, en **grains**. Paie une centrale et un extracteur (FR-019). */
  readonly startingStockGrains: Readonly<Record<ResourceId, number>>
}

/**
 * La disposition telle que le **catalogue la déclare** : sa production de base
 * est en grains par gong.
 *
 * **C'est un taux, donc il se résout** — et c'est le point que les documents de
 * conception de 003 avaient rangé de travers, en écartant « les dispositions »
 * en bloc de la résolution. La production de base est la seule grandeur d'une
 * disposition qui ait une dimension de temps, et c'est aussi la **seule source
 * de revenu d'une planète fraîche** : ne pas la résoudre laisserait le premier
 * écran du jeu battre au rythme canonique sur un serveur rapide, ce que SC-002
 * interdit nommément — « tout délai du jeu, chantier **comme accumulation de
 * ressources**, dans le même rapport, et jamais l'un sans l'autre ». C'est
 * exactement le défaut qui avait fait écarter le premier design de la tranche
 * 900 : des chantiers instantanés et un joueur affamé.
 */
export interface DeclaredLayout extends LayoutCommon {
  /**
   * Production de base, en **grains par gong**.
   *
   * L'unité est dans le nom parce que la confusion est facile et silencieuse :
   * un taux se multiplie par une durée pour donner des grains, tandis qu'un
   * stock est déjà en grains. Les deux sont des nombres entiers, et rien dans
   * le type ne les distingue. Non nulle partout (FR-018).
   */
  readonly baseProductionPerGong: Readonly<Record<ResourceId, number>>
}

/**
 * La disposition **résolue** : sa production de base est en unités par heure,
 * c'est-à-dire numériquement en grains par seconde (R1).
 *
 * Ce champ n'a ni changé de nom ni changé d'unité avec 003 — raison pour
 * laquelle `kernel/rates.ts`, qui le lit, n'a pas bougé d'une ligne.
 */
export interface Layout extends LayoutCommon {
  /** Production de base, en **unités par heure** — soit un grain par seconde. */
  readonly baseProductionPerHour: Readonly<Record<ResourceId, number>>
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
 * En **grains par gong**, et non converties : c'est déjà l'unité d'un taux.
 *
 * Au gong canonique de dix secondes, `200 ÷ 10 = 20` grains par seconde, soit
 * exactement les vingt unités par heure d'avant 003 (une unité par heure vaut
 * un grain par seconde, R1). Aucun chiffre du jeu n'a bougé.
 */
const BASE_PRODUCTION_PER_GONG = { camelote: 200, jus: 100, 'bave-etoiles': 50 } as const

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

export const BERCEAU: DeclaredLayout = {
  id: 'berceau-v1',
  archetypeId: 'berceau',
  width: WIDTH,
  height: HEIGHT,
  cells: buildCells(),
  baseProductionPerGong: BASE_PRODUCTION_PER_GONG,
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
/**
 * Elle prend `LayoutCommon` et non `Layout` : la lecture d'une case ne touche
 * que la **géométrie**, qui est identique entre la disposition déclarée et la
 * disposition résolue. Exiger l'une des deux formes obligerait un appelant à
 * résoudre un catalogue pour lire une coordonnée, ce qui n'a pas de sens.
 */
export function cellAt(layout: LayoutCommon, x: number, y: number): LayoutCell | undefined {
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) return undefined
  return layout.cells[y * layout.width + x]
}
