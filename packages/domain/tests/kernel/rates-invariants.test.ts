import { BUILDINGS } from '@zaliba/catalogs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../src/game.js'
import { DEFAULT_CATALOGS } from '../../src/kernel/catalogs.js'
import { evaluateCurve } from '../../src/kernel/curves.js'
import { NO_DEFICIT } from '../../src/kernel/energy.js'
import { coveredDeposits, gridView } from '../../src/kernel/grid.js'
import { productionRates } from '../../src/kernel/rates.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'

/**
 * Les invariants de production (data-model § 1.7).
 *
 * **I-12 et I-13 disent la même chose par les deux bouts** : la production d'un
 * extracteur est le produit de sa courbe par le nombre de gisements qu'il
 * recouvre. Le premier fixe le cas zéro — un extracteur mal placé ne produit
 * *rien*, et non « un peu » —, le second la linéarité.
 *
 * Ce couple est ce qui fait de la grille une décision et non une décoration. Si
 * la production ne dépendait pas des gisements recouverts, poser un extracteur
 * n'importe où reviendrait au même, et le vocabulaire d'empreintes serait un
 * ornement. Et si le cas zéro rendait « un peu », l'erreur de placement serait
 * pardonnée en silence, donc jamais comprise.
 */

const T0 = instant(1_787_750_000)
const CATALOGS = DEFAULT_CATALOGS

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

function mine(
  variantId: PlacedBuilding['variantId'],
  anchor: { x: number; y: number },
  level = 1,
  orientation = 0,
): PlacedBuilding {
  return { id: 'b-1', typeId: 'mine', variantId, orientation, anchor, level }
}

/**
 * La disposition qui met **deux** veines de Camelote sous une même empreinte.
 *
 * Déblayer (0,2) — un filon enfoui — y révèle une veine. Le L de quatre ancré
 * en (0,2) couvre alors (0,2), (0,3), (0,4) et (1,4), donc les veines de (0,2)
 * et de (0,4). C'est le seul placement du Berceau qui double la production d'un
 * même extracteur, et c'est exactement le scénario 3 d'US2.
 */
function withTwoVeins(building: PlacedBuilding): PlanetSnapshot {
  return { ...fresh(), clearedCells: [{ x: 0, y: 2 }], buildings: [building] }
}

/** Le taux nominal du bâtiment, tel que la projection le publie (FR-024). */
function nominalOf(snapshot: PlanetSnapshot): number {
  const view = projectPlanet(snapshot, CATALOGS, T0).buildings[0]
  if (view === undefined) throw new Error('Aucun bâtiment projeté.')
  return view.nominalRate
}

describe('I-12 — un extracteur qui ne recouvre aucun gisement produit zéro (FR-017)', () => {
  it('ne produit rien sur un terrain nu', () => {
    // (3,3), (4,3), (3,4) et (4,4) : le récif de (4,4) n'est pas de la Camelote.
    expect(nominalOf({ ...fresh(), buildings: [mine('square-4', { x: 3, y: 3 })] })).toBe(0)
  })

  it('ne produit rien sur le gisement d’une autre ressource', () => {
    expect(nominalOf({ ...fresh(), buildings: [mine('single', { x: 4, y: 4 })] })).toBe(0)
  })

  /**
   * Zéro, et non « la production de base du type ». La différence est celle
   * entre une grille qui compte et une grille qui décore.
   */
  it('ne produit rien à quelque niveau que ce soit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: BUILDINGS.mine.maxLevel }), (level) => {
        expect(
          nominalOf({ ...fresh(), buildings: [mine('square-4', { x: 3, y: 3 }, level)] }),
        ).toBe(0)
      }),
    )
  })

  /**
   * La contrepartie, sans laquelle le test précédent serait satisfait par une
   * production universellement nulle : posé sur son gisement, l'extracteur
   * produit.
   */
  it('produit, en revanche, quand il recouvre son gisement', () => {
    expect(
      nominalOf({ ...fresh(), buildings: [mine('square-4', { x: 0, y: 4 })] }),
    ).toBeGreaterThan(0)
  })

  it('laisse la production de base du Berceau intacte malgré un extracteur stérile', () => {
    const snapshot = { ...fresh(), buildings: [mine('square-4', { x: 3, y: 3 })] }
    const base = CATALOGS.layouts['berceau-v1'].baseProductionPerHour['camelote']
    expect(productionRates(snapshot, CATALOGS, NO_DEFICIT)['camelote'].nominal).toBe(base)
  })
})

