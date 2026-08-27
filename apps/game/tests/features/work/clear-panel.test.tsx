import { cleanup, render, screen } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import type { CellView, ClearPreviewResult } from '@zaliba/domain'
import { DEFAULT_CATALOGS, instant, previewClear, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { ClearPanel } from '../../../src/features/work/ClearPanel.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * Le panneau de déblaiement : l'obstacle, le résultat, le prix, la confirmation.
 *
 * Deux exigences le gouvernent, et elles portent sur la **structure** du document
 * autant que sur son contenu :
 *
 * - **FR-042 et FR-043** : le coût, la durée et surtout la **nature exacte du
 *   résultat** sont affichés avant tout paiement. Le résultat est ce qui distingue
 *   cette mécanique des trois autres : le joueur ne peut pas le deviner, et c'est
 *   lui qui décide si l'opération vaut son prix ;
 * - **FR-035** : la confirmation est postérieure à l'affichage. Ce n'est donc pas
 *   « le panneau affiche un résultat » qu'il faut vérifier, mais « le résultat est
 *   là *avant* que le bouton n'existe dans le document ».
 *
 * **La cible vient du curseur de grille**, comme celle de l'amélioration, et c'est
 * ce qui rend le déblaiement accessible au clavier seul sans ajouter de navigation
 * (FR-058, SC-004). Le panneau ne connaît donc pas la grille : il reçoit une vue
 * de case, ou `null`.
 */

afterEach(cleanup)

const CATALOGS = DEFAULT_CATALOGS
const payload = PlanetSnapshotV1.parse(rawFresh)

/** L'éboulis de (3,0) : le moins cher, et il rend du terrain nu. */
const EBOULIS = { x: 3, y: 0 }

/** La poche scellée de (3,2) : coûteuse, et elle rend un geyser de Jus. */
const POCHE = { x: 3, y: 2 }

/** (5,5) : libre dans la disposition du Berceau. */
const LIBRE = { x: 5, y: 5 }

function freshState() {
  const snapshot = snapshotFromContract(payload, CATALOGS)
  return projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
}

function cellOf(cell: { x: number; y: number }): CellView {
  const view = freshState().grid.find((one) => one.x === cell.x && one.y === cell.y)
  if (view === undefined) throw new Error(`case absente : (${cell.x},${cell.y})`)
  return view
}

function previewOf(cell: { x: number; y: number }): ClearPreviewResult {
  return previewClear(freshState(), { kind: 'clear', workId: 'apercu-local', cell }, CATALOGS)
}

function renderPanel(
  cell: CellView | null,
  preview: ClearPreviewResult | null = null,
  overrides: { pending?: boolean; onConfirm?: () => void } = {},
) {
  const onConfirm = overrides.onConfirm ?? vi.fn()

  render(
    <ClearPanel
      cell={cell}
      preview={preview}
      pending={overrides.pending ?? false}
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm }
}

const previewGroup = () => screen.getByRole('group', { name: /aperçu du déblaiement/i })
const confirmButton = () => screen.queryByRole('button', { name: /déblaiement/i })

describe('sans obstacle sous le curseur, le panneau dit quoi faire', () => {
  /**
   * Le panneau existe **avant** que le curseur ne désigne un obstacle. Le faire
   * apparaître seulement une fois la cible acquise laisserait un joueur ignorer
   * que le déblaiement existe — et US5 est le premier antidote à la grille figée.
   */
  it('invite à placer le curseur sur une case obstruée', () => {
    renderPanel(null, null)
    expect(previewGroup().textContent).toMatch(/curseur/i)
  })

  it('n’offre aucune confirmation : il n’y a rien à payer', () => {
    renderPanel(null, null)
    expect(confirmButton()).toBeNull()
  })

  /**
   * Sur une case libre, le motif est **nommé**. « Rien à prévisualiser » ne dirait
   * pas pourquoi, et le joueur chercherait un obstacle invisible.
   */
  it('dit qu’une case libre n’est pas obstruée', () => {
    renderPanel(cellOf(LIBRE), previewOf(LIBRE))
    expect(previewGroup().textContent).toMatch(/pas obstruée/i)
    expect(confirmButton()).toBeNull()
  })
})

describe('le résultat est annoncé avant tout paiement (FR-042, FR-043)', () => {
  it('nomme le type d’obstacle', () => {
    renderPanel(cellOf(POCHE), previewOf(POCHE))
    expect(previewGroup().textContent).toMatch(/poche scellée/i)
  })

  /**
   * Le vocabulaire du jeu, et non un mot générique : le document de conception
   * nomme **geyser** un gisement de Jus. « Un gisement » ne dirait pas lequel, et
   * le joueur ne saurait pas s'il achète un puits ou une mine.
   */
  it('nomme le geyser de Jus qu’une poche scellée révèle', () => {
    renderPanel(cellOf(POCHE), previewOf(POCHE))
    expect(previewGroup().textContent).toMatch(/geyser de Jus/i)
  })

  it('annonce du terrain nu pour un éboulis, et aucun gisement', () => {
    renderPanel(cellOf(EBOULIS), previewOf(EBOULIS))
    const text = previewGroup().textContent ?? ''
    expect(text).toMatch(/terrain nu/i)
    expect(text).not.toMatch(/geyser|veine|récif/i)
  })

  it('publie le coût et la durée', () => {
    renderPanel(cellOf(POCHE), previewOf(POCHE))
    const text = previewGroup().textContent ?? ''
    expect(text).toMatch(/200/)
    expect(text).toMatch(/40/)
    expect(text).toMatch(/45\s*min/)
  })

  /**
   * La valeur exacte dans l'attribut, sa forme lisible dans le texte. Le second
   * est formaté pour être lu — séparateurs de milliers compris — et le relire à
   * l'envers pour retrouver un nombre serait fragile autant qu'inutile. C'est le
   * parcours de bout en bout qui a besoin du chiffre.
   */
  it('publie le résultat en attribut, pour qu’il soit relisable exactement', () => {
    renderPanel(cellOf(POCHE), previewOf(POCHE))
    expect(previewGroup().querySelector('[data-reveals]')?.getAttribute('data-reveals')).toBe(
      'deposit:jus',
    )

    cleanup()
    renderPanel(cellOf(EBOULIS), previewOf(EBOULIS))
    expect(previewGroup().querySelector('[data-reveals]')?.getAttribute('data-reveals')).toBe(
      'bare-ground',
    )
  })
})

describe('FR-035 : la confirmation est postérieure à l’affichage', () => {
  /**
   * L'ordre du **document**, et non la seule présence des deux. Un bouton placé
   * avant l'aperçu serait atteint en premier par une tabulation, donc engagerait
   * la dépense avant que le joueur n'ait lu ce qu'il achète.
   */
  it('le bouton vient après l’aperçu dans le document', () => {
    renderPanel(cellOf(POCHE), previewOf(POCHE))
    const button = confirmButton()
    expect(button).not.toBeNull()

    // `DOCUMENT_POSITION_FOLLOWING` : le bouton vient **après** l'aperçu. La
    // présence des deux ne suffirait pas — FR-035 porte sur l'ordre.
    expect(
      previewGroup().compareDocumentPosition(button as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('confirme sur pression', () => {
    const { onConfirm } = renderPanel(cellOf(POCHE), previewOf(POCHE))
    ;(confirmButton() as HTMLButtonElement).click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  /**
   * **Le libellé nomme l'action, en vol comme au repos.** Un « Lancement en
   * cours… » générique donnerait à ce bouton et à ceux de la construction et de
   * l'amélioration le **même** nom accessible au moment précis où le joueur a
   * besoin de savoir lequel des trois il a engagé. C'est la leçon d'US2.
   */
  it('nomme l’action dans son état transitoire, et se désarme', () => {
    renderPanel(cellOf(POCHE), previewOf(POCHE), { pending: true })
    const button = confirmButton() as HTMLButtonElement

    expect(button.textContent).toMatch(/déblaiement/i)
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })
})

describe('le manque de ressources informe, il ne refuse pas (FR-035, SC-007)', () => {
  /**
   * L'aperçu d'une planète neuve peut payer une poche scellée. Pour éprouver le
   * manque, l'état est appauvri — et l'aperçu doit continuer à annoncer le
   * résultat : c'est précisément le cas où le joueur a besoin du chiffre pour
   * décider d'attendre.
   */
  it('annonce le manque et le délai, sans cesser d’annoncer le résultat', () => {
    const state = freshState()
    const poor = {
      ...state,
      holdings: Object.fromEntries(
        Object.entries(state.holdings).map(([id, holding]) => [id, { ...holding, amount: 0 }]),
      ),
    } as typeof state

    const preview = previewClear(
      poor,
      { kind: 'clear', workId: 'apercu-local', cell: POCHE },
      CATALOGS,
    )
    renderPanel(cellOf(POCHE), preview)

    const text = previewGroup().textContent ?? ''
    expect(text).toMatch(/il manque/i)
    expect(text).toMatch(/geyser de Jus/i)
  })
})
