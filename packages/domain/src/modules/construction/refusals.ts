import type { ResourceAmount, WorkId, WorkNature } from '../../kernel/effects.js'
import type { ProjectedState } from '../../kernel/projection.js'
import type { Instant } from '../../kernel/time.js'

/**
 * Les motifs de refus **communs à toutes les mécaniques de construction**.
 *
 * Deux motifs ne dépendent pas de ce qu'on construit : la planète est déjà
 * occupée par un chantier, ou le compte n'y est pas. Les redéclarer dans chaque
 * mécanique — pose, amélioration, déblaiement, démolition — donnerait quatre
 * formes structurellement identiques et indépendamment modifiables. Ce serait
 * quatre endroits où oublier une entrée, et l'oubli se paierait deux couches plus
 * haut : la table de libellés de l'API et la table de phrases du client sont
 * indexées par `code`, et un code dont la forme de détail varie selon la mécanique
 * ferait afficher au joueur un refus incomplet.
 *
 * Ils vivent donc ici, et non dans `build.ts` : la pose est arrivée la première,
 * elle n'est pas pour autant propriétaire d'un vocabulaire partagé.
 *
 * **Les constructeurs, et pas seulement les types.** L'ordre des contrôles est
 * propre à chaque mécanique — c'est ce que le joueur doit entendre en premier —,
 * mais le *contenu* d'un refus ne l'est pas. Le fabriquer une fois garantit qu'un
 * `work-in-progress` dit toujours quand revenir, quelle que soit l'action refusée.
 */

/**
 * Au plus un chantier par planète (FR-033, FR-034).
 *
 * L'échéance est dans le motif, et SC-006 l'exige : « un chantier est en cours »
 * n'apprend rien, « il s'achève dans deux minutes » dit quand revenir.
 */
export interface WorkInProgressRefusal {
  readonly code: 'work-in-progress'
  readonly workId: WorkId
  readonly nature: WorkNature
  readonly dueAt: Instant
}

/**
 * Le manque **par ressource**, et le temps pour le combler (SC-007).
 *
 * `secondsUntilAffordable` vaut `null` quand le rythme courant n'y suffira
 * jamais — la ressource sature avant. C'est une information utile et non un cas
 * d'erreur : elle dit au joueur qu'attendre ne servira à rien, et qu'il lui faut
 * d'abord un entrepôt.
 */
export interface InsufficientResourcesRefusal {
  readonly code: 'insufficient-resources'
  readonly shortfall: readonly ResourceAmount[]
  readonly secondsUntilAffordable: number | null
}

/** Le refus « chantier en cours » depuis l'état projeté qui le porte. */
export function workInProgress(work: NonNullable<ProjectedState['work']>): WorkInProgressRefusal {
  return {
    code: 'work-in-progress',
    workId: work.id,
    nature: work.nature,
    dueAt: work.dueAt,
  }
}

/** Le refus « compte insuffisant », manque et délai compris. */
export function insufficientResources(
  shortfall: readonly ResourceAmount[],
  secondsUntilAffordable: number | null,
): InsufficientResourcesRefusal {
  return { code: 'insufficient-resources', shortfall, secondsUntilAffordable }
}
