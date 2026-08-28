import { cleanup, render, screen } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import type { BuildingView, UpgradePreviewResult } from '@zaliba/domain'
import { DEFAULT_CATALOGS, instant, previewUpgrade, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { UpgradePanel } from '../../../src/features/work/UpgradePanel.js'
import rawWithMine from '../../fixtures/planet-with-mine.json' with { type: 'json' }

/**
 * Le panneau d'amélioration : la cible, le gain, la confirmation.
 *
 * Deux exigences le gouvernent, et elles portent sur la **structure** du document
 * autant que sur son contenu :
 *
 * - **FR-041** : coût, durée, production actuelle, production résultante et leur
 *   différence. Les cinq, pas trois — un joueur qui ne verrait que la production
 *   résultante devrait soustraire de tête pour savoir ce qu'il achète ;
 * - **FR-035** : la confirmation est postérieure à l'affichage. Ce n'est donc pas
 *   « le panneau affiche un gain » qu'il faut vérifier, mais « le gain est là
 *   *avant* que le bouton n'existe dans le document ».
 *
 * **La cible vient du curseur de grille**, et c'est ce qui rend l'amélioration
 * accessible au clavier seul sans ajouter de navigation (FR-058, SC-004). Le
 * panneau ne connaît donc pas la grille : il reçoit un bâtiment ou `null`.
 */

afterEach(cleanup)

const CATALOGS = DEFAULT_CATALOGS
const payload = PlanetSnapshotV1.parse(rawWithMine)
const BUILDING_ID = '88888888-8888-4888-8888-888888888888'

/** L'état projeté de la planète à la mine, à l'instant de son instantané. */
function stateWithMine() {
  const snapshot = snapshotFromContract(payload, CATALOGS)
  return projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
}

function mineView(): BuildingView {
  const building = stateWithMine().buildings[0]
  if (building === undefined) throw new Error('la mine manque à l’instantané de référence')
  return building
}

function previewOfMine(buildingId = BUILDING_ID): UpgradePreviewResult {
  return previewUpgrade(
    stateWithMine(),
    { kind: 'upgrade', workId: 'apercu-local', buildingId },
    CATALOGS,
  )
}

function renderPanel(
  building: BuildingView | null,
  preview: UpgradePreviewResult | null = null,
  overrides: { pending?: boolean; onConfirm?: () => void } = {},
) {
  const onConfirm = overrides.onConfirm ?? vi.fn()

  render(
    <UpgradePanel
      building={building}
      preview={preview}
      pending={overrides.pending ?? false}
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm }
}

const previewGroup = () => screen.getByRole('group', { name: /aperçu de l’amélioration/i })

describe('sans cible, le panneau dit quoi faire', () => {
  /**
   * Le panneau existe **avant** que le curseur ne désigne un bâtiment. Le faire
   * apparaître seulement une fois la cible acquise laisserait un joueur qui n'a
   * jamais posé de bâtiment ignorer que l'amélioration existe.
   */
  it('invite à placer le curseur sur un bâtiment posé', () => {
    renderPanel(null)
    expect(previewGroup().textContent).toMatch(/curseur/i)
  })

  it('n’offre aucun bouton de lancement', () => {
    renderPanel(null)
    expect(screen.queryByRole('button', { name: /lancer/i })).toBeNull()
  })
})

describe('l’aperçu porte les cinq grandeurs de FR-041', () => {
  it('nomme la cible par son type, son niveau et sa position', () => {
    renderPanel(mineView(), previewOfMine())
    const preview = previewGroup().textContent ?? ''

    expect(preview).toMatch(/mine/i)
    expect(preview).toMatch(/niveau 1/i)
    // L'adresse courte : « (0,4) » se déchiffre, « A5 » se dit — et se dit en une
    // syllabe, là où « colonne 1, rangée 5 » en prend sept (R7, FR-016). C'est la
    // même fonction que la grille et l'annonce : l'adresse est la même partout.
    expect(preview).toContain('A5')
  })

  it('affiche le coût, la durée, les deux productions et leur différence', () => {
    renderPanel(mineView(), previewOfMine())
    const preview = previewGroup().textContent ?? ''

    expect(preview).toMatch(/coût/i)
    expect(preview).toMatch(/Camelote/)
    expect(preview).toMatch(/durée/i)
    expect(preview).toMatch(/production actuelle/i)
    expect(preview).toMatch(/production résultante/i)
    expect(preview).toMatch(/gain/i)
  })

  /**
   * Les valeurs exactes sont dans des attributs, leur sens est dans le texte.
   *
   * L'attribut porte le chiffre qu'on refait à la main (SC-002) ; le texte porte
   * ce qu'il veut dire. Publier seulement le texte formaté obligerait un test — et
   * un joueur outillé — à relire un nombre à séparateurs de milliers à l'envers.
   */
  it('publie les deux taux et leur différence en valeurs exactes', () => {
    const preview = previewOfMine()
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    renderPanel(mineView(), preview)
    const { effect } = preview.preview

    expect(
      previewGroup().querySelector('[data-upgrade-rate]')?.getAttribute('data-upgrade-rate'),
    ).toBe(`${effect.rateBefore}/${effect.rateAfter}`)
    expect(
      previewGroup().querySelector('[data-upgrade-delta]')?.getAttribute('data-upgrade-delta'),
    ).toBe(`${effect.delta}`)
  })

  /** FR-039 énoncé au joueur, et non seulement tenu par le contrat. */
  it('annonce que les cases occupées ne changent pas', () => {
    renderPanel(mineView(), previewOfMine())
    expect(previewGroup().textContent).toMatch(/inchang/i)
  })

  /** US3-3 étendu à l'amélioration : un niveau de plus consomme davantage. */
  it('annonce l’énergie résultante avant paiement', () => {
    const preview = previewOfMine()
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    renderPanel(mineView(), preview)
    const { energyAfter } = preview.preview.effect

    expect(previewGroup().textContent).toMatch(/énergie/i)
    expect(
      previewGroup().querySelector('[data-energy-after]')?.getAttribute('data-energy-after'),
    ).toBe(`${energyAfter.produced}/${energyAfter.consumed}`)
  })
})

describe('le refus est énoncé, avec son motif', () => {
  it('dit que le niveau maximal est atteint', () => {
    const state = stateWithMine()
    const capped = {
      ...state,
      buildings: state.buildings.map((building) => ({ ...building, level: 30 })),
    }
    const preview = previewUpgrade(
      capped,
      { kind: 'upgrade', workId: 'apercu-local', buildingId: BUILDING_ID },
      CATALOGS,
    )

    renderPanel({ ...mineView(), level: 30 }, preview)
    expect(previewGroup().textContent).toMatch(/niveau maximal/i)
  })

  /**
   * L'aperçu **informe** d'un manque, il ne le cache pas.
   *
   * Un aperçu qui n'afficherait plus le coût faute de fonds retirerait
   * précisément l'information dont le joueur a besoin pour décider d'attendre
   * (SC-007, US4-3).
   */
  it('affiche le manque par ressource et le délai, coût compris', () => {
    const state = stateWithMine()
    const poor = {
      ...state,
      holdings: Object.fromEntries(
        Object.entries(state.holdings).map(([resourceId, holding]) => [
          resourceId,
          { ...holding, amount: 0 },
        ]),
      ) as typeof state.holdings,
    }
    const preview = previewUpgrade(
      poor,
      { kind: 'upgrade', workId: 'apercu-local', buildingId: BUILDING_ID },
      CATALOGS,
    )

    renderPanel(mineView(), preview)
    const text = previewGroup().textContent ?? ''
    expect(text).toMatch(/il manque/i)
    expect(text).toMatch(/payable dans/i)
    expect(text).toMatch(/coût/i)
  })
})

describe('la confirmation est postérieure à l’affichage (FR-035)', () => {
  it('le bouton suit l’aperçu dans l’ordre du document', () => {
    renderPanel(mineView(), previewOfMine())

    const button = screen.getByRole('button', { name: /lancer l’amélioration/i })
    // `DOCUMENT_POSITION_FOLLOWING` : le bouton vient **après** l'aperçu. La
    // présence des deux ne suffirait pas — FR-035 porte sur l'ordre.
    expect(previewGroup().compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('rapporte la confirmation', () => {
    const { onConfirm } = renderPanel(mineView(), previewOfMine())
    screen.getByRole('button', { name: /lancer l’amélioration/i }).click()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  /**
   * Le bouton ne se clique qu'une fois : une double dépense n'est pas rattrapable.
   * `aria-busy` est ce qui le dit à qui écoute la page, là où `disabled` seul ne
   * suffit qu'à la souris.
   *
   * Le nom recherché est `/amélioration/` **et non `/lancement/`** : c'est ce qui
   * exige du libellé en vol qu'il nomme encore l'action. Un « Lancement en cours… »
   * générique donnerait à ce bouton et à celui de la construction le même nom
   * accessible, au moment précis où le joueur a besoin de les distinguer.
   */
  it('désactive le bouton, et son nom nomme encore l’action', () => {
    renderPanel(mineView(), previewOfMine(), { pending: true })
    const button = screen.getByRole('button', { name: /amélioration/i })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })
})
