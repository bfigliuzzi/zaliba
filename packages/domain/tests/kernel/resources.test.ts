import { describe, expect, it } from 'vitest'
import {
  advanceSegment,
  GRAINS_PER_UNIT,
  gainOver,
  grains,
  ratePerHour,
  saturationAt,
  toDisplayUnits,
} from '../../src/kernel/resources.js'
import { instant } from '../../src/kernel/time.js'

/**
 * Les grandeurs de ressource (R1, R4).
 *
 * Une quantité est un **entier de grains**, où `1 grain = 1/3600 unité`. Ce
 * choix fait tomber la division par 3600 : le gain sur `s` secondes vaut
 * `taux × s` grains, un entier, toujours. C'est ce qui rend la production
 * exacte **et additive** — donc indépendante du nombre de fois où le joueur
 * a agi. Sans cela, agir souvent enrichirait ou appauvrirait.
 */

const HOUR = 3600
const DAY = 24 * HOUR
const THREE_WEEKS = 21 * DAY

describe('le grain vaut un trois-mille-six-centième d’unité', () => {
  it('fixe la constante à 3600', () => {
    expect(GRAINS_PER_UNIT).toBe(3600)
  })

  it('fait qu’un taux de 1 unité/heure produit exactement 1 grain par seconde', () => {
    expect(gainOver(ratePerHour(1), 1)).toBe(1)
    expect(gainOver(ratePerHour(1), HOUR)).toBe(3600)
  })

  it('rend le gain exact et entier pour n’importe quelle durée', () => {
    expect(gainOver(ratePerHour(120), 1)).toBe(120)
    expect(gainOver(ratePerHour(120), 7)).toBe(840)
    expect(gainOver(ratePerHour(120), THREE_WEEKS)).toBe(120 * THREE_WEEKS)
  })

  it('ne produit rien à taux nul, quelle que soit la durée', () => {
    expect(gainOver(ratePerHour(0), THREE_WEEKS)).toBe(0)
  })
})

describe('l’affichage est ⌊grains ÷ 3600⌋', () => {
  it.each([
    [0, 0],
    [1, 0],
    [3599, 0],
    [3600, 1],
    [3601, 1],
    [7199, 1],
    [7200, 2],
  ])('%i grains s’affichent %i', (g, units) => {
    expect(toDisplayUnits(grains(g))).toBe(units)
  })

  it('tronque, et n’arrondit jamais — 3599 grains ne s’affichent pas 1', () => {
    expect(toDisplayUnits(grains(3599))).not.toBe(1)
  })

  it('conserve la fraction : le jeu la garde, l’affichage la cache', () => {
    // Reproductible à la main, ce qu'exige SC-002 : « un taux de 120 par heure
    // donne exactement 120 × secondes écoulées trois-mille-six-centièmes
    // d'unité ; le jeu conserve la fraction et affiche la partie entière. »
    const held = gainOver(ratePerHour(120), 40)
    expect(held).toBe(4800)
    expect(toDisplayUnits(grains(held))).toBe(1)
  })
})

describe('les constructeurs refusent ce qui n’est pas une grandeur', () => {
  it.each([-1, 1.5, Number.NaN])('grains refuse %s', (v) => {
    expect(() => grains(v)).toThrow()
  })

  it.each([-1, 1.5, Number.NaN])('ratePerHour refuse %s', (v) => {
    expect(() => ratePerHour(v)).toThrow()
  })

  it('accepte un taux nul — une planète sans extracteur en est un cas légitime', () => {
    expect(ratePerHour(0)).toBe(0)
  })
})

describe('advanceSegment — plafond et perte (R4)', () => {
  const segment = (amount: number, lost: number, rate: number, seconds: number, cap: number) =>
    advanceSegment({
      amount: grains(amount),
      lost: grains(lost),
      rate: ratePerHour(rate),
      seconds,
      cap: grains(cap),
    })

  it('accumule sans toucher au plafond quand il reste de la place', () => {
    // brut = 0 + 100 × 10 = 1000, sous le plafond de 5000
    expect(segment(0, 0, 100, 10, 5000)).toEqual({ amount: 1000, lost: 0 })
  })

  it('plafonne : q = min(brut, P)', () => {
    // brut = 0 + 100 × 100 = 10000, plafond 5000
    expect(segment(0, 0, 100, 100, 5000)).toEqual({ amount: 5000, lost: 5000 })
  })

  it('comptabilise la perte : perdu = max(0, brut − P)', () => {
    expect(segment(4000, 0, 100, 100, 5000).lost).toBe(4000 + 10_000 - 5000)
  })

  it('cumule la perte avec celle déjà encaissée', () => {
    expect(segment(5000, 777, 100, 10, 5000).lost).toBe(777 + 1000)
  })

  it('ne perd rien quand le plafond est exactement atteint', () => {
    // brut = 4000 + 100 × 10 = 5000, plafond 5000 : rempli au grain près
    expect(segment(4000, 0, 100, 10, 5000)).toEqual({ amount: 5000, lost: 0 })
  })

  it('ne fait rien sur une durée nulle', () => {
    expect(segment(1234, 56, 100, 0, 5000)).toEqual({ amount: 1234, lost: 56 })
  })

  it('reste au plafond une fois saturé, et compte tout ce qui arrive ensuite', () => {
    const result = segment(5000, 0, 100, THREE_WEEKS, 5000)
    expect(result.amount).toBe(5000)
    expect(result.lost).toBe(100 * THREE_WEEKS)
  })
})

