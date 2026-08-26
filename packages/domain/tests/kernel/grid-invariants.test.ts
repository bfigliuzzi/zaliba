import { FOOTPRINT_IDS, type FootprintId, type Offset } from '@zaliba/catalogs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOGS } from '../../src/kernel/catalogs.js'
import type { Cell } from '../../src/kernel/effects.js'
import {
  cellsOf,
  gridView,
  orientedCells,
  placementCells,
  validatePlacement,
} from '../../src/kernel/grid.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'

/**
 * Les invariants de grille (data-model § 1.7).
 *
 * **I-5 est l'invariant central de la fonctionnalité** : les cases de deux
 * bâtiments d'une même planète sont disjointes. Il est tenu à trois niveaux, et
 * les trois sont nécessaires — la validation du domaine (ici), la clé primaire
 * `(planet_id, x, y)` de `building_cells` (R10), et le test d'intégration qui
 * l'éprouve sur un vrai PostgreSQL. Le premier explique le refus au joueur, le
 * second rend la violation impossible à écrire, le troisième vérifie que le
 * second est bien là.
 *
 * **I-6 protège une règle que le code ne peut pas violer** : aucune fonction de
 * symétrie n'existe dans `footprints.ts`. L'invariant ne garde donc pas
 * l'implémentation d'aujourd'hui — il garde celle de dans six mois.
 */

const T0 = instant(1_787_750_000)
const CATALOGS = DEFAULT_CATALOGS
const LAYOUT = CATALOGS.layouts['berceau-v1']

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

const key = (cell: Cell | Offset): string => `${cell.x},${cell.y}`

/** Un placement quelconque : variante, orientation cyclique, ancre dans la grille. */
const placement = fc.record({
  variantId: fc.constantFrom(...FOOTPRINT_IDS),
  orientation: fc.integer({ min: 0, max: 3 }),
  x: fc.integer({ min: 0, max: LAYOUT.width - 1 }),
  y: fc.integer({ min: 0, max: LAYOUT.height - 1 }),
})

/**
 * Rejoue une suite de commandes de pose en ne retenant que les **légales**.
 *
 * C'est ce qui fait de l'énoncé un invariant sur les *suites légales* et non sur
 * des données arbitraires : poser deux bâtiments superposés en trichant sur la
 * validation prouverait seulement qu'on peut écrire un état invalide à la main.
 */
function buildAll(
  commands: readonly { variantId: FootprintId; orientation: number; x: number; y: number }[],
): PlanetSnapshot {
  let snapshot = fresh()

  for (const [index, command] of commands.entries()) {
    const cells = placementCells(
      command.variantId,
      command.orientation,
      { x: command.x, y: command.y },
      CATALOGS,
    )
    if (validatePlacement(gridView(snapshot, CATALOGS), cells).kind !== 'ok') continue

    const building: PlacedBuilding = {
      id: `b-${index}`,
      typeId: 'mine',
      variantId: command.variantId,
      orientation: command.orientation,
      anchor: { x: command.x, y: command.y },
      level: 1,
    }
    snapshot = { ...snapshot, buildings: [...snapshot.buildings, building] }
  }
  return snapshot
}

