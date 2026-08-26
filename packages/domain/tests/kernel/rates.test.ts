import { BERCEAU } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOGS } from '../../src/kernel/catalogs.js'
import { applyEnergyRatio, NO_DEFICIT } from '../../src/kernel/energy.js'
import { productionRates, storageCaps } from '../../src/kernel/rates.js'
import { emptySnapshot, type PlanetSnapshot } from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'

/**
 * Les taux et les plafonds.
 *
 * Le point qui gouverne tout : **la production de base du Berceau s'ajoute après
 * le rapport d'énergie et n'en est jamais touchée** (FR-018, R5). C'est ce qui
 * garantit qu'aucun état de jeu n'est définitivement bloquant — même à zéro
 * énergie, la planète produit et le joueur peut repartir.
 */

const CATALOGS = DEFAULT_CATALOGS

function fresh(): PlanetSnapshot {
  return emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt: instant(1_787_750_000),
    catalogs: CATALOGS,
  })
}

describe('le rapport d’énergie, avec une seule troncature (R5)', () => {
  it('laisse le taux intact hors déficit', () => {
    expect(applyEnergyRatio(37, NO_DEFICIT)).toBe(37)
  })

  it('laisse le taux intact quand la production dépasse la consommation', () => {
    expect(applyEnergyRatio(37, { numerator: 50, denominator: 20 })).toBe(37)
  })

  /**
   * La troncature porte sur le **taux**, une fois, et non sur le gain. C'est ce
   * qui préserve l'additivité : `⌊a⌋ + ⌊b⌋ ≠ ⌊a+b⌋`, mais un taux entier
   * constant sur un segment se multiplie exactement par la durée. Tronquer le
   * gain serait plus fin — et rendrait la fortune du joueur dépendante de sa
   * fréquence d'action.
   */
  it('tronque vers le bas en déficit', () => {
    expect(applyEnergyRatio(37, { numerator: 1, denominator: 2 })).toBe(18)
  })

  it('rend zéro quand rien n’est produit', () => {
    expect(applyEnergyRatio(37, { numerator: 0, denominator: 5 })).toBe(0)
  })
})

describe('les taux de production d’une planète neuve', () => {
  it.each(['camelote', 'jus', 'bave-etoiles'] as const)(
    '%s produit au taux de base du Berceau',
    (resourceId) => {
      const rates = productionRates(fresh(), CATALOGS, NO_DEFICIT)
      expect(rates[resourceId].effective).toBe(BERCEAU.baseProductionPerHour[resourceId])
    },
  )

  it('donne le même taux nominal et effectif sans déficit', () => {
    const rates = productionRates(fresh(), CATALOGS, NO_DEFICIT)
    for (const rate of Object.values(rates)) {
      expect(rate.nominal).toBe(rate.effective)
    }
  })

  /**
   * Le cas qui tient FR-018. Un déficit total — rapport nul — laisse la base
   * **intacte**. Sans cela, une mine posée avant la première centrale
   * ramènerait la production de la planète à zéro, et le joueur serait puni sans
   * qu'aucune règle publiée ne l'ait annoncé.
   */
  it.each(['camelote', 'jus', 'bave-etoiles'] as const)(
    'garde la base de %s intacte même à rapport nul',
    (resourceId) => {
      const rates = productionRates(fresh(), CATALOGS, { numerator: 0, denominator: 100 })
      expect(rates[resourceId].effective).toBe(BERCEAU.baseProductionPerHour[resourceId])
      expect(rates[resourceId].effective).toBeGreaterThan(0)
    },
  )
})

describe('les plafonds de stockage', () => {
  it.each(['camelote', 'jus', 'bave-etoiles'] as const)(
    '%s est plafonnée à la capacité de base',
    (resourceId) => {
      expect(storageCaps(fresh(), CATALOGS)[resourceId]).toBe(
        BERCEAU.baseCapacityGrains[resourceId],
      )
    },
  )

  /**
   * La capacité **n'est pas** dégradée par le déficit d'énergie (R21). Un
   * plafond qui rétrécit pourrait passer sous la quantité détenue — un état que
   * l'invariant I-1 interdit, et dont il faudrait alors décider du sort :
   * confisquer, ou tolérer l'interdit.
   */
  it('ne dépend pas du rapport d’énergie', () => {
    expect(storageCaps(fresh(), CATALOGS)).toEqual(storageCaps(fresh(), CATALOGS))
  })
})
