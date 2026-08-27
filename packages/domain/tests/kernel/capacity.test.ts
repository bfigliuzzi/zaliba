import { BERCEAU, BUILDINGS } from '@zaliba/catalogs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../src/game.js'
import { DEFAULT_CATALOGS } from '../../src/kernel/catalogs.js'
import { evaluateCurve } from '../../src/kernel/curves.js'
import { storageCaps, storageContribution } from '../../src/kernel/rates.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'

/**
 * **Le plafond de stockage : la base du Berceau, plus les entrepôts posés**
 * (FR-025).
 *
 * La formule tient en une ligne, et c'est une exigence — SC-002 promet au joueur de
 * pouvoir refaire n'importe quel chiffre affiché :
 *
 * ```
 * plafond(ressource) = capacité de base de la disposition
 *                    + Σ ⌊capacitéBase × (3/2)^(niveau−1)⌋ sur les entrepôts posés
 * ```
 *
 * **Un entrepôt relève les trois plafonds du même montant**, et c'est un choix de
 * conception que la spécification tranche (§ « Divergences ») : un type unique
 * plutôt que trois entrepôts spécialisés. La conséquence est voulue — la Bave
 * d'étoiles, dont la base est la plus faible, progresse relativement plus vite. Un
 * joueur peut le calculer, et c'est tout ce qu'on lui demande de pouvoir faire.
 *
 * **La capacité n'est jamais dégradée par le déficit d'énergie** (FR-023b, R21).
 * Cette moitié-là est tenue par `energy-capacity.test.ts` ; ce fichier tient
 * l'autre : le plafond *croît* avec les entrepôts, exactement du montant annoncé.
 */

const T0 = instant(1_787_750_000)
const CATALOGS = DEFAULT_CATALOGS
const RESOURCES = CATALOGS.resourceIds
const WAREHOUSE = BUILDINGS.entrepot

function fresh(): PlanetSnapshot {
  return emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt: T0,
    catalogs: CATALOGS,
  })
}

let counter = 0
function placed(
  typeId: PlacedBuilding['typeId'],
  anchor: { x: number; y: number },
  level = 1,
): PlacedBuilding {
  counter += 1
  const variantId = BUILDINGS[typeId].variants[0]
  if (variantId === undefined) throw new Error(`${typeId} n’a aucune variante.`)
  return { id: `b-${counter}`, typeId, variantId, orientation: 0, anchor, level }
}

function withBuildings(...buildings: readonly PlacedBuilding[]): PlanetSnapshot {
  return { ...fresh(), buildings }
}

/** La capacité attendue d'un entrepôt, **recalculée depuis la courbe** du catalogue. */
function expectedCapacity(level: number): number {
  const curve = WAREHOUSE.capacity
  if (curve === null) throw new Error('l’entrepôt n’a pas de courbe de capacité')
  return evaluateCurve(curve, level)
}

describe('le catalogue publie une courbe de capacité pour l’entrepôt (T145)', () => {
  it('l’entrepôt en porte une, et lui seul', () => {
    expect(WAREHOUSE.capacity).not.toBeNull()

    for (const typeId of Object.keys(BUILDINGS) as readonly (keyof typeof BUILDINGS)[]) {
      if (typeId === 'entrepot') continue
      expect(BUILDINGS[typeId].capacity, `${typeId} ne devrait rien stocker`).toBeNull()
    }
  })

  /**
   * **Ce qui stocke n'extrait pas, et ce qui extrait ne stocke pas.** La règle est
   * tenue par un test plutôt que par la forme du type, comme les deux colonnes
   * d'énergie : l'exprimer en TypeScript demanderait une union discriminée qui
   * compliquerait tous les autres champs pour une seule ligne de garantie.
   */
  it('un type qui stocke n’extrait rien', () => {
    for (const typeId of Object.keys(BUILDINGS) as readonly (keyof typeof BUILDINGS)[]) {
      const type = BUILDINGS[typeId]
      if (type.capacity === null) continue
      expect(type.extracts, `${typeId} stocke et extrait`).toBeNull()
      expect(type.production, `${typeId} stocke et produit`).toBeNull()
    }
  })

  it('la capacité est strictement croissante, et toujours positive', () => {
    let previous = 0
    for (let level = 1; level <= WAREHOUSE.maxLevel; level += 1) {
      const capacity = expectedCapacity(level)
      expect(capacity, `niveau ${level}`).toBeGreaterThan(previous)
      previous = capacity
    }
  })

  /**
   * Un plafond doit rester un entier sûr jusqu'au niveau maximal. Une courbe
   * géométrique sur vingt niveaux monte vite, et un dépassement de
   * `MAX_SAFE_INTEGER` ne se manifesterait que comme une arithmétique fausse — le
   * genre de défaut qu'on ne voit qu'en production, chez le seul joueur assez
   * patient pour y arriver.
   */
  it('reste dans les entiers sûrs au niveau maximal', () => {
    const total = BERCEAU.baseCapacityGrains.camelote + expectedCapacity(WAREHOUSE.maxLevel)
    expect(Number.isSafeInteger(total)).toBe(true)
  })
})

