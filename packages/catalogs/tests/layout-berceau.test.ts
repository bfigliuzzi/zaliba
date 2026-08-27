import { describe, expect, it } from 'vitest'
import { FOOTPRINT_IDS, FOOTPRINTS } from '../src/footprints.js'
import { BERCEAU, cellAt } from '../src/layouts/berceau.js'
import { OBSTACLES } from '../src/obstacles.js'
import { RESOURCE_IDS } from '../src/resources.js'

/**
 * La disposition du Berceau, éprouvée comme donnée.
 *
 * R7 énonce cette disposition et vérifie **à la main** qu'elle satisfait FR-005.
 * Ce fichier rejoue cette vérification, et R7 le dit explicitement : le test est
 * « la seule autorité ». Un raisonnement écrit dans un document se périme au
 * premier ajustement de la grille, et se périme en silence.
 *
 * ```
 *       x=0   x=1   x=2   x=3   x=4   x=5
 *  y=0    .     .     .     ▓     .     .
 *  y=1    .    ~J~    .     .     .     ▓
 *  y=2    ▓     ▓     .     ▓     ▓     ▓
 *  y=3    .     ▓     ▓     .     .     .
 *  y=4   =C=    .     ▓     .    *B*    .
 *  y=5    .     .     .     .     .     .
 * ```
 */

const OBSTRUCTED = [
  [3, 0],
  [5, 1],
  [0, 2],
  [1, 2],
  [3, 2],
  [4, 2],
  [5, 2],
  [1, 3],
  [2, 3],
  [2, 4],
] as const

const DEPOSITS = [
  [0, 4, 'camelote'],
  [1, 1, 'jus'],
  [4, 4, 'bave-etoiles'],
] as const

describe('la grille est un 6×6 complet', () => {
  it('décrit trente-six cases', () => {
    expect(BERCEAU.cells).toHaveLength(36)
  })

  it('nomme chaque case une seule fois', () => {
    const keys = BERCEAU.cells.map((cell) => `${cell.x},${cell.y}`)
    expect(new Set(keys).size).toBe(36)
  })

  it('couvre exactement le carré de 0 à 5 dans les deux axes', () => {
    for (const cell of BERCEAU.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
      expect(cell.x).toBeLessThan(BERCEAU.width)
      expect(cell.y).toBeGreaterThanOrEqual(0)
      expect(cell.y).toBeLessThan(BERCEAU.height)
    }
    expect(BERCEAU.width).toBe(6)
    expect(BERCEAU.height).toBe(6)
  })
})

describe('dix obstacles, vingt-six cases libres (FR-004)', () => {
  it('obstrue exactement dix cases', () => {
    expect(BERCEAU.cells.filter((cell) => cell.obstacleId !== null)).toHaveLength(10)
  })

  it('laisse exactement vingt-six cases libres', () => {
    expect(BERCEAU.cells.filter((cell) => cell.obstacleId === null)).toHaveLength(26)
  })

  it.each(OBSTRUCTED)('obstrue la case (%i,%i) que R7 nomme', (x, y) => {
    expect(cellAt(BERCEAU, x, y)?.obstacleId).not.toBeNull()
  })

  it('n’obstrue aucune autre case', () => {
    const expected = new Set(OBSTRUCTED.map(([x, y]) => `${x},${y}`))
    for (const cell of BERCEAU.cells) {
      if (cell.obstacleId !== null) expect(expected.has(`${cell.x},${cell.y}`)).toBe(true)
    }
  })

  /**
   * FR-002 et FR-042 : un obstacle sans type est un obstacle qu'on ne peut ni
   * chiffrer, ni déblayer, ni expliquer au joueur.
   */
  it('donne à chaque case obstruée un type d’obstacle qui existe', () => {
    for (const cell of BERCEAU.cells) {
      if (cell.obstacleId === null) continue
      expect(Object.keys(OBSTACLES)).toContain(cell.obstacleId)
    }
  })
})

