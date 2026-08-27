import type { Cell } from '@zaliba/domain'

/**
 * Le fantôme de l'empreinte orientée, sous le curseur.
 *
 * **Il vit dans les cases, et non par-dessus.** Un calque positionné en absolu
 * serait plus simple à dessiner et reproduirait le défaut que la constitution
 * proscrit : une surface peinte que ni le clavier ni le lecteur d'écran
 * n'atteignent. Ici, chaque case porte sa propre marque, dans le même document
 * que son rôle et son nom accessible.
 *
 * **FR-060 : jamais la couleur seule.** La validité est portée par un caractère
 * — qui se voit en noir et blanc — et par un mot ajouté au nom accessible de la
 * case — qui s'entend. La teinte, quand il y en aura une, ne sera qu'un troisième
 * signal redondant.
 */

/** L'empreinte armée sous le curseur, telle que l'écran doit la montrer. */
export interface GhostState {
  /** Les cases que l'empreinte orientée occuperait. */
  readonly cells: readonly Cell[]
  readonly valid: boolean
  /** Les cases qui font échouer le placement, énumérées (FR-013). */
  readonly faultyCells: readonly Cell[]
}

/** Ce qu'une case a à montrer du fantôme, ou `null` si elle n'est pas dessous. */
export type GhostMark = 'valid' | 'invalid' | 'faulty'

const key = (cell: Cell): string => `${cell.x},${cell.y}`

/**
 * La marque d'une case.
 *
 * L'ordre est significatif : une case **fautive** l'emporte sur « invalide ».
 * Sans cela, les quatre cases d'un carré porteraient le même signe et le joueur
 * saurait que quelque chose ne va pas sans savoir *où* — ce qui est précisément
 * ce que FR-013 refuse.
 */
export function ghostMarkOf(ghost: GhostState | null, cell: Cell): GhostMark | null {
  if (ghost === null) return null
  if (ghost.faultyCells.some((faulty) => key(faulty) === key(cell))) return 'faulty'
  if (!ghost.cells.some((covered) => key(covered) === key(cell))) return null
  return ghost.valid ? 'valid' : 'invalid'
}

/** Le mot ajouté au nom accessible de la case. Vide si elle n'est pas dessous. */
export function ghostSuffix(mark: GhostMark | null): string {
  switch (mark) {
    case 'valid':
      return ', sous l’empreinte'
    case 'invalid':
      return ', sous l’empreinte, placement refusé'
    case 'faulty':
      return ', sous l’empreinte, case fautive'
    default:
      return ''
  }
}

/** Le caractère du fantôme. Un signe, jamais une teinte seule (FR-060). */
const GLYPHS: Readonly<Record<GhostMark, string>> = {
  valid: '▢',
  invalid: '▨',
  faulty: '✕',
}

/**
 * Le repère visuel du fantôme dans une case.
 *
 * `aria-hidden` : le nom accessible de la case porte déjà l'information, et la
 * région d'annonce la restitue à chaque déplacement. Le lire deux fois de plus
 * ferait de la navigation au lecteur d'écran une répétition.
 */
export function FootprintGhost({ mark }: { readonly mark: GhostMark | null }) {
  if (mark === null) return null
  return (
    <span aria-hidden="true" data-ghost={mark}>
      {GLYPHS[mark]}
    </span>
  )
}
