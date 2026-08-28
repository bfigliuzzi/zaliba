import type { BuildingView, WorkView } from '@zaliba/domain'
import { PlaqueChantier } from '../regie/PlaqueChantier.js'

/**
 * Le chantier en cours — **la plaque de la Régie, montée à sa place**.
 *
 * Ce fichier ne porte plus de rendu : il ne reste que la frontière. La plaque, ses
 * quatre grandeurs (FR-009) et la dérivation de l'avancement vivent dans
 * `features/regie/PlaqueChantier.tsx`, avec les autres blocs de la Régie.
 *
 * **Pourquoi le garder plutôt que monter la plaque directement.** Trois choses
 * citent `CurrentWork` : l'écran de parcelle, son test unitaire, et deux parcours
 * de bout en bout. Le nom est celui sous lequel la mécanique de 001 est connue, et
 * la tranche 002 ne renomme pas ce qu'elle réhabille — elle en change le rendu, et
 * le principe V lui interdit d'en profiter pour redessiner l'assemblage.
 *
 * **Ce qui n'a pas changé** : la dérivation de l'état. Le composant reçoit la
 * `WorkView` que la projection rend, exactement comme avant, et n'en tire que de
 * la présentation.
 */

export interface CurrentWorkProps {
  readonly work: WorkView | null
  readonly buildings: readonly BuildingView[]
}

export function CurrentWork({ work, buildings }: CurrentWorkProps) {
  return <PlaqueChantier work={work} buildings={buildings} />
}
