import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { consolidatePlanet, projectPlanet } from '../../src/game.js'
import { storageCaps } from '../../src/kernel/rates.js'
import { grains } from '../../src/kernel/resources.js'
import { applyEffects, emptySnapshot, type PlanetSnapshot } from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'
import { CATALOGS } from '../catalogs.js'

/**
 * **Depuis combien de temps la saturation dure** (US1/AC5).
 *
 * L'exigence demande deux choses de la ressource saturée : *combien* s'est perdu
 * — c'est `lost`, cumulé depuis toujours — et *depuis quand*. La seconde n'est
 * pas dérivable de la première.
 *
 * On serait tenté d'écrire `perdu ÷ taux` et d'en faire une durée. C'est faux
 * dès que le taux a changé depuis l'entrée en saturation : une pose, une
 * amélioration ou une bascule en déficit d'énergie suffisent, et la division
 * date alors la saturation d'un moment où la planète produisait autre chose. Ce
 * n'est pas une durée qu'il faut calculer, c'est un **instant** qu'il faut
 * porter.
 *
 * D'où la forme retenue : l'instant vit dans l'instantané, au même titre que la
 * quantité et la perte. Le triplet `(quantité, perte, saturée depuis)` est alors
 * une fonction du seul temps écoulé — ce que les propriétés de ce fichier
 * vérifient, et ce que la seule vue projetée ne pourrait pas tenir, puisqu'un
 * `GET` ne sait rien de ce qui a précédé la dernière consolidation.
 */

const T0 = instant(1_787_750_000)
const HOUR = 3_600

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

/**
 * L'instant de saturation de la Camelote, **recalculé à la main** depuis le
 * catalogue : `t₀ + ⌈(plafond − stock initial) ÷ taux⌉`.
 *
 * Recopier un nombre ici ferait passer le test au premier rééquilibrage sans que
 * rien ne le vérifie plus.
 */
function camelotteSaturation(): number {
  const start = fresh()
  const cap = storageCaps(start, CATALOGS)['camelote'] ?? 0
  const amount = start.holdings['camelote']?.amount ?? 0
  const rate = projectPlanet(start, CATALOGS, T0).holdings['camelote'].rate
  return T0 + Math.ceil((cap - amount) / rate)
}

const SATURATION = camelotteSaturation()

describe('l’instant d’entrée en saturation est projeté (US1/AC5)', () => {
  it('vaut null tant que la ressource n’est pas saturée', () => {
    expect(projectPlanet(fresh(), CATALOGS, T0).holdings.camelote.saturatedSince).toBeNull()
    expect(
      projectPlanet(fresh(), CATALOGS, instant(SATURATION - 1)).holdings.camelote.saturatedSince,
    ).toBeNull()
  })

  it('vaut l’instant exact où le plafond a été atteint', () => {
    const state = projectPlanet(fresh(), CATALOGS, instant(SATURATION))
    expect(state.holdings.camelote.amount).toBe(state.holdings.camelote.cap)
    expect(state.holdings.camelote.saturatedSince).toBe(SATURATION)
  })

  /**
   * Le point qui distingue « depuis quand » de « maintenant ». Une projection
   * trois semaines après la saturation doit rendre l'instant **d'entrée**, pas
   * celui de la lecture — sans quoi la grandeur affichée serait toujours zéro.
   */
  it('ne bouge plus une fois la saturation acquise', () => {
    for (const elapsed of [1, HOUR, 21 * 24 * HOUR]) {
      const state = projectPlanet(fresh(), CATALOGS, instant(SATURATION + elapsed))
      expect(state.holdings.camelote.saturatedSince).toBe(SATURATION)
    }
  })

  it('rend la durée de saturation : at − saturatedSince', () => {
    const state = projectPlanet(fresh(), CATALOGS, instant(SATURATION + 5 * HOUR))
    const since = state.holdings.camelote.saturatedSince
    expect(since).not.toBeNull()
    expect(state.at - (since as number)).toBe(5 * HOUR)
  })
})

