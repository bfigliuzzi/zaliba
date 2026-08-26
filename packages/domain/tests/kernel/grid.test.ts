import type { FootprintId } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOGS } from '../../src/kernel/catalogs.js'
import {
  cellsOf,
  coveredDeposits,
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
 * La grille : la disposition du catalogue **moins** les déblaiements, plus les
 * bâtiments.
 *
 * Rien de tout cela n'est stocké. L'état obstrué d'une case est une soustraction,
 * les cases d'un bâtiment une dérivation depuis sa variante, son orientation et
 * son ancre. Une seule de ces valeurs persistée deviendrait fausse au premier
 * rééquilibrage — et fausse en silence.
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

function mineAt(x: number, y: number, orientation = 0): PlacedBuilding {
  return {
    id: 'b-1',
    typeId: 'mine',
    variantId: 'square-4',
    orientation,
    anchor: { x, y },
    level: 1,
  }
}

function at(snapshot: PlanetSnapshot, x: number, y: number) {
  return gridView(snapshot, CATALOGS).find((cell) => cell.x === x && cell.y === y)
}

describe('les cases d’un bâtiment sont dérivées, jamais stockées', () => {
  it('décale l’empreinte de son ancre', () => {
    expect(cellsOf(mineAt(0, 4), CATALOGS)).toEqual([
      { x: 0, y: 4 },
      { x: 1, y: 4 },
      { x: 0, y: 5 },
      { x: 1, y: 5 },
    ])
  })

  /**
   * Le carré de quatre est **achiral et invariant par rotation** : il n'a qu'une
   * orientation distincte (R6). Une orientation hors bornes doit donc retomber
   * sur la seule qui existe, plutôt que d'échouer sur un tableau trop court.
   */
  it('ramène une orientation au nombre d’orientations distinctes', () => {
    expect(cellsOf(mineAt(0, 4, 3), CATALOGS)).toEqual(cellsOf(mineAt(0, 4, 0), CATALOGS))
  })

  it('applique une rotation à une empreinte qui en a plusieurs', () => {
    const straight = cellsOf({ ...mineAt(0, 0), variantId: 'l-4', orientation: 0 }, CATALOGS)
    const turned = cellsOf({ ...mineAt(0, 0), variantId: 'l-4', orientation: 1 }, CATALOGS)
    expect(turned).not.toEqual(straight)
    expect(turned).toHaveLength(straight.length)
  })

  it('refuse une empreinte inconnue plutôt que d’en inventer une', () => {
    expect(() =>
      cellsOf({ ...mineAt(0, 0), variantId: 'inexistante' as 'square-4' }, CATALOGS),
    ).toThrow(RangeError)
  })
})

describe('l’état d’une case', () => {
  it('marque libre une case sans obstacle ni bâtiment', () => {
    expect(at(fresh(), 0, 0)?.state).toBe('free')
  })

  it('marque obstruée une case du catalogue, et nomme son obstacle', () => {
    const cell = at(fresh(), 3, 0)
    expect(cell?.state).toBe('obstructed')
    expect(cell?.obstacleId).toBe('eboulis')
  })

  it('marque occupée une case sous un bâtiment', () => {
    const snapshot = { ...fresh(), buildings: [mineAt(0, 4)] }
    expect(at(snapshot, 0, 4)?.state).toBe('occupied')
    expect(at(snapshot, 0, 4)?.buildingId).toBe('b-1')
  })

  it('laisse libres les cases que le bâtiment ne couvre pas', () => {
    const snapshot = { ...fresh(), buildings: [mineAt(0, 4)] }
    expect(at(snapshot, 2, 5)?.state).toBe('free')
    expect(at(snapshot, 2, 5)?.buildingId).toBeNull()
  })
})

describe('le déblaiement retire l’obstacle et peut révéler un gisement', () => {
  it('libère la case déblayée', () => {
    const snapshot = { ...fresh(), clearedCells: [{ x: 3, y: 0 }] }
    expect(at(snapshot, 3, 0)?.state).toBe('free')
    expect(at(snapshot, 3, 0)?.obstacleId).toBeNull()
  })

  /**
   * Ce que révèle un déblaiement appartient au **type d'obstacle** et non à la
   * case. C'est ce qui rend la planète lisible : qui a déblayé un
   * `filon-enfoui` sait ce que le prochain donnera.
   */
  it('révèle une veine de Camelote sous un filon enfoui', () => {
    const snapshot = { ...fresh(), clearedCells: [{ x: 0, y: 2 }] }
    expect(at(snapshot, 0, 2)?.depositOf).toBe('camelote')
  })

  it('révèle un geyser de Jus sous une poche scellée', () => {
    const snapshot = { ...fresh(), clearedCells: [{ x: 3, y: 2 }] }
    expect(at(snapshot, 3, 2)?.depositOf).toBe('jus')
  })

  it('ne révèle rien sous un éboulis', () => {
    const snapshot = { ...fresh(), clearedCells: [{ x: 1, y: 2 }] }
    expect(at(snapshot, 1, 2)?.depositOf).toBeNull()
  })

  it('ne révèle rien sur une case libre déclarée déblayée', () => {
    const snapshot = { ...fresh(), clearedCells: [{ x: 0, y: 0 }] }
    expect(at(snapshot, 0, 0)?.depositOf).toBeNull()
  })
})

describe('un gisement recouvert reste visible (FR-020)', () => {
  /**
   * La seule information que recouvrir ne doit pas effacer. Un joueur qui a posé
   * une mine sur sa veine doit continuer à voir **pourquoi** elle est là, sans
   * quoi la décision qu'il a prise devient indéchiffrable un mois plus tard —
   * et il démolit un extracteur parfaitement placé.
   */
  it('conserve la mention du gisement sous le bâtiment', () => {
    const snapshot = { ...fresh(), buildings: [mineAt(0, 4)] }
    const cell = at(snapshot, 0, 4)
    expect(cell?.state).toBe('occupied')
    expect(cell?.depositOf).toBe('camelote')
  })
})

describe('les gisements recouverts par un extracteur (FR-017)', () => {
  function covered(building: PlacedBuilding, snapshot = fresh()): number {
    return coveredDeposits(building, gridView(snapshot, CATALOGS), CATALOGS)
  }

  it('compte le gisement de sa ressource sous son empreinte', () => {
    expect(covered(mineAt(0, 4))).toBe(1)
  })

  it('ne compte rien quand l’empreinte ne recouvre aucun gisement', () => {
    expect(covered(mineAt(3, 3))).toBe(0)
  })

  /**
   * I-12 en germe : un extracteur posé sur le gisement d'une **autre** ressource
   * n'en tire rien. La mine sur le récif de Bave d'étoiles ne compte pas.
   */
  it('ne compte pas le gisement d’une autre ressource', () => {
    expect(covered({ ...mineAt(4, 4), variantId: 'single' })).toBe(0)
  })

  it('ne compte rien pour un type qui n’extrait pas', () => {
    expect(covered({ ...mineAt(0, 4), typeId: 'entrepot', variantId: 'single' })).toBe(0)
  })

  it('compte un gisement révélé par un déblaiement', () => {
    const snapshot = { ...fresh(), clearedCells: [{ x: 0, y: 2 }] }
    expect(covered({ ...mineAt(0, 2), variantId: 'single' }, snapshot)).toBe(1)
  })
})

describe('l’ordre des cases est celui de la lecture', () => {
  /**
   * Ligne par ligne, de gauche à droite. Un `role="grid"` peut s'en servir
   * directement, et deux grilles comparées comparent des choses comparables.
   */
  it('énumère les cases par ligne puis par colonne', () => {
    const grid = gridView(fresh(), CATALOGS)
    expect(grid.slice(0, 3).map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ])
    expect(grid[6]).toMatchObject({ x: 0, y: 1 })
  })
})

