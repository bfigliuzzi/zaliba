import type { ResourceId } from './resources.js'
import { GRAINS_PER_UNIT } from './units.js'

/**
 * Les cinq types d'obstacle du Berceau (R7).
 *
 * Le **résultat du déblaiement** appartient au type, et non à la case. C'est ce
 * qui rend la planète lisible : un joueur qui a déblayé un `filon-enfoui` sait
 * ce que le prochain lui donnera. La disposition, elle, ne porte que de la
 * géométrie — aucun bonus caché sous une case particulière (document de
 * conception § 2.1).
 *
 * **Depuis 003, le type se dédouble** — `DeclaredObstacle` et `Obstacle` — sur
 * le même dédoublement que les bâtiments (G16) : le catalogue déclare une durée
 * de déblaiement en **gongs**, le domaine en consomme une en **secondes**, et
 * `resolveCatalogs` est le seul chemin de l'une à l'autre. Seule la forme
 * déclarée est exportée d'ici.
 */

/** Ce qu'un déblaiement laisse derrière lui (FR-043). */
export type ClearingResult =
  | { readonly kind: 'bare-ground' }
  | { readonly kind: 'deposit'; readonly resourceId: ResourceId }

/**
 * Ce qu'un obstacle a de commun entre sa forme déclarée et sa forme résolue :
 * tout ce qui n'a **aucune dimension de temps**. Le coût et le résultat du
 * déblaiement traversent la résolution intacts (G13).
 */
interface ObstacleCommon {
  readonly id: ObstacleId
  /**
   * Le coût du déblaiement, en grains. Jamais de Jus (FR-062) : il n'a aucun
   * débouché en 001, et l'exiger serait un blocage définitif déguisé en contenu.
   */
  readonly cost: Readonly<Partial<Record<ResourceId, number>>>
  readonly reveals: ClearingResult
}

/** L'obstacle tel que le **catalogue le déclare** : sa durée est en gongs. */
export interface DeclaredObstacle extends ObstacleCommon {
  /** Durée de déblaiement, en **gongs**. */
  readonly durationGongs: number
}

/**
 * L'obstacle **résolu** : sa durée est en secondes.
 *
 * C'est ce que `modules/construction/clear.ts` lit, et ce champ n'a ni changé
 * de nom ni changé d'unité avec 003 — raison pour laquelle ce module n'a pas
 * bougé d'une ligne.
 */
export interface Obstacle extends ObstacleCommon {
  /** Durée de déblaiement, en **secondes**. */
  readonly durationSeconds: number
}

const BARE: ClearingResult = { kind: 'bare-ground' }

const SHAPES = {
  /** Le plus commun, et le moins cher : de la caillasse à pousser. */
  eboulis: {
    id: 'eboulis',
    cost: { camelote: 40 * GRAINS_PER_UNIT },
    durationGongs: 30,
    reveals: BARE,
  },
  rocher: {
    id: 'rocher',
    cost: { camelote: 90 * GRAINS_PER_UNIT, 'bave-etoiles': 10 * GRAINS_PER_UNIT },
    durationGongs: 90,
    reveals: BARE,
  },
  /** Coûteux, et il rend une veine : le déblaiement devient un investissement. */
  'filon-enfoui': {
    id: 'filon-enfoui',
    cost: { camelote: 150 * GRAINS_PER_UNIT, 'bave-etoiles': 25 * GRAINS_PER_UNIT },
    durationGongs: 180,
    reveals: { kind: 'deposit', resourceId: 'camelote' },
  },
  'poche-scellee': {
    id: 'poche-scellee',
    cost: { camelote: 200 * GRAINS_PER_UNIT, 'bave-etoiles': 40 * GRAINS_PER_UNIT },
    durationGongs: 270,
    reveals: { kind: 'deposit', resourceId: 'jus' },
  },
  'croute-calcifiee': {
    id: 'croute-calcifiee',
    cost: { camelote: 260 * GRAINS_PER_UNIT, 'bave-etoiles': 60 * GRAINS_PER_UNIT },
    durationGongs: 360,
    reveals: { kind: 'deposit', resourceId: 'bave-etoiles' },
  },
} as const satisfies Record<string, Omit<DeclaredObstacle, 'id'> & { id: string }>

/** Le catalogue **déclaré**. Comme pour les bâtiments, il n'a pas d'équivalent
 * résolu dans ce paquet : résoudre demande une longueur de gong. */
export const OBSTACLES: Readonly<Record<ObstacleId, DeclaredObstacle>> = SHAPES

/** Dérivée du catalogue, jamais déclarée à côté de lui (doc de stack § 5.1). */
export type ObstacleId = keyof typeof SHAPES

export const OBSTACLE_IDS = Object.keys(SHAPES) as readonly ObstacleId[]
