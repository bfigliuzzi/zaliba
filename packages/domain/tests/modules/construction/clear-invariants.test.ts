import { FOOTPRINT_IDS, type ObstacleId } from '@zaliba/catalogs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../../src/game.js'
import { type Cell, EFFECT_KINDS, type Effect } from '../../../src/kernel/effects.js'
import { gridView } from '../../../src/kernel/grid.js'
import { grains } from '../../../src/kernel/resources.js'
import { applyEffects, emptySnapshot, type PlanetSnapshot } from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import { decideClear } from '../../../src/modules/construction/clear.js'
import { CATALOGS } from '../../catalogs.js'

/**
 * **I-8 — une case déblayée ne redevient jamais obstruée** (data-model § 1.7,
 * FR-045).
 *
 * L'invariant ne garde pas l'implémentation d'aujourd'hui : il garde celle de
 * dans six mois. Aujourd'hui, la garantie est **structurelle** — l'état obstrué
 * d'une case est la disposition du catalogue *moins* `clearedCells`, il n'existe
 * aucun effet inverse de `clear-cell`, et `cells.ts` n'a délibérément pas de
 * fonction de re-obstruction. Le jour où quelqu'un voudra « faire repousser » un
 * obstacle — un événement, un sabotage, un archétype vivant —, c'est ce fichier
 * qui dira que le prix à payer est un amendement, et non un ajout discret.
 *
 * **La propriété est énoncée sur le vocabulaire d'effets tout entier**, et non
 * sur les seuls effets du déblaiement. C'est ce qui la rend utile : un effet
 * nouveau qui retirerait une case de `clearedCells` la ferait tomber, même si
 * personne n'a pensé à l'éprouver. Et le compte d'effets est vérifié, pour que
 * l'élargissement du vocabulaire ne passe pas inaperçu.
 *
 * **Elle est éprouvée à trois hauteurs**, et les trois sont nécessaires :
 * l'ensemble `clearedCells` de l'instantané, la grille **rendue** — ce que le
 * joueur voit —, et le parcours complet par la projection, qui applique les
 * achèvements à leur échéance.
 */

const T0 = instant(1_787_750_000)
const LAYOUT = CATALOGS.layouts['berceau-v1']

/** Les dix cases obstruées de la disposition, et leur type. */
const OBSTRUCTED: readonly (Cell & { readonly obstacleId: ObstacleId })[] = LAYOUT.cells
  .filter((cell) => cell.obstacleId !== null)
  .map((cell) => ({ x: cell.x, y: cell.y, obstacleId: cell.obstacleId as ObstacleId }))

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
 * Une trésorerie **levée**, sans toucher au contenu du jeu.
 *
 * I-8 porte sur la géométrie du terrain, jamais sur la trésorerie. Déblayer les
 * dix obstacles du Berceau coûte plus que son stock de départ : le module
 * refuserait pour manque de ressources, et la propriété ne dirait plus rien de
 * son sujet. C'est la leçon de la phase 6 appliquée ici — et la raison pour
 * laquelle le catalogue est un argument.
 */
function rich(): PlanetSnapshot {
  const plenty = grains(50_000_000)
  return {
    ...fresh(),
    holdings: {
      camelote: { amount: plenty, lost: grains(0), saturatedSince: null },
      jus: { amount: plenty, lost: grains(0), saturatedSince: null },
      'bave-etoiles': { amount: plenty, lost: grains(0), saturatedSince: null },
    },
  }
}

const clearedKeys = (snapshot: PlanetSnapshot): ReadonlySet<string> =>
  new Set(snapshot.clearedCells.map((cell) => `${cell.x},${cell.y}`))

const obstructedKeys = (snapshot: PlanetSnapshot): ReadonlySet<string> =>
  new Set(
    gridView(snapshot, CATALOGS)
      .filter((view) => view.obstacleId !== null)
      .map((view) => `${view.x},${view.y}`),
  )

/**
 * Un effet quelconque du vocabulaire fermé, y compris absurde.
 *
 * Absurde est le point : la propriété doit tenir face à des effets qu'aucun
 * module n'émettrait jamais dans cet ordre. Ce que l'on éprouve n'est pas la
 * cohérence des modules — d'autres tests s'en chargent — mais le fait qu'**aucun
 * chemin d'écriture du noyau** ne sait retirer une case de `clearedCells`.
 */
const anyEffect = (cells: readonly Cell[]): fc.Arbitrary<Effect> =>
  fc.oneof(
    fc.record({
      kind: fc.constant('clear-cell' as const),
      cell: fc.constantFrom(...cells),
    }),
    fc.record({
      kind: fc.constant('remove-building' as const),
      buildingId: fc.constantFrom('inconnu', 'batiment-1', 'batiment-2'),
    }),
    fc.record({
      kind: fc.constant('place-building' as const),
      buildingId: fc.constantFrom('batiment-1', 'batiment-2'),
      typeId: fc.constant('entrepot' as const),
      variantId: fc.constantFrom(...FOOTPRINT_IDS),
      orientation: fc.integer({ min: 0, max: 3 }),
      anchor: fc.constantFrom(...cells),
    }),
    fc.record({
      kind: fc.constant('set-building-level' as const),
      buildingId: fc.constantFrom('batiment-1', 'batiment-2'),
      level: fc.integer({ min: 1, max: 20 }),
    }),
    fc.record({
      kind: fc.constant('credit-resources' as const),
      amounts: fc.constant([{ resourceId: 'camelote' as const, grains: 1 }]),
    }),
  )

