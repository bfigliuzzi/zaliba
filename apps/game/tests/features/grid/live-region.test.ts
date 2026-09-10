import type { CellView } from '@zaliba/domain'
import { describe, expect, it } from 'vitest'
import { announcePlacement } from '../../../src/features/grid/announce.js'
import { CATALOGS } from '../../catalogs.js'

/**
 * Ce qu'un lecteur d'écran entend quand le curseur bouge (FR-059).
 *
 * Six informations, et la spécification les énumère : position, contenu de la
 * case, empreinte courante, orientation, validité du placement, nombre de
 * gisements recouverts. Aucune n'est facultative — c'est exactement ce qu'un
 * joueur voyant lit d'un coup d'œil sur le fantôme de l'empreinte, et le
 * restituer autrement serait livrer deux jeux différents.
 *
 * **Le texte est éprouvé comme une fonction pure.** L'annonce n'est pas un
 * effet de rendu : c'est une phrase, et une phrase se compare. Le composant qui
 * la porte n'a plus alors qu'à la placer dans une région `aria-live`, ce qui ne
 * demande pas de test de composant.
 */

function cell(overrides: Partial<CellView> = {}): CellView {
  return {
    x: 0,
    y: 4,
    state: 'free',
    obstacleId: null,
    depositOf: 'camelote',
    buildingId: null,
    ...overrides,
  }
}

function announce(overrides: Parameters<typeof announcePlacement>[0]) {
  return announcePlacement(overrides, CATALOGS)
}

const VALID_SQUARE = {
  cell: cell(),
  variantId: 'square-4' as const,
  orientation: 0,
  check: { kind: 'ok' } as const,
  coveredDeposits: 1,
}

describe('l’annonce porte les six informations de FR-059', () => {
  const spoken = announce(VALID_SQUARE)

  it('dit la position, par son adresse courte', () => {
    expect(spoken).toContain('A5')
  })

  /**
   * Le gisement est nommé par le **vocabulaire du jeu** — « veine de Camelote »,
   * et non « gisement de Camelote » (document de conception § 1). Le changement est
   * arrivé avec US5, dont l'aperçu doit annoncer « geyser de Jus » : la table de
   * libellés est unique, et deux mots pour une seule notion feraient énoncer au
   * lecteur d'écran un nom que l'aperçu n'emploie pas.
   */
  it('dit le contenu de la case, dans le vocabulaire du jeu', () => {
    expect(spoken).toMatch(/libre/i)
    expect(spoken).toMatch(/veine de Camelote/i)
  })

  it('dit l’empreinte courante, par son nom et non par son identifiant', () => {
    expect(spoken).toMatch(/carré de quatre/i)
    expect(spoken).not.toContain('square-4')
  })

  it('dit l’orientation', () => {
    expect(spoken).toMatch(/orientation/i)
  })

  it('dit la validité du placement', () => {
    expect(spoken).toMatch(/valide/i)
  })

  it('dit le nombre de gisements recouverts', () => {
    expect(spoken).toMatch(/1 gisement recouvert/i)
  })

  it('accorde le pluriel des gisements', () => {
    expect(announce({ ...VALID_SQUARE, coveredDeposits: 2 })).toMatch(/2 gisements recouverts/i)
    expect(announce({ ...VALID_SQUARE, coveredDeposits: 0 })).toMatch(/aucun gisement recouvert/i)
  })
})

describe('une empreinte à orientation unique n’annonce rien comme changé (R6)', () => {
  /**
   * Le carré de quatre est invariant par rotation : ses quatre valeurs de
   * compteur désignent la **même** forme. Annoncer « orientation 3 sur 4 »
   * dirait au joueur qu'il vient de changer quelque chose, alors que rien n'a
   * bougé — et il tournerait quatre fois pour comprendre que la commande est
   * sans effet. Le dédoublonnage des orientations n'est donc pas une
   * optimisation de données : c'est une exigence d'accessibilité.
   */
  it('donne la même phrase pour les quatre valeurs du compteur', () => {
    const phrases = [0, 1, 2, 3].map((orientation) => announce({ ...VALID_SQUARE, orientation }))
    expect(new Set(phrases).size).toBe(1)
  })

  it('l’annonce comme unique plutôt que numérotée', () => {
    expect(announce(VALID_SQUARE)).toMatch(/orientation unique/i)
  })

  it('vaut aussi pour la case unique et le carré de neuf', () => {
    for (const variantId of ['single', 'square-9'] as const) {
      const phrases = [0, 1, 2, 3].map((orientation) =>
        announce({ ...VALID_SQUARE, variantId, orientation }),
      )
      expect(new Set(phrases).size, variantId).toBe(1)
    }
  })
})

