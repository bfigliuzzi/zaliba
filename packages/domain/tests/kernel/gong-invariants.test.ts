import type { GongLength } from '@zaliba/catalogs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DECLARED_CATALOGS } from '../../src/kernel/catalogs.js'
import { resolveCatalogs } from '../../src/kernel/gong.js'

/**
 * **Ce que la résolution ne touche jamais, à aucune longueur** (FR-004, G13).
 *
 * Coûts, capacités, énergie consommée et produite, empreintes, variantes,
 * plafonds de niveau, fraction de remboursement, gisements et dispositions : rien
 * de tout cela n'a de dimension de temps, et rien de tout cela ne doit bouger
 * quand le serveur change de rythme.
 *
 * La propriété est éprouvée **sur toutes les longueurs** plutôt que sur trois
 * exemples, parce que c'est une propriété d'omission : le risque n'est pas
 * qu'elle échoue au gong canonique — elle y est triviale — mais qu'une
 * résolution ajoutée plus tard, avec les meilleures intentions, se mette à
 * diviser une capacité ou une consommation d'énergie « pour rester cohérente ».
 * Une omission ne se voit pas en relisant du code ; elle se voit ici.
 *
 * Le générateur ne produit que des longueurs **utilisables** : les taux du
 * catalogue — 150, 80 et 40 grains par gong — doivent se résoudre en entiers,
 * sans quoi `resolveCatalogs` refuse (FR-006), ce que le fichier voisin éprouve.
 */

/**
 * Des longueurs qui divisent les trois taux : `n / d` avec `n ∈ {1, 2, 5, 10}`.
 *
 * 150, 80 et 40 sont tous divisibles par 1, 2, 5 et 10 ; multiplier par un
 * dénominateur quelconque ne peut pas casser une divisibilité, puisque la
 * résolution d'un taux vaut `grainsParGong × den ÷ num`.
 */
const gongLength: fc.Arbitrary<GongLength> = fc.record({
  num: fc.constantFrom(1, 2, 5, 10),
  den: fc.integer({ min: 1, max: 240 }),
})

describe('la résolution ne touche aucune grandeur sans dimension de temps', () => {
  it('laisse coûts, capacités, énergie, empreintes et bornes strictement identiques', () => {
    fc.assert(
      fc.property(gongLength, (gong) => {
        const resolved = resolveCatalogs(DECLARED_CATALOGS, gong)

        for (const id of Object.keys(
          DECLARED_CATALOGS.buildings,
        ) as (keyof typeof DECLARED_CATALOGS.buildings)[]) {
          const declared = DECLARED_CATALOGS.buildings[id]
          const become = resolved.buildings[id]

          expect(become.cost, `${id} — coût`).toEqual(declared.cost)
          expect(become.capacity, `${id} — capacité`).toEqual(declared.capacity)
          expect(become.energyConsumption, `${id} — énergie −`).toEqual(declared.energyConsumption)
          expect(become.energyProduction, `${id} — énergie +`).toEqual(declared.energyProduction)
          expect(become.variants, `${id} — variantes`).toEqual(declared.variants)
          expect(become.maxLevel, `${id} — plafond`).toBe(declared.maxLevel)
          expect(become.refund, `${id} — remboursement`).toEqual(declared.refund)
          expect(become.extracts, `${id} — ressource extraite`).toBe(declared.extracts)
        }

        for (const id of Object.keys(
          DECLARED_CATALOGS.obstacles,
        ) as (keyof typeof DECLARED_CATALOGS.obstacles)[]) {
          expect(resolved.obstacles[id].cost, `${id} — coût`).toEqual(
            DECLARED_CATALOGS.obstacles[id].cost,
          )
          expect(resolved.obstacles[id].reveals, `${id} — révèle`).toEqual(
            DECLARED_CATALOGS.obstacles[id].reveals,
          )
        }
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **La géométrie d'une disposition ne bouge pas ; sa production de base, si.**
   *
   * La distinction est la seule subtilité de G13, et elle a failli être ratée :
   * les documents de conception écartaient « les dispositions » en bloc de la
   * résolution. Or la production de base est un **taux** — la seule grandeur
   * d'une disposition qui ait une dimension de temps, et la seule source de
   * revenu d'une planète fraîche. Ne pas la résoudre laisserait le premier
   * écran du jeu battre au rythme canonique sur un serveur rapide, ce que
   * SC-002 interdit.
   *
   * Le test tient donc les deux moitiés : tout ce qui est géométrique est
   * intact, et le taux suit le rapport.
   */
  it('laisse la géométrie des dispositions intacte, et résout leur production', () => {
    fc.assert(
      fc.property(gongLength, (gong) => {
        const resolved = resolveCatalogs(DECLARED_CATALOGS, gong)

        for (const id of Object.keys(
          DECLARED_CATALOGS.layouts,
        ) as (keyof typeof DECLARED_CATALOGS.layouts)[]) {
          const declared = DECLARED_CATALOGS.layouts[id]
          const become = resolved.layouts[id]

          expect(become.cells, `${id} — cases`).toEqual(declared.cells)
          expect(become.width, `${id} — largeur`).toBe(declared.width)
          expect(become.height, `${id} — hauteur`).toBe(declared.height)
          expect(become.baseCapacityGrains, `${id} — plafond de base`).toEqual(
            declared.baseCapacityGrains,
          )
          expect(become.baseEnergy, `${id} — énergie de base`).toBe(declared.baseEnergy)
          expect(become.startingStockGrains, `${id} — stock de départ`).toEqual(
            declared.startingStockGrains,
          )

          // Et le taux, lui, se résout : grains par gong × den ÷ num.
          for (const resourceId of DECLARED_CATALOGS.resourceIds) {
            expect(become.baseProductionPerHour[resourceId], `${id} — ${resourceId}`).toBe(
              ((declared.baseProductionPerGong[resourceId] ?? 0) * gong.den) / gong.num,
            )
          }
        }

        expect(resolved.archetypes).toEqual(DECLARED_CATALOGS.archetypes)
        expect(resolved.footprints).toEqual(DECLARED_CATALOGS.footprints)
        expect(resolved.resourceIds).toEqual(DECLARED_CATALOGS.resourceIds)
        expect(resolved.version).toBe(DECLARED_CATALOGS.version)
      }),
      { numRuns: 100 },
    )
  })

  /** Et la longueur employée est toujours celle qu'on a donnée (G10). */
  it('recopie la longueur employée, toujours', () => {
    fc.assert(
      fc.property(gongLength, (gong) => {
        expect(resolveCatalogs(DECLARED_CATALOGS, gong).gong).toEqual(gong)
      }),
      { numRuns: 100 },
    )
  })
})
