import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { consolidatePlanet, projectPlanet } from '../../src/game.js'
import { DEFAULT_CATALOGS } from '../../src/kernel/catalogs.js'
import type { Effect } from '../../src/kernel/effects.js'
import { applyEffects, emptySnapshot, type PlanetSnapshot } from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'

/**
 * Les invariants du modèle, sous fast-check (data-model § 1.7).
 *
 * Ces énoncés ne sont pas des commentaires : ce sont eux qui portent la valeur
 * de la tranche. Un test d'exemple dit « pour ces trois cas, c'est juste » ; un
 * invariant dit « pour toute suite légale, c'est juste », et c'est la seule
 * forme d'assurance qui vaille pour un modèle de temps dont la propriété
 * centrale — l'additivité — n'est pas observable sur un exemple.
 *
 * **I-2 est le cœur.** Si consolider deux fois ne donnait pas le même résultat
 * que consolider une fois, la fortune d'un joueur dépendrait du nombre de fois
 * où il a ouvert le jeu. Ce serait un exploit ou une injustice selon le sens de
 * l'arrondi — et invisible jusqu'à ce que quelqu'un le remarque.
 */

const T0 = instant(1_787_750_000)
const CATALOGS = DEFAULT_CATALOGS
const RESOURCES = CATALOGS.resourceIds

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

/** Des durées qui couvrent la seconde comme les trois semaines. */
const seconds = fc.integer({ min: 0, max: 4 * 7 * 86_400 })

describe('I-1 — 0 ≤ amount ≤ cap, toujours', () => {
  it('ne dépasse jamais le plafond, quelle que soit la durée', () => {
    fc.assert(
      fc.property(seconds, (elapsed) => {
        const state = projectPlanet(fresh(), CATALOGS, instant(T0 + elapsed))
        for (const resourceId of RESOURCES) {
          const holding = state.holdings[resourceId]
          expect(holding.amount).toBeGreaterThanOrEqual(0)
          expect(holding.amount).toBeLessThanOrEqual(holding.cap)
        }
      }),
    )
  })

  /**
   * La borne basse tient par **refus**, pas par écrêtement. Écrêter
   * transformerait une dépense impossible en dépense partielle — une
   * construction à moitié gratuite — et le ferait sans un mot. Un débit
   * excessif ne peut pas venir d'un joueur : le module a déjà refusé la
   * commande. C'est donc une faute de programmation, et elle doit se voir.
   */
  it('reste positive quand la dépense est possible', () => {
    const held = fresh().holdings['camelote'].amount
    fc.assert(
      fc.property(fc.integer({ min: 0, max: held }), (spent) => {
        const effects: Effect[] = [
          { kind: 'debit-resources', amounts: [{ resourceId: 'camelote', grains: spent }] },
        ]
        const after = applyEffects(fresh(), effects, T0)
        expect(after.holdings['camelote'].amount).toBe(held - spent)
      }),
    )
  })

  it('refuse bruyamment un débit qui passerait sous zéro', () => {
    const held = fresh().holdings['camelote'].amount
    fc.assert(
      fc.property(fc.integer({ min: held + 1, max: held + 1_000_000 }), (spent) => {
        const effects: Effect[] = [
          { kind: 'debit-resources', amounts: [{ resourceId: 'camelote', grains: spent }] },
        ]
        expect(() => applyEffects(fresh(), effects, T0)).toThrow(RangeError)
      }),
    )
  })
})

