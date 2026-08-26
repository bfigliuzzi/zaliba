import { describe, expect, it } from 'vitest'
import { WorkIntentV1 } from '../../src/v1/planet.js'

/**
 * Les **bornes appartiennent au schéma**, pas au métier (contracts/README § 4).
 *
 * Les quantités négatives et les débordements sont les deux exploits les plus
 * fréquents des jeux de gestion. Les arrêter au schéma les arrête **avant**
 * toute règle : une valeur absurde n'atteint jamais le domaine, donc le domaine
 * n'a pas à s'en défendre, donc il n'a pas d'endroit où oublier de le faire.
 *
 * La distinction avec un refus de règle de jeu est nette et elle est visible au
 * statut : une orientation à 7 est un **400**, la requête est malformée ; une
 * case obstruée est un **409**, la requête était parfaitement formée et c'est le
 * jeu qui répond non.
 */

const VALID = {
  nature: 'build',
  typeId: 'mine',
  variantId: 'square-4',
  orientation: 0,
  anchorX: 0,
  anchorY: 4,
} as const

function rejects(overrides: Record<string, unknown>): boolean {
  return !WorkIntentV1.safeParse({ ...VALID, ...overrides }).success
}

describe('l’orientation est un quart de tour, entre 0 et 3', () => {
  it.each([0, 1, 2, 3])('accepte %i', (orientation) => {
    expect(rejects({ orientation })).toBe(false)
  })

  /**
   * Sept n'est pas « quatre de plus que trois » : le curseur compte modulo
   * quatre côté client, et une valeur hors bornes ne peut donc venir que d'une
   * requête forgée. La borne est au schéma pour que le domaine n'ait jamais à
   * décider quoi en faire.
   */
  it.each([-1, 4, 7, 360])('refuse %i', (orientation) => {
    expect(rejects({ orientation })).toBe(true)
  })

  it('refuse une orientation non entière', () => {
    expect(rejects({ orientation: 1.5 })).toBe(true)
  })

  it('refuse une orientation absente', () => {
    const { orientation: _unused, ...withoutOrientation } = VALID
    expect(WorkIntentV1.safeParse(withoutOrientation).success).toBe(false)
  })
})

describe('les coordonnées sont bornées à 0..15', () => {
  /**
   * La borne est plus large que la grille 6×6 de 001 : elle borne le
   * **protocole**, pas le contenu. Un archétype futur plus grand ne doit pas
   * imposer une nouvelle version de contrat, et une valeur absurde ne doit pas
   * atteindre le domaine. C'est ce dernier qui refusera une case hors grille,
   * avec le motif exact et en 409 — ce qui est une information de jeu, non une
   * erreur de forme.
   */
  it.each([0, 5, 15])('accepte %i', (value) => {
    expect(rejects({ anchorX: value, anchorY: value })).toBe(false)
  })

  it.each([-1, 16, 1_000, Number.MAX_SAFE_INTEGER])('refuse %i', (value) => {
    expect(rejects({ anchorX: value })).toBe(true)
    expect(rejects({ anchorY: value })).toBe(true)
  })

  it('refuse une coordonnée non entière', () => {
    expect(rejects({ anchorX: 2.5 })).toBe(true)
  })

  it('refuse une coordonnée absente', () => {
    const { anchorY: _unused, ...withoutAnchorY } = VALID
    expect(WorkIntentV1.safeParse(withoutAnchorY).success).toBe(false)
  })
})

describe('les valeurs non numériques n’entrent pas', () => {
  it.each([
    ['NaN', Number.NaN],
    ['l’infini', Number.POSITIVE_INFINITY],
    ['moins l’infini', Number.NEGATIVE_INFINITY],
    ['une chaîne', '0'],
    ['null', null],
    ['un objet', { valueOf: (): number => 0 }],
    ['un tableau', [0]],
  ] as const)('refuse %s en orientation', (_label, value) => {
    expect(rejects({ orientation: value })).toBe(true)
  })

  it.each([
    ['NaN', Number.NaN],
    ['l’infini', Number.POSITIVE_INFINITY],
    ['une chaîne', '4'],
    ['null', null],
  ] as const)('refuse %s en coordonnée', (_label, value) => {
    expect(rejects({ anchorX: value })).toBe(true)
  })
})

describe('les identifiants viennent d’unions littérales fermées', () => {
  it('refuse un type de bâtiment inconnu', () => {
    expect(rejects({ typeId: 'usine' })).toBe(true)
  })

  it('refuse une empreinte inconnue', () => {
    expect(rejects({ variantId: 'square-16' })).toBe(true)
  })

  /**
   * Le schéma ne vérifie **pas** que la variante appartient au type : c'est une
   * règle de jeu, donc un 409 `variant-not-available-for-type`, et elle vit dans
   * le catalogue. Le schéma dit ce qui est *transmissible*, le domaine ce qui
   * est *permis* — les confondre mettrait une table du catalogue dans le
   * protocole, et un rééquilibrage deviendrait une rupture de contrat.
   */
  it('accepte une variante étrangère au type — c’est au domaine de la refuser', () => {
    expect(rejects({ typeId: 'centrale', variantId: 'square-9' })).toBe(false)
  })

  it('refuse un identifiant vide', () => {
    expect(rejects({ typeId: '' })).toBe(true)
    expect(rejects({ variantId: '' })).toBe(true)
  })
})
