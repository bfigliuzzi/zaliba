import type { PlanetSnapshotV1 } from '@zaliba/contracts'

/**
 * Ce que l'écran de planète attend du serveur — et rien de plus.
 *
 * Deux opérations, déclarées comme un **port** plutôt que prises directement du
 * client `ts-rest`. Ce n'est pas de l'abstraction pour l'abstraction : c'est ce
 * qui permet d'éprouver le déclenchement du provisionnement — un `404` qui n'est
 * pas une erreur — sans monter un serveur, et ce qui empêche un composant
 * d'aller chercher une troisième route au passage.
 */
export interface PlanetGateway {
  /** Lit l'instantané. Lève avec `code: 'planet-not-provisioned'` s'il n'y en a pas. */
  read(): Promise<PlanetSnapshotV1>
  /** Fonde la colonie. Idempotente côté serveur (R11). */
  provision(): Promise<PlanetSnapshotV1>
}

/** Le motif que le serveur oppose à une planète absente (contrats § 5). */
export const PLANET_NOT_PROVISIONED = 'planet-not-provisioned'

/**
 * Reconnaît le refus « pas encore de planète ».
 *
 * Reconnu par son **code**, jamais par son message : le message est un libellé
 * lisible et n'est jamais la source de vérité (contrats § 5). Le reconnaître au
 * texte casserait à la première reformulation, et casserait en silence — le
 * client provisionnerait alors en boucle, ou n'accueillerait plus personne.
 */
export function isNotProvisioned(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === PLANET_NOT_PROVISIONED
}
