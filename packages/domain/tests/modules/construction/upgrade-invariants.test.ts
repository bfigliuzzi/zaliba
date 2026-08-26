import {
  BUILDING_TYPE_IDS,
  BUILDINGS,
  type BuildingTypeId,
  type FootprintId,
} from '@zaliba/catalogs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../../src/game.js'
import { type Catalogs, DEFAULT_CATALOGS } from '../../../src/kernel/catalogs.js'
import { evaluateCurve } from '../../../src/kernel/curves.js'
import type { Cell } from '../../../src/kernel/effects.js'
import { cellsOf, gridView, placementCells, validatePlacement } from '../../../src/kernel/grid.js'
import { grains } from '../../../src/kernel/resources.js'
import {
  applyEffects,
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import { decideUpgrade } from '../../../src/modules/construction/upgrade.js'

/**
 * **I-7 — une amélioration laisse l'ensemble des cases occupées identique**, à la
 * case près (data-model § 1.7, FR-039, US4-1).
 *
 * L'invariant garde une règle que le code d'aujourd'hui ne peut pas violer :
 * l'effet `set-building-level` ne porte qu'un niveau, et le contrat d'amélioration
 * n'a **aucun** champ d'empreinte ni d'orientation. Il ne garde donc pas
 * l'implémentation actuelle — il garde celle de dans six mois, le jour où
 * quelqu'un voudra « faire grandir » un bâtiment avec son niveau.
 *
 * C'est pourquoi il est énoncé sur **toutes** les formes à la fois : les cinq
 * types, chacune de leurs variantes, les quatre orientations, toutes les ancres
 * légales. Un cas d'exemple prouverait qu'une mine carrée ne bouge pas ; il ne
 * dirait rien du L de quatre, seule empreinte chirale du vocabulaire (I-6) et donc
 * la seule dont une réorientation se verrait.
 *
 * L'invariant est éprouvé à **deux hauteurs**, et les deux sont nécessaires :
 * l'effet nu — ce que le noyau applique —, et le parcours complet par la
 * projection — ce que le joueur constate. Le second peut échouer là où le premier
 * tient : un achèvement qui redériverait la géométrie depuis le catalogue au lieu
 * de la relire de l'instantané changerait les cases sans qu'aucun effet ne le dise.
 */

const T0 = instant(1_787_750_000)

/**
 * Un catalogue synthétique, aux plafonds de stockage **levés**.
 *
 * I-7 porte sur la géométrie, jamais sur la trésorerie. Avec les plafonds du jeu,
 * une amélioration de haut niveau coûte plus que la capacité du Berceau : le
 * module refuserait pour manque de ressources, et la propriété ne dirait plus rien
 * des cases. C'est exactement pourquoi le catalogue est un **argument** des
 * fonctions de domaine et non un import caché — on éprouve une règle contre le
 * monde dont elle a besoin, sans toucher au contenu du jeu.
 *
 * Seule la capacité change. La géométrie, les courbes et les niveaux maximaux
 * restent ceux du jeu, sans quoi l'invariant garderait une planète imaginaire.
 */
const SPACIOUS = 10 ** 14
const CATALOGS: Catalogs = {
  ...DEFAULT_CATALOGS,
  layouts: {
    'berceau-v1': {
      ...DEFAULT_CATALOGS.layouts['berceau-v1'],
      baseCapacityGrains: { camelote: SPACIOUS, jus: SPACIOUS, 'bave-etoiles': SPACIOUS },
    },
  },
}
const LAYOUT = CATALOGS.layouts['berceau-v1']
const BUILDING_ID = '88888888-8888-4888-8888-888888888888'
const WORK_ID = '99999999-9999-4999-8999-999999999999'

const key = (cell: Cell): string => `${cell.x},${cell.y}`
const cellSet = (cells: readonly Cell[]): readonly string[] => cells.map(key).toSorted()

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
 * Une planète riche, pour que l'invariant porte sur la géométrie et non sur la
 * trésorerie : un refus faute de fonds ne dirait rien de I-7.
 */
function wealthy(building: PlacedBuilding): PlanetSnapshot {
  const holding = { amount: grains(SPACIOUS), lost: grains(0) }
  return {
    ...fresh(),
    holdings: { camelote: holding, jus: holding, 'bave-etoiles': holding },
    buildings: [building],
  }
}

interface Placement {
  readonly typeId: BuildingTypeId
  readonly variantId: FootprintId
  readonly orientation: number
  readonly x: number
  readonly y: number
  readonly level: number
}

/**
 * Un placement quelconque : un type, **une de ses variantes**, une orientation
 * cyclique, une ancre dans la grille, un niveau améliorable.
 *
 * La variante est tirée dans la liste du type et non dans le vocabulaire entier :
 * une variante étrangère au type est refusée par le catalogue (FR-009), et le
 * placement n'existerait pas — l'invariant ne dirait alors rien du tout.
 */
const placement: fc.Arbitrary<Placement> = fc.constantFrom(...BUILDING_TYPE_IDS).chain((typeId) =>
  fc.record({
    typeId: fc.constant(typeId),
    variantId: fc.constantFrom(...BUILDINGS[typeId].variants),
    orientation: fc.integer({ min: 0, max: 3 }),
    x: fc.integer({ min: 0, max: LAYOUT.width - 1 }),
    y: fc.integer({ min: 0, max: LAYOUT.height - 1 }),
    level: fc.integer({ min: 1, max: BUILDINGS[typeId].maxLevel - 1 }),
  }),
)

/**
 * Le bâtiment posé que décrit un placement, ou `null` s'il est illégal ici.
 *
 * Filtrer les placements illégaux fait de l'énoncé un invariant sur les états
 * **atteignables** : améliorer un bâtiment qu'aucune pose n'aurait accepté
 * prouverait seulement qu'on peut écrire un état invalide à la main.
 */
function place(command: Placement): PlacedBuilding | null {
  const cells = placementCells(
    command.variantId,
    command.orientation,
    { x: command.x, y: command.y },
    CATALOGS,
  )
  if (validatePlacement(gridView(fresh(), CATALOGS), cells).kind !== 'ok') return null

  return {
    id: BUILDING_ID,
    typeId: command.typeId,
    variantId: command.variantId,
    orientation: command.orientation,
    anchor: { x: command.x, y: command.y },
    level: command.level,
  }
}

/** Le bâtiment, porté d'un niveau par l'effet du noyau. */
function raise(building: PlacedBuilding): PlacedBuilding {
  const next = applyEffects(
    wealthy(building),
    [{ kind: 'set-building-level', buildingId: BUILDING_ID, level: building.level + 1 }],
    T0,
  ).buildings[0]
  if (next === undefined) throw new Error('le bâtiment a disparu de l’instantané')
  return next
}

describe('I-7 : une amélioration ne déplace aucune case (FR-039, US4-1)', () => {
  it('l’effet de niveau laisse les cases identiques, quelle que soit la forme', () => {
    fc.assert(
      fc.property(placement, (command) => {
        const building = place(command)
        // Un placement illégal n'a rien à dire de I-7 : il n'existe pas.
        if (building === null) return true

        expect(cellSet(cellsOf(raise(building), CATALOGS))).toEqual(
          cellSet(cellsOf(building, CATALOGS)),
        )
        return true
      }),
      { numRuns: 400 },
    )
  })

  /**
   * Ce que I-7 interdit, dit autrement : **rien** ne change sauf le niveau.
   *
   * L'énoncé sur les cases seules serait satisfait par un code qui réorienterait
   * une empreinte à orientation unique — un carré de quatre tourne sans bouger.
   * Comparer l'enregistrement entier attrape aussi cela.
   */
  it('seul le niveau change dans l’enregistrement du bâtiment', () => {
    fc.assert(
      fc.property(placement, (command) => {
        const building = place(command)
        if (building === null) return true

        expect(raise(building)).toEqual({ ...building, level: building.level + 1 })
        return true
      }),
      { numRuns: 400 },
    )
  })

  /**
   * Le parcours complet : décider, appliquer, laisser courir jusqu'à l'échéance.
   *
   * C'est la hauteur à laquelle un joueur constate l'invariant, et la seule qui
   * traverse `effectsOnCompletion` — donc la seule qui prouve que l'achèvement
   * relit la géométrie de l'instantané au lieu de la reconstruire.
   */
  it('le parcours entier laisse les cases identiques, à la case près', () => {
    fc.assert(
      fc.property(placement, (command) => {
        const building = place(command)
        if (building === null) return true

        const snapshot = wealthy(building)
        const before = cellSet(cellsOf(building, CATALOGS))

        const decision = decideUpgrade(
          projectPlanet(snapshot, CATALOGS, T0),
          { kind: 'upgrade', workId: WORK_ID, buildingId: BUILDING_ID },
          CATALOGS,
        )
        if (decision.outcome !== 'accepted') {
          throw new Error(`refus inattendu : ${decision.refusal.code}`)
        }

        const launched = applyEffects(snapshot, decision.effects, T0)
        const seconds = evaluateCurve(BUILDINGS[building.typeId].buildDuration, building.level + 1)
        const raised = projectPlanet(launched, CATALOGS, instant(T0 + seconds)).buildings[0]
        if (raised === undefined) throw new Error('le bâtiment a disparu de la projection')

        expect(raised.level).toBe(building.level + 1)
        expect(cellSet(raised.cells)).toEqual(before)
        return true
      }),
      { numRuns: 200 },
    )
  })
})
