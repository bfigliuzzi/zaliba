import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { consolidatePlanet, projectPlanet } from '../../src/game.js'
import { energyReport } from '../../src/kernel/energy.js'
import { productionRates } from '../../src/kernel/rates.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'
import { CATALOGS } from '../catalogs.js'

/**
 * I-2 sous déficit d'énergie (data-model § 1.7).
 *
 * L'invariant a déjà été éprouvé sur une planète nue. Le rejouer ici n'est pas
 * une répétition : le déficit introduit **une troncature de plus** dans la
 * chaîne, et une troncature est précisément ce qui casse l'additivité quand elle
 * est mal placée. `⌊a⌋ + ⌊b⌋ ≠ ⌊a+b⌋` — donc si le rapport était appliqué au
 * *gain* de chaque segment, consolider deux fois ne vaudrait plus consolider une
 * fois, et la fortune du joueur dépendrait du nombre de fois où il ouvre le jeu.
 *
 * La raison pour laquelle l'invariant tient malgré tout tient en une ligne, et
 * c'est elle que ce fichier éprouve : **le taux effectif est entier et constant
 * sur un segment** (R5). Un entier constant se multiplie exactement par une
 * durée, quel que soit le découpage.
 */

const T0 = instant(1_787_750_000)
const RESOURCES = CATALOGS.resourceIds

/** Des durées qui couvrent la seconde comme les quatre semaines. */
const seconds = fc.integer({ min: 0, max: 4 * 7 * 86_400 })

function fresh(consolidatedAt = T0): PlanetSnapshot {
  return emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt,
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
  const variantId = CATALOGS.buildings[typeId].variants[0]
  if (variantId === undefined) throw new Error(`${typeId} n’a aucune variante.`)
  return { id: `b-${counter}`, typeId, variantId, orientation: 0, anchor, level }
}

/**
 * Une planète **en déficit**, et sans chantier en cours.
 *
 * L'absence de chantier est délibérée : I-2 est déjà éprouvé avec segmentation
 * ailleurs, et le mêler ici rendrait indiscernables deux causes d'échec — la
 * segmentation à l'échéance, et la troncature du rapport.
 */
function deficient(consolidatedAt = T0): PlanetSnapshot {
  return {
    ...fresh(consolidatedAt),
    buildings: [
      placed('mine', { x: 0, y: 4 }),
      placed('racloir', { x: 3, y: 3 }),
      placed('entrepot', { x: 2, y: 5 }),
    ],
  }
}

describe('le déficit est réel, et le taux effectif entier', () => {
  it('consomme plus qu’elle ne produit', () => {
    const report = energyReport(deficient(), CATALOGS)
    expect(report.consumed).toBeGreaterThan(report.produced)
  })

  /**
   * La propriété dont tout le reste découle. Un taux fractionnaire — même
   * représenté exactement — rendrait le gain d'un segment dépendant de sa
   * longueur autrement que linéairement, et I-2 tomberait.
   */
  it('publie des taux effectifs entiers', () => {
    const report = energyReport(deficient(), CATALOGS)
    const rates = productionRates(deficient(), CATALOGS, report.ratio)
    for (const resourceId of RESOURCES) {
      expect(Number.isInteger(rates[resourceId].effective)).toBe(true)
      expect(Number.isInteger(rates[resourceId].nominal)).toBe(true)
    }
  })

  /** Constant : le rapport ne dépend pas de l'instant, seulement des bâtiments. */
  it('publie le même taux effectif à tout instant du segment', () => {
    fc.assert(
      fc.property(seconds, (elapsed) => {
        const first = projectPlanet(deficient(), CATALOGS, T0)
        const later = projectPlanet(deficient(), CATALOGS, instant(T0 + elapsed))
        for (const resourceId of RESOURCES) {
          expect(later.holdings[resourceId].rate).toBe(first.holdings[resourceId].rate)
        }
      }),
    )
  })
})

describe('I-2 tient sous déficit comme hors déficit', () => {
  it('donne la même quantité et la même perte, quel que soit le découpage', () => {
    fc.assert(
      fc.property(seconds, seconds, (a, b) => {
        const [first, second] = a <= b ? [a, b] : [b, a]

        const direct = projectPlanet(deficient(), CATALOGS, instant(T0 + second))
        const stepped = projectPlanet(
          consolidatePlanet(deficient(), CATALOGS, instant(T0 + first)),
          CATALOGS,
          instant(T0 + second),
        )

        for (const resourceId of RESOURCES) {
          expect(stepped.holdings[resourceId].amount).toBe(direct.holdings[resourceId].amount)
          expect(stepped.holdings[resourceId].lost).toBe(direct.holdings[resourceId].lost)
        }
      }),
    )
  })

  it('reste vrai sur trois consolidations', () => {
    fc.assert(
      fc.property(seconds, seconds, seconds, (x, y, z) => {
        const [a, b, c] = [x, y, z].sort((p, q) => p - q) as [number, number, number]

        const direct = projectPlanet(deficient(), CATALOGS, instant(T0 + c))
        const stepped = projectPlanet(
          consolidatePlanet(
            consolidatePlanet(deficient(), CATALOGS, instant(T0 + a)),
            CATALOGS,
            instant(T0 + b),
          ),
          CATALOGS,
          instant(T0 + c),
        )

        for (const resourceId of RESOURCES) {
          expect(stepped.holdings[resourceId].amount).toBe(direct.holdings[resourceId].amount)
          expect(stepped.holdings[resourceId].lost).toBe(direct.holdings[resourceId].lost)
        }
      }),
      { numRuns: 60 },
    )
  })

  /**
   * L'additivité au sens strict : le gain d'un segment est **exactement** le
   * taux effectif multiplié par sa durée, tant que le plafond n'est pas atteint.
   * C'est la formulation que SC-002 promet au joueur de pouvoir refaire à la
   * main — et elle serait fausse si le rapport était appliqué au gain.
   */
  it('rend un gain exactement proportionnel à la durée, hors saturation', () => {
    const rate = projectPlanet(deficient(), CATALOGS, T0).holdings['bave-etoiles'].rate
    const start = deficient().holdings['bave-etoiles'].amount
    const cap = projectPlanet(deficient(), CATALOGS, T0).holdings['bave-etoiles'].cap

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3_600 }), (elapsed) => {
        const gained = start + rate * elapsed
        fc.pre(gained <= cap)
        expect(
          projectPlanet(deficient(), CATALOGS, instant(T0 + elapsed)).holdings['bave-etoiles']
            .amount,
        ).toBe(gained)
      }),
    )
  })
})