describe('I-2 — consolider deux fois vaut consolider une fois', () => {
  /**
   * L'invariant le plus important du modèle, et le moins visible : **quantité
   * et perte cumulée**. Le plafonnement seul n'est pas additif ; le
   * plafonnement plus le cumul des pertes l'est. Sans le second, deux
   * consolidations donneraient la même quantité mais auraient perdu la trace de
   * ce qui a débordé.
   */
  it('donne la même quantité et la même perte, quel que soit le découpage', () => {
    fc.assert(
      fc.property(seconds, seconds, (a, b) => {
        const [first, second] = a <= b ? [a, b] : [b, a]

        const direct = projectPlanet(fresh(), CATALOGS, instant(T0 + second))
        const stepped = projectPlanet(
          consolidatePlanet(fresh(), CATALOGS, instant(T0 + first)),
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

        const direct = projectPlanet(fresh(), CATALOGS, instant(T0 + c))
        const stepped = projectPlanet(
          consolidatePlanet(
            consolidatePlanet(fresh(), CATALOGS, instant(T0 + a)),
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
})

describe('I-3 — dépenser puis projeter = projeter puis dépenser', () => {
  /**
   * Au **même** instant, l'ordre ne doit rien changer. Si l'ordre comptait, la
   * couche serveur devrait le fixer et le documenter — et un aperçu calculé
   * côté client dans l'autre ordre annoncerait un résultat que le serveur ne
   * produirait pas.
   */
  /**
   * Les deux ordres sont réellement distincts : dans le premier, la dépense a
   * lieu **à `T0`** et le temps passe ensuite sur un solde diminué ; dans le
   * second, le temps passe d'abord et la dépense a lieu **à `at`**.
   *
   * Ils ne coïncident qu'en l'absence de plafonnement, et c'est attendu :
   * dépenser plus tôt laisse de la place sous le plafond, donc évite une perte
   * que l'autre ordre subit. La condition n'affaiblit pas l'invariant, elle
   * énonce exactement son domaine de validité.
   */
  it('donne le même solde dans les deux ordres, hors plafonnement', () => {
    const held = fresh().holdings['camelote'].amount
    fc.assert(
      fc.property(seconds, fc.integer({ min: 0, max: held }), (elapsed, spent) => {
        const at = instant(T0 + elapsed)
        const debit: Effect[] = [
          { kind: 'debit-resources', amounts: [{ resourceId: 'camelote', grains: spent }] },
        ]

        // Dépenser à T0, puis laisser le temps passer.
        const spendFirst = projectPlanet(applyEffects(fresh(), debit, T0), CATALOGS, at)
        // Laisser le temps passer, puis dépenser à `at`.
        const spendLast = applyEffects(consolidatePlanet(fresh(), CATALOGS, at), debit, at)

        // La garde porte sur **les deux** ordres. fast-check a trouvé la
        // frontière : à l'instant de saturation plus une seconde, dépenser plus
        // tôt laisse assez de place pour ne pas déborder, tandis que dépenser à
        // la fin déborde d'abord. Ne vérifier qu'un seul des deux aurait laissé
        // passer un écart réel en le prenant pour un cas hors domaine.
        const neitherSaturated =
          spendFirst.holdings['camelote'].lost === 0 && spendLast.holdings['camelote'].lost === 0

        if (neitherSaturated) {
          expect(spendFirst.holdings['camelote'].amount).toBe(spendLast.holdings['camelote'].amount)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('retire exactement ce qui est dépensé, hors saturation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 0, max: 500_000 }),
        (spent, elapsed) => {
          const debit: Effect[] = [
            { kind: 'debit-resources', amounts: [{ resourceId: 'camelote', grains: spent }] },
          ]

          const afterSpend = applyEffects(fresh(), debit, T0)
          const projected = projectPlanet(afterSpend, CATALOGS, instant(T0 + elapsed))
          const plain = projectPlanet(fresh(), CATALOGS, instant(T0 + elapsed))

          if (plain.holdings['camelote'].lost === 0) {
            expect(projected.holdings['camelote'].amount).toBe(
              plain.holdings['camelote'].amount - spent,
            )
          }
        },
      ),
      { numRuns: 60 },
    )
  })
})

describe('I-4 — rien ne crée de ressource à partir de rien', () => {
  /**
   * Le garde-fou anti-exploit. Ce que la planète possède à `t` ne peut pas
   * dépasser ce qu'elle possédait plus ce que ses taux publiés permettaient de
   * produire dans l'intervalle — c'est la définition même d'un jeu dont les
   * règles sont vérifiables à la main.
   */
  it('ne produit jamais plus que taux × durée', () => {
    fc.assert(
      fc.property(seconds, (elapsed) => {
        const start = fresh()
        const state = projectPlanet(start, CATALOGS, instant(T0 + elapsed))

        for (const resourceId of RESOURCES) {
          const before = start.holdings[resourceId].amount
          const gained =
            state.holdings[resourceId].amount + state.holdings[resourceId].lost - before
          expect(gained).toBeLessThanOrEqual(state.holdings[resourceId].nominalRate * elapsed)
        }
      }),
    )
  })

  it('ne fait jamais croître une quantité quand le temps ne passe pas', () => {
    const start = fresh()
    const state = projectPlanet(start, CATALOGS, T0)
    for (const resourceId of RESOURCES) {
      expect(state.holdings[resourceId].amount).toBe(start.holdings[resourceId].amount)
    }
  })
})

describe('I-10 — la production reste strictement positive depuis un état vide', () => {
  /**
   * Aucun état de jeu n'est définitivement bloquant (FR-018). Même sur une
   * planète dépouillée de tout et vidée de ses réserves, la base du Berceau
   * produit — et le joueur peut repartir.
   */
  it('produit encore quelque chose après avoir tout dépensé', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 86_400 }), (elapsed) => {
        const start = fresh()
        const drained = applyEffects(
          start,
          [
            {
              kind: 'debit-resources',
              // Tout, à la dernière unité — pas davantage : un débit excessif
              // est une faute de programmation, pas un scénario de jeu.
              amounts: RESOURCES.map((resourceId) => ({
                resourceId,
                grains: start.holdings[resourceId].amount,
              })),
            },
          ],
          T0,
        )

        const state = projectPlanet(drained, CATALOGS, instant(T0 + elapsed))
        for (const resourceId of RESOURCES) {
          expect(state.holdings[resourceId].rate).toBeGreaterThan(0)
          expect(state.holdings[resourceId].amount).toBeGreaterThan(0)
        }
      }),
    )
  })
})

describe('I-11 — la projection ne dépend d’aucune horloge', () => {
  it('rend deux résultats identiques pour le même instant', () => {
    fc.assert(
      fc.property(seconds, (elapsed) => {
        const at = instant(T0 + elapsed)
        const snapshot = fresh()
        expect(JSON.stringify(projectPlanet(snapshot, CATALOGS, at))).toBe(
          JSON.stringify(projectPlanet(snapshot, CATALOGS, at)),
        )
      }),
    )
  })

  it('ne mute jamais l’instantané reçu', () => {
    fc.assert(
      fc.property(seconds, (elapsed) => {
        const snapshot = fresh()
        const before = JSON.stringify(snapshot)
        projectPlanet(snapshot, CATALOGS, instant(T0 + elapsed))
        consolidatePlanet(snapshot, CATALOGS, instant(T0 + elapsed))
        expect(JSON.stringify(snapshot)).toBe(before)
      }),
    )
  })
})

describe('I-8 — une case déblayée ne redevient jamais obstruée', () => {
  /**
   * Garanti par l'**absence de chemin d'écriture** : le vocabulaire d'effets ne
   * contient aucun inverse de `clear-cell`. Ce cas constate l'idempotence, qui
   * en est le second gardien.
   */
  it('reste déblayée quel que soit le nombre de déblaiements', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (times) => {
        const effects: Effect[] = Array.from({ length: times }, () => ({
          kind: 'clear-cell' as const,
          cell: { x: 3, y: 0 },
        }))
        const after = applyEffects(fresh(), effects, T0)

        expect(after.clearedCells).toHaveLength(1)
        expect(
          projectPlanet(after, CATALOGS, T0).grid.find((c) => c.x === 3 && c.y === 0)?.state,
        ).toBe('free')
      }),
    )
  })
})