describe('I-13 — la production est proportionnelle aux gisements recouverts (FR-017)', () => {
  it('recouvre bien deux veines dans la disposition attendue', () => {
    const building = mine('l-4', { x: 0, y: 2 })
    const snapshot = withTwoVeins(building)
    expect(coveredDeposits(building, gridView(snapshot, CATALOGS), CATALOGS)).toBe(2)
  })

  it('double la production quand deux veines sont recouvertes au lieu d’une', () => {
    const one = nominalOf({ ...fresh(), buildings: [mine('square-4', { x: 0, y: 4 })] })
    const two = nominalOf(withTwoVeins(mine('l-4', { x: 0, y: 2 })))
    expect(two).toBe(2 * one)
  })

  /**
   * L'énoncé général : `taux = courbeProduction(niveau) × gisements` (R5). C'est
   * la formule publiée, et elle doit se vérifier au niveau près — SC-002 promet
   * qu'un joueur peut refaire n'importe quel chiffre affiché.
   */
  it('vaut exactement la courbe du niveau multipliée par le compte de gisements', () => {
    const curve = BUILDINGS.mine.production
    expect(curve).not.toBeNull()
    if (curve === null) return

    fc.assert(
      fc.property(fc.integer({ min: 1, max: BUILDINGS.mine.maxLevel }), (level) => {
        expect(
          nominalOf({ ...fresh(), buildings: [mine('square-4', { x: 0, y: 4 }, level)] }),
        ).toBe(evaluateCurve(curve, level) * 1)
        expect(nominalOf(withTwoVeins(mine('l-4', { x: 0, y: 2 }, level)))).toBe(
          evaluateCurve(curve, level) * 2,
        )
      }),
    )
  })

  /**
   * Le taux de la **planète** est la somme des extracteurs plus la base du
   * Berceau. Le vérifier ici évite qu'un bâtiment produise juste pendant que la
   * planète ignore sa contribution — deux chiffres justes séparément et
   * incohérents ensemble, ce qui est le pire des deux.
   */
  it('ajoute la contribution de l’extracteur au taux de la planète', () => {
    const snapshot = { ...fresh(), buildings: [mine('square-4', { x: 0, y: 4 })] }
    const base = CATALOGS.layouts['berceau-v1'].baseProductionPerHour['camelote']
    const rates = productionRates(snapshot, CATALOGS, NO_DEFICIT)

    expect(rates['camelote'].nominal).toBe(base + nominalOf(snapshot))
    // Les deux autres ressources ne bougent pas : une mine n'extrait que de la
    // Camelote, et le taux d'une ressource ne doit rien à un extracteur voisin.
    expect(rates['jus'].nominal).toBe(CATALOGS.layouts['berceau-v1'].baseProductionPerHour['jus'])
  })

  it('additionne deux extracteurs de la même ressource', () => {
    const snapshot: PlanetSnapshot = {
      ...fresh(),
      clearedCells: [{ x: 0, y: 2 }],
      buildings: [
        { ...mine('single', { x: 0, y: 2 }), id: 'b-1' },
        { ...mine('single', { x: 0, y: 4 }), id: 'b-2' },
      ],
    }
    const base = CATALOGS.layouts['berceau-v1'].baseProductionPerHour['camelote']
    const state = projectPlanet(snapshot, CATALOGS, T0)
    const fromBuildings = state.buildings.reduce(
      (total, building) => total + building.nominalRate,
      0,
    )

    expect(state.buildings).toHaveLength(2)
    expect(fromBuildings).toBeGreaterThan(0)
    expect(state.holdings['camelote'].nominalRate).toBe(base + fromBuildings)
  })
})
