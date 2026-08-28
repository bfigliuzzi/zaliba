import { describe, expect, it } from 'vitest'
import {
  CONFIRM_KEYS,
  CURSOR_ORIGIN,
  type CursorState,
  isCursorKey,
  reduceCursor,
} from '../../../src/features/grid/useGridCursor.js'

/**
 * Le curseur de grille : une machine à états, et **pas** un glisser-déposer (R14).
 *
 * La décision qui gouverne ce fichier : le même parcours sert le clavier et le
 * pointeur. Ce n'est pas une économie de code, c'est ce qui rend FR-058 et
 * SC-004 vrais *par construction* plutôt que par une seconde implémentation à
 * maintenir en parallèle — la moitié qu'on oublie de tester étant toujours celle
 * du clavier.
 *
 * La réduction est une **fonction pure**, éprouvée sans DOM. Un curseur est un
 * état, pas un effet de bord : le mettre à l'épreuve dans un jsdom coûterait
 * cinquante secondes de montage pour vérifier une addition.
 */

const BOUNDS = { width: 6, height: 6 } as const

/** Enchaîne des touches depuis un état donné. */
function press(state: CursorState, ...keys: readonly string[]): CursorState {
  return keys.reduce((current, key) => reduceCursor(current, { kind: 'key', key }, BOUNDS), state)
}

