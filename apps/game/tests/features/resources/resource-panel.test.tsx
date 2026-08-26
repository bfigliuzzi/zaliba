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
    // 1 440 000 grains = 400,00 unités exactement.
    expect(group(/camelote/i).getByText('400,00')).toBeDefined()
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

describe('la quantité détenue progresse de façon continue (US1, critère 3)', () => {
  /**
   * Le critère 3 demande une progression **continue**. En unités entières, le
   * chiffre de la Camelote change une fois toutes les trois minutes à vingt
   * unités par heure, celui de la Bave d'étoiles toutes les douze : rien ne
   * bouge sous les yeux du joueur, et le parcours de bout en bout l'a montré en
   * expirant.
   *
   * Deux décimales suffisent — la seconde change environ toutes les 1,8 s à
   * vingt unités par heure. **R1 n'est pas touché** : le grain reste l'unité
   * canonique, et c'est seulement la résolution d'affichage qui augmente.
   */
  it('montre deux décimales sur la quantité détenue', () => {
    renderPanel()
    expect(group(/camelote/i).getByText('400,00')).toBeDefined()
  })

  it('bouge après quelques secondes seulement', () => {
    // La quantité détenue est la seule à porter des décimales : c'est ce qui la
    // désigne sans ambiguïté parmi les quatre grandeurs.
    const held = /^[\d {2}]+,\d{2}$/

    const { unmount } = renderPanel(0)
    const before = group(/camelote/i).getByText(held).textContent
    unmount()

    // Deux secondes : 20 u/h × 2 s = 40 grains, soit 0,011 unité.
    renderPanel(2)
    expect(group(/camelote/i).getByText(held).textContent).not.toBe(before)
  })

  it('garde le plafond et la perte en unités entières', () => {
    renderPanel(21 * 86_400)
    const camelote = group(/camelote/i)
    // Le plafond ne bouge jamais et la perte se compte en milliers : les
    // décimales n'y apporteraient que du bruit.
    expect(camelote.getByText('5 000')).toBeDefined()
    expect(camelote.getByText('5 480')).toBeDefined()
  })

  it('reste exact au grain près', () => {
    // 1 440 040 grains = 400,0111… → tronqué à 400,01, jamais arrondi au-dessus :
    // annoncer une ressource qu'on n'a pas ferait refuser une commande que
    // l'écran présentait comme payable.
    renderPanel(2)
    expect(group(/camelote/i).getByText('400,01')).toBeDefined()
  })
})

/**
 * Le plafond, lisible **en grains** dans un attribut.
 *
 * Le texte affiché est formaté pour être lu — séparateurs de milliers compris —
 * et le relire à l'envers pour retrouver un nombre serait fragile autant
 * qu'inutile. Le parcours de bout en bout d'US3 a besoin de comparer deux
 * plafonds pour établir que le déficit d'énergie ne les dégrade pas (FR-023b) :
 * il lui faut le chiffre, pas son apparence.
 */
describe('le plafond est comparable, pas seulement lisible', () => {
  it.each([/camelote/i, /jus/i, /bave d’étoiles/i])('porte le plafond de %s en grains', (name) => {
    renderPanel()
    const value = group(name).getByText(/^\d[\d   ]*$/, { selector: '[data-cap]' })
    expect(value.getAttribute('data-cap')).toMatch(/^\d+$/)
  })

  it('donne exactement le plafond de la projection', () => {
    const snapshot = snapshotFromContract(payload, CATALOGS)
    const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
    renderPanel()

    for (const [resourceId, holding] of Object.entries(state.holdings)) {
      const row = document.querySelector(`[data-cap][data-resource="${resourceId}"]`)
      expect(row, `${resourceId} n’expose pas son plafond`).not.toBeNull()
      expect(row?.getAttribute('data-cap')).toBe(String(holding.cap))
    }
  })
})
