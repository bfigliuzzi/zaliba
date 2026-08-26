import { describe, expect, it } from 'vitest'
import {
  addDuration,
  duration,
  instant,
  instantFromMillis,
  secondsBetween,
} from '../../src/kernel/time.js'

/**
 * Le modèle de temps (R2).
 *
 * `Instant` est un **entier de secondes UTC**. Pas de millisecondes : `taux × s`
 * cesserait d'être entier, ce qui détruirait R1. Pas de minutes : la promesse
 * est l'exactitude à la seconde.
 *
 * Et surtout : **aucune fonction de ce module n'appelle l'horloge système.**
 * L'instant est toujours un argument. C'est ce qui rend testable un jeu dont le
 * sujet est le temps.
 */

const HOUR = 3600
const DAY = 24 * HOUR
const THREE_WEEKS = 21 * DAY

describe('Instant — un entier de secondes UTC', () => {
  it('accepte zéro : l’époque est un instant comme un autre', () => {
    expect(instant(0)).toBe(0)
  })

  it('accepte un instant lointain sans perdre la seconde', () => {
    expect(instant(1_787_745_600)).toBe(1_787_745_600)
  })

  it.each([-1, 1.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuse %s — ce n’est pas un entier de secondes ≥ 0',
    (value) => {
      expect(() => instant(value)).toThrow()
    },
  )
})

describe('Duration — un entier de secondes, strictement positif pour un chantier', () => {
  it('accepte une seconde : c’est le plus court chantier concevable', () => {
    expect(duration(1)).toBe(1)
  })

  it('refuse zéro — un chantier instantané n’est pas un chantier', () => {
    expect(() => duration(0)).toThrow()
  })

  it.each([-1, -3600, 1.5, Number.NaN])('refuse %s', (value) => {
    expect(() => duration(value)).toThrow()
  })
})

describe('la conversion depuis les millisecondes tronque vers le bas (R2)', () => {
  it.each([
    [0, 0],
    [999, 0],
    [1000, 1],
    [1001, 1],
    [1999, 1],
    [1_787_745_600_999, 1_787_745_600],
  ])('%i ms donne %i s', (millis, seconds) => {
    expect(instantFromMillis(millis)).toBe(seconds)
  })

  it('tronque, et n’arrondit jamais — 1999 ms ne donne pas 2 s', () => {
    expect(instantFromMillis(1999)).not.toBe(2)
  })

  it('refuse une valeur négative', () => {
    expect(() => instantFromMillis(-1)).toThrow()
  })
})

describe('l’arithmétique du temps', () => {
  it('ajoute une durée à un instant', () => {
    expect(addDuration(instant(1000), duration(HOUR))).toBe(1000 + HOUR)
  })

  it('mesure l’écart entre deux instants', () => {
    expect(secondsBetween(instant(1000), instant(1000 + THREE_WEEKS))).toBe(THREE_WEEKS)
  })

  it('donne zéro pour deux instants égaux', () => {
    expect(secondsBetween(instant(42), instant(42))).toBe(0)
  })

  /**
   * Remonter le temps est une **erreur de programmation, pas un cas de jeu**
   * (data-model § 1.3). Retourner un écart négatif laisserait la faute se
   * propager en silence jusqu'à une quantité de ressource fausse.
   */
  it('refuse de mesurer un écart négatif', () => {
    expect(() => secondsBetween(instant(1000), instant(999))).toThrow()
  })
})

describe('exactitude sur trois semaines (SC-003)', () => {
  it('n’accumule aucune dérive : la somme des pas vaut le pas unique', () => {
    const start = instant(1_700_000_000)
    let stepped: number = start
    for (let day = 0; day < 21; day += 1) {
      stepped = addDuration(instant(stepped), duration(DAY))
    }
    expect(stepped).toBe(addDuration(start, duration(THREE_WEEKS)))
  })
})

describe('l’horloge est un paramètre, jamais un appel', () => {
  /**
   * Ce test ne vérifie pas un comportement : il vérifie une **absence**. Aucune
   * fonction exportée ne doit pouvoir produire un instant sans qu'on le lui
   * donne. La constitution en fait une règle, et une règle non testée est une
   * intention.
   */
  it('deux appels identiques à un instant donné rendent la même valeur', () => {
    const a = addDuration(instant(1000), duration(60))
    const b = addDuration(instant(1000), duration(60))
    expect(a).toBe(b)
  })

  it('n’expose aucune fonction dont le nom promette l’instant courant', async () => {
    const timeModule = await import('../../src/kernel/time.js')
    const suspicious = Object.keys(timeModule).filter((name) => /now|current|today/i.test(name))
    expect(suspicious).toEqual([])
  })
})
