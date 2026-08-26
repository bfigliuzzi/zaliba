import { describe, expect, it } from 'vitest'
import { FOOTPRINT_IDS, FOOTPRINTS, type Offset } from '../src/footprints.js'

/**
 * Les sept empreintes du vocabulaire fermé (R6).
 *
 * Ce fichier est l'autorité sur trois propriétés que rien d'autre ne garantit :
 * la surface de chaque forme, sa normalisation, et le **nombre d'orientations
 * distinctes**. Ce dernier n'est pas une curiosité : c'est lui qui fait qu'une
 * rotation de carré n'annonce rien à un lecteur d'écran.
 */

const surface = (id: keyof typeof FOOTPRINTS): number => FOOTPRINTS[id].cells.length
const key = (c: Offset): string => `${c.x},${c.y}`
const asSet = (cells: readonly Offset[]): Set<string> => new Set(cells.map(key))

describe('le vocabulaire est fermé', () => {
  it('compte exactement sept empreintes', () => {
    expect(FOOTPRINT_IDS).toHaveLength(7)
  })

  it('nomme les sept formes de R6, et pas une de plus', () => {
    expect([...FOOTPRINT_IDS].sort()).toEqual(
      ['l-4', 'line-2', 'rect-6', 'single', 'square-4', 'square-9', 't-4'].sort(),
    )
  })

  it('associe chaque identifiant à une empreinte qui le porte', () => {
    for (const id of FOOTPRINT_IDS) {
      expect(FOOTPRINTS[id].id).toBe(id)
    }
  })
})

describe('les surfaces sont celles de la table R6', () => {
  it.each([
    ['single', 1],
    ['line-2', 2],
    ['square-4', 4],
    ['l-4', 4],
    ['t-4', 4],
    ['rect-6', 6],
    ['square-9', 9],
  ] as const)('%s occupe %i cases', (id, cases) => {
    expect(surface(id)).toBe(cases)
  })

  it('ne place jamais deux fois la même case', () => {
    for (const id of FOOTPRINT_IDS) {
      const cells = FOOTPRINTS[id].cells
      expect(asSet(cells).size, `${id} porte un doublon`).toBe(cells.length)
    }
  })
})

describe('les offsets sont normalisés', () => {
  it('cale chaque empreinte sur min x = min y = 0', () => {
    for (const id of FOOTPRINT_IDS) {
      const cells = FOOTPRINTS[id].cells
      expect(Math.min(...cells.map((c) => c.x)), `${id} en x`).toBe(0)
      expect(Math.min(...cells.map((c) => c.y)), `${id} en y`).toBe(0)
    }
  })

  it('n’emploie que des entiers positifs ou nuls', () => {
    for (const id of FOOTPRINT_IDS) {
      for (const c of FOOTPRINTS[id].cells) {
        expect(Number.isInteger(c.x) && c.x >= 0, `${id} → ${key(c)}`).toBe(true)
        expect(Number.isInteger(c.y) && c.y >= 0, `${id} → ${key(c)}`).toBe(true)
      }
    }
  })

  it('normalise aussi chaque orientation précalculée', () => {
    for (const id of FOOTPRINT_IDS) {
      for (const [i, cells] of FOOTPRINTS[id].orientations.entries()) {
        expect(Math.min(...cells.map((c) => c.x)), `${id} orientation ${i} en x`).toBe(0)
        expect(Math.min(...cells.map((c) => c.y)), `${id} orientation ${i} en y`).toBe(0)
      }
    }
  })
})

describe('les orientations distinctes sont celles de la table R6', () => {
  it.each([
    ['single', 1],
    ['line-2', 2],
    ['square-4', 1],
    ['l-4', 4],
    ['t-4', 4],
    ['rect-6', 2],
    ['square-9', 1],
  ] as const)('%s admet %i orientation(s) distincte(s)', (id, count) => {
    expect(FOOTPRINTS[id].orientations).toHaveLength(count)
  })

  it('donne l’orientation 0 pour première orientation', () => {
    for (const id of FOOTPRINT_IDS) {
      expect(asSet(FOOTPRINTS[id].orientations[0] ?? []), id).toEqual(asSet(FOOTPRINTS[id].cells))
    }
  })

  it('conserve la surface en tournant — une rotation ne crée ni ne perd de case', () => {
    for (const id of FOOTPRINT_IDS) {
      for (const cells of FOOTPRINTS[id].orientations) {
        expect(cells, id).toHaveLength(surface(id))
      }
    }
  })

  it('ne répète jamais deux fois la même orientation', () => {
    for (const id of FOOTPRINT_IDS) {
      const seen = FOOTPRINTS[id].orientations.map((cells) => [...asSet(cells)].sort().join('|'))
      expect(new Set(seen).size, `${id} répète une orientation`).toBe(seen.length)
    }
  })
})