describe('l’additivité — la propriété qui porte SC-003 (I-2)', () => {
  const run = (steps: readonly number[], rate: number, cap: number) => {
    let state = { amount: grains(0), lost: grains(0) }
    for (const seconds of steps) {
      const next = advanceSegment({
        amount: state.amount,
        lost: state.lost,
        rate: ratePerHour(rate),
        seconds,
        cap: grains(cap),
      })
      state = { amount: grains(next.amount), lost: grains(next.lost) }
    }
    return state
  }

  it('donne le même résultat en un pas qu’en deux, sous le plafond', () => {
    expect(run([DAY, DAY], 100, 100_000_000)).toEqual(run([2 * DAY], 100, 100_000_000))
  })

  /**
   * Le cas qui compte. Le plafonnement seul n'est pas additif ; le
   * plafonnement **plus le cumul des pertes** l'est. C'est ce qui garantit que
   * la fortune d'un joueur ne dépend pas du nombre de fois où il a agi.
   */
  it('donne le même résultat en un pas qu’en deux, plafond franchi', () => {
    expect(run([HOUR, HOUR], 1000, 1_000_000)).toEqual(run([2 * HOUR], 1000, 1_000_000))
  })

  it('reste additif sur vingt et un pas d’un jour, plafond franchi', () => {
    const daily = Array.from({ length: 21 }, () => DAY)
    expect(run(daily, 500, 10_000_000)).toEqual(run([THREE_WEEKS], 500, 10_000_000))
  })

  it('reste additif sur des pas de longueurs quelconques', () => {
    expect(run([7, 3599, 1, 86_400, 13], 137, 2_000_000)).toEqual(
      run([7 + 3599 + 1 + 86_400 + 13], 137, 2_000_000),
    )
  })
})

describe('saturationAt — l’instant où la ressource cesse de croître (FR-027)', () => {
  const at = (amount: number, cap: number, rate: number) =>
    saturationAt(instant(1000), grains(amount), grains(cap), ratePerHour(rate))

  it('vaut t₀ + ⌈(P − q₀) ÷ r⌉', () => {
    // (5000 − 0) ÷ 100 = 50 exactement
    expect(at(0, 5000, 100)).toBe(1000 + 50)
  })

  it('arrondit vers le haut — la saturation survient à la seconde où elle est atteinte', () => {
    // (5000 − 0) ÷ 300 = 16,67 → 17 secondes
    expect(at(0, 5000, 300)).toBe(1000 + 17)
  })

  it('vaut null à taux nul — la saturation n’arrivera jamais', () => {
    expect(at(0, 5000, 0)).toBeNull()
  })

  it('vaut null si la ressource est déjà saturée', () => {
    expect(at(5000, 5000, 100)).toBeNull()
    expect(at(6000, 5000, 100)).toBeNull()
  })

  it('vaut l’instant courant plus une seconde s’il ne manque qu’un grain', () => {
    expect(at(4999, 5000, 100)).toBe(1001)
  })

  it('est cohérent avec advanceSegment : à cet instant, le plafond est atteint', () => {
    const start = 1000
    const saturation = at(0, 5000, 300)
    expect(saturation).not.toBeNull()
    const seconds = (saturation as number) - start

    const justBefore = advanceSegment({
      amount: grains(0),
      lost: grains(0),
      rate: ratePerHour(300),
      seconds: seconds - 1,
      cap: grains(5000),
    })
    expect(justBefore.amount).toBeLessThan(5000)

    const atSaturation = advanceSegment({
      amount: grains(0),
      lost: grains(0),
      rate: ratePerHour(300),
      seconds,
      cap: grains(5000),
    })
    expect(atSaturation.amount).toBe(5000)
  })
})