describe('storageContribution — ce qu’un bâtiment apporte au plafond', () => {
  it('un entrepôt apporte sa courbe, **aux trois** ressources', () => {
    const contribution = storageContribution(placed('entrepot', { x: 5, y: 5 }, 3), CATALOGS)

    for (const resourceId of RESOURCES) {
      expect(contribution[resourceId], resourceId).toBe(expectedCapacity(3))
    }
  })

  it('tout autre type n’apporte rien', () => {
    for (const typeId of Object.keys(BUILDINGS) as readonly (keyof typeof BUILDINGS)[]) {
      if (typeId === 'entrepot') continue
      const contribution = storageContribution(placed(typeId, { x: 0, y: 0 }, 4), CATALOGS)
      for (const resourceId of RESOURCES) {
        expect(contribution[resourceId] ?? 0, `${typeId} / ${resourceId}`).toBe(0)
      }
    }
  })
})

describe('le plafond vaut la base plus les entrepôts (FR-025)', () => {
  it('sans entrepôt, c’est la base de la disposition, au grain près', () => {
    const caps = storageCaps(fresh(), CATALOGS)
    for (const resourceId of RESOURCES) {
      expect(caps[resourceId]).toBe(BERCEAU.baseCapacityGrains[resourceId])
    }
  })

  it('un entrepôt de niveau 1 relève **les trois** plafonds du même montant', () => {
    const caps = storageCaps(withBuildings(placed('entrepot', { x: 5, y: 5 })), CATALOGS)

    for (const resourceId of RESOURCES) {
      expect(caps[resourceId]).toBe(BERCEAU.baseCapacityGrains[resourceId] + expectedCapacity(1))
    }
  })

  /**
   * **Le plafond augmente exactement du montant annoncé** (US7-1), et l'énoncé est
   * une somme : deux entrepôts de niveaux différents apportent la somme de leurs
   * courbes, pas le maximum ni une moyenne. C'est ce qui rend le calcul refaisable à
   * la main — et ce qui fait qu'un second entrepôt vaut autant que le premier.
   */
  it('deux entrepôts apportent la somme de leurs capacités', () => {
    const caps = storageCaps(
      withBuildings(placed('entrepot', { x: 5, y: 5 }, 1), placed('entrepot', { x: 5, y: 0 }, 4)),
      CATALOGS,
    )

    for (const resourceId of RESOURCES) {
      expect(caps[resourceId]).toBe(
        BERCEAU.baseCapacityGrains[resourceId] + expectedCapacity(1) + expectedCapacity(4),
      )
    }
  })

  it('les autres types de bâtiment ne changent aucun plafond', () => {
    const caps = storageCaps(
      withBuildings(
        placed('mine', { x: 0, y: 4 }),
        placed('centrale', { x: 3, y: 5 }, 7),
        placed('racloir', { x: 3, y: 3 }, 2),
      ),
      CATALOGS,
    )

    for (const resourceId of RESOURCES) {
      expect(caps[resourceId]).toBe(BERCEAU.baseCapacityGrains[resourceId])
    }
  })

  /**
   * La propriété, et non l'exemple : **quel que soit** l'assortiment d'entrepôts, le
   * plafond vaut la base plus la somme de leurs courbes. C'est ce qui interdit qu'un
   * futur rééquilibrage introduise un plafonnement, un rendement décroissant ou un
   * bonus d'adjacence sans que personne s'en aperçoive.
   */
  it('l’additivité tient pour tout assortiment d’entrepôts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: WAREHOUSE.maxLevel }), { maxLength: 8 }),
        (levels) => {
          const snapshot = withBuildings(
            ...levels.map((level, index) => placed('entrepot', { x: index % 6, y: 0 }, level)),
          )
          const expected = levels.reduce((total, level) => total + expectedCapacity(level), 0)
          const caps = storageCaps(snapshot, CATALOGS)

          return RESOURCES.every(
            (resourceId) => caps[resourceId] === BERCEAU.baseCapacityGrains[resourceId] + expected,
          )
        },
      ),
    )
  })
})

describe('le plafond publié dans l’état projeté est celui du calcul (FR-025)', () => {
  /**
   * L'énoncé qui compte pour l'écran : le `cap` que le joueur lit **est** celui que
   * la projection applique. Deux chemins de calcul donneraient deux chiffres justes
   * séparément et incohérents ensemble — et le joueur voit le plafond et la
   * saturation sur le même écran, donc il ne pourrait pas savoir lequel croire.
   */
  it('`ProjectedState.holdings[r].cap` porte la base plus les entrepôts', () => {
    const snapshot = withBuildings(placed('entrepot', { x: 5, y: 5 }, 2))
    const state = projectPlanet(snapshot, CATALOGS, T0)

    for (const resourceId of RESOURCES) {
      expect(state.holdings[resourceId].cap).toBe(
        BERCEAU.baseCapacityGrains[resourceId] + expectedCapacity(2),
      )
    }
  })

  /**
   * **Poser un entrepôt repousse la saturation**, et l'instant publié le dit. C'est
   * la promesse d'US7-2 : le temps restant est calculé au rythme courant, et il
   * s'allonge d'exactement `capacité ajoutée ÷ taux`.
   */
  it('la saturation annoncée s’éloigne d’exactement la capacité ajoutée ÷ le taux', () => {
    const without = projectPlanet(fresh(), CATALOGS, T0)
    const withOne = projectPlanet(withBuildings(placed('entrepot', { x: 5, y: 5 })), CATALOGS, T0)

    for (const resourceId of RESOURCES) {
      const before = without.holdings[resourceId].saturationAt
      const after = withOne.holdings[resourceId].saturationAt
      const rate = without.holdings[resourceId].rate

      // Le Jus mis à part : rien ne le produit hors la base, et sa saturation existe
      // donc bel et bien — mais le taux est le même dans les deux cas.
      if (before === null || after === null) continue
      expect(after - before, resourceId).toBe(Math.ceil(expectedCapacity(1) / rate))
    }
  })
})
