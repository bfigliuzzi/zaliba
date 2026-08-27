import type { CellView } from '@zaliba/domain'
import { type KeyboardEvent, useEffect, useRef } from 'react'
import { describeCell } from '../../lib/labels.js'
import { FootprintGhost, type GhostState, ghostMarkOf, ghostSuffix } from './FootprintGhost.js'

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
 * **Le curseur n'est pas ici.** Il vit au-dessus, dans l'écran de planète, parce
 * que l'aperçu, le fantôme, l'annonce et le lancement en dépendent tous. Une
 * grille qui détiendrait son curseur obligerait chacun de ces quatre à le lui
 * redemander, ou à en tenir une copie — et une copie de curseur est une seconde
 * position, donc un fantôme affiché à un endroit et une pose faite à un autre.
 *
 * **FR-060 : jamais la couleur seule.** L'état d'une case, son gisement et sa
 * place sous le fantôme sont dans son **nom accessible**. Une teinte n'existe pas
 * pour qui ne la distingue pas, ni pour qui écoute la page.
 */

export interface GridViewProps {
  readonly cells: readonly CellView[]
  readonly width: number
  readonly height: number
  /** L'index de la case du curseur : la seule tabulable. */
  readonly cursorIndex: number
  /** L'empreinte armée, ou `null` avant tout choix de bâtiment. */
  readonly ghost?: GhostState | null
  /** Traite une touche ; rend `true` si la grille l'a consommée. */
  readonly onKey?: (key: string) => boolean
  /** Un appui sur une case — le **même** parcours que le clavier (R14). */
  readonly onPoint?: (x: number, y: number) => void
  readonly onConfirm?: (cell: CellView) => void
}

/** Les touches qui confirment. Alignées sur celles du curseur. */
const CONFIRM = new Set(['Enter', ' '])

export function GridView({
  cells,
  width,
  height,
  cursorIndex,
  ghost = null,
  onKey,
  onPoint,
  onConfirm,
}: GridViewProps) {
  const container = useRef<HTMLDivElement>(null)

  /**
   * Déplacer le curseur **et** le focus.
   *
   * Les deux sont distincts, et les confondre est le défaut que le parcours de
   * bout en bout a trouvé : changer quel élément porte `tabIndex={0}` ne
   * focalise rien. Le navigateur garde le focus là où il était, et un joueur au
   * clavier reste bloqué sur la première case en croyant que la grille ne répond
   * pas. Compter les `tabIndex` ne pouvait pas l'attraper — le compte était juste.
   *
   * La garde `contains` est ce qui empêche la grille de **voler** le focus : elle
   * ne le déplace que si elle l'avait déjà. Sans elle, chaque changement de
   * curseur — y compris celui qu'un appui de pointeur provoque ailleurs sur la
   * page — arracherait le focus au champ que le joueur était en train de lire.
   */
  useEffect(() => {
    const root = container.current
    if (root === null) return
    if (!root.contains(document.activeElement)) return
    root.querySelector<HTMLElement>(`[data-index="${cursorIndex}"]`)?.focus()
  }, [cursorIndex])

  const rows = Array.from({ length: height }, (_, y) => cells.slice(y * width, (y + 1) * width))

  function handleKey(event: KeyboardEvent<HTMLDivElement>, cell: CellView) {
    if (CONFIRM.has(event.key)) {
      event.preventDefault()
      onConfirm?.(cell)
      return
    }
    // Les flèches font défiler la page par défaut : ne pas les retenir ferait
    // bouger l'écran sous le joueur à chaque déplacement de curseur.
    if (onKey?.(event.key) === true) event.preventDefault()
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
    <div
      ref={container}
      role="grid"
      aria-label="Grille de la planète"
      aria-colcount={width}
      aria-rowcount={height}
    >
      {rows.map((row, y) => (
        // biome-ignore lint/a11y/useSemanticElements: `<tr>` hors d'une table n'est pas du HTML valide ; le rôle explicite est la seule voie. `tabIndex={-1}` rend la rangée atteignable par programme sans la rendre tabulable — seule la case du curseur l'est —, ce que le motif ARIA de grille attend d'une rangée.
        <div role="row" tabIndex={-1} key={`row-${row[0]?.y ?? y}`}>
          {row.map((cell, x) => {
            const index = y * width + x
            const mark = ghostMarkOf(ghost, cell)
            return (
              // biome-ignore lint/a11y/useSemanticElements: idem pour `<td>`.
              <div
                role="gridcell"
                key={`cell-${cell.x}-${cell.y}`}
                data-index={index}
                tabIndex={index === cursorIndex ? 0 : -1}
                aria-label={`${describeCell(cell)}${ghostSuffix(mark)}`}
                data-state={cell.state}
                data-deposit={cell.depositOf ?? undefined}
                onFocus={() => onPoint?.(cell.x, cell.y)}
                onKeyDown={(event) => handleKey(event, cell)}
                onClick={() => onPoint?.(cell.x, cell.y)}
              >
                {/*
                  Un repère visuel **en plus** du nom accessible, jamais à sa
                  place : un caractère se voit en noir et blanc, et se lit.
                */}
                <span aria-hidden="true">{glyphOf(cell)}</span>
                <FootprintGhost mark={mark} />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function glyphOf(cell: CellView): string {
  if (cell.state === 'obstructed') return '▓'
  if (cell.state === 'occupied') return '■'
  return cell.depositOf === null ? '·' : '◆'
}
