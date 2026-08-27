import { BUILDINGS } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOGS } from '../../../src/kernel/catalogs.js'
import { cumulativeCost } from '../../../src/kernel/curves.js'
import {
  emptySnapshot,
  type PlanetSnapshot,
  type ScheduledWork,
} from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import { effectsOnCompletion } from '../../../src/modules/construction/completion.js'

/**
 * Les effets d'un chantier à son achèvement — **redérivés, jamais stockés**.
 *
 * Une charge d'effets sérialisée en base deviendrait une surface de confiance :
 * il faudrait la valider à la relecture, puisqu'elle a pu être écrite par une
 * version antérieure du code. La redériver la rend déterministe et sans surface.
 *
 * Elle a une seconde vertu, moins évidente : les effets **suivent le
 * catalogue**. Un rééquilibrage s'applique aux chantiers en cours, au lieu de
 * laisser vivre des promesses chiffrées selon des règles qui n'existent plus.
 */

const T0 = instant(1_787_750_000)
const CATALOGS = DEFAULT_CATALOGS

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

function withBuilding(level: number, typeId = 'mine' as const): PlanetSnapshot {
  return {
    ...fresh(),
    buildings: [
      {
        id: 'b-1',
        typeId,
        variantId: 'square-4',
        orientation: 0,
        anchor: { x: 0, y: 4 },
        level,
      },
    ],
  }
}

function work(nature: ScheduledWork['nature'], target: ScheduledWork['target']): ScheduledWork {
  return { id: 'w-1', nature, target, startedAt: T0, dueAt: instant(T0 + 600) }
}

describe('une construction pose le bâtiment au niveau 1', () => {
  const building = work('build', {
    kind: 'build',
    typeId: 'mine',
    variantId: 'square-4',
    orientation: 1,
    anchor: { x: 0, y: 4 },
  })

  it('produit exactement un effet de pose', () => {
    const effects = effectsOnCompletion(building, fresh(), CATALOGS)
    expect(effects).toHaveLength(1)
    expect(effects[0]?.kind).toBe('place-building')
  })

  /**
   * Le coût a été **débité au lancement**, pas à l'échéance. Le redébiter ici
   * ferait payer deux fois — et le joueur ne le verrait qu'en comparant ses
   * comptes.
   */
  it('ne débite rien : le coût a été payé au lancement', () => {
    const effects = effectsOnCompletion(building, fresh(), CATALOGS)
    expect(effects.some((e) => e.kind === 'debit-resources')).toBe(false)
  })

  it('reprend la variante, l’orientation et l’ancre du chantier', () => {
    const [effect] = effectsOnCompletion(building, fresh(), CATALOGS)
    expect(effect).toMatchObject({
      variantId: 'square-4',
      orientation: 1,
      anchor: { x: 0, y: 4 },
    })
  })
})

describe('une amélioration monte d’un niveau, depuis le niveau réel', () => {
  it('passe du niveau 3 au niveau 4', () => {
    const effects = effectsOnCompletion(
      work('upgrade', { kind: 'building', buildingId: 'b-1' }),
      withBuilding(3),
      CATALOGS,
    )
    expect(effects).toEqual([{ kind: 'set-building-level', buildingId: 'b-1', level: 4 }])
  })

  /**
   * Le niveau visé est lu **à l'échéance**, pas figé au lancement. La nuance
   * comptera quand plusieurs sources pourront modifier un bâtiment : figer la
   * cible ferait revenir en arrière un bâtiment amélioré entre-temps.
   */
  it('ne laisse aucune trace du niveau qu’il était au lancement', () => {
    const [effect] = effectsOnCompletion(
      work('upgrade', { kind: 'building', buildingId: 'b-1' }),
      withBuilding(7),
      CATALOGS,
    )
    expect(effect).toMatchObject({ level: 8 })
  })

  it('ne produit rien si le bâtiment a disparu entre-temps', () => {
    expect(
      effectsOnCompletion(
        work('upgrade', { kind: 'building', buildingId: 'disparu' }),
        withBuilding(3),
        CATALOGS,
      ),
    ).toEqual([])
  })
})

