import type { BuildingView, Catalogs, Cell, CellView, PlacementCheck } from '@zaliba/domain'
import {
  adresseOf,
  articleDefini,
  articleIndefini,
  BUILDING_GENRE,
  BUILDING_LABELS,
  OBSTACLE_GENRE,
  OBSTACLE_LABELS,
} from '../../lib/labels.js'

/**
 * La raison d'un refus de pose, **mise en mots** (FR-021, R12).
 *
 * 001 marquait le refus ; il ne le motivait pas. Un joueur au clavier apprenait
 * donc *qu'*une case refuse sans apprendre *pourquoi*, et il essayait les
 * trente-six cases. C'est la raison d'être d'US3.
 *
 * ---
 *
 * **Une fonction de présentation, et la frontière est nette.**
 *
 * Le domaine rend déjà l'union fermée des motifs et l'énumération **complète** des
 * cases fautives ; il ne rend pas de phrase, et il ne doit pas en rendre. La
 * direction d'un débordement — « par la droite » — est de la géométrie
 * d'affichage : elle se calcule des cases hors bornes contre les dimensions de la
 * parcelle, sans que le domaine ait à connaître le mot « droite ».
 *
 * **Il n'y a jamais qu'une cause à traduire.** `validatePlacement` rend un seul
 * verdict, selon une priorité fixée dans le domaine — hors parcelle, puis obstrué,
 * puis occupé —, et le motif y est écrit : « une case absente de la grille n'a
 * aucun état à examiner ». Aucune règle d'agrégation de causes n'a donc d'objet
 * ici, et le test le constate plutôt que de le supposer.
 *
 * **Ce qui est cumulé, ce sont les cases** — toutes. Un joueur qui n'entend qu'une
 * case en corrige une pour en découvrir une autre.
 */

export interface ContexteDeRefus {
  /** Les dimensions de la parcelle, d'où se déduit la direction d'un débordement. */
  readonly bounds: { readonly width: number; readonly height: number }
  /** La grille projetée, pour nommer l'obstacle d'une case fautive. */
  readonly grid: readonly CellView[]
  /** Les bâtiments projetés, pour nommer celui qu'une empreinte chevauche. */
  readonly buildings: readonly BuildingView[]
  readonly catalogs: Catalogs
}

/**
 * Les quatre directions, dans l'ordre où on les énonce.
 *
 * L'ordre est fixé pour que deux débordements identiques produisent la même
 * phrase : une phrase qui change d'ordre d'un rendu à l'autre est une phrase qu'un
 * lecteur d'écran réénonce sans que rien n'ait bougé.
 */
const DIRECTIONS = [
  { nom: 'par le haut', dehors: (cell: Cell) => cell.y < 0 },
  { nom: 'par le bas', dehors: (cell: Cell, hauteur: number) => cell.y >= hauteur },
  { nom: 'par la gauche', dehors: (cell: Cell) => cell.x < 0 },
  { nom: 'par la droite', dehors: (cell: Cell, _h: number, largeur: number) => cell.x >= largeur },
] as const

/** « par la droite », « par la droite et par le bas ». */
function enumerer(elements: readonly string[]): string {
  if (elements.length <= 1) return elements[0] ?? ''
  return `${elements.slice(0, -1).join(', ')} et ${elements[elements.length - 1]}`
}

function raisonDeDebordement(cells: readonly Cell[], contexte: ContexteDeRefus): string {
  const { width, height } = contexte.bounds

  const directions = DIRECTIONS.filter(({ dehors }) =>
    cells.some((cell) => dehors(cell, height, width)),
  ).map(({ nom }) => nom)

  const compte = cells.length
  const verbe = compte === 1 ? 'case sort' : 'cases sortent'
  return `${compte} ${verbe} de la parcelle ${enumerer(directions)}`
}

function raisonDObstruction(cells: readonly Cell[], contexte: ContexteDeRefus): string {
  const clauses = cells.map((cell, index) => {
    const adresse = adresseOf(cell)
    const vue = contexte.grid.find((une) => une.x === cell.x && une.y === cell.y)
    const obstacleId = vue?.obstacleId ?? null

    const obstacle =
      obstacleId === null
        ? 'un obstacle'
        : `${articleIndefini(OBSTACLE_GENRE[obstacleId])} ${OBSTACLE_LABELS[obstacleId]}`

    // La seconde clause et les suivantes élident « est obstruée » : « la case A3
    // est obstruée par un éboulis et la case B3 par un rocher » se lit ; répéter
    // le verbe quatre fois fait une litanie que personne n'écoute jusqu'au bout.
    return index === 0
      ? `la case ${adresse} est obstruée par ${obstacle}`
      : `la case ${adresse} par ${obstacle}`
  })

  return enumerer(clauses)
}

function raisonDOccupation(cells: readonly Cell[], contexte: ContexteDeRefus): string {
  /*
    **Groupé par bâtiment**, et non par case. Un bâtiment de quatre cases
    recouvertes ne se nomme qu'une fois : le répéter ferait croire à quatre
    bâtiments, et allongerait de trois fois ce qu'un lecteur d'écran énonce.
  */
  const vus = new Set<string>()
  const clauses: string[] = []

  for (const cell of cells) {
    const batiment = contexte.buildings.find((une) =>
      une.cells.some((autre) => autre.x === cell.x && autre.y === cell.y),
    )

    if (batiment === undefined) {
      clauses.push(`un bâtiment en ${adresseOf(cell)}`)
      continue
    }
    if (vus.has(batiment.id)) continue
    vus.add(batiment.id)

    const nom = BUILDING_LABELS[batiment.typeId] ?? batiment.typeId
    const article = articleDefini(BUILDING_GENRE[batiment.typeId])
    // L'adresse est celle de l'**ancre** du bâtiment, non de la case recouverte :
    // c'est par elle que le joueur le désigne partout ailleurs dans l'écran.
    clauses.push(`${article} ${nom} niveau ${batiment.level} en ${adresseOf(batiment.anchor)}`)
  }

  return `chevauche ${enumerer(clauses)}`
}

/**
 * La phrase d'un verdict de placement, ou `null` s'il est accepté.
 *
 * Le `switch` est exhaustif sur l'union du domaine : ajouter un motif de refus
 * fera échouer la compilation ici, plutôt qu'afficher un refus sans cause.
 */
export function raisonDeRefus(check: PlacementCheck, contexte: ContexteDeRefus): string | null {
  switch (check.kind) {
    case 'ok':
      return null
    case 'out-of-grid':
      return raisonDeDebordement(check.cells, contexte)
    case 'obstructed':
      return raisonDObstruction(check.cells, contexte)
    case 'occupied':
      return raisonDOccupation(check.cells, contexte)
  }
}
