import { BERCEAU } from '@zaliba/catalogs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { evaluateCurve } from '../../src/kernel/curves.js'
import { applyEnergyRatio, energyAfterRemoval, energyReport } from '../../src/kernel/energy.js'
import { productionRates } from '../../src/kernel/rates.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'
import { CATALOGS } from '../catalogs.js'

/**
 * L'énergie : une grandeur **instantanée**, ni stockée ni accumulée (FR-021).
 *
 * Elle ne figure donc dans aucun instantané et ne se consolide pas : elle se
 * *recalcule* à chaque projection depuis les bâtiments posés. C'est la même
 * discipline que les taux — une valeur dérivable et stockée devient fausse au
 * premier rééquilibrage, et fausse en silence.
 *
 * Deux asymétries gouvernent ce fichier, et ce sont elles que les tests tiennent :
 *
 * - **au numérateur**, la centrale et le Berceau ; **au dénominateur**, tout le
 *   reste, l'entrepôt compris (FR-022, R21) ;
 * - **une seule troncature**, sur le taux et non sur le gain (R5).
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

function withBuildings(...buildings: readonly PlacedBuilding[]): PlanetSnapshot {
  return { ...fresh(), buildings }
}

/** La valeur de la courbe du catalogue, recalculée par un second chemin. */
function consumptionOf(typeId: PlacedBuilding['typeId'], level = 1): number {
  const curve = CATALOGS.buildings[typeId].energyConsumption
  if (curve === null) throw new Error(`${typeId} ne consomme rien.`)
  return evaluateCurve(curve, level)
}

/** Idem pour la production d'un extracteur, par gisement recouvert (R5). */
function productionOf(typeId: PlacedBuilding['typeId'], level = 1): number {
  const curve = CATALOGS.buildings[typeId].production
  if (curve === null) throw new Error(`${typeId} n’extrait rien.`)
  return evaluateCurve(curve, level)
}

describe('E₊ — le Berceau et les centrales, et rien d’autre (FR-022)', () => {
  it('vaut l’énergie de base du Berceau sur une planète neuve', () => {
    const report = energyReport(fresh(), CATALOGS)
    expect(report.base).toBe(BERCEAU.baseEnergy)
    expect(report.fromPlants).toBe(0)
    expect(report.produced).toBe(BERCEAU.baseEnergy)
  })

  it('ajoute la production de chaque centrale', () => {
    const curve = CATALOGS.buildings.centrale.energyProduction
    expect(curve, 'la centrale doit porter une courbe de production').not.toBeNull()
    if (curve === null) return

    const report = energyReport(withBuildings(placed('centrale', { x: 0, y: 0 })), CATALOGS)
    expect(report.fromPlants).toBe(evaluateCurve(curve, 1))
    expect(report.produced).toBe(BERCEAU.baseEnergy + evaluateCurve(curve, 1))
  })

  it('somme les centrales, sans les compter au dénominateur', () => {
    const snapshot = withBuildings(
      placed('centrale', { x: 0, y: 0 }),
      placed('centrale', { x: 3, y: 5 }),
    )
    const one = energyReport(withBuildings(placed('centrale', { x: 0, y: 0 })), CATALOGS)
    const two = energyReport(snapshot, CATALOGS)

    expect(two.fromPlants).toBe(2 * one.fromPlants)
    expect(two.consumed).toBe(0)
  })

  /**
   * Le cas qui tient FR-022, et le plus facile à casser : une mine posée
   * **avant** toute centrale ne doit pas se retrouver à zéro. Sans l'énergie de
   * base du Berceau au numérateur, la première pose du jeu punirait le joueur —
   * et rien dans les règles publiées ne l'aurait annoncé.
   */
  it('ne réduit pas à zéro une mine posée avant toute centrale', () => {
    const snapshot = withBuildings(placed('mine', { x: 0, y: 4 }))
    const report = energyReport(snapshot, CATALOGS)

    expect(report.produced).toBeGreaterThan(0)
    expect(report.consumed).toBeLessThanOrEqual(report.produced)
    expect(report.ratio.numerator).toBe(report.ratio.denominator)

    const rates = productionRates(snapshot, CATALOGS, report.ratio)
    expect(rates['camelote'].effective).toBe(rates['camelote'].nominal)
    expect(rates['camelote'].effective).toBeGreaterThan(
      CATALOGS.layouts['berceau-v1'].baseProductionPerHour['camelote'],
    )
  })
})

