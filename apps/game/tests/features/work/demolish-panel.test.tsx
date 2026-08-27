import { cleanup, render, screen } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import type { BuildingView, DemolishPreviewResult, ProjectedState } from '@zaliba/domain'
import { DEFAULT_CATALOGS, instant, previewDemolish, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { DemolishPanel } from '../../../src/features/work/DemolishPanel.js'
import rawWithMine from '../../fixtures/planet-with-mine.json' with { type: 'json' }

/**
 * Le panneau de démolition : le remboursement, ce qu'on récupère, ce qu'on perd.
 *
 * Trois exigences le gouvernent, et elles portent sur la **structure** du document
 * autant que sur son contenu :
 *
 * - **FR-046** : le remboursement est annoncé, et il vaut la fraction publiée du
 *   coût cumulé de tous les niveaux payés ;
 * - **FR-047** : les cases redeviennent libres et les **gisements restent intacts**.
 *   C'est la seule des quatre grandeurs que le joueur ne peut pas deviner — rien ne
 *   dit *a priori* que démolir une mine ne détruit pas la veine qu'elle recouvrait.
 *   Sans cette annonce, il hésiterait à corriger son erreur ;
 * - **FR-049** : le montant écrêté est annoncé **avant confirmation**, jamais
 *   constaté après.
 *
 * **La cible vient du curseur de grille**, comme celle de l'amélioration. Le panneau
 * ne connaît donc pas la grille : il reçoit un bâtiment ou `null`.
 */

afterEach(cleanup)

const CATALOGS = DEFAULT_CATALOGS
const payload = PlanetSnapshotV1.parse(rawWithMine)
const BUILDING_ID = '88888888-8888-4888-8888-888888888888'

function stateWithMine(): ProjectedState {
  const snapshot = snapshotFromContract(payload, CATALOGS)
  return projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
}

function mineView(): BuildingView {
  const building = stateWithMine().buildings[0]
  if (building === undefined) throw new Error('la mine manque à l’instantané de référence')
  return building
}

function previewOf(state = stateWithMine(), buildingId = BUILDING_ID): DemolishPreviewResult {
  return previewDemolish(state, { kind: 'demolish', workId: 'apercu-local', buildingId }, CATALOGS)
}

/** Un état dont les deux ressources du coût de la mine sont **au plafond**. */
function saturated(): ProjectedState {
  const state = stateWithMine()
  return {
    ...state,
    holdings: Object.fromEntries(
      Object.entries(state.holdings).map(([id, holding]) => [
        id,
        { ...holding, amount: holding.cap },
      ]),
    ),
  } as ProjectedState
}

function renderPanel(
  building: BuildingView | null,
  preview: DemolishPreviewResult | null = null,
  overrides: { pending?: boolean; onConfirm?: () => void } = {},
) {
  const onConfirm = overrides.onConfirm ?? vi.fn()

  render(
    <DemolishPanel
      building={building}
      preview={preview}
      pending={overrides.pending ?? false}
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm }
}

const previewGroup = () => screen.getByRole('group', { name: /aperçu de la démolition/i })
const confirmButton = () => screen.queryByRole('button', { name: /démol/i })

describe('sans cible, le panneau dit quoi faire', () => {
  /**
   * Le panneau existe **avant** que le curseur ne désigne un bâtiment. Le faire
   * apparaître seulement une fois la cible acquise laisserait un joueur ignorer que
   * la démolition existe — et c'est elle qui rend une erreur de placement réparable.
   */
  it('invite à placer le curseur sur un bâtiment posé', () => {
    renderPanel(null, null)
    expect(previewGroup().textContent).toMatch(/curseur/i)
    expect(confirmButton()).toBeNull()
  })
})

describe('le remboursement et ses conséquences sont annoncés (FR-046, FR-047)', () => {
  it('publie le remboursement, la durée et le nombre de cases libérées', () => {
    renderPanel(mineView(), previewOf())
    const text = previewGroup().textContent ?? ''

    expect(text).toMatch(/rembours/i)
    expect(text).toMatch(/4 cases/i)
    expect(text).toMatch(/min|s$|\ds/i)
  })

  /**
   * **Le gisement préservé, nommé.** C'est la grandeur que le joueur ne peut pas
   * deviner : recouvrir n'efface pas un gisement (FR-020), et rien ne dit qu'en
   * démolir l'extracteur ne l'effacera pas. Le vocabulaire du jeu — « veine de
   * Camelote » — dit du même coup ce qu'il pourra reposer dessus.
   */
  it('nomme les gisements que les cases conserveront', () => {
    renderPanel(mineView(), previewOf())
    expect(previewGroup().textContent).toMatch(/veine de Camelote/i)
  })

  /**
   * La valeur exacte dans l'attribut, sa forme lisible dans le texte : c'est le
   * parcours de bout en bout qui a besoin du chiffre, et un nombre à séparateurs de
   * milliers relu à l'envers serait fragile autant qu'inutile.
   */
  it('publie le remboursement en attribut, relisable exactement', () => {
    renderPanel(mineView(), previewOf())
    const node = previewGroup().querySelector('[data-refund]')
    expect(node?.getAttribute('data-refund')).toMatch(/^camelote:\d+/)
  })

  /** La production que la planète perdra — à l'échéance, et pas avant (FR-048). */
  it('annonce la production perdue, et dit quand elle cessera', () => {
    renderPanel(mineView(), previewOf())
    const text = previewGroup().textContent ?? ''
    expect(text).toMatch(/production/i)
    expect(text).toMatch(/échéance/i)
  })
})

describe('l’écrêtement est annoncé avant confirmation (FR-049)', () => {
  /**
   * L'énoncé central de la tranche côté écran : le joueur voit **avant de
   * confirmer** ce qu'un plafond lui retiendra. Le constater après serait une
   * mauvaise surprise que FR-049 interdit explicitement.
   */
  it('nomme le montant écrêté quand un plafond retient le remboursement', () => {
    renderPanel(mineView(), previewOf(saturated()))
    const text = previewGroup().textContent ?? ''

    expect(text).toMatch(/écrêt/i)
    expect(previewGroup().querySelector('[data-clipped]')).not.toBeNull()
  })

  /**
   * **Rien n'est dit quand rien n'est écrêté.** Une ligne « 0 Camelote écrêtée »
   * ferait chercher au joueur une perte qui n'existe pas, et l'habituerait à ignorer
   * la seule ligne qui doit l'alerter.
   */
  it('ne dit rien de l’écrêtement quand il n’y en a pas', () => {
    renderPanel(mineView(), previewOf())
    expect(previewGroup().textContent).not.toMatch(/écrêt/i)
    expect(previewGroup().querySelector('[data-clipped]')).toBeNull()
  })
})

describe('FR-035 : la confirmation est postérieure à l’affichage', () => {
  /**
   * L'ordre du **document**, et non la seule présence des deux. Un bouton placé
   * avant l'aperçu serait atteint en premier par une tabulation, donc engagerait une
   * démolition irréversible avant que le joueur n'ait lu ce qu'il perd.
   */
  it('le bouton vient après l’aperçu dans le document', () => {
    renderPanel(mineView(), previewOf())
    const button = confirmButton()
    expect(button).not.toBeNull()

    expect(
      previewGroup().compareDocumentPosition(button as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  /**
   * **Une confirmation explicite**, et pas seulement un bouton. La démolition est la
   * seule mécanique dont l'effet est une perte : un chantier lancé n'est ni annulable
   * ni remplaçable (FR-037), donc le joueur doit avoir dit oui à ce qu'il perd.
   */
  it('énonce l’irréversibilité', () => {
    renderPanel(mineView(), previewOf())
    expect(previewGroup().parentElement?.textContent).toMatch(/ni annul|irréversible/i)
  })

  it('confirme sur pression', () => {
    const { onConfirm } = renderPanel(mineView(), previewOf())
    ;(confirmButton() as HTMLButtonElement).click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  /**
   * **Le libellé nomme l'action, en vol comme au repos.** Quatre panneaux portent
   * maintenant un bouton ; un « Lancement en cours… » générique les rendrait
   * indiscernables au moment précis où le joueur a besoin de savoir lequel il a
   * engagé. C'est la leçon d'US2, quatre fois.
   */
  it('nomme l’action dans son état transitoire, et se désarme', () => {
    renderPanel(mineView(), previewOf(), { pending: true })
    const button = confirmButton() as HTMLButtonElement

    expect(button.textContent).toMatch(/démol/i)
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })
})

describe('un refus d’aperçu est énoncé, et non résumé', () => {
  it('dit que le bâtiment est la cible du chantier en cours', () => {
    const state = stateWithMine()
    const busy: ProjectedState = {
      ...state,
      work: {
        id: '33333333-3333-4333-8333-333333333333',
        nature: 'upgrade',
        target: { kind: 'building', buildingId: BUILDING_ID },
        startedAt: state.at,
        dueAt: instant(state.at + 168),
        remaining: 168,
      } as ProjectedState['work'],
    }

    renderPanel(mineView(), previewOf(busy))
    expect(previewGroup().textContent).toMatch(/chantier en cours/i)
    expect(confirmButton()).toBeNull()
  })
})