describe('I-5 — les cases de deux bâtiments sont disjointes (FR-012)', () => {
  it('ne superpose jamais deux bâtiments, quelle que soit la suite de poses légales', () => {
    fc.assert(
      fc.property(fc.array(placement, { minLength: 2, maxLength: 12 }), (commands) => {
        const snapshot = buildAll(commands)
        const occupied = new Set<string>()

        for (const building of snapshot.buildings) {
          for (const cell of cellsOf(building, CATALOGS)) {
            expect(occupied.has(key(cell)), `la case ${key(cell)} est réclamée deux fois`).toBe(
              false,
            )
            occupied.add(key(cell))
          }
        }
      }),
    )
  })

  it('ne pose jamais un bâtiment sur une case obstruée', () => {
    fc.assert(
      fc.property(fc.array(placement, { maxLength: 12 }), (commands) => {
        const snapshot = buildAll(commands)
        const obstructed = new Set(
          gridView(fresh(), CATALOGS)
            .filter((cell) => cell.obstacleId !== null)
            .map(key),
        )

        for (const building of snapshot.buildings) {
          for (const cell of cellsOf(building, CATALOGS)) {
            expect(obstructed.has(key(cell)), `la case ${key(cell)} est obstruée`).toBe(false)
          }
        }
      }),
    )
  })

  it('ne pose jamais un bâtiment hors de la grille', () => {
    fc.assert(
      fc.property(fc.array(placement, { maxLength: 12 }), (commands) => {
        for (const building of buildAll(commands).buildings) {
          for (const cell of cellsOf(building, CATALOGS)) {
            expect(cell.x >= 0 && cell.x < LAYOUT.width).toBe(true)
            expect(cell.y >= 0 && cell.y < LAYOUT.height).toBe(true)
          }
        }
      }),
    )
  })

  /**
   * Le compte de cases occupées est **exactement** la somme des surfaces. Sans
   * ce contrôle, une validation trop stricte — qui refuserait tout — ferait
   * passer les trois cas ci-dessus en n'ayant rien posé du tout.
   */
  it('occupe exactement la somme des surfaces des bâtiments posés', () => {
    fc.assert(
      fc.property(fc.array(placement, { minLength: 1, maxLength: 12 }), (commands) => {
        const snapshot = buildAll(commands)
        const surface = snapshot.buildings.reduce(
          (total, building) => total + cellsOf(building, CATALOGS).length,
          0,
        )
        const occupied = gridView(snapshot, CATALOGS).filter((cell) => cell.state === 'occupied')
        expect(occupied).toHaveLength(surface)
      }),
    )
  })

  it('finit par poser quelque chose — la validation n’est pas un refus universel', () => {
    const snapshot = buildAll([
      { variantId: 'square-4', orientation: 0, x: 0, y: 4 },
      { variantId: 'single', orientation: 0, x: 2, y: 5 },
    ])
    expect(snapshot.buildings).toHaveLength(2)
  })
})

describe('I-6 — aucune rotation n’atteint le miroir d’une empreinte chirale (FR-011)', () => {
  /** Le miroir horizontal, normalisé : ce qu'aucune rotation ne doit produire. */
  function mirrored(cells: readonly Offset[]): Set<string> {
    const maxX = Math.max(...cells.map((cell) => cell.x))
    return new Set(cells.map((cell) => key({ x: maxX - cell.x, y: cell.y })))
  }

  function sameShape(cells: readonly Offset[], target: Set<string>): boolean {
    const asSet = new Set(cells.map(key))
    return asSet.size === target.size && [...asSet].every((value) => target.has(value))
  }

  /**
   * **`l-4` est la seule empreinte chirale du vocabulaire** (R6, corrigé le
   * 2026-08-26). Le T a un axe de symétrie vertical : son miroir *est* son
   * orientation 0, donc exiger de lui l'inatteignabilité échouerait contre une
   * vérité de géométrie — et la tentation serait d'assouplir le test, c'est-à-dire
   * d'affaiblir aussi la garantie sur le L.
   */
  it('ne produit jamais le miroir du L, pour aucun nombre de quarts de tour', () => {
    const target = mirrored(CATALOGS.footprints['l-4'].cells)
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_000 }), (quarters) => {
        expect(sameShape(orientedCells('l-4', quarters, CATALOGS), target)).toBe(false)
      }),
    )
  })

  it('ne produit jamais le miroir du L, où qu’il soit ancré', () => {
    const target = mirrored(CATALOGS.footprints['l-4'].cells)
    fc.assert(
      fc.property(placement, ({ orientation, x, y }) => {
        const cells = placementCells('l-4', orientation, { x, y }, CATALOGS)
        const minX = Math.min(...cells.map((cell) => cell.x))
        const minY = Math.min(...cells.map((cell) => cell.y))
        const normalized = cells.map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
        expect(sameShape(normalized, target)).toBe(false)
      }),
    )
  })

  it('conserve la surface, quel que soit le nombre de quarts de tour', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FOOTPRINT_IDS),
        fc.integer({ min: 0, max: 4_000 }),
        (variantId, quarters) => {
          expect(orientedCells(variantId, quarters, CATALOGS)).toHaveLength(
            CATALOGS.footprints[variantId].cells.length,
          )
        },
      ),
    )
  })

  /**
   * La partition du vocabulaire : une chirale, six achirales. Une empreinte
   * future qui changerait de catégorie se signalerait d'elle-même, au lieu de
   * glisser du bon côté sans qu'on le voie.
   */
  it('laisse les six autres empreintes atteindre leur miroir — c’est de la géométrie', () => {
    for (const variantId of FOOTPRINT_IDS.filter((id) => id !== 'l-4')) {
      const target = mirrored(CATALOGS.footprints[variantId].cells)
      const reached = [0, 1, 2, 3].some((orientation) =>
        sameShape(orientedCells(variantId, orientation, CATALOGS), target),
      )
      expect(reached, `${variantId} n’atteint pas son miroir`).toBe(true)
    }
  })
})