describe('une démolition retire le bâtiment et rembourse (FR-046)', () => {
  it('retire le bâtiment', () => {
    const effects = effectsOnCompletion(
      work('demolish', { kind: 'building', buildingId: 'b-1' }),
      withBuilding(1),
      CATALOGS,
    )
    expect(effects[0]).toEqual({ kind: 'remove-building', buildingId: 'b-1' })
  })

  /**
   * Le coût cumulé est **dérivé** du niveau et de la courbe (R9), jamais
   * stocké : le stocker le rendrait faux au premier rééquilibrage, et faux en
   * silence. Le montant attendu se recalcule donc ici depuis le catalogue, ce
   * qui vérifie la dérivation elle-même et non un chiffre recopié.
   */
  it('rembourse la moitié du coût cumulé, tronquée vers le bas', () => {
    const level = 4
    const effects = effectsOnCompletion(
      work('demolish', { kind: 'building', buildingId: 'b-1' }),
      withBuilding(level),
      CATALOGS,
    )
    const credit = effects.find((e) => e.kind === 'credit-resources')

    const { cost, refund } = BUILDINGS['mine']
    for (const [resourceId, curve] of Object.entries(cost)) {
      const expected = Math.floor((cumulativeCost(curve, level) * refund.num) / refund.den)
      const amount =
        credit?.kind === 'credit-resources'
          ? credit.amounts.find((a) => a.resourceId === resourceId)?.grains
          : undefined
      expect(amount).toBe(expected)
    }
  })

  it('rembourse davantage pour un niveau plus élevé', () => {
    function refundOf(level: number): number {
      const effects = effectsOnCompletion(
        work('demolish', { kind: 'building', buildingId: 'b-1' }),
        withBuilding(level),
        CATALOGS,
      )
      const credit = effects.find((e) => e.kind === 'credit-resources')
      return credit?.kind === 'credit-resources'
        ? credit.amounts.reduce((total, a) => total + a.grains, 0)
        : 0
    }

    expect(refundOf(5)).toBeGreaterThan(refundOf(1))
  })

  it('retire avant de créditer : c’est l’ordre que lira un journal', () => {
    const effects = effectsOnCompletion(
      work('demolish', { kind: 'building', buildingId: 'b-1' }),
      withBuilding(2),
      CATALOGS,
    )
    expect(effects.map((e) => e.kind)).toEqual(['remove-building', 'credit-resources'])
  })

  it('ne produit rien si le bâtiment a disparu entre-temps', () => {
    expect(
      effectsOnCompletion(
        work('demolish', { kind: 'building', buildingId: 'disparu' }),
        withBuilding(2),
        CATALOGS,
      ),
    ).toEqual([])
  })
})

describe('un déblaiement libère la case', () => {
  it('produit exactement un effet de déblaiement', () => {
    expect(
      effectsOnCompletion(work('clear', { kind: 'cell', cell: { x: 3, y: 0 } }), fresh(), CATALOGS),
    ).toEqual([{ kind: 'clear-cell', cell: { x: 3, y: 0 } }])
  })

  /**
   * Il n'existe **aucun effet inverse** : une case déblayée ne redevient jamais
   * obstruée (I-8, FR-045). C'est garanti par l'absence de chemin d'écriture, et
   * non par une vérification.
   */
  it('ne produit aucun effet d’obstruction', () => {
    const kinds = effectsOnCompletion(
      work('clear', { kind: 'cell', cell: { x: 3, y: 0 } }),
      fresh(),
      CATALOGS,
    ).map((e) => e.kind)
    expect(kinds).not.toContain('obstruct-cell')
  })
})

describe('une cible qui contredit sa nature ne produit rien', () => {
  /**
   * La cohérence entre `nature` et cible est portée en base par
   * `works_target_matches_nature` : une telle ligne ne peut pas exister. Ne rien
   * produire ici est donc une **défense en profondeur**, pas la garde
   * principale — mais produire n'importe quoi serait pire que ne rien produire.
   */
  it.each([
    ['build', { kind: 'cell', cell: { x: 0, y: 0 } }],
    ['upgrade', { kind: 'cell', cell: { x: 0, y: 0 } }],
    ['demolish', { kind: 'cell', cell: { x: 0, y: 0 } }],
    ['clear', { kind: 'building', buildingId: 'b-1' }],
  ] as const)('%s avec une cible incohérente', (nature, target) => {
    expect(effectsOnCompletion(work(nature, target), withBuilding(1), CATALOGS)).toEqual([])
  })
})