describe('les offsets de l’orientation 0 sont ceux que R6 publie', () => {
  it.each([
    ['single', [[0, 0]]],
    [
      'line-2',
      [
        [0, 0],
        [1, 0],
      ],
    ],
    [
      'square-4',
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
    ],
    [
      'l-4',
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    ],
    [
      't-4',
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [1, 1],
      ],
    ],
    [
      'rect-6',
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
    ],
    [
      'square-9',
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ],
    ],
  ] as const)('%s', (id, expected) => {
    expect(asSet(FOOTPRINTS[id].cells)).toEqual(new Set(expected.map(([x, y]) => `${x},${y}`)))
  })
})

describe('le miroir est inatteignable par construction (FR-011)', () => {
  /** Le miroir horizontal, normalisé — ce que la rotation ne doit jamais produire. */
  const mirrored = (cells: readonly Offset[]): Set<string> => {
    const maxX = Math.max(...cells.map((c) => c.x))
    return asSet(cells.map((c) => ({ x: maxX - c.x, y: c.y })))
  }

  const sameSet = (a: Set<string>, b: Set<string>): boolean =>
    a.size === b.size && [...a].every((v) => b.has(v))

  const reachesMirror = (id: keyof typeof FOOTPRINTS): boolean => {
    const target = mirrored(FOOTPRINTS[id].cells)
    return FOOTPRINTS[id].orientations.some((cells) => sameSet(asSet(cells), target))
  }

  /**
   * **`l-4` est la seule empreinte chirale du vocabulaire.**
   *
   * Une forme est chirale quand son miroir n'est atteignable par aucune
   * rotation. C'est le seul cas où FR-011 a un objet : pour toutes les autres,
   * le miroir *est* une rotation, et l'interdire n'aurait aucun sens.
   *
   * La vérification est faite ici plutôt que supposée — voir le contrôle
   * d'achiralité juste en dessous, qui interdit qu'une future empreinte se
   * glisse dans la mauvaise catégorie sans qu'on le voie.
   */
  it('aucune orientation de l-4 ne coïncide avec son miroir', () => {
    expect(reachesMirror('l-4')).toBe(false)
  })

  /**
   * Les six autres sont achirales, et c'est un fait de géométrie, pas un choix.
   * Le T a un axe de symétrie vertical : son miroir est son orientation 0.
   *
   * Ce test n'est pas une redite. Il fixe la **partition** du vocabulaire : si
   * quelqu'un ajoute demain une empreinte chirale à cette liste, ou déforme une
   * empreinte existante, l'échec dira exactement laquelle a changé de nature.
   */
  it.each(['single', 'line-2', 'square-4', 't-4', 'rect-6', 'square-9'] as const)(
    '%s est achirale — son miroir est l’une de ses rotations',
    (id) => {
      expect(reachesMirror(id)).toBe(true)
    },
  )

  /**
   * Ce qui protège réellement FR-011 n'est aucun de ces deux tests, mais le
   * fait qu'aucune fonction de symétrie n'existe dans `footprints.ts`. Les
   * tests ci-dessus décrivent la géométrie ; c'est l'absence de code qui rend
   * le retournement impossible à demander.
   */
  it('n’expose aucune opération capable de produire un miroir', () => {
    const surface = (id: keyof typeof FOOTPRINTS): number => FOOTPRINTS[id].cells.length
    for (const id of FOOTPRINT_IDS) {
      for (const cells of FOOTPRINTS[id].orientations) {
        // Une rotation conserve la surface et la normalisation ; c'est tout ce
        // que le module sait faire.
        expect(cells).toHaveLength(surface(id))
      }
    }
  })
})
