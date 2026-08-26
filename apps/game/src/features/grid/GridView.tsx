import type { CellView } from '@zaliba/domain'
import { type KeyboardEvent, useState } from 'react'

/**
 * La grille de la planète.
 *
 * **Le canvas est une vue, jamais le contrôle.** L'interaction passe par des
 * éléments du document focalisables, dont l'état est la source de vérité. Une
 * grille peinte serait plus jolie et inatteignable au clavier comme au lecteur
 * d'écran — et FR-058 en fait une exigence, pas une préférence.
 *
 * **`tabindex` mobile.** Une seule case est atteignable par tabulation ; les
 * flèches déplacent le curseur à l'intérieur. Rendre les trente-six cases
 * tabulables obligerait à trente-six tabulations pour traverser la grille, ce
 * qui est la façon habituelle de rendre une interface « accessible » et
 * impraticable.
 *
 * **FR-060 : jamais la couleur seule.** L'état d'une case et son gisement sont
 * dans son **nom accessible**. Une teinte n'existe pas pour qui ne la distingue
 * pas, ni pour qui écoute la page.
 */

/** Les noms des ressources, tels que le joueur les lit. */
const RESOURCE_LABELS: Readonly<Record<string, string>> = {
  camelote: 'Camelote',
  jus: 'Jus',
  'bave-etoiles': 'Bave d’étoiles',
}

/** Les noms des obstacles, tels que le joueur les lit. */
const OBSTACLE_LABELS: Readonly<Record<string, string>> = {
  eboulis: 'éboulis',
  rocher: 'rocher',
  'filon-enfoui': 'filon enfoui',
  'poche-scellee': 'poche scellée',
  'croute-calcifiee': 'croûte calcifiée',
}

export interface GridViewProps {
  readonly cells: readonly CellView[]
  readonly width: number
  readonly height: number
  readonly onSelect?: (cell: CellView) => void
}

/**
 * Le nom accessible d'une case — la seule description que tout le monde reçoit.
 *
 * Les coordonnées y sont en base 1 : « colonne 4, rangée 1 » se dit, « (3,0) »
 * se déchiffre.
 */
export function describeCell(cell: CellView): string {
  const position = `Colonne ${cell.x + 1}, rangée ${cell.y + 1}`

  const state =
    cell.state === 'obstructed'
      ? `obstruée par un ${OBSTACLE_LABELS[cell.obstacleId ?? ''] ?? 'obstacle'}`
      : cell.state === 'occupied'
        ? 'occupée par un bâtiment'
        : 'libre'

  const deposit =
    cell.depositOf === null
      ? ''
      : `, gisement de ${RESOURCE_LABELS[cell.depositOf] ?? cell.depositOf}`

  return `${position} : ${state}${deposit}`
}

export function GridView({ cells, width, height, onSelect }: GridViewProps) {
  /** Le curseur : l'index de la seule case tabulable. */
  const [cursor, setCursor] = useState(0)

  const rows = Array.from({ length: height }, (_, y) => cells.slice(y * width, (y + 1) * width))

  function handleKey(event: KeyboardEvent<HTMLDivElement>, index: number, cell: CellView) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect?.(cell)
      return
    }

    const next = neighbourOf(event.key, index, width, cells.length)
    if (next === null) return
    event.preventDefault()
    setCursor(next)
  }

  return (
    /*
      Des `div` portant les rôles ARIA, et non une `<table>`.
      Une `<table role="grid">` serait le motif canonique — et deux outils s'y
      opposent : le lint refuse un rôle interactif sur une table, et le calcul de
      rôle accessible employé par les tests ne dérive pas `td` → `gridcell` du
      rôle de la table ancêtre. Les rôles explicites sont donc **plus** fiables
      ici, parce qu'ils sont lus tels quels par tout le monde. Chaque dérogation
      au lint est justifiée à son emplacement.
    */
    // biome-ignore lint/a11y/useSemanticElements: aucun élément natif ne porte le rôle `grid` ; une `<table role="grid">` est refusée par la règle noNoninteractiveElementToInteractiveRole.
    <div role="grid" aria-label="Grille de la planète" aria-colcount={width} aria-rowcount={height}>
      {rows.map((row, y) => (
        // biome-ignore lint/a11y/useSemanticElements: `<tr>` hors d'une table n'est pas du HTML valide ; le rôle explicite est la seule voie. `tabIndex={-1}` rend la rangée atteignable par programme sans la rendre tabulable — seule la case du curseur l'est —, ce que le motif ARIA de grille attend d'une rangée.
        <div role="row" tabIndex={-1} key={`row-${row[0]?.y ?? y}`}>
          {row.map((cell, x) => {
            const index = y * width + x
            return (
              // biome-ignore lint/a11y/useSemanticElements: idem pour `<td>`.
              <div
                role="gridcell"
                key={`cell-${cell.x}-${cell.y}`}
                tabIndex={index === cursor ? 0 : -1}
                aria-label={describeCell(cell)}
                data-state={cell.state}
                data-deposit={cell.depositOf ?? undefined}
                onFocus={() => setCursor(index)}
                onKeyDown={(event) => handleKey(event, index, cell)}
                onClick={() => onSelect?.(cell)}
              >
                {/*
                  Un repère visuel **en plus** du nom accessible, jamais à sa
                  place : un caractère se voit en noir et blanc, et se lit.
                */}
                <span aria-hidden="true">{glyphOf(cell)}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * La case voisine dans la direction demandée, ou `null`.
 *
 * Le curseur **ne sort pas** de la grille et ne change pas de rangée sur un
 * déplacement horizontal. Rebondir vers le bord opposé ferait sauter d'une
 * rangée à l'autre sans que rien ne l'annonce — et un joueur qui navigue au
 * clavier perdrait sa place à chaque bout de ligne.
 */
export function neighbourOf(
  key: string,
  index: number,
  width: number,
  total: number,
): number | null {
  const horizontal = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  if (horizontal !== 0) {
    const next = index + horizontal
    const sameRow = Math.floor(next / width) === Math.floor(index / width)
    return next >= 0 && next < total && sameRow ? next : null
  }

  const vertical = key === 'ArrowDown' ? width : key === 'ArrowUp' ? -width : 0
  if (vertical === 0) return null

  const next = index + vertical
  return next >= 0 && next < total ? next : null
}

function glyphOf(cell: CellView): string {
  if (cell.state === 'obstructed') return '▓'
  if (cell.state === 'occupied') return '■'
  return cell.depositOf === null ? '·' : '◆'
}
