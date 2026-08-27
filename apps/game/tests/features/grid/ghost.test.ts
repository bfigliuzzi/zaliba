import { describe, expect, it } from 'vitest'
import {
  type GhostState,
  ghostMarkOf,
  ghostSuffix,
} from '../../../src/features/grid/FootprintGhost.js'

/**
 * Le fantôme de l'empreinte : quelle case porte quelle marque.
 *
 * La propriété qui compte est la **précédence** : une case fautive l'emporte sur
 * « invalide ». Sans elle, les quatre cases d'un carré porteraient le même signe
 * et le joueur saurait que quelque chose ne va pas sans savoir *où* — ce qui est
 * exactement ce que FR-013 refuse.
 *
 * Le suffixe accessible est l'autre moitié de FR-060 : la marque se voit en noir
 * et blanc *et* s'entend. Une teinte seule ne remplacerait ni l'un ni l'autre.
 */

const cell = (x: number, y: number) => ({ x, y })

function ghost(overrides: Partial<GhostState> = {}): GhostState {
  return {
    cells: [cell(0, 4), cell(1, 4), cell(0, 5), cell(1, 5)],
    valid: true,
    faultyCells: [],
    ...overrides,
  }
}

describe('la marque d’une case sous le fantôme', () => {
  it('marque « valide » les cases d’un placement valide', () => {
    for (const covered of ghost().cells) {
      expect(ghostMarkOf(ghost(), covered)).toBe('valid')
    }
  })

  it('ne marque rien hors de l’empreinte', () => {
    expect(ghostMarkOf(ghost(), cell(3, 3))).toBeNull()
  })

  it('ne marque rien sans empreinte armée', () => {
    expect(ghostMarkOf(null, cell(0, 4))).toBeNull()
  })

  it('marque « invalide » toutes les cases d’un placement refusé', () => {
    const refused = ghost({ valid: false })
    expect(ghostMarkOf(refused, cell(0, 4))).toBe('invalid')
    expect(ghostMarkOf(refused, cell(1, 5))).toBe('invalid')
  })

  /**
   * La précédence, et c'est le cas qui porte FR-013 : les cases fautives se
   * distinguent des simplement recouvertes.
   */
  it('marque « fautive » la case qui fait échouer le placement', () => {
    const refused = ghost({ valid: false, faultyCells: [cell(1, 5)] })
    expect(ghostMarkOf(refused, cell(1, 5))).toBe('faulty')
    expect(ghostMarkOf(refused, cell(0, 4))).toBe('invalid')
  })

  /**
   * Une case fautive **hors** de l'empreinte reste marquée. Le cas se produit
   * pour un débordement de grille : la case (6,5) n'appartient pas à la grille,
   * donc pas aux cases affichables — et pourtant elle est la fautive. La marquer
   * quand elle existe évite d'avoir à distinguer deux sortes de fautives.
   */
  it('marque une case fautive même absente de la liste recouverte', () => {
    const refused = ghost({ cells: [cell(0, 4)], valid: false, faultyCells: [cell(6, 5)] })
    expect(ghostMarkOf(refused, cell(6, 5))).toBe('faulty')
  })
})

describe('le suffixe accessible dit la même chose que la marque (FR-060)', () => {
  it('donne trois textes distincts pour trois marques distinctes', () => {
    const suffixes = [ghostSuffix('valid'), ghostSuffix('invalid'), ghostSuffix('faulty')]
    expect(new Set(suffixes).size).toBe(3)
  })

  it('nomme l’empreinte dans chacun', () => {
    for (const mark of ['valid', 'invalid', 'faulty'] as const) {
      expect(ghostSuffix(mark)).toMatch(/empreinte/i)
    }
  })

  it('dit le refus, et non la seule position', () => {
    expect(ghostSuffix('invalid')).toMatch(/refusé/i)
    expect(ghostSuffix('faulty')).toMatch(/fautive/i)
  })

  it('reste vide hors de l’empreinte', () => {
    expect(ghostSuffix(null)).toBe('')
  })
})
