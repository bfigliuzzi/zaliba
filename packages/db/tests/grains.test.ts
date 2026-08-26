import { describe, expect, it } from 'vitest'
import { grainsFromDb, grainsToDb, instantFromDb, instantToDb } from '../src/conversions.js'

/**
 * Les conversions de frontière de `packages/db`.
 *
 * Deux grandeurs traversent ici, et chacune a un piège propre.
 *
 * **Les grains** sont des `bigint` en base et des `number` dans le domaine. Aux
 * échelles du jeu, ils restent très loin de `2⁵³` : une planète produisant mille
 * unités par heure sans discontinuer mettrait plus de deux cent quatre-vingt
 * mille ans à l'atteindre. La conversion est donc sûre — **aujourd'hui**. Ce que
 * l'assertion protège, c'est le jour où un rééquilibrage, un nouveau bâtiment ou
 * une redéfinition du grain rapprocherait la borne : sans elle, le dépassement
 * se manifesterait par une quantité de ressource silencieusement fausse chez un
 * joueur. Avec elle, il se manifeste par une erreur bruyante en CI.
 *
 * **Les instants** sont des `timestamptz` en base et des entiers de secondes
 * dans le domaine. La conversion tronque vers le bas (R2), jamais n'arrondit :
 * une ressource ne doit pas pouvoir être créditée pour une seconde qui n'a pas
 * eu lieu.
 */

describe('grainsFromDb — bigint vers number', () => {
  it.each([0n, 1n, 3600n, 1_000_000n, 9_007_199_254_740_991n])(
    'convertit %s sans perte',
    (value) => {
      expect(grainsFromDb(value)).toBe(Number(value))
    },
  )

  it('convertit la borne exacte de sûreté, 2⁵³ − 1', () => {
    expect(grainsFromDb(9_007_199_254_740_991n)).toBe(Number.MAX_SAFE_INTEGER)
  })

  /**
   * Le cœur du fichier. `Number(9007199254740993n)` rend `9007199254740992` —
   * silencieusement faux. C'est exactement le genre de perte qu'on refuse.
   */
  it('refuse bruyamment au-delà de 2⁵³ − 1, plutôt que de perdre un grain', () => {
    expect(() => grainsFromDb(9_007_199_254_740_992n)).toThrow(/sûreté|2\^53|dépassement/i)
    expect(() => grainsFromDb(9_007_199_254_740_993n)).toThrow()
  })

  it('nomme la valeur fautive dans son message — sans quoi l’erreur n’aide pas', () => {
    expect(() => grainsFromDb(10_000_000_000_000_000n)).toThrow(/10000000000000000/)
  })

  it('refuse une quantité négative — la base l’interdit déjà, la frontière aussi', () => {
    expect(() => grainsFromDb(-1n)).toThrow()
  })
})

describe('grainsToDb — number vers bigint', () => {
  it.each([0, 1, 3600, 1_000_000])('convertit %i sans perte', (value) => {
    expect(grainsToDb(value)).toBe(BigInt(value))
  })

  it('fait un aller-retour fidèle', () => {
    for (const value of [0, 1, 3599, 3600, 123_456_789]) {
      expect(grainsFromDb(grainsToDb(value))).toBe(value)
    }
  })

  it.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuse %s', (value) => {
    expect(() => grainsToDb(value)).toThrow()
  })
})

describe('instantFromDb — timestamptz vers entier de secondes (R2)', () => {
  it('tronque vers le bas', () => {
    expect(instantFromDb(new Date('2026-08-26T10:00:00.000Z'))).toBe(1_787_738_400)
    expect(instantFromDb(new Date('2026-08-26T10:00:00.999Z'))).toBe(1_787_738_400)
  })

  it('n’arrondit jamais vers le haut', () => {
    const almostNextSecond = new Date('2026-08-26T10:00:00.999Z')
    expect(instantFromDb(almostNextSecond)).not.toBe(1_787_738_401)
  })

  it('refuse une date invalide', () => {
    expect(() => instantFromDb(new Date('pas une date'))).toThrow()
  })
})

describe('instantToDb — entier de secondes vers Date', () => {
  it('fait un aller-retour fidèle à la seconde', () => {
    for (const seconds of [0, 1, 1_787_738_400]) {
      expect(instantFromDb(instantToDb(seconds))).toBe(seconds)
    }
  })

  it('produit une date dont les millisecondes sont nulles', () => {
    expect(instantToDb(1_787_738_400).getMilliseconds()).toBe(0)
  })

  it.each([-1, 1.5, Number.NaN])('refuse %s', (value) => {
    expect(() => instantToDb(value)).toThrow()
  })
})