describe('l’empreinte orientée, puis translatée (R6)', () => {
  it('rend les offsets de l’orientation demandée', () => {
    expect(orientedCells('square-4', 0, CATALOGS)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ])
  })

  /**
   * L'orientation du curseur est un compteur cyclique modulo **quatre** (R14),
   * alors qu'une empreinte n'a que le nombre d'orientations *distinctes* que sa
   * géométrie autorise. Le repli est donc la règle, pas le cas limite : c'est
   * lui qui permet à la commande de rotation d'être toujours acceptée et de ne
   * rien annoncer quand il n'y a rien à annoncer.
   */
  it('ramène l’orientation au nombre d’orientations distinctes', () => {
    for (const orientation of [0, 1, 2, 3]) {
      expect(orientedCells('square-4', orientation, CATALOGS)).toEqual(
        orientedCells('square-4', 0, CATALOGS),
      )
    }
    expect(orientedCells('rect-6', 2, CATALOGS)).toEqual(orientedCells('rect-6', 0, CATALOGS))
    expect(orientedCells('l-4', 3, CATALOGS)).not.toEqual(orientedCells('l-4', 0, CATALOGS))
  })

  it('translate l’empreinte de son ancre', () => {
    expect(placementCells('square-4', 0, { x: 3, y: 3 }, CATALOGS)).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ])
  })

  /**
   * La contiguïté n'est **jamais** vérifiée, et ce test dit pourquoi : les sept
   * empreintes sont contiguës par définition, et une translation la conserve.
   * Une vérification serait du code mort qui aurait l'air prudent.
   */
  it('conserve la surface en tournant et en translatant', () => {
    for (const orientation of [0, 1, 2, 3]) {
      expect(placementCells('l-4', orientation, { x: 1, y: 1 }, CATALOGS)).toHaveLength(4)
    }
  })
})

