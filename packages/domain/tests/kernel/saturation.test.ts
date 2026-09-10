import { BERCEAU } from '@zaliba/catalogs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../src/game.js'
import { evaluateCurve } from '../../src/kernel/curves.js'
import { grains } from '../../src/kernel/resources.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'
import { CATALOGS } from '../catalogs.js'

/**
 * **La saturation longue : trois semaines d'absence, au grain près** (US1-5, US7-3,
 * SC-003).
 *
 * C'est le test que le modèle de temps existe pour permettre. La projection est une
 * fonction pure de l'instant (R2, R4) : trois semaines de jeu se vérifient en une
 * milliseconde, sans attente, sans horloge simulée, sans test instable. Un jeu dont
 * le sujet est le temps ne peut être éprouvé d'aucune autre façon.
 *
 * Trois grandeurs doivent être **exactes**, et pas seulement plausibles :
 *
 * - la quantité, qui vaut **exactement** le plafond — ni un grain de plus, ni un
 *   grain de moins ;
 * - la durée de saturation, c'est-à-dire l'instant où le plafond a été atteint ;
 * - la **quantité perdue**, cumulée depuis toujours (FR-026). C'est elle qui rend un
 *   entrepôt désirable pour une raison chiffrée plutôt que par intuition, et c'est
 *   ce qu'US7-3 exige de rendre consultable.
 *
 * **Le cumul de la perte est ce qui rend l'opération additive** (R4). Le
 * plafonnement seul ne l'est pas : deux segments successifs plafonnés donneraient la
 * même quantité qu'un segment unique, mais on aurait perdu la trace de ce qui a
 * débordé. En cumulant, la somme des pertes de deux segments vaut exactement celle
 * du segment unique équivalent — et l'état complet `(quantité, perte)` devient une
 * fonction du seul temps écoulé.
 */

const T0 = instant(1_787_750_000)
const RESOURCES = CATALOGS.resourceIds
const THREE_WEEKS = 21 * 86_400

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
function placed(level: number, x: number): PlacedBuilding {
  counter += 1
  return {
    id: `entrepot-${counter}`,
    typeId: 'entrepot',
    variantId: 'single',
    orientation: 0,
    anchor: { x, y: 0 },
    level,
  }
}

/** La capacité d'un entrepôt, **recalculée depuis la courbe** du catalogue. */
function warehouseCapacity(level: number): number {
  const curve = CATALOGS.buildings.entrepot.capacity
  if (curve === null) throw new Error('l’entrepôt n’a pas de courbe de capacité')
  return evaluateCurve(curve, level)
}

/**
 * La saturation, **calculée à la main** depuis les règles publiées.
 *
 * Aucun attendu de ce fichier ne vient d'une exécution : un attendu recopié d'une
 * sortie ne teste que la stabilité, pas la justesse.
 */
function expected(
  resourceId: (typeof RESOURCES)[number],
  seconds: number,
  extraCapacity = 0,
): { amount: number; lost: number; saturatedAtSecond: number | null } {
  const cap = BERCEAU.baseCapacityGrains[resourceId] + extraCapacity
  const rate = CATALOGS.layouts['berceau-v1'].baseProductionPerHour[resourceId]
  const start = BERCEAU.startingStockGrains[resourceId]

  // Une unité par heure vaut exactement un grain par seconde (R1) : le gain brut est
  // `taux × secondes`, un entier, sans reste à arrondir.
  const raw = start + rate * seconds

  return {
    amount: Math.min(raw, cap),
    lost: Math.max(0, raw - cap),
    // `t₀ + ⌈(P − q₀) ÷ r⌉`, arrondi **vers le haut** : la saturation survient à la
    // seconde où elle est atteinte, pas à celle qui la précède.
    saturatedAtSecond: rate === 0 ? null : Math.ceil((cap - start) / rate),
  }
}

