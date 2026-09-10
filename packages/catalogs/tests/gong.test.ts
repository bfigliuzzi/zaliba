import { describe, expect, it } from 'vitest'
import { BUILDING_TYPE_IDS, BUILDINGS } from '../src/buildings.js'
import { GONG_CANONICAL } from '../src/gong.js'
import { OBSTACLE_IDS, OBSTACLES } from '../src/obstacles.js'

/**
 * Le gong canonique dure **dix secondes**, et ce n'est pas un chiffre rond
 * choisi pour l'être : c'est le plus grand commun diviseur exact des quinze
 * durées que le catalogue déclarait avant 003 (G2).
 *
 * Le vérifier ici plutôt que de le croire a une conséquence pratique : le jour
 * où une durée nouvelle entre au catalogue avec un nombre de gongs qui ne
 * tombe pas juste, ce test le dit. Un gong qui ne diviserait plus toutes les
 * durées ferait de la résolution canonique une approximation, et l'égalité
 * stricte de FR-010 tomberait sans que rien ne l'annonce.
 */

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

describe('le gong canonique', () => {
  it('vaut dix secondes, en fraction entière', () => {
    expect(GONG_CANONICAL).toEqual({ num: 10, den: 1 })
  })

  it('divise exactement les quinze durées déclarées', () => {
    const gongs = [
      ...BUILDING_TYPE_IDS.map((id) => BUILDINGS[id].buildDuration.base),
      ...BUILDING_TYPE_IDS.map((id) => BUILDINGS[id].demolitionGongs),
      ...OBSTACLE_IDS.map((id) => OBSTACLES[id].durationGongs),
    ]

    expect(gongs).toHaveLength(15)

    // Les durées sont déclarées en gongs : leur PGCD vaut un, c'est-à-dire
    // exactement un gong. C'est la forme sous laquelle G2 reste vérifiable
    // une fois la bascule faite — avant elle, le même énoncé se lisait « le
    // PGCD des quinze durées en secondes vaut dix ».
    expect(gongs.reduce(gcd)).toBe(1)

    // Et chacune est un entier de gongs : une demi-durée ne se déclare pas.
    for (const value of gongs) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
    }
  })
})
