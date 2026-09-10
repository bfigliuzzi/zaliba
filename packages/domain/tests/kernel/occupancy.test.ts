import { describe, expect, it } from 'vitest'
import type { Cell } from '../../src/kernel/effects.js'
import { gridOccupancy, gridView } from '../../src/kernel/grid.js'
import { grains } from '../../src/kernel/resources.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'
import { CATALOGS } from '../catalogs.js'

/**
 * **L'occupation de la grille, comptée** — et le cas limite qu'elle sert.
 *
 * La spécification le pose ainsi : « la grille est entièrement occupée : seules
 * la démolition et le déblaiement peuvent libérer de la place, **et le jeu le
 * dit** ». Le dire suppose de le savoir, et le savoir suppose de compter — un
 * joueur qui ne trouve plus où poser doit lire pourquoi et par où sortir, sans
 * le déduire de refus successifs case par case.
 *
 * Les deux issues sont comptées **séparément**, et ce n'est pas du détail : une
 * planète pleine de bâtiments et une planète pleine d'obstacles appellent des
 * décisions opposées, et une seule des deux se paie en bâtiment perdu.
 */

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

/** Un entrepôt d'une case, posé là — de quoi occuper sans rien calculer. */
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

/** L'instantané où chacune de ces cases porte un entrepôt. */
function occupying(cells: readonly Cell[]): PlanetSnapshot {
  return { ...fresh(), buildings: cells.map(single) }
}

/** Les cases libres d'une planète neuve. */
function freeCells(): readonly Cell[] {
  return gridView(fresh(), CATALOGS)
    .filter((cell) => cell.state === 'free')
    .map(({ x, y }) => ({ x, y }))
}

describe('le compte d’occupation d’une planète neuve', () => {
  it('rend les trente-six cases, dix obstruées et vingt-six libres (R7)', () => {
    const occupancy = gridOccupancy(gridView(fresh(), CATALOGS))

    expect(occupancy.total).toBe(36)
    expect(occupancy.obstructed).toBe(10)
    expect(occupancy.occupied).toBe(0)
    expect(occupancy.free).toBe(26)
  })

  it('ne la dit pas pleine — il y reste vingt-six cases', () => {
    expect(gridOccupancy(gridView(fresh(), CATALOGS)).full).toBe(false)
  })

  it('les trois comptes recouvrent exactement le total', () => {
    const o = gridOccupancy(gridView(fresh(), CATALOGS))
    expect(o.free + o.obstructed + o.occupied).toBe(o.total)
  })
})

describe('la grille entièrement occupée (cas limite de la spécification)', () => {
  it('est pleine quand aucune case n’est libre', () => {
    const occupancy = gridOccupancy(gridView(occupying(freeCells()), CATALOGS))

    expect(occupancy.free).toBe(0)
    expect(occupancy.full).toBe(true)
  })

  /**
   * Les deux issues restent **distinguables** une fois la grille pleine, et
   * c'est tout l'intérêt de compter séparément : « vingt-six bâtiments et dix
   * obstacles » dit au joueur qu'il peut déblayer *ou* démolir, alors qu'un
   * simple « pleine » le laisserait chercher.
   */
  it('dit encore par où sortir : démolir vingt-six, déblayer dix', () => {
    const occupancy = gridOccupancy(gridView(occupying(freeCells()), CATALOGS))

    expect(occupancy.occupied).toBe(26)
    expect(occupancy.obstructed).toBe(10)
  })

  it('n’est pas pleine tant qu’il reste une seule case libre', () => {
    const allButOne = freeCells().slice(1)
    const occupancy = gridOccupancy(gridView(occupying(allButOne), CATALOGS))

    expect(occupancy.free).toBe(1)
    expect(occupancy.full).toBe(false)
  })
})

describe('une grille vide de cases n’existe pas, mais la fonction y répond', () => {
  /**
   * Le cas dégénéré est traité pour lui-même : `full` doit rester une réponse
   * sur le nombre de cases libres, pas un effet de bord d'une division.
   */
  it('rend zéro partout, et se dit pleine', () => {
    expect(gridOccupancy([])).toEqual({
      total: 0,
      free: 0,
      obstructed: 0,
      occupied: 0,
      full: true,
    })
  })
})

describe('les possessions ne changent rien au compte', () => {
  it('compte les cases, jamais les ressources', () => {
    const rich: PlanetSnapshot = {
      ...fresh(),
      holdings: {
        camelote: { amount: grains(0), lost: grains(0), saturatedSince: null },
        jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
        'bave-etoiles': { amount: grains(0), lost: grains(0), saturatedSince: null },
      },
    }
    expect(gridOccupancy(gridView(rich, CATALOGS))).toEqual(
      gridOccupancy(gridView(fresh(), CATALOGS)),
    )
  })
})