describe('trois semaines d’absence, au grain près (SC-003, US1-5)', () => {
  it.each(RESOURCES)('%s vaut exactement son plafond, jamais un grain de plus', (resourceId) => {
    const state = projectPlanet(fresh(), CATALOGS, instant(T0 + THREE_WEEKS))
    const attendu = expected(resourceId, THREE_WEEKS)

    expect(state.holdings[resourceId].amount).toBe(attendu.amount)
    // Trois semaines suffisent à saturer les trois ressources du Berceau : la
    // quantité **est** le plafond.
    expect(state.holdings[resourceId].amount).toBe(state.holdings[resourceId].cap)
  })

  it.each(RESOURCES)('la quantité perdue de %s est exacte (FR-026)', (resourceId) => {
    const state = projectPlanet(fresh(), CATALOGS, instant(T0 + THREE_WEEKS))
    expect(state.holdings[resourceId].lost).toBe(expected(resourceId, THREE_WEEKS).lost)
  })

  /**
   * **Une ressource saturée cesse de croître, et la perte continue de courir.** Les
   * deux moitiés ensemble : sans la seconde, le joueur ne saurait pas ce que son
   * absence lui a coûté, et un entrepôt resterait un achat d'intuition.
   */
  it.each(RESOURCES)('%s saturée ne croît plus, mais sa perte croît', (resourceId) => {
    const first = projectPlanet(fresh(), CATALOGS, instant(T0 + THREE_WEEKS))
    const second = projectPlanet(fresh(), CATALOGS, instant(T0 + 2 * THREE_WEEKS))

    expect(second.holdings[resourceId].amount).toBe(first.holdings[resourceId].amount)
    expect(second.holdings[resourceId].lost).toBeGreaterThan(first.holdings[resourceId].lost)

    // Et la perte supplémentaire vaut exactement la production de la période.
    const rate = CATALOGS.layouts['berceau-v1'].baseProductionPerHour[resourceId]
    expect(second.holdings[resourceId].lost - first.holdings[resourceId].lost).toBe(
      rate * THREE_WEEKS,
    )
  })

  /**
   * **L'instant de saturation est exact**, et c'est lui qui dit *quand* agir
   * (FR-027). Éprouvé de part et d'autre de la seconde où il tombe : à cette
   * seconde-là, la ressource est pleine et l'instant publié devient `null` — il n'y
   * a plus de saturation à venir, elle est là.
   */
  it.each(RESOURCES)('la seconde de saturation de %s est celle annoncée', (resourceId) => {
    const attendu = expected(resourceId, 0)
    if (attendu.saturatedAtSecond === null) return

    const announced = projectPlanet(fresh(), CATALOGS, T0).holdings[resourceId].saturationAt
    expect(announced).toBe(T0 + attendu.saturatedAtSecond)

    const justBefore = projectPlanet(fresh(), CATALOGS, instant(T0 + attendu.saturatedAtSecond - 1))
      .holdings[resourceId]
    const atSaturation = projectPlanet(fresh(), CATALOGS, instant(T0 + attendu.saturatedAtSecond))
      .holdings[resourceId]

    expect(justBefore.amount).toBeLessThan(justBefore.cap)
    expect(justBefore.lost).toBe(0)
    expect(atSaturation.amount).toBe(atSaturation.cap)
    // À l'instant où le plafond est atteint, il n'y a plus de saturation à venir.
    expect(atSaturation.saturationAt).toBeNull()
  })
})

