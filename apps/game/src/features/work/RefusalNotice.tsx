import type { ResourceId } from '@zaliba/catalogs'
import type { Instant } from '@zaliba/domain'
import { formatDuration, formatUnits } from '../../lib/format.js'
import { describePosition, RESOURCE_LABELS } from '../../lib/labels.js'
import type { PlanetRefusal } from '../../lib/planetGateway.js'

/**
 * Le refus, énoncé avec son **motif exact** (FR-013, FR-060, SC-006, SC-007).
 *
 * Trois décisions gouvernent ce composant, et aucune n'est cosmétique.
 *
 * **Le `code` est la source de vérité, jamais le message.** Le serveur envoie
 * les deux ; le message est un libellé lisible qui peut être reformulé sans
 * préavis, et le reconnaître au texte casserait en silence à la première
 * retouche (contrats § 5). Ce fichier est donc la table qui traduit un code en
 * phrase — et un code inconnu retombe sur le message du serveur plutôt que sur
 * un écran muet.
 *
 * **`role="alert"`, et rendu seulement en présence d'un refus.** Un conteneur
 * vide et permanent n'est pas annoncé de façon fiable par tous les lecteurs
 * d'écran, alors qu'un élément `alert` qui apparaît l'est toujours. C'est
 * l'inverse du choix fait pour la région de curseur, et pour la raison inverse :
 * un refus est une interruption légitime, un déplacement de curseur non.
 *
 * **Le détail chiffré fait la différence entre un refus et une impasse.** « Un
 * chantier est en cours » n'apprend rien ; « il s'achève dans deux minutes » dit
 * quand revenir. Même chose pour les cases fautives, et pour le manque par
 * ressource.
 */

export interface RefusalNoticeProps {
  readonly refusal: PlanetRefusal | null
  /** L'instant courant, pour dire *dans combien de temps* plutôt que *quand*. */
  readonly at: Instant
}

interface Cell {
  readonly x: number
  readonly y: number
}

interface Shortfall {
  readonly resourceId: ResourceId
  readonly grains: number
}

function cellsOf(details: Record<string, unknown> | undefined): readonly Cell[] {
  const cells = details?.['cells']
  return Array.isArray(cells) ? (cells as readonly Cell[]) : []
}

function describeCells(details: Record<string, unknown> | undefined): string {
  const cells = cellsOf(details)
  return cells.length === 0 ? '' : ` : ${cells.map(describePosition).join(', ')}`
}

/**
 * La phrase d'un refus.
 *
 * Le `switch` n'a pas de branche exhaustive imposée par le compilateur — le code
 * vient du réseau, donc d'une union que le serveur peut élargir avant le client.
 * C'est pourquoi le cas par défaut rend le message du serveur : un client ancien
 * qui rencontre un motif inédit doit dire quelque chose de vrai, pas rien.
 */
function describeRefusal(refusal: PlanetRefusal, at: Instant): string {
  const details = refusal.details

  switch (refusal.code) {
    case 'work-in-progress': {
      const dueAt = typeof details?.['dueAt'] === 'number' ? details['dueAt'] : null
      const remaining = dueAt === null ? null : Math.max(0, dueAt - at)
      return remaining === null
        ? 'Un chantier est déjà en cours sur cette planète.'
        : `Un chantier est déjà en cours : il s’achève dans ${formatDuration(remaining)}.`
    }

    case 'placement-out-of-grid':
      return `L’empreinte sortirait de la grille${describeCells(details)}.`

    case 'placement-on-obstructed-cell':
      return `L’empreinte recouvrirait une case obstruée${describeCells(details)}.`

    case 'placement-on-occupied-cell':
      return `L’empreinte recouvrirait une case déjà occupée${describeCells(details)}.`

    case 'variant-not-available-for-type':
      return 'Ce type de bâtiment n’admet pas cette empreinte.'

    case 'insufficient-resources': {
      const shortfall = Array.isArray(details?.['shortfall'])
        ? (details['shortfall'] as readonly Shortfall[])
        : []
      const missing = shortfall
        .map((amount) => `${formatUnits(amount.grains)} ${RESOURCE_LABELS[amount.resourceId]}`)
        .join(', ')
      const seconds = details?.['secondsUntilAffordable']
      const when =
        typeof seconds === 'number'
          ? ` Payable dans ${formatDuration(seconds)}.`
          : ' Le rythme courant n’y suffira pas : un entrepôt est nécessaire.'
      return `Il manque ${missing}.${when}`
    }

    default:
      return refusal.message
  }
}

export function RefusalNotice({ refusal, at }: RefusalNoticeProps) {
  if (refusal === null) return null

  return (
    <p role="alert" data-refusal={refusal.code}>
      {describeRefusal(refusal, at)}
    </p>
  )
}
