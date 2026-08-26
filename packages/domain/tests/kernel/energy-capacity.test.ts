import { BERCEAU, BUILDINGS } from '@zaliba/catalogs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../src/game.js'
import { DEFAULT_CATALOGS } from '../../src/kernel/catalogs.js'
import { energyReport } from '../../src/kernel/energy.js'
import { productionRates, storageCaps } from '../../src/kernel/rates.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'

/**
 * FR-023b et R21 : **le rapport ne s'applique qu'à la production**.
 *
 * L'asymétrie est délibérée et c'est la décision la plus contre-intuitive de la
 * tranche : l'entrepôt figure au dénominateur — il dégrade donc le rendement de
 * *toute* la planète — mais sa capacité reste entière.
 *
 * L'alternative symétrique a été écartée nommément (R21) : un plafond qui
 * rétrécit peut passer **sous la quantité détenue**, et il faudrait alors
 * choisir entre confisquer le surplus — une confiscation déclenchée par une
 * construction — et tolérer un état que l'invariant I-1 interdit.
 *
 * Ce fichier tient les deux moitiés ensemble, ce qu'aucun des deux ne fait seul :
 * la capacité est intacte **et** la consommation est bien comptée.
 */

const T0 = instant(1_787_750_000)
const CATALOGS = DEFAULT_CATALOGS
const RESOURCES = CATALOGS.resourceIds

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

let counter = 0
function placed(
  typeId: PlacedBuilding['typeId'],
  anchor: { x: number; y: number },
  level = 1,
): PlacedBuilding {
  counter += 1
  const variantId = BUILDINGS[typeId].variants[0]
  if (variantId === undefined) throw new Error(`${typeId} n’a aucune variante.`)
  return { id: `b-${counter}`, typeId, variantId, orientation: 0, anchor, level }
}

/** Une planète en déficit franc : deux extracteurs, un entrepôt, aucune centrale. */
function inDeficit(): PlanetSnapshot {
  return {
    ...fresh(),
    buildings: [
      placed('mine', { x: 0, y: 4 }),
      placed('racloir', { x: 3, y: 3 }),
      placed('entrepot', { x: 2, y: 5 }),
    ],
  }
}

describe('la mise en déficit est bien celle qu’on croit', () => {
  it('consomme plus que la planète ne produit', () => {
    const report = energyReport(inDeficit(), CATALOGS)
    expect(report.consumed).toBeGreaterThan(report.produced)
    expect(report.ratio.numerator).toBeLessThan(report.ratio.denominator)
  })

  /**
   * Sans cette moitié, le test de capacité serait satisfait par un entrepôt
   * qu'on aurait simplement oublié de compter (US3-4).
   */
  it('fait figurer l’entrepôt dans les consommateurs', () => {
    const report = energyReport(inDeficit(), CATALOGS)
    expect(report.consumers.map((one) => one.typeId)).toContain('entrepot')
  })

  it('dégrade effectivement le rapport des extracteurs par la faute de l’entrepôt', () => {
    const withStore = energyReport(inDeficit(), CATALOGS)
    const withoutStore = energyReport(
      { ...inDeficit(), buildings: inDeficit().buildings.slice(0, 2) },
      CATALOGS,
    )

    // Le même numérateur, un dénominateur plus grand : le rapport baisse.
    expect(withStore.produced).toBe(withoutStore.produced)
    expect(withStore.consumed).toBeGreaterThan(withoutStore.consumed)
    expect(withStore.ratio.numerator * withoutStore.ratio.denominator).toBeLessThan(
      withoutStore.ratio.numerator * withStore.ratio.denominator,
    )
  })
})

describe('les trois plafonds sont inchangés en déficit (FR-023b, R21)', () => {
  it.each(['camelote', 'jus', 'bave-etoiles'] as const)(
    '%s garde exactement le plafond de la planète à l’équilibre',
    (resourceId) => {
      expect(storageCaps(inDeficit(), CATALOGS)[resourceId]).toBe(
        storageCaps(fresh(), CATALOGS)[resourceId],
      )
    },
  )

  it('rend les trois plafonds de la disposition, au grain près', () => {
    const caps = storageCaps(inDeficit(), CATALOGS)
    for (const resourceId of RESOURCES) {
      expect(caps[resourceId]).toBe(BERCEAU.baseCapacityGrains[resourceId])
    }
  })

  /**
   * La propriété, et non l'exemple : **quel que soit** le déficit — y compris
   * un rapport nul, que le catalogue ne permet pas d'atteindre —, le plafond ne
   * bouge pas. C'est ce qui interdit qu'un futur rééquilibrage rende la
   * capacité sensible à l'énergie sans que personne s'en aperçoive.
   */
  it('ne dépend d’aucun niveau de déficit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: BUILDINGS.mine.maxLevel }),
        fc.integer({ min: 1, max: BUILDINGS.entrepot.maxLevel }),
        (mineLevel, storeLevel) => {
          const snapshot: PlanetSnapshot = {
            ...fresh(),
            buildings: [
              placed('mine', { x: 0, y: 4 }, mineLevel),
              placed('entrepot', { x: 2, y: 5 }, storeLevel),
            ],
          }
          const caps = storageCaps(snapshot, CATALOGS)
          for (const resourceId of RESOURCES) {
            expect(caps[resourceId]).toBe(BERCEAU.baseCapacityGrains[resourceId])
          }
        },
      ),
    )
  })

  /** Le plafond que la **projection** publie, et non seulement celui du noyau. */
  it.each(['camelote', 'jus', 'bave-etoiles'] as const)(
    'publie pour %s le même plafond dans l’état projeté',
    (resourceId) => {
      const state = projectPlanet(inDeficit(), CATALOGS, T0)
      expect(state.holdings[resourceId].cap).toBe(BERCEAU.baseCapacityGrains[resourceId])
    },
  )
})

describe('la production, elle, est bien dégradée', () => {
  /**
   * La contrepartie indispensable : sans elle, un rapport qui ne s'appliquerait
   * à *rien* satisferait tous les tests ci-dessus.
   */
  it('rend un taux effectif strictement inférieur au nominal', () => {
    const report = energyReport(inDeficit(), CATALOGS)
    const rates = productionRates(inDeficit(), CATALOGS, report.ratio)

    expect(rates['camelote'].effective).toBeLessThan(rates['camelote'].nominal)
    expect(rates['bave-etoiles'].effective).toBeLessThan(rates['bave-etoiles'].nominal)
  })

  it('laisse la quantité détenue sous le plafond intact', () => {
    const state = projectPlanet(inDeficit(), CATALOGS, instant(T0 + 30 * 86_400))
    for (const resourceId of RESOURCES) {
      const holding = state.holdings[resourceId]
      expect(holding.amount).toBeLessThanOrEqual(holding.cap)
      expect(holding.cap).toBe(BERCEAU.baseCapacityGrains[resourceId])
    }
  })
})