describe('les flèches déplacent le curseur d’une case', () => {
  it('part du coin haut-gauche', () => {
    expect(CURSOR_ORIGIN).toEqual({ x: 0, y: 0, orientation: 0 })
  })

  it.each([
    ['ArrowRight', { x: 1, y: 0 }],
    ['ArrowDown', { x: 0, y: 1 }],
  ] as const)('%s mène en %j', (key, expected) => {
    expect(press(CURSOR_ORIGIN, key)).toMatchObject(expected)
  })

  it('revient sur ses pas', () => {
    expect(press(CURSOR_ORIGIN, 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp')).toEqual(
      CURSOR_ORIGIN,
    )
  })

  it('atteint n’importe quelle case en flèches seules', () => {
    const target = press(CURSOR_ORIGIN, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown')
    expect(target).toMatchObject({ x: 0, y: 4 })
  })
})

describe('le curseur ne sort pas de la grille', () => {
  /**
   * Il **bute**, il ne rebondit pas. Rebondir vers le bord opposé ferait sauter
   * d'une rangée à l'autre sans que rien ne l'annonce, et un joueur au clavier
   * perdrait sa place à chaque bout de ligne — le genre de détail qui rend une
   * interface « accessible » et impraticable.
   */
  it('bute sur le bord gauche', () => {
    expect(press(CURSOR_ORIGIN, 'ArrowLeft')).toEqual(CURSOR_ORIGIN)
  })

  it('bute sur le bord haut', () => {
    expect(press(CURSOR_ORIGIN, 'ArrowUp')).toEqual(CURSOR_ORIGIN)
  })

  it('bute sur le bord droit', () => {
    const state = press(CURSOR_ORIGIN, ...Array(10).fill('ArrowRight'))
    expect(state).toMatchObject({ x: BOUNDS.width - 1, y: 0 })
  })

  it('bute sur le bord bas', () => {
    const state = press(CURSOR_ORIGIN, ...Array(10).fill('ArrowDown'))
    expect(state).toMatchObject({ x: 0, y: BOUNDS.height - 1 })
  })

  it('ne change jamais de rangée sur un déplacement horizontal', () => {
    const state = press(CURSOR_ORIGIN, 'ArrowDown', ...Array(10).fill('ArrowRight'))
    expect(state.y).toBe(1)
  })
})

describe('la rotation est cyclique modulo quatre', () => {
  /**
   * Le compteur va de 0 à 3 quelle que soit l'empreinte ; c'est l'empreinte qui
   * ramène ce nombre à ses orientations *distinctes* (R6). La conséquence est
   * voulue : la commande de rotation est toujours acceptée, et sur un carré de
   * quatre elle ne change rien — donc un lecteur d'écran n'a rien à annoncer.
   */
  it('avance d’un quart de tour', () => {
    expect(press(CURSOR_ORIGIN, 'r').orientation).toBe(1)
  })

  it('revient à zéro au quatrième quart de tour', () => {
    expect(press(CURSOR_ORIGIN, 'r', 'r', 'r', 'r').orientation).toBe(0)
  })

  it('accepte la majuscule comme la minuscule', () => {
    expect(press(CURSOR_ORIGIN, 'R').orientation).toBe(1)
    expect(press(CURSOR_ORIGIN, 'R', 'r').orientation).toBe(2)
  })

  it('ne déplace pas le curseur en tournant', () => {
    const moved = press(CURSOR_ORIGIN, 'ArrowRight', 'ArrowDown')
    const turned = press(moved, 'r')
    expect(turned).toMatchObject({ x: moved.x, y: moved.y })
  })

  it('conserve l’orientation en se déplaçant', () => {
    const turned = press(CURSOR_ORIGIN, 'r', 'r')
    expect(press(turned, 'ArrowDown').orientation).toBe(2)
  })
})

describe('la confirmation n’est pas un état du curseur', () => {
  /**
   * `Entrée` déclenche une action ; elle ne déplace rien et ne tourne rien.
   * L'inclure dans l'état ferait du curseur un mélange de position et
   * d'intention, et il faudrait alors le remettre à zéro après chaque pose.
   */
  it.each(CONFIRM_KEYS)('« %s » laisse le curseur intact', (key) => {
    const moved = press(CURSOR_ORIGIN, 'ArrowDown', 'r')
    expect(press(moved, key)).toEqual(moved)
  })

  it('reconnaît les touches de confirmation', () => {
    expect(CONFIRM_KEYS).toContain('Enter')
  })
})

describe('les touches étrangères ne font rien', () => {
  it.each(['a', 'Tab', 'Escape', 'PageDown', 'Home'])('« %s » laisse l’état inchangé', (key) => {
    expect(press(CURSOR_ORIGIN, key)).toEqual(CURSOR_ORIGIN)
  })

  /**
   * L'identité **de référence**, et pas seulement d'égalité. C'est elle qui
   * évite un rendu par frappe de tabulation, et elle est ce qui permet à la
   * région d'annonce de ne rien redire quand rien n'a changé.
   */
  it('rend le même état, à la référence près, quand rien ne change', () => {
    expect(reduceCursor(CURSOR_ORIGIN, { kind: 'key', key: 'Tab' }, BOUNDS)).toBe(CURSOR_ORIGIN)
  })

  /**
   * *Réécrit par 002.* `Escape` figurait parmi les touches **laissées passer**. Elle
   * est désormais consommée, et le motif n'est pas qu'elle change l'état du curseur
   * — elle ne le change pas — mais qu'elle doit être **retenue** : sans
   * `preventDefault`, `Échap` remonte au navigateur, où elle interrompt un
   * chargement en cours ou ferme une boîte native, c'est-à-dire fait quelque chose
   * que le joueur n'a pas demandé (FR-020, US3-AC4).
   *
   * `Tab` reste laissée passer, et c'est essentiel : la retenir enfermerait le
   * joueur dans la grille — la façon habituelle de rendre une interface
   * « accessible » et inutilisable.
   */
  it('distingue les touches qu’il consomme de celles qu’il laisse passer', () => {
    for (const key of [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'r',
      'R',
      'Enter',
      ' ',
      'Escape',
    ]) {
      expect(isCursorKey(key), key).toBe(true)
    }
    for (const key of ['Tab', 'a', 'F5']) {
      expect(isCursorKey(key), key).toBe(false)
    }
  })
})

describe('le pointeur mène au même état que le clavier (SC-004)', () => {
  /**
   * C'est la propriété centrale de R14, et la raison pour laquelle il n'y a pas
   * de glisser-déposer : les deux dispositifs traversent la **même** machine à
   * états. Ce qu'un joueur à la souris peut atteindre, un joueur au clavier
   * l'atteint aussi — non par une seconde implémentation, mais parce qu'il n'y
   * en a qu'une.
   */
  it('mène en (2,3) aussi bien par appui que par flèches', () => {
    const byPointer = reduceCursor(CURSOR_ORIGIN, { kind: 'point', x: 2, y: 3 }, BOUNDS)
    const byKeyboard = press(
      CURSOR_ORIGIN,
      'ArrowRight',
      'ArrowRight',
      'ArrowDown',
      'ArrowDown',
      'ArrowDown',
    )
    expect(byPointer).toEqual(byKeyboard)
  })

  it('conserve l’orientation acquise au clavier', () => {
    const turned = press(CURSOR_ORIGIN, 'r')
    expect(reduceCursor(turned, { kind: 'point', x: 4, y: 4 }, BOUNDS)).toEqual({
      x: 4,
      y: 4,
      orientation: 1,
    })
  })

  it('ramène un appui hors grille dans la grille', () => {
    expect(reduceCursor(CURSOR_ORIGIN, { kind: 'point', x: 99, y: -3 }, BOUNDS)).toMatchObject({
      x: BOUNDS.width - 1,
      y: 0,
    })
  })
})

/**
 * `Échap` — **l'annulation de la pose armée** (US3-AC4, § 3 du contrat).
 *
 * FR-020 exige que les trois commandes de pose — pivoter, poser, annuler — soient
 * atteignables **au clavier et par un bouton visible**. 001 n'avait aucune
 * annulation : un joueur qui avait armé une pose par erreur devait choisir un autre
 * type pour s'en défaire, c'est-à-dire apprendre un détour.
 *
 * **Le curseur consomme la touche, il ne désarme pas lui-même.** La sélection vit
 * dans l'écran de planète — comme le curseur, comme le fantôme —, et un curseur qui
 * effacerait une sélection qu'il ne détient pas serait un état muté à distance. Ce
 * que le curseur doit garantir est qu'il **reconnaît** la touche : sans cela,
 * `preventDefault` ne s'applique pas et `Échap` remonte au navigateur.
 */
describe('Échap annule la pose armée (US3-AC4)', () => {
  it('est reconnue comme touche de curseur', () => {
    expect(isCursorKey('Escape')).toBe(true)
  })

  /**
   * **Elle ne déplace rien.** Une annulation qui bougerait le curseur ferait perdre
   * au joueur la case qu'il visait, alors qu'il vient précisément de dire qu'il ne
   * voulait pas y poser *ce* bâtiment.
   */
  it('ne déplace ni le curseur ni l’orientation', () => {
    const state: CursorState = { x: 3, y: 2, orientation: 2 }
    expect(reduceCursor(state, { kind: 'key', key: 'Escape' }, BOUNDS)).toBe(state)
  })

  it('rend l’état **à la référence près** — donc ne provoque aucun rendu', () => {
    const state: CursorState = { x: 0, y: 0, orientation: 0 }
    expect(reduceCursor(state, { kind: 'key', key: 'Escape' }, BOUNDS) === state).toBe(true)
  })

  it('n’est pas confondue avec une confirmation', () => {
    const state: CursorState = { x: 1, y: 1, orientation: 0 }
    const apresEchap = reduceCursor(state, { kind: 'key', key: 'Escape' }, BOUNDS)
    const apresEntree = reduceCursor(state, { kind: 'key', key: 'Enter' }, BOUNDS)
    // Les deux laissent le curseur intact ; ce qui les distingue est ce que
    // l'écran en fait, et c'est lui qui l'éprouve.
    expect(apresEchap).toBe(state)
    expect(apresEntree).toBe(state)
  })

  it('reste sans effet sur une touche inconnue', () => {
    expect(isCursorKey('Backspace')).toBe(false)
  })
})
