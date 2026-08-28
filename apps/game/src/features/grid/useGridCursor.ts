import { useCallback, useState } from 'react'

/**
 * Le curseur de grille : une machine à états, et **pas** un glisser-déposer (R14).
 *
 * Le modèle est : *sélectionner un type → choisir une variante → déplacer un
 * curseur → pivoter → confirmer*. Le curseur se déplace au clavier (flèches) et
 * au pointeur (appui sur une case), et les deux traversent la **même** réduction.
 *
 * Ce n'est pas une économie de code : c'est ce qui rend FR-058 et SC-004 vrais
 * *par construction* plutôt que par une seconde implémentation à maintenir en
 * parallèle — la moitié qu'on oublie de tester étant toujours celle du clavier.
 * Sur téléphone, l'appui sur une case est de surcroît plus fiable qu'un
 * glissement sur une cible de quarante pixels.
 *
 * **La réduction est pure et exportée.** Un curseur est un état, pas un effet de
 * bord : il s'éprouve sans DOM, et lui faire monter un jsdom coûterait cinquante
 * secondes pour vérifier une addition. Le crochet en dessous n'est qu'un
 * `useState` autour d'elle.
 */

export interface CursorState {
  readonly x: number
  readonly y: number
  /**
   * Le compteur de quarts de tour, **modulo quatre**, quelle que soit
   * l'empreinte portée.
   *
   * C'est l'empreinte qui ramène ce nombre à ses orientations *distinctes*
   * (R6) — le curseur ignore quelle forme il transporte. La conséquence est
   * voulue : la commande de rotation est toujours acceptée, et sur un carré de
   * quatre elle ne change rien, donc un lecteur d'écran n'a rien à annoncer.
   */
  readonly orientation: number
}

export type CursorEvent =
  | { readonly kind: 'key'; readonly key: string }
  | { readonly kind: 'point'; readonly x: number; readonly y: number }

export interface GridBounds {
  readonly width: number
  readonly height: number
}

export const CURSOR_ORIGIN: CursorState = { x: 0, y: 0, orientation: 0 }

/** Les touches qui lancent l'action. `Entrée` et l'espace, comme un bouton. */
export const CONFIRM_KEYS = ['Enter', ' '] as const

/** La rotation, majuscule comprise : un joueur ne relâche pas Maj pour tourner. */
const ROTATE_KEYS: readonly string[] = ['r', 'R']

/**
 * `Échap` — **l'annulation de la pose armée** (US3-AC4, § 3 du contrat).
 *
 * Le curseur la **reconnaît** sans rien en faire, et c'est délibéré : la sélection
 * de bâtiment vit dans l'écran de planète, comme le curseur et comme le fantôme, et
 * un curseur qui effacerait une sélection qu'il ne détient pas serait un état muté
 * à distance.
 *
 * Ce que la reconnaissance garantit est le `preventDefault` : sans elle, `Échap`
 * remonte au navigateur, où elle interrompt un chargement en cours ou ferme une
 * boîte native — c'est-à-dire fait quelque chose que le joueur n'a pas demandé.
 */
const CANCEL_KEYS: readonly string[] = ['Escape']

/** Vrai si cette touche demande l'annulation de la pose armée (US3-AC4). */
export function isCancelKey(key: string): boolean {
  return CANCEL_KEYS.includes(key)
}

const HORIZONTAL: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 }
const VERTICAL: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }

/**
 * Vrai si la grille **consomme** cette touche.
 *
 * Sert à décider d'un `preventDefault`, et à lui seul. Les flèches font défiler
 * la page par défaut : ne pas les retenir ferait bouger l'écran sous le joueur à
 * chaque déplacement de curseur. Mais retenir `Tab` l'enfermerait dans la
 * grille, ce qui est la façon habituelle de rendre une interface « accessible »
 * et inutilisable.
 */
export function isCursorKey(key: string): boolean {
  return (
    key in HORIZONTAL ||
    key in VERTICAL ||
    ROTATE_KEYS.includes(key) ||
    CANCEL_KEYS.includes(key) ||
    (CONFIRM_KEYS as readonly string[]).includes(key)
  )
}

/** Ramène une valeur dans `[0, max]`. Le curseur **bute**, il ne rebondit pas. */
function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max)
}

/**
 * L'état suivant du curseur.
 *
 * Rend l'état **reçu**, à la référence près, quand rien ne change. C'est ce qui
 * évite un rendu par frappe de tabulation, et surtout ce qui permet à la région
 * d'annonce de ne rien redire quand rien n'a bougé — un lecteur d'écran qui
 * répète la même phrase est un lecteur d'écran qu'on finit par couper.
 */
export function reduceCursor(
  state: CursorState,
  event: CursorEvent,
  bounds: GridBounds,
): CursorState {
  if (event.kind === 'point') {
    const x = clamp(event.x, bounds.width - 1)
    const y = clamp(event.y, bounds.height - 1)
    return x === state.x && y === state.y ? state : { ...state, x, y }
  }

  if (ROTATE_KEYS.includes(event.key)) {
    return { ...state, orientation: (state.orientation + 1) % 4 }
  }

  // La confirmation n'est pas un état du curseur : elle déclenche une action.
  // L'y mêler ferait du curseur un mélange de position et d'intention, qu'il
  // faudrait remettre à zéro après chaque pose.
  if ((CONFIRM_KEYS as readonly string[]).includes(event.key)) return state

  /*
    **L'annulation ne déplace rien.** Une annulation qui bougerait le curseur ferait
    perdre au joueur la case qu'il visait, alors qu'il vient précisément de dire
    qu'il ne voulait pas y poser *ce* bâtiment. L'état est rendu **à la référence
    près**, donc aucun rendu n'a lieu — et la région d'annonce ne redit rien.
  */
  if (CANCEL_KEYS.includes(event.key)) return state

  const dx = HORIZONTAL[event.key]
  if (dx !== undefined) {
    // Un déplacement horizontal ne change **jamais** de rangée. Rebondir vers le
    // bord opposé ferait sauter d'une ligne à l'autre sans que rien ne
    // l'annonce, et le joueur au clavier perdrait sa place à chaque bout.
    const x = clamp(state.x + dx, bounds.width - 1)
    return x === state.x ? state : { ...state, x }
  }

  const dy = VERTICAL[event.key]
  if (dy !== undefined) {
    const y = clamp(state.y + dy, bounds.height - 1)
    return y === state.y ? state : { ...state, y }
  }

  return state
}

export interface GridCursor {
  readonly state: CursorState
  /** L'index de la case du curseur, dans l'ordre de lecture de la grille. */
  readonly index: number
  /** Traite une touche. Rend `true` si la grille l'a consommée. */
  handleKey(key: string): boolean
  /** Traite un appui sur une case. */
  point(x: number, y: number): void
}

/** Le crochet : un `useState` autour de la réduction, et rien de plus. */
export function useGridCursor(bounds: GridBounds): GridCursor {
  const [state, setState] = useState<CursorState>(CURSOR_ORIGIN)

  const handleKey = useCallback(
    (key: string): boolean => {
      if (!isCursorKey(key)) return false
      setState((current) => reduceCursor(current, { kind: 'key', key }, bounds))
      return true
    },
    [bounds],
  )

  const point = useCallback(
    (x: number, y: number): void => {
      setState((current) => reduceCursor(current, { kind: 'point', x, y }, bounds))
    },
    [bounds],
  )

  return { state, index: state.y * bounds.width + state.x, handleKey, point }
}