describe('E₋ — tous les bâtiments sauf la centrale (FR-022, R21)', () => {
  it('vaut zéro sur une planète neuve', () => {
    expect(energyReport(fresh(), CATALOGS).consumed).toBe(0)
  })

  it.each(['mine', 'puits', 'racloir', 'entrepot'] as const)(
    'compte la consommation de %s',
    (typeId) => {
      const report = energyReport(withBuildings(placed(typeId, { x: 0, y: 0 })), CATALOGS)
      expect(report.consumed).toBe(consumptionOf(typeId))
    },
  )

  /**
   * L'entrepôt est le cas qui se serait oublié : il ne produit rien, donc rien
   * n'attirait l'attention sur sa consommation. Elle est pourtant ce qui fait
   * que le poser sans centrale se paie — le prix étant payé par les extracteurs,
   * dont il grossit le dénominateur (R21).
   */
  it('compte l’entrepôt, qui ne produit pourtant rien', () => {
    const withoutStore = energyReport(withBuildings(placed('mine', { x: 0, y: 4 })), CATALOGS)
    const withStore = energyReport(
      withBuildings(placed('mine', { x: 0, y: 4 }), placed('entrepot', { x: 2, y: 5 })),
      CATALOGS,
    )

    expect(withStore.consumed).toBe(withoutStore.consumed + consumptionOf('entrepot'))
  })

  it('n’attribue aucune consommation à la centrale', () => {
    const report = energyReport(withBuildings(placed('centrale', { x: 0, y: 0 })), CATALOGS)
    expect(report.consumed).toBe(0)
    expect(report.consumers).toEqual([])
  })

  /** Le détail par bâtiment, sans lequel FR-024 n'a rien à afficher. */
  it('nomme chaque consommateur, son type, son niveau et sa part', () => {
    const mine = placed('mine', { x: 0, y: 4 })
    const store = placed('entrepot', { x: 2, y: 5 })
    const report = energyReport(
      withBuildings(mine, store, placed('centrale', { x: 0, y: 0 })),
      CATALOGS,
    )

    expect(report.consumers).toEqual([
      { buildingId: mine.id, typeId: 'mine', level: 1, amount: consumptionOf('mine') },
      { buildingId: store.id, typeId: 'entrepot', level: 1, amount: consumptionOf('entrepot') },
    ])
    expect(report.consumers.reduce((total, one) => total + one.amount, 0)).toBe(report.consumed)
  })

  it('suit la courbe de consommation avec le niveau', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: CATALOGS.buildings.mine.maxLevel }), (level) => {
        const report = energyReport(withBuildings(placed('mine', { x: 0, y: 4 }, level)), CATALOGS)
        expect(report.consumed).toBe(consumptionOf('mine', level))
      }),
    )
  })
})

describe('le rapport vaut 1 tant que la consommation ne dépasse pas la production', () => {
  it('vaut 1 sur une planète neuve', () => {
    const { ratio } = energyReport(fresh(), CATALOGS)
    expect(ratio.numerator).toBe(ratio.denominator)
  })

  /**
   * L'égalité **n'est pas** un déficit : `E₋ ≤ E₊` (FR-023). Une planète juste à
   * l'équilibre produit à plein, et c'est ce qui rend le seuil énonçable — « en
   * dessous ou égal, rien ne change » se dit en une phrase.
   */
  it('vaut 1 à l’égalité exacte', () => {
    const ratio = ratioFor(BERCEAU.baseEnergy)
    expect(applyEnergyRatio(37, ratio)).toBe(37)
  })

  it('laisse tout taux intact quand le rapport vaut 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (nominal) => {
        const { ratio } = energyReport(fresh(), CATALOGS)
        expect(applyEnergyRatio(nominal, ratio)).toBe(nominal)
      }),
    )
  })
})