describe('l’instant survit à la consolidation — c’est pourquoi il est porté', () => {
  /**
   * **Le test qui justifie la colonne.** Une mutation consolide : l'instantané
   * écrit ne porte plus que « quantité au plafond ». Sans l'instant, la lecture
   * suivante ne pourrait que répondre « saturée depuis la consolidation », et
   * l'ancienneté de la saturation se réinitialiserait à chaque action du joueur
   * — exactement le contraire de ce qu'US1/AC5 demande de montrer.
   */
  it('une consolidation postérieure à la saturation ne la redate pas', () => {
    const consolidated = consolidatePlanet(fresh(), CATALOGS, instant(SATURATION + HOUR))
    expect(consolidated.holdings.camelote.saturatedSince).toBe(SATURATION)

    const later = projectPlanet(consolidated, CATALOGS, instant(SATURATION + 10 * HOUR))
    expect(later.holdings.camelote.saturatedSince).toBe(SATURATION)
  })

  it('une consolidation exactement à la saturation la date à cet instant', () => {
    const consolidated = consolidatePlanet(fresh(), CATALOGS, instant(SATURATION))
    expect(consolidated.holdings.camelote.saturatedSince).toBe(SATURATION)
  })

  /**
   * L'additivité, étendue au troisième terme (I-2). Projeter par étapes et
   * projeter d'un coup doivent donner la **même** date d'entrée en saturation,
   * sans quoi l'ancienneté affichée dépendrait du nombre de fois où le joueur a
   * ouvert le jeu.
   */
  it('consolider en n étapes date la saturation comme en une seule', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 400_000 }), { minLength: 1, maxLength: 6 }),
        (steps) => {
          const total = steps.reduce((sum, step) => sum + step, 0)

          let stepwise = fresh()
          let elapsed = 0
          for (const step of steps) {
            elapsed += step
            stepwise = consolidatePlanet(stepwise, CATALOGS, instant(T0 + elapsed))
          }

          const oneShot = consolidatePlanet(fresh(), CATALOGS, instant(T0 + total))

          for (const resourceId of CATALOGS.resourceIds) {
            expect(stepwise.holdings[resourceId].saturatedSince).toBe(
              oneShot.holdings[resourceId].saturatedSince,
            )
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('une dépense qui fait redescendre sous le plafond met fin à la saturation', () => {
  it('rend null après un débit, puis redate à la nouvelle saturation', () => {
    const saturated = consolidatePlanet(fresh(), CATALOGS, instant(SATURATION + HOUR))
    expect(saturated.holdings.camelote.saturatedSince).toBe(SATURATION)

    const rate = projectPlanet(saturated, CATALOGS, instant(SATURATION + HOUR)).holdings.camelote
      .rate
    const spent = applyEffects(
      saturated,
      [
        {
          kind: 'debit-resources',
          amounts: [{ resourceId: 'camelote', grains: grains(rate * 100) }],
        },
      ],
      instant(SATURATION + HOUR),
    )

    // Immédiatement après la dépense, la ressource n'est plus saturée.
    expect(
      projectPlanet(spent, CATALOGS, instant(SATURATION + HOUR)).holdings.camelote.saturatedSince,
    ).toBeNull()

    // Cent secondes plus tard, elle l'est de nouveau — et depuis cet
    // instant-là, jamais depuis le premier.
    const again = projectPlanet(spent, CATALOGS, instant(SATURATION + HOUR + 100))
    expect(again.holdings.camelote.saturatedSince).toBe(SATURATION + HOUR + 100)
  })
})

describe('une ressource qui ne produit rien n’est pas saturée pour autant', () => {
  /**
   * Le Jus part à zéro et le Berceau en produit : il sature un jour. Le cas
   * limite qui compte est celui d'un plafond **déjà atteint à la fondation** —
   * la ressource est alors saturée depuis l'instant de fondation, et non depuis
   * un instant inconnu.
   */
  it('date la saturation de la fondation quand le stock initial vaut le plafond', () => {
    const start = fresh()
    const cap = grains(storageCaps(start, CATALOGS)['jus'] ?? 0)
    const full: PlanetSnapshot = {
      ...start,
      holdings: { ...start.holdings, jus: { amount: cap, lost: grains(0), saturatedSince: null } },
    }

    expect(projectPlanet(full, CATALOGS, T0).holdings.jus.saturatedSince).toBe(T0)
    expect(projectPlanet(full, CATALOGS, instant(T0 + 10 * HOUR)).holdings.jus.saturatedSince).toBe(
      T0,
    )
  })
})