describe('la validité d’un placement, motif par motif (FR-012, FR-013)', () => {
  function check(variantId: FootprintId, orientation: number, anchor: { x: number; y: number }) {
    const snapshot = fresh()
    return validatePlacement(
      gridView(snapshot, CATALOGS),
      placementCells(variantId, orientation, anchor, CATALOGS),
    )
  }

  it('accepte un placement entièrement libre', () => {
    expect(check('square-4', 0, { x: 0, y: 4 })).toEqual({ kind: 'ok' })
  })

  /**
   * FR-013 exige le **motif exact**, et non un booléen. La différence n'est pas
   * de confort : « refusé » n'apprend rien, « la case (5,2) est obstruée par une
   * croûte calcifiée » dit au joueur quoi faire ensuite — et c'est la même
   * information qui remonte jusqu'à l'annonce du lecteur d'écran (FR-059).
   */
  it('refuse hors de la grille, et énumère les cases fautives', () => {
    const refusal = check('square-4', 0, { x: 5, y: 5 })
    expect(refusal.kind).toBe('out-of-grid')
    expect(refusal.kind === 'ok' ? [] : refusal.cells).toEqual([
      { x: 6, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ])
  })

  it('refuse sur une case obstruée, et énumère les cases fautives', () => {
    const refusal = check('square-4', 0, { x: 0, y: 2 })
    expect(refusal.kind).toBe('obstructed')
    // (0,2) filon enfoui, (1,2) éboulis, (1,3) rocher — (0,3) est libre.
    expect(refusal.kind === 'ok' ? [] : refusal.cells).toEqual([
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ])
  })

  it('refuse sur une case occupée, et énumère les cases fautives', () => {
    const snapshot = { ...fresh(), buildings: [mineAt(0, 4)] }
    const refusal = validatePlacement(
      gridView(snapshot, CATALOGS),
      placementCells('single', 0, { x: 1, y: 5 }, CATALOGS),
    )
    expect(refusal.kind).toBe('occupied')
    expect(refusal.kind === 'ok' ? [] : refusal.cells).toEqual([{ x: 1, y: 5 }])
  })

  /**
   * L'ordre des motifs n'est pas arbitraire. « Hors de la grille » vient
   * d'abord parce qu'une case absente de la grille n'a **aucun** état à
   * examiner : dire d'elle qu'elle est obstruée serait inventer une réponse. Le
   * reste suit la même logique — on nomme la cause la plus fondamentale.
   */
  it('nomme « hors de la grille » avant tout autre motif', () => {
    // Le carré de neuf ancré en (4,1) déborde **et** couvre des cases obstruées.
    const refusal = check('square-9', 0, { x: 4, y: 1 })
    expect(refusal.kind).toBe('out-of-grid')
  })

  it('nomme « obstruée » avant « occupée »', () => {
    const snapshot = { ...fresh(), buildings: [{ ...mineAt(0, 3), variantId: 'single' as const }] }
    const refusal = validatePlacement(
      gridView(snapshot, CATALOGS),
      placementCells('square-4', 0, { x: 0, y: 2 }, CATALOGS),
    )
    expect(refusal.kind).toBe('obstructed')
  })

  /**
   * Une case déblayée est plaçable : c'est tout l'objet du déblaiement, et le
   * seul chemin par lequel les vingt-six cases libres deviennent trente-six.
   */
  it('accepte un placement sur une case déblayée', () => {
    const snapshot = { ...fresh(), clearedCells: [{ x: 3, y: 0 }] }
    const refusal = validatePlacement(
      gridView(snapshot, CATALOGS),
      placementCells('single', 0, { x: 3, y: 0 }, CATALOGS),
    )
    expect(refusal).toEqual({ kind: 'ok' })
  })

  /** Un gisement n'obstrue rien : il se recouvre, c'est même le but (FR-020). */
  it('accepte un placement sur un gisement affleurant', () => {
    const refusal = validatePlacement(
      gridView(fresh(), CATALOGS),
      placementCells('single', 0, { x: 0, y: 4 }, CATALOGS),
    )
    expect(refusal).toEqual({ kind: 'ok' })
  })
})
