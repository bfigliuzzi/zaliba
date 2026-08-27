import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOGS } from '../../../src/kernel/catalogs.js'
import type { Cell } from '../../../src/kernel/effects.js'
import { gridView, placementCells, validatePlacement } from '../../../src/kernel/grid.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import { placementAvailability } from '../../../src/modules/construction/availability.js'

/**
 * **L'impossibilité de placer un type, énoncée** (cas limite de la spécification).
 *
 * « Aucune empreinte d'un type donné ne tient nulle part sur la grille : le type
 * reste consultable, **son aperçu énonce l'impossibilité et son motif**. »
 *
 * `previewBuild` exige une position, et `validatePlacement` répond case par
 * case : ni l'un ni l'autre ne sait dire s'il *existe* un placement. C'est une
 * question distincte, et elle appelle une réponse distincte.
 *
 * **Le motif importe autant que le verdict.** « Plus assez de cases libres » et
 * « il en reste, mais pas dans cette forme » n'appellent pas la même décision :
 * la première se règle en libérant n'importe quelle case, la seconde en libérant
 * *les bonnes* — ou en choisissant une autre empreinte. Un booléen les
 * confondrait, et le joueur démolirait au hasard.
 */

const CATALOGS = DEFAULT_CATALOGS
const T0 = instant(1_787_750_000)

function fresh(): PlanetSnapshot {
  return emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt: T0,
    catalogs: CATALOGS,
  })
}

function single(cell: Cell, index: number): PlacedBuilding {
  return {
    id: `entrepot-${index}`,
    typeId: 'entrepot',
    variantId: 'single',
    orientation: 0,
    anchor: cell,
    level: 1,
  }
}

function occupying(cells: readonly Cell[]): readonly ReturnType<typeof gridView>[number][] {
  return gridView({ ...fresh(), buildings: cells.map(single) }, CATALOGS)
}

function freeCells(): readonly Cell[] {
  return gridView(fresh(), CATALOGS)
    .filter((cell) => cell.state === 'free')
    .map(({ x, y }) => ({ x, y }))
}

/**
 * Le seul bloc de trois sur trois entièrement libre du Berceau : (3,3) à (5,5).
 *
 * Il est ce qui rend le racloir posable sur une planète neuve — et l'occuper est
 * ce qui, à lui seul, le rend impossible sans qu'il manque une seule case.
 */
const BLOC_LIBRE: readonly Cell[] = [
  { x: 3, y: 3 },
  { x: 4, y: 3 },
  { x: 5, y: 3 },
  { x: 3, y: 4 },
  { x: 4, y: 4 },
  { x: 5, y: 4 },
  { x: 3, y: 5 },
  { x: 4, y: 5 },
  { x: 5, y: 5 },
]

describe('sur une planète neuve, chaque type trouve où se poser', () => {
  it.each(['mine', 'puits', 'racloir', 'centrale', 'entrepot'] as const)(
    'trouve un placement pour %s',
    (typeId) => {
      expect(placementAvailability(gridView(fresh(), CATALOGS), typeId, CATALOGS).kind).toBe(
        'available',
      )
    },
  )

  /**
   * Le placement rendu n'est pas une indication : il doit **passer la
   * validation**. Une réponse « oui, quelque part » que le joueur ne pourrait pas
   * exécuter serait pire qu'un refus.
   */
  it.each(['mine', 'puits', 'racloir', 'centrale', 'entrepot'] as const)(
    'et ce placement est réellement valide pour %s',
    (typeId) => {
      const grid = gridView(fresh(), CATALOGS)
      const found = placementAvailability(grid, typeId, CATALOGS)
      expect(found.kind).toBe('available')
      if (found.kind !== 'available') return

      const cells = placementCells(found.variantId, found.orientation, found.anchor, CATALOGS)
      expect(validatePlacement(grid, cells)).toEqual({ kind: 'ok' })
    },
  )

  it('ne rend qu’une empreinte admissible pour le type', () => {
    const found = placementAvailability(gridView(fresh(), CATALOGS), 'mine', CATALOGS)
    expect(found.kind).toBe('available')
    if (found.kind !== 'available') return
    expect(CATALOGS.buildings.mine.variants).toContain(found.variantId)
  })
})

describe('« il en reste, mais pas dans cette forme »', () => {
  /**
   * Le cas qui rend le motif indispensable. Dix-sept cases restent libres — bien
   * plus que les neuf du racloir —, et pourtant aucune ne convient : le seul bloc
   * de trois sur trois vient d'être occupé. Dire « plus de place » ici serait
   * faux, et enverrait le joueur démolir au hasard.
   */
  it('nomme la forme quand la place existe mais pas le bloc', () => {
    const verdict = placementAvailability(occupying(BLOC_LIBRE), 'racloir', CATALOGS)

    expect(verdict.kind).toBe('no-shape-fits')
    if (verdict.kind === 'available') return
    expect(verdict.freeCells).toBe(17)
    expect(verdict.smallestFootprint).toBe(9)
  })

  it('laisse les autres types posables — l’impossibilité est par type', () => {
    const grid = occupying(BLOC_LIBRE)
    expect(placementAvailability(grid, 'entrepot', CATALOGS).kind).toBe('available')
    expect(placementAvailability(grid, 'mine', CATALOGS).kind).toBe('available')
  })
})

describe('« plus assez de cases libres »', () => {
  /**
   * L'autre motif, et la décision qu'il appelle est différente : il ne s'agit
   * plus de libérer les bonnes cases, mais d'en libérer davantage.
   */
  it('compte les cases quand il en manque, toutes formes confondues', () => {
    // Dix-neuf des vingt-six cases libres occupées : il en reste sept, moins que
    // les neuf du racloir.
    const verdict = placementAvailability(occupying(freeCells().slice(0, 19)), 'racloir', CATALOGS)

    expect(verdict.kind).toBe('not-enough-free-cells')
    if (verdict.kind === 'available') return
    expect(verdict.freeCells).toBe(7)
    expect(verdict.smallestFootprint).toBe(9)
  })

  it('vaut pour le plus petit des types quand la grille est pleine', () => {
    const verdict = placementAvailability(occupying(freeCells()), 'entrepot', CATALOGS)

    expect(verdict.kind).toBe('not-enough-free-cells')
    if (verdict.kind === 'available') return
    expect(verdict.freeCells).toBe(0)
    // L'entrepôt tient sur une case : c'est la plus petite empreinte du jeu, et
    // elle ne tient plus.
    expect(verdict.smallestFootprint).toBe(1)
  })

  it('mesure la plus petite empreinte du type, pas la plus grande', () => {
    // La mine a trois variantes, toutes de quatre cases : le seuil est quatre.
    const verdict = placementAvailability(occupying(freeCells()), 'mine', CATALOGS)
    if (verdict.kind === 'available') throw new Error('la grille est pleine')
    expect(verdict.smallestFootprint).toBe(4)
  })
})

describe('un type inconnu est une faute de programmation', () => {
  it('lève plutôt que de répondre « impossible »', () => {
    expect(() =>
      placementAvailability(gridView(fresh(), CATALOGS), 'tourelle' as never, CATALOGS),
    ).toThrow(RangeError)
  })
})
