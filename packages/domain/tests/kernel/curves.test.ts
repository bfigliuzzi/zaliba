import type { Curve } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { cumulativeCost, evaluateCurve } from '../../src/kernel/curves.js'

/**
 * Les trois courbes nommées de R19.
 *
 * L'enjeu de ce fichier tient en une phrase : **une seule troncature, en fin de
 * calcul**. C'est ce qui rend une valeur reproductible à la main, donc publiable
 * (SC-002). Un arrondi appliqué à chaque niveau ne se raconte pas.
 */

const linear = (base: number, step: number): Curve => ({ kind: 'linear', base, step })
const geometric = (base: number, num: number, den: number): Curve => ({
  kind: 'geometric',
  base,
  num,
  den,
})
const steps = (values: readonly number[]): Curve => ({ kind: 'steps', values })

describe('linear(base, step) = base + step × (n − 1)', () => {
  it.each([
    [1, 10],
    [2, 14],
    [3, 18],
    [10, 46],
  ])('au niveau %i vaut %i', (level, expected) => {
    expect(evaluateCurve(linear(10, 4), level)).toBe(expected)
  })

  it('vaut la base au niveau 1, quel que soit le pas', () => {
    expect(evaluateCurve(linear(7, 999), 1)).toBe(7)
  })

  it('admet un pas nul — une durée plate est une courbe comme une autre', () => {
    for (const level of [1, 5, 30]) {
      expect(evaluateCurve(linear(120, 0), level)).toBe(120)
    }
  })
})

describe('geometric(base, num, den) = ⌊ base × num^(n−1) ÷ den^(n−1) ⌋', () => {
  it('vaut exactement la base au niveau 1 — l’exposant est nul', () => {
    expect(evaluateCurve(geometric(300, 3, 2), 1)).toBe(300)
  })

  /**
   * La table de référence, calculée à la main. Avec base 300 et ratio 3/2 :
   *
   *   niveau 5 → ⌊300 × 3⁴ ÷ 2⁴⌋ = ⌊300 × 81 ÷ 16⌋ = ⌊24300 ÷ 16⌋ = ⌊1518,75⌋ = 1518
   *   niveau 8 → ⌊300 × 3⁷ ÷ 2⁷⌋ = ⌊300 × 2187 ÷ 128⌋ = ⌊656100 ÷ 128⌋ = ⌊5125,78⌋ = 5125
   *
   * Une troncature à chaque niveau suit la même suite jusqu'au niveau 5, puis
   * décroche : c'est le niveau 6 qui sépare les deux implémentations.
   */
  it.each([
    [1, 300],
    [2, 450],
    [3, 675],
    [4, 1012],
    [5, 1518],
    [6, 2278],
    [7, 3417],
    [8, 5125],
  ])('au niveau %i vaut %i, calculé à la main', (level, expected) => {
    expect(evaluateCurve(geometric(300, 3, 2), level)).toBe(expected)
  })

  it('tronque une seule fois — le niveau 6 sépare les deux implémentations', () => {
    /** L'implémentation naïve : une troncature par niveau, la perte s'accumule. */
    const perLevelTruncation = (level: number): number => {
      let value = 300
      for (let n = 2; n <= level; n += 1) value = Math.floor((value * 3) / 2)
      return value
    }

    // Jusqu'au niveau 5, les deux coïncident — c'est ce qui rend la faute
    // difficile à voir : un test qui s'arrêterait là passerait au vert.
    for (const level of [1, 2, 3, 4, 5]) {
      expect(evaluateCurve(geometric(300, 3, 2), level), `niveau ${level}`).toBe(
        perLevelTruncation(level),
      )
    }

    // Puis elles décrochent, et l'écart ne se referme plus.
    // ⌊300 × 3⁵ ÷ 2⁵⌋ = ⌊72900 ÷ 32⌋ = ⌊2278,125⌋ = 2278, contre 2277.
    expect(evaluateCurve(geometric(300, 3, 2), 6)).toBe(2278)
    expect(perLevelTruncation(6)).toBe(2277)

    for (const level of [6, 7, 8]) {
      expect(
        evaluateCurve(geometric(300, 3, 2), level),
        `niveau ${level} devrait diverger de la troncature par niveau`,
      ).not.toBe(perLevelTruncation(level))
    }
  })

  it('reste exact au niveau 30, où un flottant aurait dérivé', () => {
    // ⌊100 × 7^29 ÷ 5^29⌋, en arithmétique entière étendue.
    const expected = Number((100n * 7n ** 29n) / 5n ** 29n)
    expect(evaluateCurve(geometric(100, 7, 5), 30)).toBe(expected)
  })

  it('admet un ratio de 1 — une courbe plate reste une géométrique', () => {
    for (const level of [1, 12, 30]) {
      expect(evaluateCurve(geometric(50, 1, 1), level)).toBe(50)
    }
  })

  it('croît strictement dès que num > den et que la base est suffisante', () => {
    let previous = 0
    for (let level = 1; level <= 30; level += 1) {
      const value = evaluateCurve(geometric(100, 3, 2), level)
      expect(value, `niveau ${level}`).toBeGreaterThan(previous)
      previous = value
    }
  })
})