/**
 * Un rapport composé à la main, pour éprouver la **règle** indépendamment du
 * contenu du jeu. Un test qui ne saurait fabriquer que les rapports que le
 * catalogue permet n'éprouverait qu'un équilibrage, pas une formule.
 */
function ratioFor(consumed: number): { numerator: number; denominator: number } {
  const produced = BERCEAU.baseEnergy
  return consumed <= produced
    ? { numerator: 1, denominator: 1 }
    : { numerator: produced, denominator: consumed }
}

describe('en déficit, une seule troncature, sur le taux (R5, US3-2)', () => {
  /** Le scénario 2 d'US3, à la lettre : 60 produits pour 100 consommés. */
  it('rend exactement 60 % du taux nominal pour 60 produits sur 100 consommés', () => {
    const ratio = { numerator: 60, denominator: 100 }
    expect(applyEnergyRatio(100, ratio)).toBe(60)
    expect(applyEnergyRatio(50, ratio)).toBe(30)
    expect(applyEnergyRatio(15, ratio)).toBe(9)
  })

  it('tronque vers le bas, jamais vers le haut', () => {
    // ⌊15 × 60 ÷ 100⌋ = ⌊9⌋ = 9 ; ⌊16 × 60 ÷ 100⌋ = ⌊9,6⌋ = 9.
    expect(applyEnergyRatio(16, { numerator: 60, denominator: 100 })).toBe(9)
  })

  /**
   * La propriété que la règle publiée doit avoir pour être reproductible à la
   * main : le taux effectif est `⌊ nominal × E₊ ÷ E₋ ⌋`, calculé **en une fois**
   * sur le produit — et non en tronquant un rapport puis en multipliant.
   */
  it('multiplie avant de tronquer, pour tout taux et tout déficit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        (nominal, produced, extra) => {
          const consumed = produced + extra
          const ratio = { numerator: produced, denominator: consumed }
          expect(applyEnergyRatio(nominal, ratio)).toBe(Math.floor((nominal * produced) / consumed))
        },
      ),
    )
  })

  /** Un déficit réel, composé de bâtiments du catalogue et non d'une fraction. */
  it('réduit la production d’une mine sous un déficit qu’un racloir provoque', () => {
    const snapshot = withBuildings(
      placed('mine', { x: 0, y: 4 }),
      placed('racloir', { x: 3, y: 3 }),
    )
    const report = energyReport(snapshot, CATALOGS)
    expect(report.consumed).toBeGreaterThan(report.produced)

    const rates = productionRates(snapshot, CATALOGS, report.ratio)
    const mineNominal = productionOf('mine')
    const base = CATALOGS.layouts['berceau-v1'].baseProductionPerHour['camelote']

    expect(rates['camelote'].nominal).toBe(base + mineNominal)
    expect(rates['camelote'].effective).toBe(
      base + Math.floor((mineNominal * report.produced) / report.consumed),
    )
    expect(rates['camelote'].effective).toBeLessThan(rates['camelote'].nominal)
  })
})

