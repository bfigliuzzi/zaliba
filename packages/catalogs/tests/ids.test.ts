import { describe, expect, it } from 'vitest'
import { BUILDING_TYPE_IDS, BUILDINGS } from '../src/buildings.js'
import { CURVE_KINDS } from '../src/curves.js'
import { FOOTPRINT_IDS, FOOTPRINTS } from '../src/footprints.js'
import { ARCHETYPE_IDS, ARCHETYPES, BERCEAU, LAYOUT_IDS, LAYOUTS } from '../src/layouts/berceau.js'
import { OBSTACLE_IDS, OBSTACLES } from '../src/obstacles.js'
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
  { name: 'obstacles', ids: OBSTACLE_IDS, record: OBSTACLES },
  { name: 'buildings', ids: BUILDING_TYPE_IDS, record: BUILDINGS },
  { name: 'layouts', ids: LAYOUT_IDS, record: LAYOUTS },
  { name: 'archetypes', ids: ARCHETYPE_IDS, record: ARCHETYPES },
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

describe('aucune référence ne pointe dans le vide', () => {
  /**
   * Le cœur de ce fichier. Un catalogue qui pointe à côté **compile
   * parfaitement** et échoue à l'exécution, chez le joueur — c'est le genre de
   * faute qu'aucune relecture n'attrape et qu'une boucle attrape toujours.
   */
  it('chaque variante de bâtiment nomme une empreinte existante', () => {
    for (const typeId of BUILDING_TYPE_IDS) {
      for (const variantId of BUILDINGS[typeId].variants) {
        expect(FOOTPRINT_IDS).toContain(variantId)
      }
    }
  })

  it('chaque ressource extraite existe', () => {
    for (const typeId of BUILDING_TYPE_IDS) {
      const extracted = BUILDINGS[typeId].extracts
      if (extracted !== null) expect(RESOURCE_IDS).toContain(extracted)
    }
  })

  it('chaque coût de bâtiment est libellé dans une ressource existante', () => {
    for (const typeId of BUILDING_TYPE_IDS) {
      for (const resourceId of Object.keys(BUILDINGS[typeId].cost)) {
        expect(RESOURCE_IDS).toContain(resourceId)
      }
    }
  })

  it('chaque coût de déblaiement est libellé dans une ressource existante', () => {
    for (const obstacleId of OBSTACLE_IDS) {
      for (const resourceId of Object.keys(OBSTACLES[obstacleId].cost)) {
        expect(RESOURCE_IDS).toContain(resourceId)
      }
    }
  })

  it('chaque gisement révélé par un obstacle nomme une ressource existante', () => {
    for (const obstacleId of OBSTACLE_IDS) {
      const reveals = OBSTACLES[obstacleId].reveals
      if (reveals.kind === 'deposit') expect(RESOURCE_IDS).toContain(reveals.resourceId)
    }
  })

  it('chaque case obstruée nomme un obstacle existant', () => {
    for (const cell of BERCEAU.cells) {
      if (cell.obstacleId !== null) expect(OBSTACLE_IDS).toContain(cell.obstacleId)
    }
  })

  it('chaque gisement de la disposition nomme une ressource existante', () => {
    for (const cell of BERCEAU.cells) {
      if (cell.depositOf !== null) expect(RESOURCE_IDS).toContain(cell.depositOf)
    }
  })

  it('chaque archétype renvoie à une disposition existante', () => {
    for (const archetypeId of ARCHETYPE_IDS) {
      expect(LAYOUT_IDS).toContain(ARCHETYPES[archetypeId].layoutId)
    }
  })

  it('la production, la capacité et le stock couvrent exactement les ressources', () => {
    for (const table of [
      BERCEAU.baseProductionPerGong,
      BERCEAU.baseCapacityGrains,
      BERCEAU.startingStockGrains,
    ]) {
      expect(Object.keys(table).sort()).toEqual([...RESOURCE_IDS].sort())
    }
  })

  /**
   * Le sens inverse, qui se néglige : une ressource que **rien** n'extrait
   * n'est pas une faute — le Jus attend ses débouchés (R22) —, mais une
   * empreinte que rien n'emploie est du vocabulaire mort qu'il vaut mieux
   * constater que découvrir.
   */
  it('n’expose aucune empreinte orpheline', () => {
    const used = new Set(BUILDING_TYPE_IDS.flatMap((typeId) => BUILDINGS[typeId].variants))
    expect([...used].sort()).toEqual([...FOOTPRINT_IDS].sort())
  })

  it('n’expose aucun type d’obstacle inutilisé par la disposition', () => {
    const used = new Set(
      BERCEAU.cells
        .map((cell) => cell.obstacleId)
        .filter((id): id is NonNullable<typeof id> => id !== null),
    )
    expect([...used].sort()).toEqual([...OBSTACLE_IDS].sort())
  })
})
