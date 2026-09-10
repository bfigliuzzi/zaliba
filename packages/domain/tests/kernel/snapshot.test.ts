import { BERCEAU } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import type { Effect } from '../../src/kernel/effects.js'
import {
  applyEffects,
  emptySnapshot,
  type PlanetSnapshot,
  sameCell,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'
import { CATALOGS } from '../catalogs.js'

/**
 * L'instantané daté et l'application des effets.
 *
 * **Un module ne mute rien** : il retourne des effets, et c'est le noyau qui les
 * applique. La séparation n'est pas décorative. Elle rend chaque décision de jeu
 * inspectable **avant** d'être subie — ce dont un aperçu a besoin (R8) — et elle
 * permet à la couche serveur de tout écrire dans une seule transaction.
 */

const T0 = instant(1_787_750_000)
const T1 = instant(T0 + 600)

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

describe('une planète fondée part du catalogue, jamais d’une constante recopiée', () => {
  it('reprend le stock de départ de la disposition', () => {
    const snapshot = fresh()
    for (const [resourceId, expected] of Object.entries(BERCEAU.startingStockGrains)) {
      expect(snapshot.holdings[resourceId as 'camelote'].amount).toBe(expected)
    }
  })

  it('n’a rien perdu, rien construit, rien déblayé, aucun chantier', () => {
    const snapshot = fresh()
    expect(snapshot.buildings).toHaveLength(0)
    expect(snapshot.clearedCells).toHaveLength(0)
    expect(snapshot.work).toBeNull()
    for (const holding of Object.values(snapshot.holdings)) {
      expect(holding.lost).toBe(0)
    }
  })

  it('fait du fondateur le propriétaire **et** l’occupant (FR-006)', () => {
    const snapshot = fresh()
    expect(snapshot.occupantId).toBe(snapshot.ownerId)
  })

  it('refuse une disposition inconnue plutôt que d’en inventer une', () => {
    expect(() =>
      emptySnapshot({
        ...fresh(),
        layoutId: 'inexistante' as 'berceau-v1',
        catalogs: CATALOGS,
      }),
    ).toThrow(RangeError)
  })
})

describe('les effets de ressource', () => {
  it('crédite ce qui est crédité', () => {
    const before = fresh().holdings['camelote'].amount
    const after = applyEffects(
      fresh(),
      [{ kind: 'credit-resources', amounts: [{ resourceId: 'camelote', grains: 500 }] }],
      T1,
    )
    expect(after.holdings['camelote'].amount).toBe(before + 500)
  })

  it('débite ce qui est débité', () => {
    const before = fresh().holdings['camelote'].amount
    const after = applyEffects(
      fresh(),
      [{ kind: 'debit-resources', amounts: [{ resourceId: 'camelote', grains: 500 }] }],
      T1,
    )
    expect(after.holdings['camelote'].amount).toBe(before - 500)
  })

  /**
   * La perte cumulée n'est **pas** touchée par un débit. Elle mesure ce que le
   * plafond a fait déborder, pas ce que le joueur a dépensé — les confondre
   * rendrait FR-026 inintelligible.
   */
  it('ne touche pas à la perte cumulée', () => {
    const after = applyEffects(
      fresh(),
      [{ kind: 'debit-resources', amounts: [{ resourceId: 'camelote', grains: 500 }] }],
      T1,
    )
    expect(after.holdings['camelote'].lost).toBe(0)
  })

  it('ignore une ressource que la planète ne connaît pas', () => {
    const after = applyEffects(
      fresh(),
      [{ kind: 'credit-resources', amounts: [{ resourceId: 'inexistante' as 'jus', grains: 10 }] }],
      T1,
    )
    expect(Object.keys(after.holdings).sort()).toEqual([...CATALOGS.resourceIds].sort())
  })
})

describe('les effets de bâtiment', () => {
  const place: Effect = {
    kind: 'place-building',
    buildingId: 'b-1',
    typeId: 'mine',
    variantId: 'square-4',
    orientation: 0,
    anchor: { x: 0, y: 4 },
  }

  it('pose un bâtiment au niveau 1', () => {
    const after = applyEffects(fresh(), [place], T1)
    expect(after.buildings).toHaveLength(1)
    expect(after.buildings[0]?.level).toBe(1)
  })

  it('fige la variante et l’orientation à la pose (FR-010)', () => {
    const after = applyEffects(fresh(), [place], T1)
    expect(after.buildings[0]?.variantId).toBe('square-4')
    expect(after.buildings[0]?.orientation).toBe(0)
  })

  it('change le niveau sans toucher à la forme', () => {
    const after = applyEffects(
      fresh(),
      [place, { kind: 'set-building-level', buildingId: 'b-1', level: 3 }],
      T1,
    )
    expect(after.buildings[0]?.level).toBe(3)
    expect(after.buildings[0]?.anchor).toEqual({ x: 0, y: 4 })
  })

  it('retire un bâtiment sans toucher aux autres', () => {
    const after = applyEffects(
      fresh(),
      [
        place,
        { ...place, buildingId: 'b-2', anchor: { x: 3, y: 3 } } as Effect,
        { kind: 'remove-building', buildingId: 'b-1' },
      ],
      T1,
    )
    expect(after.buildings.map((b) => b.id)).toEqual(['b-2'])
  })

  it('ignore une amélioration ou un retrait qui ne vise rien', () => {
    const after = applyEffects(
      fresh(),
      [
        { kind: 'set-building-level', buildingId: 'inconnu', level: 5 },
        { kind: 'remove-building', buildingId: 'inconnu' },
      ],
      T1,
    )
    expect(after.buildings).toHaveLength(0)
  })
})

describe('les effets de case et de chantier', () => {
  it('déblaie une case', () => {
    const after = applyEffects(fresh(), [{ kind: 'clear-cell', cell: { x: 3, y: 0 } }], T1)
    expect(after.clearedCells).toEqual([{ x: 3, y: 0 }])
  })

  it('planifie un chantier avec sa cible et ses deux instants', () => {
    const after = applyEffects(
      fresh(),
      [
        {
          kind: 'schedule-work',
          workId: 'w-1',
          nature: 'clear',
          target: { kind: 'cell', cell: { x: 3, y: 0 } },
          startedAt: T1,
          dueAt: T1 + 300,
        },
      ],
      T1,
    )

    expect(after.work?.id).toBe('w-1')
    expect(after.work?.startedAt).toBe(T1)
    expect(after.work?.dueAt).toBe(T1 + 300)
    expect(after.work?.target).toEqual({ kind: 'cell', cell: { x: 3, y: 0 } })
  })
})

describe('l’application est une transformation, jamais une mutation', () => {
  /**
   * Si `applyEffects` mutait, la couche serveur ne pourrait pas comparer l'avant
   * et l'après pour décider quoi écrire — et un aperçu client détruirait l'état
   * qu'il était censé simuler.
   */
  it('laisse l’instantané d’origine intact', () => {
    const snapshot = fresh()
    const before = JSON.stringify(snapshot)
    applyEffects(
      snapshot,
      [
        { kind: 'debit-resources', amounts: [{ resourceId: 'camelote', grains: 100 }] },
        { kind: 'clear-cell', cell: { x: 3, y: 0 } },
      ],
      T1,
    )
    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it('date le résultat de l’instant qu’on lui donne', () => {
    expect(applyEffects(fresh(), [], T1).consolidatedAt).toBe(T1)
  })

  it('applique les effets dans l’ordre où ils arrivent', () => {
    const after = applyEffects(
      fresh(),
      [
        { kind: 'credit-resources', amounts: [{ resourceId: 'jus', grains: 100 }] },
        { kind: 'debit-resources', amounts: [{ resourceId: 'jus', grains: 40 }] },
      ],
      T1,
    )
    expect(after.holdings['jus'].amount).toBe(60)
  })
})

describe('sameCell', () => {
  it('reconnaît la même case', () => {
    expect(sameCell({ x: 2, y: 3 }, { x: 2, y: 3 })).toBe(true)
  })

  it('distingue deux cases', () => {
    expect(sameCell({ x: 2, y: 3 }, { x: 3, y: 2 })).toBe(false)
  })
})
