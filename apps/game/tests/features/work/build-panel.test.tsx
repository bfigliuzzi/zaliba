import { cleanup, render, screen } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { DEFAULT_CATALOGS, instant, previewBuild, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { BuildPanel, type BuildSelection } from '../../../src/features/work/BuildPanel.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * Le panneau de construction : choisir, voir, confirmer.
 *
 * Deux exigences le gouvernent, et elles portent sur la **structure** du
 * document autant que sur son contenu :
 *
 * - **FR-035** : la confirmation est postérieure à l'affichage du coût, de la
 *   durée et de l'effet. Ce n'est donc pas « le panneau affiche un coût » qu'il
 *   faut vérifier, mais « le coût est là *avant* que le bouton n'existe » ;
 * - **SC-001** : le parcours tient dans un nombre publié d'interactions. Le
 *   compte se mesure dans le navigateur (parcours de bout en bout), mais ce qui le
 *   détruirait se voit ici : un sélecteur de variante toujours présent, un groupe
 *   vide, un arrêt de tabulation qui n'apprend rien.
 */

afterEach(cleanup)

const CATALOGS = DEFAULT_CATALOGS
const payload = PlanetSnapshotV1.parse(rawFresh)

/** L'état projeté d'une planète neuve, à l'instant de son instantané. */
function freshState() {
  const snapshot = snapshotFromContract(payload, CATALOGS)
  return projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
}

/** L'aperçu d'une mine sur la veine de Camelote — le placement de référence. */
function previewOnVein() {
  return previewBuild(
    freshState(),
    {
      kind: 'build',
      workId: 'apercu-local',
      typeId: 'mine',
      variantId: 'square-4',
      orientation: 0,
      anchor: { x: 0, y: 4 },
    },
    CATALOGS,
  )
}

function renderPanel(
  selection: BuildSelection,
  preview: ReturnType<typeof previewBuild> | null = null,
  overrides: { pending?: boolean; onConfirm?: () => void } = {},
) {
  const onSelectType = vi.fn()
  const onSelectVariant = vi.fn()
  const onConfirm = overrides.onConfirm ?? vi.fn()

  render(
    <BuildPanel
      catalogs={CATALOGS}
      selection={selection}
      preview={preview}
      pending={overrides.pending ?? false}
      onSelectType={onSelectType}
      onSelectVariant={onSelectVariant}
      onConfirm={onConfirm}
    />,
  )
  return { onSelectType, onSelectVariant, onConfirm }
}

const NOTHING_SELECTED: BuildSelection = { typeId: null, variantId: null }
const MINE_SQUARE: BuildSelection = { typeId: 'mine', variantId: 'square-4' }

describe('le sélecteur de type propose les cinq types, nommés en clair', () => {
  it('offre un choix par type du catalogue', () => {
    renderPanel(NOTHING_SELECTED)
    expect(screen.getAllByRole('radio')).toHaveLength(5)
  })

  it('nomme chaque type par son nom de jeu, jamais par son identifiant', () => {
    renderPanel(NOTHING_SELECTED)
    for (const label of ['Mine', 'Puits', 'Racloir', 'Centrale', 'Entrepôt']) {
      expect(screen.getByRole('radio', { name: label })).toBeDefined()
    }
    expect(screen.queryByRole('radio', { name: 'entrepot' })).toBeNull()
  })

  it('groupe les choix sous un intitulé', () => {
    renderPanel(NOTHING_SELECTED)
    expect(screen.getByRole('group', { name: /type de bâtiment/i })).toBeDefined()
  })

  it('rapporte le type choisi', () => {
    const { onSelectType } = renderPanel(NOTHING_SELECTED)
    screen.getByRole('radio', { name: 'Mine' }).click()
    expect(onSelectType).toHaveBeenCalledWith('mine')
  })
})

describe('le sélecteur d’empreinte n’existe qu’une fois le type choisi (SC-001)', () => {
  /**
   * Un groupe vide serait un arrêt de tabulation qui n'apprend rien — et il
   * compterait pourtant dans le parcours que SC-001 mesure.
   */
  it('est absent avant tout choix de type', () => {
    renderPanel(NOTHING_SELECTED)
    expect(screen.queryByRole('group', { name: /empreinte/i })).toBeNull()
  })

  it('propose les trois variantes de la mine', () => {
    renderPanel(MINE_SQUARE)
    const group = screen.getByRole('group', { name: /empreinte/i })
    expect(group).toBeDefined()
    for (const label of ['Carré de quatre', 'L de quatre', 'T de quatre']) {
      expect(screen.getByRole('radio', { name: label })).toBeDefined()
    }
  })

  it('ne propose qu’une variante à un type qui n’en a qu’une', () => {
    renderPanel({ typeId: 'centrale', variantId: 'line-2' })
    expect(screen.getByRole('radio', { name: 'Deux en ligne' })).toBeDefined()
    expect(screen.queryByRole('radio', { name: 'Carré de neuf' })).toBeNull()
  })

  it('rapporte la variante choisie', () => {
    const { onSelectVariant } = renderPanel(MINE_SQUARE)
    screen.getByRole('radio', { name: 'L de quatre' }).click()
    expect(onSelectVariant).toHaveBeenCalledWith('l-4')
  })
})

describe('l’aperçu précède la confirmation (FR-035, FR-050)', () => {
  it('invite à choisir un type tant qu’il n’y a rien à prévisualiser', () => {
    renderPanel(NOTHING_SELECTED)
    expect(screen.getByRole('group', { name: /aperçu/i }).textContent).toMatch(/choisissez/i)
  })

  it('n’offre aucun bouton de lancement avant tout choix de type', () => {
    renderPanel(NOTHING_SELECTED)
    expect(screen.queryByRole('button', { name: /lancer/i })).toBeNull()
  })

  it('affiche coût, durée, gisements et production annoncée', () => {
    renderPanel(MINE_SQUARE, previewOnVein())
    const preview = screen.getByRole('group', { name: /aperçu/i })

    expect(preview.textContent).toMatch(/coût/i)
    expect(preview.textContent).toMatch(/Camelote/)
    expect(preview.textContent).toMatch(/durée/i)
    expect(preview.textContent).toMatch(/gisements recouverts/i)
    expect(preview.textContent).toMatch(/production annoncée/i)
  })

  /**
   * Le scénario 4 d'US2, vu de l'écran : une mine sur zéro gisement annonce
   * zéro, **avant** la pose. La seconde moitié de la phrase est FR-051.
   */
  it('annonce un gisement recouvert sur la veine, et zéro ailleurs', () => {
    renderPanel(MINE_SQUARE, previewOnVein())
    expect(screen.getByRole('group', { name: /aperçu/i }).textContent).toMatch(/1/)
    cleanup()

    const barren = previewBuild(
      freshState(),
      {
        kind: 'build',
        workId: 'apercu-local',
        typeId: 'mine',
        variantId: 'square-4',
        orientation: 0,
        anchor: { x: 3, y: 3 },
      },
      CATALOGS,
    )
    renderPanel(MINE_SQUARE, barren)
    expect(screen.getByRole('group', { name: /aperçu/i }).textContent).toMatch(/0 par heure/)
  })

  it('dit qu’il n’y a rien à prévisualiser sur un placement refusé', () => {
    const refused = previewBuild(
      freshState(),
      {
        kind: 'build',
        workId: 'apercu-local',
        typeId: 'mine',
        variantId: 'square-4',
        orientation: 0,
        anchor: { x: 5, y: 5 },
      },
      CATALOGS,
    )
    renderPanel(MINE_SQUARE, refused)
    expect(screen.getByRole('group', { name: /aperçu/i }).textContent).toMatch(/refusé/i)
  })

  /**
   * L'ordre dans le document, et non seulement la présence : la confirmation
   * doit être **postérieure** à l'affichage. Comparer les positions est la seule
   * façon de le vérifier sans se fier à la lecture du code.
   */
  it('place le bouton après l’aperçu dans le document', () => {
    renderPanel(MINE_SQUARE, previewOnVein())
    const preview = screen.getByRole('group', { name: /aperçu/i })
    const button = screen.getByRole('button', { name: /lancer la construction/i })

    // `compareDocumentPosition` rend un **masque de bits** : le lire autrement
    // qu'avec `&` n'a pas de sens, et comparer le nombre entier à une constante
    // serait faux dès que deux positions se cumulent.
    const follows = preview.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(follows).toBeGreaterThan(0)
  })
})

describe('le lancement est explicite, et ne part qu’une fois', () => {
  it('rapporte la confirmation', () => {
    const onConfirm = vi.fn()
    renderPanel(MINE_SQUARE, previewOnVein(), { onConfirm })
    screen.getByRole('button', { name: /lancer la construction/i }).click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  /**
   * Pendant que la commande est en vol, le bouton est désactivé **et** annoncé
   * occupé. Le désactiver seul suffirait à la souris ; `aria-busy` est ce qui le
   * dit à qui écoute la page.
   */
  it('se désactive et s’annonce occupé pendant l’envoi', () => {
    renderPanel(MINE_SQUARE, previewOnVein(), { pending: true })
    const button = screen.getByRole('button', { name: /lancement/i })
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })
})

describe('le manque de ressources est affiché, non refusé', () => {
  /**
   * L'aperçu **informe** du manque : le joueur doit voir le coût et le manque
   * avant de confirmer (FR-035, SC-007). C'est `decide` qui refuse, côté serveur.
   */
  it('chiffre le manque et le délai quand le stock ne suffit pas', () => {
    const state = freshState()
    const broke = {
      ...state,
      holdings: Object.fromEntries(
        Object.entries(state.holdings).map(([resourceId, holding]) => [
          resourceId,
          { ...holding, amount: 0 },
        ]),
      ),
    } as typeof state

    const preview = previewBuild(
      broke,
      {
        kind: 'build',
        workId: 'apercu-local',
        typeId: 'mine',
        variantId: 'square-4',
        orientation: 0,
        anchor: { x: 0, y: 4 },
      },
      CATALOGS,
    )

    renderPanel(MINE_SQUARE, preview)
    const shown = screen.getByRole('group', { name: /aperçu/i }).textContent ?? ''
    expect(shown).toMatch(/il manque/i)
    expect(shown).toMatch(/payable dans/i)
  })
})
