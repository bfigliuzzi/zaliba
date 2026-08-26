import { cleanup, render, screen, within } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { DEFAULT_CATALOGS, instant, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { GridView } from '../../../src/features/grid/GridView.js'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * La grille 6×6.
 *
 * **Le canvas est une vue, jamais le contrôle.** L'interaction passe par des
 * éléments du document focalisables, dont l'état est la source de vérité. Une
 * grille peinte serait plus jolie et inatteignable au clavier comme au lecteur
 * d'écran — et FR-058 en fait une exigence, pas une préférence.
 *
 * **FR-060 : jamais la couleur seule.** Une case obstruée, une case libre et une
 * case portant un gisement doivent se distinguer par autre chose qu'une teinte —
 * ici, par le nom accessible de la case. C'est ce qui la rend lisible pour qui
 * ne distingue pas les couleurs, et énonçable pour qui écoute la page.
 */

afterEach(cleanup)

const CATALOGS = DEFAULT_CATALOGS
const payload = PlanetSnapshotV1.parse(rawFresh)

function renderGrid() {
  const snapshot = snapshotFromContract(payload, CATALOGS)
  const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
  return render(<GridView cells={state.grid} width={6} height={6} />)
}

describe('la grille est une grille, au sens du document', () => {
  it('expose un rôle de grille', () => {
    renderGrid()
    expect(screen.getByRole('grid')).toBeDefined()
  })

  it('expose trente-six cases', () => {
    renderGrid()
    expect(screen.getAllByRole('gridcell')).toHaveLength(36)
  })

  it('expose six rangées', () => {
    renderGrid()
    expect(screen.getAllByRole('row')).toHaveLength(6)
  })

  /**
   * `tabindex` mobile : **une seule** case est atteignable par tabulation, et
   * les flèches déplacent le curseur à l'intérieur. Rendre les trente-six cases
   * tabulables obligerait à trente-six tabulations pour traverser la grille.
   */
  it('n’offre qu’un seul point d’entrée au clavier', () => {
    renderGrid()
    const focusable = screen.getAllByRole('gridcell').filter((cell) => cell.tabIndex === 0)
    expect(focusable).toHaveLength(1)
  })

  it('rend les trente-cinq autres cases atteignables au curseur', () => {
    renderGrid()
    const cells = screen.getAllByRole('gridcell')
    expect(cells.filter((cell) => cell.tabIndex === -1)).toHaveLength(35)
  })
})

describe('l’état d’une case se lit sans la voir (FR-060)', () => {
  function cellAt(x: number, y: number) {
    const rows = screen.getAllByRole('row')
    const row = rows[y]
    if (row === undefined) throw new Error(`Rangée ${y} absente.`)
    return within(row).getAllByRole('gridcell')[x]
  }

  it('nomme une case libre', () => {
    renderGrid()
    expect(cellAt(0, 0)?.getAttribute('aria-label')).toMatch(/libre/i)
  })

  it('nomme une case obstruée et son obstacle', () => {
    renderGrid()
    const label = cellAt(3, 0)?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/obstruée/i)
    expect(label).toMatch(/éboulis/i)
  })

  it('nomme le gisement d’une case qui en porte un', () => {
    renderGrid()
    expect(cellAt(0, 4)?.getAttribute('aria-label')).toMatch(/camelote/i)
  })

  it('annonce toujours la position de la case', () => {
    renderGrid()
    for (const [x, y] of [
      [0, 0],
      [3, 0],
      [5, 5],
    ] as const) {
      expect(cellAt(x, y)?.getAttribute('aria-label')).toContain(`${x + 1}`)
    }
  })

  /**
   * Le test qui rend FR-060 vérifiable plutôt que promis : deux états distincts
   * doivent porter des noms accessibles distincts. Une différence purement
   * visuelle ne passerait pas ici.
   */
  it('distingue les trois états autrement que par le style', () => {
    renderGrid()
    const libre = cellAt(0, 0)?.getAttribute('aria-label')
    const obstruee = cellAt(3, 0)?.getAttribute('aria-label')
    const gisement = cellAt(0, 4)?.getAttribute('aria-label')

    expect(new Set([libre, obstruee, gisement]).size).toBe(3)
  })
})

describe('la grille est un tableau de données, pas une image', () => {
  it('porte un nom accessible', () => {
    renderGrid()
    expect(screen.getByRole('grid').getAttribute('aria-label')).toBeTruthy()
  })

  it('annonce ses dimensions', () => {
    renderGrid()
    const grid = screen.getByRole('grid')
    expect(grid.getAttribute('aria-colcount')).toBe('6')
    expect(grid.getAttribute('aria-rowcount')).toBe('6')
  })
})
