import type { WorkView } from '@zaliba/domain'

/**
 * Le chantier en cours.
 *
 * Un seul peut être actif (FR-033), et il n'est **ni annulable ni remplaçable**
 * (FR-037) : aucune route ne le permet. C'est plus solide qu'un refus — le
 * bouton n'existe pas, donc il n'y a rien à contourner. L'écran l'énonce
 * clairement plutôt que de laisser le joueur chercher le bouton.
 */

const NATURE_LABELS: Readonly<Record<string, string>> = {
  build: 'Construction',
  upgrade: 'Amélioration',
  demolish: 'Démolition',
  clear: 'Déblaiement',
}

export interface WorkInProgressProps {
  readonly work: WorkView | null
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3_600) return `${Math.ceil(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.ceil(seconds / 3_600)} h`
  return `${Math.ceil(seconds / 86_400)} j`
}

export function WorkInProgress({ work }: WorkInProgressProps) {
  if (work === null) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées. Une `<section>` étiquetée deviendrait un point de repère `region`, et `<fieldset>` annonce un groupe de champs de saisie : il n'y en a aucun ici.
      <div role="group" aria-label="Chantier">
        <p>Aucun chantier en cours.</p>
      </div>
    )
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées. Une `<section>` étiquetée deviendrait un point de repère `region`, et `<fieldset>` annonce un groupe de champs de saisie : il n'y en a aucun ici.
    <div role="group" aria-label="Chantier">
      <h2>{NATURE_LABELS[work.nature] ?? 'Chantier'} en cours</h2>
      <dl>
        <dt>Temps restant</dt>
        <dd>{formatDuration(work.remaining)}</dd>
      </dl>
      <p>Un chantier lancé ne peut être ni annulé ni remplacé.</p>
    </div>
  )
}
