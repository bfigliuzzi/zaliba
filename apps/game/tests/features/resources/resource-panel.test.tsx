import { cleanup, render, screen, within } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { DEFAULT_CATALOGS, instant, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { ResourcePanel } from '../../../src/features/resources/ResourcePanel.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * Le panneau de ressources.
 *
 * Quatre grandeurs par ressource, et aucune n'est décorative :
 *
 * - la **quantité** détenue ;
 * - le **plafond**, sans lequel la saturation est une surprise ;
 * - le **temps restant avant saturation** au rythme courant (FR-027), qui est
 *   la seule information disant *quand* agir ;
 * - la **quantité perdue cumulée** (FR-026), qui dit combien a déjà coûté le
 *   fait de ne pas avoir agi. C'est elle qui rend un entrepôt désirable pour une
 *   raison chiffrée plutôt que par intuition.
 */

afterEach(cleanup)

const CATALOGS = DEFAULT_CATALOGS
const payload = PlanetSnapshotV1.parse(rawFresh)

function renderPanel(elapsed = 0) {
  const snapshot = snapshotFromContract(payload, CATALOGS)
  const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt + elapsed))
  return render(<ResourcePanel holdings={state.holdings} at={state.at} />)
}

function group(name: RegExp) {
  return within(screen.getByRole('group', { name }))
}

describe('chaque ressource a son bloc', () => {
  it.each([/camelote/i, /jus/i, /bave d’étoiles/i])('expose un bloc pour %s', (name) => {
    renderPanel()
    expect(screen.getByRole('group', { name })).toBeDefined()
  })

  it('n’expose que les trois ressources du jeu', () => {
    renderPanel()
    expect(screen.getAllByRole('group')).toHaveLength(3)
  })
})

describe('les quatre grandeurs sont affichées', () => {
  it('affiche la quantité détenue en unités', () => {
    renderPanel()
    // 1 440 000 grains = 400 unités.
    expect(group(/camelote/i).getByText(/\b400\b/)).toBeDefined()
  })

  it('affiche le plafond en unités', () => {
    renderPanel()
    expect(group(/camelote/i).getByText(/5[\s ]?000/)).toBeDefined()
  })

  it('affiche le temps restant avant saturation (FR-027)', () => {
    renderPanel()
    expect(group(/camelote/i).getByText(/saturation/i)).toBeDefined()
  })

  it('affiche la perte cumulée (FR-026)', () => {
    renderPanel()
    expect(group(/camelote/i).getByText(/perdu/i)).toBeDefined()
  })
})

describe('la saturation est annoncée pour ce qu’elle est', () => {
  /**
   * `null` n'est pas une absence d'information : il dit au joueur qu'il **perd
   * déjà**. L'afficher comme un tiret muet gaspillerait le seul moment où
   * l'interface a quelque chose d'utile à dire.
   */
  it('dit que la ressource sature déjà quand c’est le cas', () => {
    renderPanel(21 * 86_400)
    expect(group(/camelote/i).getByText(/saturée/i)).toBeDefined()
  })

  it('affiche la perte accumulée après trois semaines', () => {
    renderPanel(21 * 86_400)
    // 19 728 000 grains perdus = 5 480 unités.
    expect(group(/camelote/i).getByText(/5[\s ]?480/)).toBeDefined()
  })
})

describe('l’affichage est perceptible sans la couleur (FR-060)', () => {
  it('nomme chaque grandeur en toutes lettres', () => {
    renderPanel()
    const camelote = group(/camelote/i)
    for (const label of [/détenu/i, /plafond/i, /perdu/i, /saturation/i]) {
      expect(camelote.getByText(label)).toBeDefined()
    }
  })

  /**
   * Les compteurs bougent en continu. Une région `polite` les annoncerait à
   * chaque image et rendrait la page inutilisable au lecteur d'écran : les
   * valeurs sont donc lisibles à la demande, et **non** annoncées d'office.
   */
  it('n’annonce pas les compteurs en continu', () => {
    renderPanel()
    const panel = screen.getAllByRole('group')[0]
    expect(panel?.getAttribute('aria-live')).toBeNull()
  })
})