describe('un entrepôt repousse la saturation, et réduit la perte (US7-2, US7-3)', () => {
  it.each(RESOURCES)('%s sature plus tard avec un entrepôt', (resourceId) => {
    const extra = warehouseCapacity(1)
    const withOne: PlanetSnapshot = { ...fresh(), buildings: [placed(1, 5)] }

    const attendu = expected(resourceId, THREE_WEEKS, extra)
    const state = projectPlanet(withOne, CATALOGS, instant(T0 + THREE_WEEKS))

    expect(state.holdings[resourceId].amount).toBe(attendu.amount)
    expect(state.holdings[resourceId].lost).toBe(attendu.lost)
  })

  /**
   * **La perte évitée vaut exactement la capacité ajoutée** — mais seulement une fois
   * que les *deux* planètes saturent, et c'est la condition qui donne son sens à
   * l'énoncé.
   *
   * Deux mois, et non trois semaines : c'est ce qu'il faut pour que la planète à
   * l'entrepôt sature à son tour. Le premier essai de ce test employait trois
   * semaines et échouait pour la bonne raison — à ce terme l'entrepôt n'a pas
   * seulement *réduit* la perte de Jus, il l'a **annulée**. C'est un meilleur
   * argument de vente qu'une soustraction, et l'énoncé suivant le dit séparément.
   */
  const TwoMonths = 60 * 86_400

  it.each(RESOURCES)('la perte évitée sur %s vaut la capacité ajoutée', (resourceId) => {
    const extra = warehouseCapacity(1)
    const withOne: PlanetSnapshot = { ...fresh(), buildings: [placed(1, 5)] }

    const without = projectPlanet(fresh(), CATALOGS, instant(T0 + TwoMonths))
    const one = projectPlanet(withOne, CATALOGS, instant(T0 + TwoMonths))

    // La condition, vérifiée et non supposée : les deux planètes saturent.
    expect(without.holdings[resourceId].amount).toBe(without.holdings[resourceId].cap)
    expect(one.holdings[resourceId].amount).toBe(one.holdings[resourceId].cap)

    // Alors la différence de perte est exactement la capacité de plus.
    expect(without.holdings[resourceId].lost - one.holdings[resourceId].lost).toBe(extra)
  })

  /**
   * **Et parfois l'entrepôt ne réduit pas la perte : il la supprime.**
   *
   * Sur trois semaines, le Jus déborde de cent quarante-quatre mille grains sans
   * entrepôt — et de rien du tout avec. C'est l'argument que l'écran doit porter
   * (US7-3) : ce n'est pas « vous perdrez moins », c'est « vous ne perdrez plus ».
   */
  it('un entrepôt peut annuler la perte, et pas seulement la réduire', () => {
    const withOne: PlanetSnapshot = { ...fresh(), buildings: [placed(1, 5)] }

    const without = projectPlanet(fresh(), CATALOGS, instant(T0 + THREE_WEEKS))
    const one = projectPlanet(withOne, CATALOGS, instant(T0 + THREE_WEEKS))

    expect(without.holdings.jus.lost).toBeGreaterThan(0)
    expect(one.holdings.jus.lost).toBe(0)
    // Et la ressource n'est plus saturée : il reste du temps avant qu'elle le soit.
    expect(one.holdings.jus.saturationAt).not.toBeNull()
  })
})

describe('I-2 — la projection reste additive, plafond et perte compris', () => {
  /**
   * `project(t₀ → t₁ → t₂)` et `project(t₀ → t₂)` donnent la **même** quantité *et*
   * la même perte cumulée. Sans cette propriété, la fortune d'un joueur dépendrait
   * du nombre de fois où il a ouvert le jeu — ce qui est un exploit ou une injustice
   * selon le sens de l'arrondi.
   *
   * L'énoncé est ici porté sur une planète **avec entrepôt**, ce qu'`invariants.test.ts`
   * ne pouvait pas faire avant US7 : un plafond dérivé des bâtiments est un plafond
   * de plus à tenir juste dans les deux chemins.
   */
  it('deux consolidations valent une seule, avec entrepôt', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: THREE_WEEKS }),
        fc.integer({ min: 1, max: THREE_WEEKS }),
        fc.integer({ min: 1, max: CATALOGS.buildings.entrepot.maxLevel }),
        (first, second, level) => {
          const start: PlanetSnapshot = { ...fresh(), buildings: [placed(level, 5)] }

          const once = projectPlanet(start, CATALOGS, instant(T0 + first + second))

          // Le chemin en deux temps : consolider à `t₁`, puis projeter depuis là.
          const middle = projectPlanet(start, CATALOGS, instant(T0 + first))
          const consolidated: PlanetSnapshot = {
            ...start,
            consolidatedAt: instant(T0 + first),
            holdings: Object.fromEntries(
              RESOURCES.map((resourceId) => [
                resourceId,
                {
                  amount: grains(middle.holdings[resourceId].amount),
                  lost: grains(middle.holdings[resourceId].lost),
                  saturatedSince: null,
                },
              ]),
            ) as PlanetSnapshot['holdings'],
          }
          const twice = projectPlanet(consolidated, CATALOGS, instant(T0 + first + second))

          return RESOURCES.every(
            (resourceId) =>
              once.holdings[resourceId].amount === twice.holdings[resourceId].amount &&
              once.holdings[resourceId].lost === twice.holdings[resourceId].lost,
          )
        },
      ),
    )
  })
})
