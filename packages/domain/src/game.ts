import type { Catalogs } from './kernel/catalogs.js'
import {
  type CompletionResolver,
  consolidate,
  type ProjectedState,
  project,
} from './kernel/projection.js'
import type { PlanetSnapshot } from './kernel/snapshot.js'
import type { Instant } from './kernel/time.js'
import { effectsOnCompletion } from './modules/construction/completion.js'

/**
 * La racine de composition : le seul endroit qui connaît **à la fois** le noyau
 * et les modules.
 *
 * Elle existe parce que « `kernel` n'importe jamais un module. Aucune
 * exception » (doc de stack § 5.2). La projection a pourtant besoin de savoir ce
 * qu'un chantier échu produit — et cette connaissance appartient à
 * `modules/construction`. Le noyau prend donc un résolveur en argument, et ce
 * fichier le lui fournit.
 *
 * Ce n'est pas une couche de plus : c'est **cinq lignes de câblage**, et c'est
 * exactement ce que la règle demande. Le jour où une seconde mécanique produira
 * des achèvements, c'est ici — et nulle part dans le noyau — que le graphe des
 * modules se déclarera.
 *
 * Tout appelant hors du domaine — l'API, le client — passe par ces fonctions,
 * jamais par `project` nu.
 */

/** Le résolveur d'achèvement de 001 : la construction, et rien d'autre. */
export const RESOLVE_COMPLETION: CompletionResolver = effectsOnCompletion

/** `project`, câblé sur les modules de cette itération. */
export function projectPlanet(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  at: Instant,
): ProjectedState {
  return project(snapshot, catalogs, at, RESOLVE_COMPLETION)
}

/** `consolidate`, câblé sur les modules de cette itération. */
export function consolidatePlanet(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  at: Instant,
): PlanetSnapshot {
  return consolidate(snapshot, catalogs, at, RESOLVE_COMPLETION)
}