const anyCell = fc.record({
  x: fc.integer({ min: 0, max: LAYOUT.width - 1 }),
  y: fc.integer({ min: 0, max: LAYOUT.height - 1 }),
})

describe('I-8 — aucun chemin d’écriture ne réobstrue une case déblayée', () => {
  it('le vocabulaire d’effets ne compte que ce qu’on croit', () => {
    // Une propriété énoncée sur « tous les effets » ne vaut que si l'on sait
    // combien il y en a. L'élargir sans le voir rendrait la propriété muette sur
    // l'effet nouveau — donc rassurante à tort.
    expect(EFFECT_KINDS).toHaveLength(7)
  })

  it('`clearedCells` ne perd jamais une case, quelle que soit la suite d’effets', () => {
    fc.assert(
      fc.property(
        fc.array(anyCell, { minLength: 1, maxLength: 6 }),
        fc.array(anyEffect(LAYOUT.cells.map((cell) => ({ x: cell.x, y: cell.y }))), {
          maxLength: 20,
        }),
        (seeded, effects) => {
          const start: PlanetSnapshot = { ...rich(), clearedCells: seeded }
          const before = clearedKeys(start)

          let snapshot = start
          for (const effect of effects) {
            snapshot = applyEffects(snapshot, [effect], T0)
            const after = clearedKeys(snapshot)
            for (const key of before) {
              if (!after.has(key)) return false
            }
          }
          return true
        },
      ),
    )
  })

  it('`clear-cell` est idempotent : deux fois la même case ne fait pas deux lignes', () => {
    fc.assert(
      fc.property(anyCell, fc.integer({ min: 1, max: 5 }), (cell, times) => {
        let snapshot = fresh()
        for (let i = 0; i < times; i += 1) {
          snapshot = applyEffects(snapshot, [{ kind: 'clear-cell', cell }], T0)
        }
        return snapshot.clearedCells.length === 1
      }),
    )
  })

  it('une case déblayée n’est plus jamais obstruée dans la grille rendue', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...OBSTRUCTED), { minLength: 1, maxLength: OBSTRUCTED.length }),
        (targets) => {
          let snapshot = rich()
          for (const target of targets) {
            snapshot = applyEffects(
              snapshot,
              [{ kind: 'clear-cell', cell: { x: target.x, y: target.y } }],
              T0,
            )
          }

          const obstructed = obstructedKeys(snapshot)
          return targets.every((target) => !obstructed.has(`${target.x},${target.y}`))
        },
      ),
    )
  })

  it('le déblaiement de tous les obstacles laisse la planète sans aucun obstacle', () => {
    let snapshot = rich()
    for (const target of OBSTRUCTED) {
      snapshot = applyEffects(
        snapshot,
        [{ kind: 'clear-cell', cell: { x: target.x, y: target.y } }],
        T0,
      )
    }

    expect(obstructedKeys(snapshot).size).toBe(0)
    // Et la planète reste une planète : trente-six cases, pas une de plus.
    expect(gridView(snapshot, CATALOGS)).toHaveLength(LAYOUT.cells.length)
  })
})

describe('I-8 tient aussi de bout en bout, par la projection', () => {
  it('un déblaiement achevé libère la case, et rien ne la réobstrue ensuite', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...OBSTRUCTED),
        fc.integer({ min: 0, max: 400_000 }),
        (target, extra) => {
          const state = projectPlanet(rich(), CATALOGS, T0)
          const decision = decideClear(
            state,
            {
              kind: 'clear',
              workId: '99999999-9999-4999-8999-999999999999',
              cell: { x: target.x, y: target.y },
            },
            CATALOGS,
          )
          if (decision.outcome !== 'accepted') return false

          const launched = applyEffects(rich(), decision.effects, T0)
          const seconds = CATALOGS.obstacles[target.obstacleId].durationSeconds

          // Bien **après** l'échéance : la projection applique l'achèvement à
          // `dueAt`, et le temps qui suit n'y change rien (FR-032, R3).
          const projected = projectPlanet(launched, CATALOGS, instant(T0 + seconds + extra))

          const cell = projected.grid.find((one) => one.x === target.x && one.y === target.y)
          if (cell === undefined) return false
          return cell.obstacleId === null && cell.state !== 'obstructed'
        },
      ),
    )
  })

  it('le gisement révélé est celui du type d’obstacle, et il apparaît à l’échéance', () => {
    for (const target of OBSTRUCTED) {
      const reveals = CATALOGS.obstacles[target.obstacleId].reveals
      const state = projectPlanet(rich(), CATALOGS, T0)
      const decision = decideClear(
        state,
        {
          kind: 'clear',
          workId: '99999999-9999-4999-8999-999999999999',
          cell: { x: target.x, y: target.y },
        },
        CATALOGS,
      )
      if (decision.outcome !== 'accepted') throw new Error(`Refusé sur (${target.x},${target.y}).`)

      const launched = applyEffects(rich(), decision.effects, T0)
      const seconds = CATALOGS.obstacles[target.obstacleId].durationSeconds
      const projected = projectPlanet(launched, CATALOGS, instant(T0 + seconds))
      const cell = projected.grid.find((one) => one.x === target.x && one.y === target.y)

      expect(cell?.depositOf ?? null).toBe(reveals.kind === 'deposit' ? reveals.resourceId : null)
    }
  })
})
