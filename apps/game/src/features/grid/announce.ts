import type { FootprintId } from '@zaliba/catalogs'
import type { Catalogs, CellView, PlacementCheck } from '@zaliba/domain'
import { orientationCount } from '@zaliba/domain'
import { describeCell, describePosition, FOOTPRINT_LABELS } from '../../lib/labels.js'

/**
 * Ce qu'un lecteur d'écran entend quand le curseur bouge (FR-059).
 *
 * Six informations, et la spécification les énumère : position, contenu de la
 * case, empreinte courante, orientation, validité du placement, nombre de
 * gisements recouverts. Aucune n'est facultative — c'est exactement ce qu'un
 * joueur voyant lit d'un coup d'œil sur le fantôme de l'empreinte, et le
 * restituer autrement serait livrer deux jeux différents.
 *
 * **Une phrase, pas un rendu.** L'annonce est une fonction pure de l'état, ce
 * qui la rend comparable — donc éprouvable — et laisse au composant la seule
 * charge de la placer dans une région `aria-live`.
 */

export interface PlacementAnnouncement {
  readonly cell: CellView
  /** `null` avant tout choix de bâtiment : le curseur existe pour explorer. */
  readonly variantId: FootprintId | null
  readonly orientation: number
  /** `null` quand il n'y a pas d'empreinte, donc rien à valider. */
  readonly check: PlacementCheck | null
  readonly coveredDeposits: number
}

/**
 * L'orientation, énoncée **telle qu'elle est perçue**.
 *
 * Une empreinte à orientation unique — le carré de quatre, le carré de neuf, la
 * case seule — s'annonce « orientation unique » et non « orientation 3 sur 4 ».
 * La différence n'est pas cosmétique : numéroter dirait au joueur qu'il vient de
 * changer quelque chose alors que rien n'a bougé, et il tournerait quatre fois
 * pour comprendre que la commande est sans effet. Le dédoublonnage des
 * orientations de R6 n'est donc pas une optimisation de données, c'est une
 * exigence d'accessibilité.
 */
function describeOrientation(
  variantId: FootprintId,
  orientation: number,
  catalogs: Catalogs,
): string {
  const count = orientationCount(variantId, catalogs)
  if (count === 1) return 'orientation unique'
  return `orientation ${(orientation % count) + 1} sur ${count}`
}

/** Le compte de gisements, accordé. « Aucun » se dit, « 0 » se déchiffre. */
function describeDeposits(count: number): string {
  if (count === 0) return 'aucun gisement recouvert'
  if (count === 1) return '1 gisement recouvert'
  return `${count} gisements recouverts`
}

/**
 * Le motif d'un refus, **avec ses cases fautives**.
 *
 * Toutes les cases, et non seulement la première : le joueur qui n'entend qu'une
 * case en corrige une pour en découvrir une autre. C'est la même exigence que
 * FR-013 côté domaine, portée jusqu'à l'oreille.
 */
function describeRefusal(check: Exclude<PlacementCheck, { kind: 'ok' }>): string {
  const reason =
    check.kind === 'out-of-grid'
      ? 'hors de la grille'
      : check.kind === 'obstructed'
        ? 'case obstruée'
        : 'case occupée'

  const cells = check.cells.map((cell) => describePosition(cell)).join(', ')
  return `Placement refusé : ${reason} en ${cells}.`
}

export function announcePlacement(announcement: PlacementAnnouncement, catalogs: Catalogs): string {
  const parts = [`${describeCell(announcement.cell)}.`]

  if (announcement.variantId === null) {
    // Le curseur existe avant tout choix de bâtiment : c'est ainsi qu'un joueur
    // explore sa planète. Annoncer une empreinte imaginaire, ou taire la case,
    // seraient deux façons de le perdre.
    parts.push('Aucune empreinte sélectionnée.')
    return parts.join(' ')
  }

  parts.push(
    `Empreinte ${FOOTPRINT_LABELS[announcement.variantId]}, ` +
      `${describeOrientation(announcement.variantId, announcement.orientation, catalogs)}.`,
  )

  if (announcement.check === null) return parts.join(' ')

  if (announcement.check.kind === 'ok') {
    parts.push(`Placement valide, ${describeDeposits(announcement.coveredDeposits)}.`)
  } else {
    // Aucun compte de gisements sur un placement refusé : il annoncerait une
    // production que ce placement ne donnera jamais.
    parts.push(describeRefusal(announcement.check))
  }

  return parts.join(' ')
}
