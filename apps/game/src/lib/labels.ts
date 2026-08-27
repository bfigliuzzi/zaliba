import type { BuildingTypeId, FootprintId, ObstacleId, ResourceId } from '@zaliba/catalogs'
import type { CellView } from '@zaliba/domain'

/**
 * Le vocabulaire que le joueur lit.
 *
 * Les identifiants de contenu de jeu sont en kebab-case français (R18) : ce sont
 * des clés, pas des phrases. `square-4` se déchiffre, « carré de quatre » se dit
 * — et ce fichier est la **seule** table de correspondance entre les deux.
 *
 * Une seule table, et non une par composant : la grille, le panneau de
 * construction et la région d'annonce nomment forcément les mêmes choses. Deux
 * tables divergeraient, et le lecteur d'écran finirait par énoncer un nom que
 * l'écran n'affiche pas — c'est-à-dire par décrire un autre jeu.
 */

export const RESOURCE_LABELS: Readonly<Record<ResourceId, string>> = {
  camelote: 'Camelote',
  jus: 'Jus',
  'bave-etoiles': 'Bave d’étoiles',
}

/**
 * Les gisements, nommés par le **vocabulaire du jeu** et non par leur ressource.
 *
 * « Veine », « geyser », « récif » : ce sont les mots du document de conception
 * § 1, et ils ne sont pas de la décoration. Un joueur qui lit « geyser de Jus »
 * apprend que ce gisement se nomme, donc qu'il existe un vocabulaire à connaître ;
 * « gisement de Jus » lui aurait fait croire à une catégorie interchangeable.
 * L'aperçu du déblaiement en dépend directement — il annonce ce que le joueur
 * achète —, et la grille emploie les mêmes mots pour que ce soit le même jeu des
 * deux côtés.
 */
export const DEPOSIT_LABELS: Readonly<Record<ResourceId, string>> = {
  camelote: 'veine de Camelote',
  jus: 'geyser de Jus',
  'bave-etoiles': 'récif de Bave d’étoiles',
}

export const OBSTACLE_LABELS: Readonly<Record<ObstacleId, string>> = {
  eboulis: 'éboulis',
  rocher: 'rocher',
  'filon-enfoui': 'filon enfoui',
  'poche-scellee': 'poche scellée',
  'croute-calcifiee': 'croûte calcifiée',
}

export const BUILDING_LABELS: Readonly<Record<BuildingTypeId, string>> = {
  mine: 'Mine',
  puits: 'Puits',
  racloir: 'Racloir',
  centrale: 'Centrale',
  entrepot: 'Entrepôt',
}

/**
 * Les sept empreintes, nommées par leur **forme** et non par leur taille seule.
 *
 * « L de quatre » plutôt que « L » : le nombre de cases est ce qui décide si une
 * empreinte tient dans un espace, et le joueur doit l'entendre sans avoir à
 * compter les cases d'un fantôme.
 */
export const FOOTPRINT_LABELS: Readonly<Record<FootprintId, string>> = {
  single: 'Une case',
  'line-2': 'Deux en ligne',
  'square-4': 'Carré de quatre',
  'l-4': 'L de quatre',
  't-4': 'T de quatre',
  'rect-6': 'Rectangle de six',
  'square-9': 'Carré de neuf',
}

/**
 * La position d'une case, **en base 1**.
 *
 * « Colonne 4, rangée 1 » se dit ; « (3,0) » se déchiffre. Le décalage est la
 * seule concession faite à l'affichage sur des coordonnées qui sont, partout
 * ailleurs, indexées à zéro — et il est fait ici, une fois.
 */
export function describePosition(cell: { readonly x: number; readonly y: number }): string {
  return `Colonne ${cell.x + 1}, rangée ${cell.y + 1}`
}

/**
 * Le nom accessible d'une case — la seule description que **tout le monde**
 * reçoit.
 *
 * FR-060 : jamais la couleur seule. L'état d'une case et son gisement sont dans
 * son nom accessible, parce qu'une teinte n'existe pas pour qui ne la distingue
 * pas, ni pour qui écoute la page.
 */
export function describeCell(cell: CellView): string {
  const state =
    cell.state === 'obstructed'
      ? `obstruée par un ${OBSTACLE_LABELS[cell.obstacleId as ObstacleId] ?? 'obstacle'}`
      : cell.state === 'occupied'
        ? 'occupée par un bâtiment'
        : 'libre'

  const deposit =
    cell.depositOf === null ? '' : `, ${DEPOSIT_LABELS[cell.depositOf] ?? cell.depositOf}`

  return `${describePosition(cell)} : ${state}${deposit}`
}
