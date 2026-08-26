import { describe, expect, it } from 'vitest'
import { CURVE_KINDS } from '../src/curves.js'
import { FOOTPRINT_IDS, FOOTPRINTS } from '../src/footprints.js'
import { RESOURCE_IDS, RESOURCES } from '../src/resources.js'

/**
 * Cohérence des identifiants de catalogue (data-model § 1.8).
 *
 * Trois propriétés, et une seule idée : **un identifiant référencé quelque part
 * existe ailleurs**. Un catalogue qui pointe dans le vide compile parfaitement
 * et échoue à l'exécution, chez le joueur. C'est le genre de faute qu'aucune
 * relecture n'attrape et qu'une boucle attrape toujours.
 *
 * Ce fichier grandit avec le catalogue : les obstacles, les types de bâtiment
 * et les dispositions viennent s'y brancher en US1 et US2.
 */

/** Les registres du catalogue, appariés à leur liste d'identifiants. */
const registries = [
  { name: 'resources', ids: RESOURCE_IDS, record: RESOURCES },
  { name: 'footprints', ids: FOOTPRINT_IDS, record: FOOTPRINTS },
] as const

describe('aucun doublon', () => {
  it.each(registries)('$name ne nomme jamais deux fois le même identifiant', ({ ids }) => {
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('aucun orphelin dans les deux sens', () => {
  it.each(registries)(
    '$name : chaque identifiant listé a son entrée, et réciproquement',
    ({ ids, record }) => {
      expect([...ids].sort()).toEqual(Object.keys(record).sort())
    },
  )

  it.each(registries)('$name : chaque entrée porte la clé sous laquelle elle vit', ({ record }) => {
    for (const [key, entry] of Object.entries(record)) {
      expect((entry as { id: string }).id).toBe(key)
    }
  })
})

describe('le vocabulaire de courbes est fermé', () => {
  it('nomme les trois formes de R19, et pas une de plus', () => {
    expect([...CURVE_KINDS].sort()).toEqual(['geometric', 'linear', 'steps'])
  })

  it('ne répète aucune forme', () => {
    expect(new Set(CURVE_KINDS).size).toBe(CURVE_KINDS.length)
  })
})

describe('les identifiants suivent la convention de langue (R18)', () => {
  /**
   * Structure du code en anglais, **contenu de jeu** en kebab-case français.
   * Ces identifiants-ci sont du contenu : ce sont des noms propres du jeu.
   */
  const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/

  it.each(registries)('$name : tout identifiant est en kebab-case', ({ ids }) => {
    for (const id of ids) {
      expect(id, `${id} n’est pas en kebab-case`).toMatch(kebab)
    }
  })
})

describe('les trois ressources de 001', () => {
  it('sont exactement camelote, jus et bave-etoiles', () => {
    expect([...RESOURCE_IDS].sort()).toEqual(['bave-etoiles', 'camelote', 'jus'])
  })

  it('déclarent chacune leurs emplois, dont le Jus qui n’en a aucun en 001 (R22)', () => {
    expect(RESOURCES['jus'].uses).toEqual([])
    expect(RESOURCES['camelote'].uses).toContain('construction')
    expect(RESOURCES['bave-etoiles'].uses).toContain('construction')
  })
})
