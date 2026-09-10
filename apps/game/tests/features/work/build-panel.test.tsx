import { cleanup, render, screen } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import type { CellView, GridOccupancy, PlacementAvailability } from '@zaliba/domain'
import {
  gridOccupancy,
  instant,
  placementAvailability,
  previewBuild,
  projectPlanet,
} from '@zaliba/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { BuildPanel, type BuildSelection } from '../../../src/features/work/BuildPanel.js'
import { CATALOGS } from '../../catalogs.js'
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
  overrides: {
    occupancy?: GridOccupancy
    availability?: PlacementAvailability | null
  } = {},
) {
  const onSelectType = vi.fn()
  const onSelectVariant = vi.fn()

  render(
    <BuildPanel
      catalogs={CATALOGS}
      selection={selection}
      preview={preview}
      occupancy={overrides.occupancy ?? gridOccupancy(freshState().grid)}
      availability={overrides.availability ?? null}
      onSelectType={onSelectType}
      onSelectVariant={onSelectVariant}
    />,
  )
  return { onSelectType, onSelectVariant }
}

/** L'aperçu de construction, nommé en entier — jamais `/aperçu/i` seul (leçon d'US2). */
const previewGroup = () => screen.getByRole('group', { name: /aperçu de la construction/i })

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
  /**
   * *Réécrit par 002.* L'assertion plaçait le **bouton de confirmation** après
   * l'aperçu. Ce bouton a quitté ce panneau : le § 6 du contrat d'interface nomme
   * **une** commande de pose, `JE POSE ÇA`, et conclut « aucune autre commande
   * n'existe ». Deux boutons visibles qui posent sont deux commandes de pose.
   *
   * Ce que l'assertion voulait dire — *l'aperçu précède la confirmation* — reste vrai
   * et se lit désormais sur l'assemblage : le panneau tout entier précède la barre
   * d'actions dans le bloc des actions, et `ordre-du-document.test.tsx` le vérifie.
   *
   * Ce qui subsiste ici, et qui est ce que ce fichier peut dire : **l'aperçu est le
   * dernier nœud du panneau**. Rien ne s'interpose entre ce que le joueur lit et la
   * commande qui suit.
   */
  it('place l’aperçu en dernier dans le panneau', () => {
    // `renderPanel` ne rend pas son conteneur : le document fait l'affaire, il ne
    // porte que ce panneau.
    renderPanel(MINE_SQUARE, previewOnVein())
    const preview = screen.getByRole('group', { name: /aperçu/i })
    const panneau = preview.parentElement

    expect(panneau, 'le panneau de construction').not.toBeNull()
    expect(panneau?.lastElementChild, 'l’aperçu ferme le panneau').toBe(preview)
    expect(
      document.body.querySelectorAll('button'),
      'et le panneau ne porte plus aucune commande',
    ).toHaveLength(0)
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

/**
 * US3-3 : l'effet énergétique est annoncé **avant paiement**.
 *
 * Le calcul appartient à `preview.ts` et y est éprouvé. Ce qui se vérifie ici
 * est qu'il *arrive dans le document*, et au bon endroit : dans le groupe
 * d'aperçu, donc avant le bouton de confirmation. Un aperçu qui calculerait
 * juste et n'afficherait rien satisferait tous les tests de domaine.
 */
describe('l’aperçu annonce l’effet énergétique avant paiement (US3-3)', () => {
  /** Une planète portant déjà une mine : le racloir la fera basculer. */
  function stateWithMine() {
    const snapshot = snapshotFromContract(
      {
        ...payload,
        buildings: [
          {
            id: 'b-1',
            typeId: 'mine',
            variantId: 'square-4',
            orientation: 0,
            anchorX: 0,
            anchorY: 4,
            level: 1,
          },
        ],
      } as typeof payload,
      CATALOGS,
    )
    return projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
  }

  function previewRacloir() {
    return previewBuild(
      stateWithMine(),
      {
        kind: 'build',
        workId: 'apercu-local',
        typeId: 'racloir',
        variantId: 'square-9',
        orientation: 0,
        anchor: { x: 3, y: 3 },
      },
      CATALOGS,
    )
  }

  it('bascule bien la planète en déficit — sans quoi le test ne prouverait rien', () => {
    const preview = previewRacloir()
    expect(preview.outcome).toBe('accepted')
    if (preview.outcome !== 'accepted') return

    expect(stateWithMine().energy.deficit).toBe(false)
    expect(preview.preview.effect.energyAfter.deficit).toBe(true)
  })

  it('publie le rapport résultant en fraction exacte', () => {
    const preview = previewRacloir()
    if (preview.outcome !== 'accepted') throw new Error('Aperçu refusé.')
    const after = preview.preview.effect.energyAfter

    renderPanel({ typeId: 'racloir', variantId: 'square-9' }, preview)
    expect(
      document.querySelector(`[data-energy-after="${after.produced}/${after.consumed}"]`),
    ).not.toBeNull()
  })

  it('dit en clair que la planète basculera en déficit', () => {
    renderPanel({ typeId: 'racloir', variantId: 'square-9' }, previewRacloir())
    const shown = screen.getByRole('group', { name: /aperçu/i }).textContent ?? ''
    expect(shown).toMatch(/énergie/i)
    expect(shown).toMatch(/déficit/i)
  })

  /**
   * La production annoncée est celle du rapport **résultant**, et non du rapport
   * courant. Annoncer sous l'ancien promettrait un chiffre que la pose rendrait
   * faux à l'instant même où elle l'atteint.
   */
  it('annonce la production sous le rapport résultant, pas sous l’actuel', () => {
    const preview = previewRacloir()
    if (preview.outcome !== 'accepted') throw new Error('Aperçu refusé.')
    const { effect } = preview.preview

    expect(effect.effectiveRateAfter).toBeLessThan(effect.effectiveRate)

    renderPanel({ typeId: 'racloir', variantId: 'square-9' }, preview)
    const shown = screen.getByRole('group', { name: /aperçu/i }).textContent ?? ''
    expect(shown).toContain(String(effect.effectiveRateAfter))
  })

  it('n’annonce aucun déficit quand la pose n’en provoque pas', () => {
    const preview = previewBuild(
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

    renderPanel(MINE_SQUARE, preview)
    const shown = screen.getByRole('group', { name: /aperçu/i }).textContent ?? ''
    expect(shown).toMatch(/énergie/i)
    expect(shown).not.toMatch(/déficit/i)
  })
})

/**
 * **L'effet d'un entrepôt sur les plafonds, annoncé avant la pose** (US7-1, T147).
 *
 * L'entrepôt est le seul des cinq types dont la vertu ne soit ni une production ni
 * une énergie. Un aperçu qui n'aurait su parler que de production l'aurait présenté
 * comme un bâtiment inutile qui consomme de l'énergie — ce qui est vrai et trompeur
 * à la fois.
 */
describe('l’aperçu d’un entrepôt annonce ce qu’il stocke (US7-1, US7-2)', () => {
  function previewOfWarehouse() {
    const snapshot = snapshotFromContract(payload, CATALOGS)
    const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
    return previewBuild(
      state,
      {
        kind: 'build',
        workId: 'apercu-local',
        typeId: 'entrepot',
        variantId: 'single',
        orientation: 0,
        anchor: { x: 5, y: 5 },
      },
      CATALOGS,
    )
  }

  it('publie les plafonds résultants et l’ajout', () => {
    renderPanel({ typeId: 'entrepot', variantId: 'single' }, previewOfWarehouse())
    const text = previewGroup().textContent ?? ''

    expect(text).toMatch(/plafonds après la pose/i)
    // L'ajout **et** le résultat : un joueur qui ne verrait que « +2 000 » devrait
    // connaître son plafond de tête pour savoir ce qu'il achète.
    expect(text).toMatch(/\+\s*2[\s ]?000/)
  })

  it('publie l’ajout en grains, comparable', () => {
    renderPanel({ typeId: 'entrepot', variantId: 'single' }, previewOfWarehouse())
    const node = previewGroup().querySelector('[data-cap-added]')
    expect(node?.getAttribute('data-cap-added')).toMatch(/^camelote:\d+/)
  })

  /**
   * Le temps gagné, et c'est la grandeur qui décide : « votre Camelote saturera dans
   * quatre jours au lieu de deux » est une raison de payer, « votre plafond passera
   * de 5 000 à 7 000 » demande au joueur de faire lui-même la division.
   */
  it('publie le temps de saturation gagné, par ressource', () => {
    renderPanel({ typeId: 'entrepot', variantId: 'single' }, previewOfWarehouse())
    expect(previewGroup().textContent).toMatch(/saturation repoussée de/i)
  })

  /**
   * **Rien n'est dit quand rien ne change.** Quatre des cinq types ne stockent rien,
   * et une ligne « +0 » sur l'aperçu d'une mine ferait chercher au joueur un effet
   * qui n'existe pas.
   */
  it('une mine n’annonce aucun plafond', () => {
    const snapshot = snapshotFromContract(payload, CATALOGS)
    const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
    const preview = previewBuild(
      state,
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

    renderPanel({ typeId: 'mine', variantId: 'square-4' }, preview)
    expect(previewGroup().textContent).not.toMatch(/plafonds après la pose/i)
    expect(previewGroup().querySelector('[data-cap-added]')).toBeNull()
  })
})

/**
 * **L'impossibilité de placer un type, énoncée** (cas limite de la spécification).
 *
 * « Aucune empreinte d'un type donné ne tient nulle part sur la grille : le type
 * reste consultable, **son aperçu énonce l'impossibilité et son motif**. » Les
 * deux moitiés comptent : le type ne disparaît pas du sélecteur — le joueur doit
 * pouvoir continuer de le consulter —, et l'aperçu dit *pourquoi*.
 */
describe('l’aperçu énonce l’impossibilité et son motif', () => {
  const notEnough: PlacementAvailability = {
    kind: 'not-enough-free-cells',
    freeCells: 3,
    smallestFootprint: 9,
  }
  const noShape: PlacementAvailability = {
    kind: 'no-shape-fits',
    freeCells: 17,
    smallestFootprint: 9,
  }

  it('dit qu’aucune empreinte ne tient', () => {
    renderPanel({ typeId: 'racloir', variantId: 'square-9' }, null, { availability: noShape })
    expect(previewGroup().textContent).toMatch(/ne tient nulle part/i)
  })

  /**
   * Les deux motifs n'appellent pas la même décision : libérer *davantage* de
   * cases, ou libérer *les bonnes*. Les confondre enverrait le joueur démolir au
   * hasard.
   */
  it('distingue « pas dans cette forme » de « plus assez de place »', () => {
    renderPanel({ typeId: 'racloir', variantId: 'square-9' }, null, { availability: noShape })
    expect(previewGroup().textContent).toMatch(/pas dans cette forme/i)
    expect(previewGroup().textContent).not.toMatch(/plus assez/i)
  })

  it('dit « plus assez de cases » et chiffre le manque', () => {
    renderPanel({ typeId: 'racloir', variantId: 'square-9' }, null, { availability: notEnough })
    const text = previewGroup().textContent ?? ''
    expect(text).toMatch(/plus assez/i)
    // Les deux nombres qui disent l'ampleur : ce qui reste, ce qu'il faudrait.
    expect(text).toContain('3')
    expect(text).toContain('9')
  })

  it('laisse le type consultable — il reste sélectionné et sélectionnable', () => {
    renderPanel({ typeId: 'racloir', variantId: 'square-9' }, null, { availability: noShape })
    const radio = screen.getByRole('radio', { name: /racloir/i }) as HTMLInputElement
    expect(radio.checked).toBe(true)
    expect(radio.disabled).toBe(false)
  })

  it('n’en dit rien quand un placement existe', () => {
    renderPanel(MINE_SQUARE, previewOnVein(), {
      availability: {
        kind: 'available',
        variantId: 'square-4',
        orientation: 0,
        anchor: { x: 3, y: 3 },
      },
    })
    expect(previewGroup().textContent).not.toMatch(/ne tient nulle part/i)
  })
})

/**
 * **La grille pleine, dite** (cas limite de la spécification).
 *
 * « La grille est entièrement occupée : seules la démolition et le déblaiement
 * peuvent libérer de la place, **et le jeu le dit**. » Un joueur qui ne trouve
 * plus où poser doit lire pourquoi et par où sortir, sans le déduire de refus
 * successifs case par case.
 */
describe('la grille pleine est énoncée, avec ses issues', () => {
  /** Une grille dont aucune case n'est libre. */
  function fullGrid(): readonly CellView[] {
    return freshState().grid.map((cell) =>
      cell.state === 'free' ? { ...cell, state: 'occupied' as const, buildingId: 'plein' } : cell,
    )
  }

  const pleine = () => renderPanel(NOTHING_SELECTED, null, { occupancy: gridOccupancy(fullGrid()) })

  const texteDeLAvis = (): string => screen.getByText(/entièrement occupée/i).textContent ?? ''

  it('ne dit rien tant qu’une case reste libre', () => {
    renderPanel(NOTHING_SELECTED)
    expect(screen.queryByText(/entièrement occupée/i)).toBeNull()
  })

  it('dit que la grille est entièrement occupée', () => {
    pleine()
    expect(screen.getByText(/entièrement occupée/i)).toBeDefined()
  })

  it('nomme les deux issues : démolir, déblayer', () => {
    pleine()
    expect(texteDeLAvis()).toMatch(/démoli/i)
    expect(texteDeLAvis()).toMatch(/déblaiement/i)
  })

  /**
   * Les deux comptes, parce qu'ils décident : dix obstacles et vingt-six
   * bâtiments ne se libèrent pas au même prix.
   */
  it('chiffre ce qui est sous obstacle et ce qui est sous bâtiment', () => {
    pleine()
    expect(texteDeLAvis()).toContain('26')
    expect(texteDeLAvis()).toContain('10')
  })

  /**
   * **La région polie disparaît ; le message reste** (T067, FR-022, INV-N1).
   *
   * 001 portait cet avis dans un `role="status"` — une **seconde** région polie sur
   * l'écran de parcelle, en concurrence avec celle du curseur. Deux régions polies se
   * disputent l'ordre de restitution, et le joueur entend l'une des deux sans savoir
   * laquelle.
   *
   * L'avis reste **visible et lisible** : ce que 002 retire est le canal
   * d'annonce, non l'information. Et il n'est pas perdu à l'oreille : l'annonce
   * unique le porte au moment où il devient vrai, c'est-à-dire quand une pose vient
   * d'occuper la dernière case libre — sous l'origine `pose-acceptee`, qui est
   * exactement l'événement qui l'a produit.
   */
  it('ne porte plus de région polie (INV-N1)', () => {
    pleine()
    expect(document.body.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(0)
  })
})

/** L'occupation réelle d'une planète neuve, pour ancrer les cas ci-dessus. */
describe('les deux cas limites se lisent sur la grille réelle', () => {
  it('une planète neuve n’est ni pleine ni sans placement', () => {
    const grid = freshState().grid
    expect(gridOccupancy(grid).full).toBe(false)
    expect(placementAvailability(grid, 'racloir', CATALOGS).kind).toBe('available')
  })
})