describe('steps([v₁, v₂, …]) = vₙ', () => {
  it('rend la valeur du rang demandé, indexée à partir de 1', () => {
    const curve = steps([5, 9, 14, 20])
    expect(evaluateCurve(curve, 1)).toBe(5)
    expect(evaluateCurve(curve, 2)).toBe(9)
    expect(evaluateCurve(curve, 3)).toBe(14)
    expect(evaluateCurve(curve, 4)).toBe(20)
  })

  it('refuse un niveau au-delà de la table — c’est une erreur de catalogue', () => {
    expect(() => evaluateCurve(steps([5, 9]), 3)).toThrow()
  })
})

describe('un niveau invalide est une erreur de programmation, pas un cas de jeu', () => {
  it.each([0, -1, 1.5, Number.NaN])('refuse le niveau %s', (level) => {
    expect(() => evaluateCurve(linear(10, 1), level)).toThrow()
  })
})

describe('cumulativeCost — la somme des valeurs déjà tronquées (R9, R19)', () => {
  it('vaut la valeur du niveau 1 au niveau 1', () => {
    expect(cumulativeCost(geometric(300, 3, 2), 1)).toBe(300)
  })

  it('somme les valeurs tronquées, jamais une formule fermée', () => {
    // 300 + 450 + 675 = 1425
    expect(cumulativeCost(geometric(300, 3, 2), 3)).toBe(1425)
  })

  it('coïncide avec la somme explicite pour tout niveau jusqu’à 30', () => {
    const curve = geometric(137, 8, 5)
    for (let level = 1; level <= 30; level += 1) {
      let sum = 0
      for (let k = 1; k <= level; k += 1) sum += evaluateCurve(curve, k)
      expect(cumulativeCost(curve, level), `niveau ${level}`).toBe(sum)
    }
  })

  it('somme aussi une linéaire et une table', () => {
    expect(cumulativeCost(linear(10, 4), 4)).toBe(10 + 14 + 18 + 22)
    expect(cumulativeCost(steps([5, 9, 14]), 3)).toBe(28)
  })

  it('est ce qui rend le remboursement d’une démolition dérivable (R9)', () => {
    // Un bâtiment de niveau 3 a coûté la somme des trois niveaux — jamais une
    // valeur stockée, qu'une migration pourrait rendre fausse.
    const cost = geometric(300, 3, 2)
    expect(cumulativeCost(cost, 3)).toBe(
      evaluateCurve(cost, 1) + evaluateCurve(cost, 2) + evaluateCurve(cost, 3),
    )
  })
})