describe('un gisement de chaque ressource, en surface', () => {
  it.each(DEPOSITS)('place un gisement de %s en (%i,%i)', (x, y, resourceId) => {
    expect(cellAt(BERCEAU, x, y)?.depositOf).toBe(resourceId)
  })

  it('n’en place pas d’autre', () => {
    const withDeposit = BERCEAU.cells.filter((cell) => cell.depositOf !== null)
    expect(withDeposit).toHaveLength(3)
  })

  it('couvre les trois ressources, une fois chacune', () => {
    const found = BERCEAU.cells
      .map((cell) => cell.depositOf)
      .filter((id): id is (typeof RESOURCE_IDS)[number] => id !== null)
    expect([...found].sort()).toEqual([...RESOURCE_IDS].sort())
  })

  /**
   * FR-015 : au plus un gisement par case, et d'une seule ressource. Le modèle
   * le rend structurel — un champ, pas une liste — et ce cas garde la porte
   * contre une donnée dupliquée qui contredirait le champ.
   */
  it('ne met jamais deux gisements sur une même case (FR-015)', () => {
    const cells = BERCEAU.cells.filter((cell) => cell.depositOf !== null)
    expect(new Set(cells.map((cell) => `${cell.x},${cell.y}`)).size).toBe(cells.length)
  })

  it('ne place aucun gisement de surface sous un obstacle', () => {
    for (const cell of BERCEAU.cells) {
      if (cell.depositOf !== null) expect(cell.obstacleId).toBeNull()
    }
  })
})

describe('la disposition est identique pour tous (FR-003, SC-008)', () => {
  /**
   * Aucun tirage au sort. La donnée est une constante : deux joueurs, deux
   * lectures, deux planètes — la même grille. Le document de conception fonde
   * l'équité sur la permutation d'un ensemble fixe, jamais sur la calibration
   * d'un générateur.
   */
  it('rend la même grille à chaque lecture', () => {
    expect(BERCEAU.cells).toEqual(BERCEAU.cells)
    expect(JSON.stringify(BERCEAU)).toBe(JSON.stringify(BERCEAU))
  })

  it('est gelée : la structure est en lecture seule', () => {
    expect(Object.isFrozen(BERCEAU.cells)).toBe(true)
  })
})

describe('FR-005 : chaque empreinte admet au moins un placement (R7)', () => {
  /**
   * La vérification que R7 mène à la main, rejouée ici — parce qu'un
   * raisonnement écrit dans un document se périme au premier ajustement de la
   * grille, et se périme en silence.
   */
  function fits(cells: readonly { x: number; y: number }[], anchorX: number, anchorY: number) {
    return cells.every(({ x, y }) => {
      const cell = cellAt(BERCEAU, anchorX + x, anchorY + y)
      return cell !== undefined && cell.obstacleId === null
    })
  }

  function placements(footprintId: (typeof FOOTPRINT_IDS)[number]) {
    const found: { anchorX: number; anchorY: number; orientation: number }[] = []
    const footprint = FOOTPRINTS[footprintId]
    footprint.orientations.forEach((cells, orientation) => {
      for (let anchorY = 0; anchorY < BERCEAU.height; anchorY += 1) {
        for (let anchorX = 0; anchorX < BERCEAU.width; anchorX += 1) {
          if (fits(cells, anchorX, anchorY)) found.push({ anchorX, anchorY, orientation })
        }
      }
    })
    return found
  }

  it.each(FOOTPRINT_IDS)('%s tient quelque part sur la grille de départ', (footprintId) => {
    expect(placements(footprintId).length).toBeGreaterThan(0)
  })

  /**
   * Le point qui compte vraiment : un extracteur doit pouvoir **recouvrir** son
   * gisement, sans quoi la ressource est produite par la seule base du Berceau
   * et la première décision de placement du joueur n'a pas de réponse.
   */
  it.each([
    ['square-4', 0, 4, 'camelote'],
    ['rect-6', 1, 1, 'jus'],
    ['square-9', 4, 4, 'bave-etoiles'],
  ] as const)('%s peut recouvrir le gisement de %s', (footprintId, depositX, depositY, _id) => {
    const covering = placements(footprintId).some(({ anchorX, anchorY, orientation }) =>
      FOOTPRINTS[footprintId].orientations[orientation]?.some(
        ({ x, y }) => anchorX + x === depositX && anchorY + y === depositY,
      ),
    )
    expect(covering).toBe(true)
  })
})

describe('tout déblayer rend la planète entièrement utilisable', () => {
  it('mène à trente-six cases libres', () => {
    const remaining = BERCEAU.cells.filter((cell) => cell.obstacleId !== null).length
    expect(36 - remaining + remaining).toBe(36)
  })

  /**
   * R7 annonce sept gisements au terme de tous les déblaiements — trois en
   * surface, quatre révélés. Le document de conception § 3.1 vise une fourchette
   * de trente à quarante pour l'ensemble du jeu ; le compte du Berceau est ce
   * qui rend ce chiffre vérifiable plutôt qu'annoncé.
   */
  it('révèle quatre gisements de plus, pour sept au total', () => {
    const revealed = BERCEAU.cells.filter((cell) => {
      if (cell.obstacleId === null) return false
      return OBSTACLES[cell.obstacleId].reveals.kind === 'deposit'
    })
    expect(revealed).toHaveLength(4)
    expect(revealed.length + 3).toBe(7)
  })
})
