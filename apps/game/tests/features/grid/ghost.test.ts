import { DEFAULT_CATALOGS } from '@zaliba/domain'
import { describe, expect, it } from 'vitest'
import { appearanceOf } from '../../../src/features/grid/appearance.js'
import { type GhostState, ghostMarkOf } from '../../../src/features/grid/FootprintGhost.js'

/**
 * Le fantôme de l'empreinte : quelle case porte quelle marque.
 *
 * La propriété qui compte est la **précédence** : une case fautive l'emporte sur
 * « invalide ». Sans elle, les quatre cases d'un carré porteraient le même signe
 * et le joueur saurait que quelque chose ne va pas sans savoir *où* — ce qui est
 * exactement ce que FR-013 refuse.
 *
 * **Le suffixe accessible a disparu avec 002.** `ghostSuffix` rendait
 * « , sous l'empreinte, placement refusé » ; le § 2.3 du contrat d'interface
 * prescrit désormais une **grammaire** — implémentée une fois dans `describeCell`,
 * et exercée sur ses onze exemples normatifs par `tests/lib/labels.test.ts`. Garder
 * les deux aurait laissé deux façons de nommer une case visée, dont une que le
 * contrat ne prescrit plus.
 *
 * Ce qui subsiste ici est donc la **précédence** — la seule propriété que
 * `ghostMarkOf` porte —, plus la vérification que la moitié audible de FR-012 a
 * bien trouvé son nouveau porteur.
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

/**
 * *Réécrit par 002.* Ce bloc éprouvait `ghostSuffix`, que la grammaire du § 2.3 a
 * remplacé. Il éprouve désormais **la même exigence sur son nouveau porteur** : la
 * marque du fantôme se voit *et* s'entend, et ce qu'on entend est la grammaire.
 *
 * L'exigence n'a pas disparu avec la fonction ; c'est pourquoi ce bloc reste.
 */
describe('la case visée s’entend autant qu’elle se voit (FR-012, FR-021)', () => {
  const libre = {
    x: 2,
    y: 2,
    state: 'free',
    obstacleId: null,
    depositOf: null,
    buildingId: null,
  } as const

  const nommer = (valide: boolean, raison?: string) =>
    appearanceOf(
      libre,
      [],
      null,
      {
        cells: [cell(2, 2)],
        fautives: valide ? [] : [cell(2, 2)],
        valide,
        ...(raison === undefined ? {} : { raison }),
      },
      DEFAULT_CATALOGS,
    ).nomAccessible

  it('nomme l’empreinte dans les deux cas', () => {
    expect(nommer(true)).toMatch(/sous l’empreinte/)
    expect(nommer(false, 'la case D3 est obstruée par un rocher')).toMatch(/sous l’empreinte/)
  })

  it('dit le refus **et sa raison**, non la seule position', () => {
    const refuse = nommer(false, 'la case D3 est obstruée par un rocher')
    expect(refuse).toMatch(/refusé/)
    // Ce que 001 ne disait pas : *pourquoi*. Sans la cause, un joueur au clavier
    // apprend le refus et essaie les trente-six cases.
    expect(refuse).toMatch(/obstruée par un rocher/)
  })

  it('ne dit rien de l’empreinte hors d’elle', () => {
    expect(appearanceOf(libre, [], null, null, DEFAULT_CATALOGS).nomAccessible).not.toMatch(
      /empreinte/,
    )
  })

  it('donne deux phrases distinctes pour deux verdicts distincts', () => {
    expect(nommer(true)).not.toBe(nommer(false, 'chevauche la Mine niveau 2 en D3'))
  })
})
