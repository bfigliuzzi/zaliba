import type { WorkView } from '@zaliba/domain'
import { formatDuration } from '../../lib/format.js'
import { BUILDING_LABELS, describePosition, FOOTPRINT_LABELS } from '../../lib/labels.js'

/**
 * Le chantier en cours : sa nature, **sa cible** et le temps restant (FR-038).
 *
 * La cible est ce qui manquait à la première version de cet écran, et son
 * absence n'était pas anodine : « construction en cours, deux minutes » ne dit
 * pas *quoi*, donc ne permet pas de vérifier qu'on a lancé ce qu'on croyait
 * lancer. Or le chantier n'est **ni annulable ni remplaçable** (FR-037) — c'est
 * précisément quand l'erreur est irréversible que le joueur doit pouvoir la
 * constater.
 *
 * Le temps restant est **extrapolé localement**, comme les compteurs de
 * ressources : il vient de la projection rejouée à la seconde, sans un seul appel
 * réseau (R8).
 */

const NATURE_LABELS: Readonly<Record<WorkView['nature'], string>> = {
  build: 'Construction',
  upgrade: 'Amélioration',
  demolish: 'Démolition',
  clear: 'Déblaiement',
}

export interface CurrentWorkProps {
  readonly work: WorkView | null
}

/**
 * La cible, en clair.
 *
 * L'union discriminée du domaine rend ce `switch` exhaustif : ajouter une nature
 * de cible fera échouer la compilation ici, plutôt qu'afficher un chantier sans
 * cible.
 *
 * La branche `building` reste volontairement sans nom de bâtiment. Le nommer
 * demanderait la liste des bâtiments projetés, et les deux tranches qui
 * produisent ce genre de chantier — l'amélioration et la démolition — ne sont pas
 * livrées. Afficher un identifiant technique en attendant serait pire que ne rien
 * dire : ce serait dire quelque chose d'illisible.
 */
function describeTarget(work: WorkView): string {
  switch (work.target.kind) {
    case 'build': {
      const typeId = work.target.typeId as keyof typeof BUILDING_LABELS
      const label = BUILDING_LABELS[typeId] ?? typeId
      const footprint = FOOTPRINT_LABELS[work.target.variantId] ?? work.target.variantId
      return `${label} (${footprint.toLowerCase()}) en ${describePosition(work.target.anchor)}`
    }
    case 'building':
      return 'un bâtiment posé'
    case 'cell':
      return describePosition(work.target.cell)
  }
}

export function CurrentWork({ work }: CurrentWorkProps) {
  if (work === null) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées. Une `<section>` étiquetée deviendrait un point de repère `region`, et `<fieldset>` annonce un groupe de champs de saisie : il n'y en a aucun ici.
      <div role="group" aria-label="Chantier">
        <p>Aucun chantier en cours.</p>
      </div>
    )
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
    <div role="group" aria-label="Chantier">
      <h2>{NATURE_LABELS[work.nature]} en cours</h2>
      <dl>
        <dt>Cible</dt>
        <dd>{describeTarget(work)}</dd>

        <dt>Temps restant</dt>
        <dd>{formatDuration(work.remaining)}</dd>
      </dl>
      <p>Un chantier lancé ne peut être ni annulé ni remplacé.</p>
    </div>
  )
}
