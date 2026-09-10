import { cleanup, render, screen, within } from '@testing-library/react'
import type { BuildingTypeId } from '@zaliba/catalogs'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { instant, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { EnergyPanel } from '../../../src/features/resources/EnergyPanel.js'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { CATALOGS } from '../../catalogs.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * Le panneau d'énergie.
 *
 * FR-024 lui impose d'afficher **séparément** trois choses que rien ne force à
 * distinguer : la production nominale, la production effective, et le rapport
 * qui mène de l'une à l'autre. Un panneau qui n'afficherait que l'effective
 * serait plus simple et ferait perdre l'information qui décide : produire peu et
 * être bridé appellent des actions opposées — poser un extracteur, ou poser une
 * centrale.
 *
 * Deux distinctions de plus, et chacune répond à une question du joueur :
 *
 * - **base du Berceau et centrales** au numérateur : laquelle des deux puis-je
 *   faire grandir ?
 * - **le détail par bâtiment** au dénominateur : lequel dois-je démolir ?
 */

afterEach(cleanup)

const payload = PlanetSnapshotV1.parse(rawFresh)

let counter = 0
function placed(typeId: BuildingTypeId, anchor: { x: number; y: number }, level = 1) {
  counter += 1
  return {
    id: `b-${counter}`,
    typeId,
    variantId: CATALOGS.buildings[typeId].variants[0] as string,
    orientation: 0,
    anchorX: anchor.x,
    anchorY: anchor.y,
    level,
  }
}

function renderPanel(buildings: readonly ReturnType<typeof placed>[] = []) {
  const snapshot = snapshotFromContract(
    { ...payload, buildings: [...buildings] } as typeof payload,
    CATALOGS,
  )
  const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
  render(<EnergyPanel energy={state.energy} buildings={state.buildings} />)
  return state
}

const panel = () => within(screen.getByRole('group', { name: /^énergie$/i }))

describe('le rapport et ses deux membres sont lisibles', () => {
  it('expose un bloc nommé « Énergie »', () => {
    renderPanel()
    expect(screen.getByRole('group', { name: /^énergie$/i })).toBeDefined()
  })

  it('distingue la base du Berceau des centrales (FR-024)', () => {
    const state = renderPanel([placed('centrale', { x: 0, y: 0 })])

    expect(panel().getByText(/berceau/i)).toBeDefined()
    expect(panel().getByText(/centrales/i)).toBeDefined()
    expect(state.energy.fromPlants).toBeGreaterThan(0)
    expect(panel().getByText(String(state.energy.fromPlants))).toBeDefined()
    expect(panel().getByText(String(state.energy.base))).toBeDefined()
  })

  /**
   * Deux attributs, deux faits distincts. `data-energy` porte `E₊/E₋`, les deux
   * membres tels quels ; `data-energy-ratio` porte le rapport. C'est SC-002 qui
   * exige les deux : le joueur refait le calcul depuis les membres, et lit sa
   * conséquence dans le rapport. Un pourcentage arrondi ne referait ni l'un ni
   * l'autre.
   */
  it('publie les deux membres et le rapport, séparément, en déficit', () => {
    const state = renderPanel([placed('mine', { x: 0, y: 4 }), placed('racloir', { x: 3, y: 3 })])

    expect(state.energy.deficit).toBe(true)
    expect(
      document.querySelector(`[data-energy="${state.energy.produced}/${state.energy.consumed}"]`),
    ).not.toBeNull()
    expect(
      document.querySelector(
        `[data-energy-ratio="${state.energy.produced}/${state.energy.consumed}"]`,
      ),
    ).not.toBeNull()
  })

  /**
   * Le cas qui a fait séparer les deux attributs : sur une planète neuve, `E₋`
   * vaut zéro. Les deux membres se lisent, le quotient n'existe pas — et les
   * confondre publiait « 20/0 » sous le nom de rapport.
   */
  it('publie un rapport de 1 sur une planète dont personne ne tire rien', () => {
    const state = renderPanel()

    expect(state.energy.consumed).toBe(0)
    expect(document.querySelector('[data-energy-ratio="1/1"]')).not.toBeNull()
    expect(document.querySelector(`[data-energy="${state.energy.produced}/0"]`)).not.toBeNull()
  })

  it('n’annonce aucun déficit à l’équilibre', () => {
    renderPanel([placed('mine', { x: 0, y: 4 })])
    expect(panel().queryByText(/déficit/i)).toBeNull()
  })

  it('annonce le déficit quand il y en a un', () => {
    renderPanel([placed('mine', { x: 0, y: 4 }), placed('racloir', { x: 3, y: 3 })])
    expect(panel().getAllByText(/déficit/i).length).toBeGreaterThan(0)
  })
})

describe('la consommation est détaillée par bâtiment (FR-024)', () => {
  it('nomme chaque consommateur et sa part', () => {
    const state = renderPanel([placed('mine', { x: 0, y: 4 }), placed('entrepot', { x: 2, y: 5 })])

    for (const consumer of state.energy.consumers) {
      const row = document.querySelector(`[data-consumer="${consumer.buildingId}"]`)
      expect(row, `${consumer.typeId} manque au détail`).not.toBeNull()
      expect(row?.textContent).toContain(String(consumer.amount))
    }
  })

  /**
   * L'entrepôt est le cas qui se serait oublié : il ne produit rien, donc rien
   * n'attire l'attention sur sa consommation. Elle est pourtant ce qui explique
   * au joueur pourquoi ses extracteurs ont ralenti (US3-4).
   */
  it('fait figurer l’entrepôt, qui ne produit pourtant rien', () => {
    renderPanel([placed('mine', { x: 0, y: 4 }), placed('entrepot', { x: 2, y: 5 })])
    expect(panel().getByText(/entrepôt/i)).toBeDefined()
  })

  it('n’attribue aucune ligne à la centrale', () => {
    renderPanel([placed('centrale', { x: 0, y: 0 })])
    expect(panel().queryByText(/aucune consommation/i)).not.toBeNull()
  })
})

describe('chaque extracteur montre sa production nominale et son effective (FR-024)', () => {
  it('affiche les deux valeurs, distinctes, sous déficit', () => {
    const state = renderPanel([placed('mine', { x: 0, y: 4 }), placed('racloir', { x: 3, y: 3 })])

    const mine = state.buildings.find((building) => building.typeId === 'mine')
    expect(mine).toBeDefined()
    if (mine === undefined) return

    expect(mine.effectiveRate).toBeLessThan(mine.nominalRate)
    const row = document.querySelector(`[data-building-rate]`)
    expect(row).not.toBeNull()
    expect(row?.getAttribute('data-building-rate')).toBe(
      `${mine.nominalRate}/${mine.effectiveRate}`,
    )
  })

  /**
   * Sans déficit, les deux valeurs sont égales — et elles restent **affichées
   * toutes les deux**. Les fondre en une seule quand elles coïncident ferait
   * disparaître l'information au moment où le joueur apprend à la lire.
   */
  it('affiche les deux même quand elles coïncident', () => {
    const state = renderPanel([placed('mine', { x: 0, y: 4 })])
    const mine = state.buildings[0]
    if (mine === undefined) throw new Error('Aucun bâtiment projeté.')
    expect(mine.effectiveRate).toBe(mine.nominalRate)
    expect(document.querySelector('[data-building-rate]')?.getAttribute('data-building-rate')).toBe(
      `${mine.nominalRate}/${mine.effectiveRate}`,
    )
  })

  it('ne liste aucun bâtiment qui n’extrait rien', () => {
    renderPanel([placed('centrale', { x: 0, y: 0 }), placed('entrepot', { x: 2, y: 5 })])
    expect(document.querySelectorAll('[data-building-rate]')).toHaveLength(0)
  })
})

describe('une planète neuve reste lisible', () => {
  it('n’affiche ni consommateur ni extracteur, sans rien casser', () => {
    renderPanel()
    expect(document.querySelectorAll('[data-consumer]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-building-rate]')).toHaveLength(0)
    expect(panel().getByText(/aucune consommation/i)).toBeDefined()
  })
})
