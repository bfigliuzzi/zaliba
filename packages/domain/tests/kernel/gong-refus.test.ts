import type { GongLength } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { DECLARED_CATALOGS } from '../../src/kernel/catalogs.js'
import { resolveCatalogs } from '../../src/kernel/gong.js'

/**
 * **Une longueur dont un taux ne se résout pas en entier est refusée** (FR-006).
 *
 * L'exactitude à la seconde de R1 tient à ce que tous les taux soient des
 * entiers de grains par seconde : c'est ce qui permet à la projection de
 * n'employer que de l'arithmétique entière et de donner le même chiffre au
 * client et au serveur. Un taux fractionnaire y introduirait un arrondi par
 * segment de temps, donc une dérive — et une dérive silencieuse, puisque
 * chaque valeur prise séparément aurait l'air juste.
 *
 * Le refus **nomme la ressource et le type fautifs**. Un message générique
 * laisserait l'exploitant deviner quelle longueur essayer ensuite, et la
 * seule information utile — quel taux ne tombe pas juste — est justement celle
 * que le calcul vient de produire.
 */

describe('resolveCatalogs refuse une longueur qui casse l’exactitude des taux', () => {
  /**
   * Sept secondes ne divisent ni 150, ni 80, ni 40 : les trois extracteurs
   * échouent, et le premier rencontré est nommé.
   */
  const Seven: GongLength = { num: 7, den: 1 }

  it('lève une RangeError', () => {
    expect(() => resolveCatalogs(DECLARED_CATALOGS, Seven)).toThrow(RangeError)
  })

  it('nomme la ressource et le type fautifs, pas seulement l’échec', () => {
    let message = ''
    try {
      resolveCatalogs(DECLARED_CATALOGS, Seven)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    // Le type qui porte le taux, la ressource qu'il extrait, et la longueur
    // refusée : les trois sont nécessaires pour choisir la longueur suivante.
    expect(message).toContain('mine')
    expect(message).toContain('camelote')
    expect(message).toContain('7')
  })

  it('accepte toute longueur qui divise les trois taux', () => {
    // 150, 80 et 40 sont tous divisibles par 10 et par 2 ; et multiplier par
    // un dénominateur ne peut pas casser une divisibilité.
    expect(() => resolveCatalogs(DECLARED_CATALOGS, { num: 10, den: 1 })).not.toThrow()
    expect(() => resolveCatalogs(DECLARED_CATALOGS, { num: 1, den: 2 })).not.toThrow()
    expect(() => resolveCatalogs(DECLARED_CATALOGS, { num: 1, den: 6 })).not.toThrow()
    expect(() => resolveCatalogs(DECLARED_CATALOGS, { num: 5, den: 1 })).not.toThrow()
  })

  /**
   * Le refus est celui d'une **longueur**, donc il porte sur la fraction
   * entière et non sur sa valeur décimale : `{ 20, 2 }` vaut dix secondes et
   * doit passer, sans qu'on ait eu besoin de réduire la fraction d'abord.
   */
  it('juge la fraction sur ce qu’elle vaut, pas sur son écriture', () => {
    expect(() => resolveCatalogs(DECLARED_CATALOGS, { num: 20, den: 2 })).not.toThrow()
    expect(
      resolveCatalogs(DECLARED_CATALOGS, { num: 20, den: 2 }).buildings.mine.production?.base,
    ).toBe(15)
  })
})
