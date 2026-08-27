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
 */

/** Ce qu'un déblaiement laisse derrière lui (FR-043). */
export type ClearingResult =
  | { readonly kind: 'bare-ground' }
  | { readonly kind: 'deposit'; readonly resourceId: ResourceId }

export interface Obstacle {
  readonly id: ObstacleId
  /**
   * Le coût du déblaiement, en grains. Jamais de Jus (FR-062) : il n'a aucun
   * débouché en 001, et l'exiger serait un blocage définitif déguisé en contenu.
   */
  readonly cost: Readonly<Partial<Record<ResourceId, number>>>
  readonly durationSeconds: number
  readonly reveals: ClearingResult
}

const BARE: ClearingResult = { kind: 'bare-ground' }

const SHAPES = {
  /** Le plus commun, et le moins cher : de la caillasse à pousser. */
  eboulis: {
    id: 'eboulis',
    cost: { camelote: 40 * GRAINS_PER_UNIT },
    durationSeconds: 300,
    reveals: BARE,
  },
  rocher: {
    id: 'rocher',
    cost: { camelote: 90 * GRAINS_PER_UNIT, 'bave-etoiles': 10 * GRAINS_PER_UNIT },
    durationSeconds: 900,
    reveals: BARE,
  },
  /** Coûteux, et il rend une veine : le déblaiement devient un investissement. */
  'filon-enfoui': {
    id: 'filon-enfoui',
    cost: { camelote: 150 * GRAINS_PER_UNIT, 'bave-etoiles': 25 * GRAINS_PER_UNIT },
    durationSeconds: 1_800,
    reveals: { kind: 'deposit', resourceId: 'camelote' },
  },
  'poche-scellee': {
    id: 'poche-scellee',
    cost: { camelote: 200 * GRAINS_PER_UNIT, 'bave-etoiles': 40 * GRAINS_PER_UNIT },
    durationSeconds: 2_700,
    reveals: { kind: 'deposit', resourceId: 'jus' },
  },
  'croute-calcifiee': {
    id: 'croute-calcifiee',
    cost: { camelote: 260 * GRAINS_PER_UNIT, 'bave-etoiles': 60 * GRAINS_PER_UNIT },
    durationSeconds: 3_600,
    reveals: { kind: 'deposit', resourceId: 'bave-etoiles' },
  },
} as const satisfies Record<string, Omit<Obstacle, 'id'> & { id: string }>

export const OBSTACLES: Readonly<Record<ObstacleId, Obstacle>> = SHAPES

/** Dérivée du catalogue, jamais déclarée à côté de lui (doc de stack § 5.1). */
export type ObstacleId = keyof typeof SHAPES

export const OBSTACLE_IDS = Object.keys(SHAPES) as readonly ObstacleId[]
