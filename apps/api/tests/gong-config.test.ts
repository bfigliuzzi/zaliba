import { describe, expect, it } from 'vitest'
import { parseGongSeconds } from '../src/config/gong.js'

/**
 * **La lecture de `GONG_SECONDS`, et ses refus** (FR-007).
 *
 * La fonction vit hors de `main.ts` parce que ce qui doit être éprouvé n'a rien
 * à faire dans un point d'entrée qu'aucun test ne monte. C'est la même raison
 * qui a fait sortir les routes du point d'entrée en 001.
 *
 * **Chaque refus nomme la variable et la valeur**, et ce n'est pas de la
 * courtoisie : un serveur qui bat au mauvais rythme est indétectable de
 * l'intérieur, donc le seul moment où l'exploitant peut corriger est celui du
 * démarrage, et le seul endroit où il lit est le message.
 */

describe('parseGongSeconds accepte les formes valides', () => {
  it('lit un entier de secondes', () => {
    expect(parseGongSeconds('10')).toEqual({ num: 10, den: 1 })
    expect(parseGongSeconds('1')).toEqual({ num: 1, den: 1 })
  })

  it('lit une fraction entière', () => {
    expect(parseGongSeconds('1/2')).toEqual({ num: 1, den: 2 })
    expect(parseGongSeconds('1/6')).toEqual({ num: 1, den: 6 })
  })

  it('tolère les espaces autour, qu’un fichier .env laisse traîner', () => {
    expect(parseGongSeconds(' 10 ')).toEqual({ num: 10, den: 1 })
    expect(parseGongSeconds('1 / 2')).toEqual({ num: 1, den: 2 })
  })
})

describe('parseGongSeconds refuse tout le reste, en nommant la variable et la valeur', () => {
  /**
   * `1.5` mérite son cas : c'est la forme qu'on écrirait spontanément, et c'est
   * celle qui rendrait les durées du jeu dépendantes de la représentation
   * binaire d'un flottant (G3). Le message doit donc dire quoi écrire à la
   * place, pas seulement que c'est faux.
   */
  it.each([
    ['absente', undefined],
    ['vide', ''],
    ['espaces seuls', '   '],
    ['nulle', '0'],
    ['négative', '-3'],
    ['non numérique', 'abc'],
    ['flottante', '1.5'],
    ['de dénominateur nul', '1/0'],
    ['de dénominateur négatif', '1/-2'],
    ['de numérateur nul', '0/5'],
    ['à trois termes', '1/2/3'],
  ])('refuse une valeur %s', (_label, raw) => {
    expect(() => parseGongSeconds(raw)).toThrow()
  })

  it('nomme la variable dans chaque message', () => {
    for (const raw of [undefined, '', '0', '-3', 'abc', '1.5', '1/0']) {
      let message = ''
      try {
        parseGongSeconds(raw)
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message, `pour ${String(raw)}`).toContain('GONG_SECONDS')
    }
  })

  it('cite la valeur fautive, pour que l’exploitant sache ce qu’il a écrit', () => {
    for (const raw of ['0', '-3', 'abc', '1.5', '1/0']) {
      let message = ''
      try {
        parseGongSeconds(raw)
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message, `pour ${raw}`).toContain(raw)
    }
  })

  it('dit quoi écrire à la place d’un flottant', () => {
    let message = ''
    try {
      parseGongSeconds('1.5')
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    // La forme de rechange, littéralement : une fraction entière.
    expect(message).toMatch(/3\/2|fraction/)
  })
})