describe('une empreinte chirale annonce chaque orientation distincte', () => {
  it('numérote les quatre orientations du L', () => {
    const phrases = [0, 1, 2, 3].map((orientation) =>
      announce({ ...VALID_SQUARE, variantId: 'l-4', orientation }),
    )
    expect(new Set(phrases).size).toBe(4)
    expect(phrases[0]).toMatch(/orientation 1 sur 4/i)
    expect(phrases[2]).toMatch(/orientation 3 sur 4/i)
  })

  /**
   * Le rectangle de six n'a que **deux** orientations distinctes : le compteur
   * modulo quatre les parcourt deux fois. Deux phrases, pas quatre — sinon la
   * moitié des rotations annoncerait un changement qui n'a pas eu lieu.
   */
  it('n’annonce que deux orientations pour le rectangle de six', () => {
    const phrases = [0, 1, 2, 3].map((orientation) =>
      announce({ ...VALID_SQUARE, variantId: 'rect-6', orientation }),
    )
    expect(new Set(phrases).size).toBe(2)
    expect(phrases[0]).toBe(phrases[2])
  })
})

describe('un refus est annoncé avec son motif et ses cases fautives (FR-013, FR-060)', () => {
  it('nomme la sortie de grille', () => {
    const spoken = announce({
      ...VALID_SQUARE,
      check: { kind: 'out-of-grid', cells: [{ x: 6, y: 5 }] },
    })
    expect(spoken).toMatch(/refusé/i)
    expect(spoken).toMatch(/hors de la grille/i)
    expect(spoken).toContain('G6')
  })

  it('nomme l’obstruction et la case', () => {
    const spoken = announce({
      ...VALID_SQUARE,
      check: { kind: 'obstructed', cells: [{ x: 0, y: 2 }] },
    })
    expect(spoken).toMatch(/obstruée/i)
    expect(spoken).toContain('A3')
  })

  it('nomme l’occupation et la case', () => {
    const spoken = announce({
      ...VALID_SQUARE,
      check: { kind: 'occupied', cells: [{ x: 1, y: 5 }] },
    })
    expect(spoken).toMatch(/occupée/i)
    expect(spoken).toContain('B6')
  })

  it('énumère plusieurs cases fautives', () => {
    const spoken = announce({
      ...VALID_SQUARE,
      check: {
        kind: 'obstructed',
        cells: [
          { x: 0, y: 2 },
          { x: 1, y: 2 },
        ],
      },
    })
    expect(spoken).toContain('A3')
    expect(spoken).toContain('B3')
  })

  /**
   * FR-060 : jamais la couleur ni la position seules. Le motif est **dans la
   * phrase**, donc il existe pour qui écoute la page comme pour qui la regarde
   * en noir et blanc.
   */
  it('ne se contente jamais d’un « invalide » sans motif', () => {
    const spoken = announce({
      ...VALID_SQUARE,
      check: { kind: 'obstructed', cells: [{ x: 0, y: 2 }] },
    })
    expect(spoken).not.toMatch(/^.*invalide\.?$/i)
  })

  it('ne compte aucun gisement recouvert sur un placement refusé', () => {
    const spoken = announce({
      ...VALID_SQUARE,
      coveredDeposits: 2,
      check: { kind: 'obstructed', cells: [{ x: 0, y: 2 }] },
    })
    expect(spoken).not.toMatch(/gisements recouverts/i)
  })
})

describe('sans empreinte sélectionnée, l’annonce se borne à la case', () => {
  /**
   * Le curseur existe avant tout choix de bâtiment : c'est ainsi qu'un joueur
   * explore sa planète. Annoncer une empreinte imaginaire, ou taire la case,
   * seraient deux façons de le perdre.
   */
  it('dit la case et l’absence de sélection', () => {
    const spoken = announce({
      cell: cell({ x: 3, y: 0, state: 'obstructed', obstacleId: 'eboulis', depositOf: null }),
      variantId: null,
      orientation: 0,
      check: null,
      coveredDeposits: 0,
    })

    expect(spoken).toContain('D1')
    expect(spoken).toMatch(/éboulis/i)
    expect(spoken).toMatch(/aucune empreinte/i)
    expect(spoken).not.toMatch(/orientation/i)
  })

  it('reste identique quand on tourne sans empreinte', () => {
    const base = {
      cell: cell(),
      variantId: null,
      orientation: 0,
      check: null,
      coveredDeposits: 0,
    }
    expect(announce({ ...base, orientation: 2 })).toBe(announce(base))
  })
})