describe('la production de base du Berceau n’est jamais touchée (FR-018)', () => {
  it.each(['camelote', 'jus', 'bave-etoiles'] as const)(
    'garde la base de %s intacte sous le déficit le plus dur',
    (resourceId) => {
      // Cinq bâtiments consommateurs et aucune centrale : le pire cas atteignable.
      const snapshot = withBuildings(
        placed('mine', { x: 0, y: 4 }, 30),
        placed('racloir', { x: 3, y: 3 }, 30),
        placed('entrepot', { x: 2, y: 5 }, 20),
      )
      const report = energyReport(snapshot, CATALOGS)
      expect(report.consumed).toBeGreaterThan(report.produced)

      const rates = productionRates(snapshot, CATALOGS, report.ratio)
      expect(rates[resourceId].effective).toBeGreaterThanOrEqual(
        CATALOGS.layouts['berceau-v1'].baseProductionPerHour[resourceId],
      )
    },
  )

  /**
   * Le cas limite : rapport **nul**. Il n'est pas atteignable par le catalogue —
   * le Berceau produit toujours — mais la règle doit le tenir quand même, sans
   * quoi la garantie « aucun état n'est définitivement bloquant » reposerait sur
   * une donnée d'équilibrage plutôt que sur une propriété.
   */
  it.each(['camelote', 'jus', 'bave-etoiles'] as const)(
    'laisse la base de %s intacte à rapport nul',
    (resourceId) => {
      const rates = productionRates(fresh(), CATALOGS, { numerator: 0, denominator: 100 })
      expect(rates[resourceId].effective).toBe(
        CATALOGS.layouts['berceau-v1'].baseProductionPerHour[resourceId],
      )
      expect(rates[resourceId].effective).toBeGreaterThan(0)
    },
  )
})

/**
 * Le rapport **après retrait** d'un bâtiment posé (US6).
 *
 * L'information est utile dans les deux sens, et c'est ce qui la rend nécessaire :
 * démolir un extracteur soulage le déficit et fait remonter la production des
 * autres, tandis que démolir une centrale l'aggrave. Un joueur qui ne verrait que la
 * production perdue par le bâtiment démoli manquerait la moitié du calcul — celle
 * qui peut rendre la démolition rentable.
 */
describe('energyAfterRemoval — le rapport après une démolition', () => {
  const Cat = CATALOGS
  const Plant = 'centrale-1'
  const Racloir = 'racloir-1'

  /**
   * Une centrale de niveau 1 et un racloir de niveau 8 : la planète est en déficit.
   *
   * Les vingt de base plus les trente de la centrale font cinquante ; le racloir en
   * consomme `14 + 7 × 7 = 63`. C'est la boucle que US3 rend lisible — monter ses
   * extracteurs finit toujours par exiger de monter sa centrale.
   */
  const RacloirLevel = 8

  function deficient(): PlanetSnapshot {
    return withBuildings(
      { ...placed('centrale', { x: 3, y: 5 }), id: Plant },
      { ...placed('racloir', { x: 3, y: 3 }, RacloirLevel), id: Racloir },
    )
  }

  it('retirer un consommateur réduit E₋ et peut lever le déficit', () => {
    const before = energyReport(deficient(), Cat)
    expect(before.deficit).toBe(true)

    const after = energyAfterRemoval(before, Racloir, 'racloir', RacloirLevel, Cat)

    expect(after.consumed).toBe(0)
    expect(after.produced).toBe(before.produced)
    expect(after.deficit).toBe(false)
    // Le bâtiment est **retiré** du détail, et non laissé à zéro : une ligne
    // « racloir, 0 » ferait chercher un consommateur qui n'existe plus.
    expect(after.consumers.some((one) => one.buildingId === Racloir)).toBe(false)
  })

  it('retirer une centrale réduit E₊ et peut créer le déficit', () => {
    const before = energyReport(deficient(), Cat)
    const after = energyAfterRemoval(before, Plant, 'centrale', 1, Cat)

    expect(after.fromPlants).toBe(0)
    expect(after.produced).toBe(before.base)
    // La consommation est intacte : la centrale ne consommait rien (R20).
    expect(after.consumed).toBe(before.consumed)
    expect(after.deficit).toBe(true)
    // Et le déficit est **pire** qu'avant : le rapport a baissé.
    expect(after.ratio.numerator / after.ratio.denominator).toBeLessThan(
      before.ratio.numerator / before.ratio.denominator,
    )
  })

  it('retirer un bâtiment absent ne change rien', () => {
    const before = energyReport(deficient(), Cat)
    const after = energyAfterRemoval(before, 'inconnu', 'entrepot', 1, Cat)

    expect(after.consumed).toBe(before.consumed)
    expect(after.produced).toBe(before.produced)
    expect(after.consumers).toEqual(before.consumers)
  })
})
