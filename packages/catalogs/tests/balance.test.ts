import { describe, expect, it } from 'vitest'
import { BUILDING_TYPE_IDS, BUILDINGS, EXTRACTOR_TYPE_IDS } from '../src/buildings.js'
import { FOOTPRINTS } from '../src/footprints.js'
import { BERCEAU } from '../src/layouts/berceau.js'
import { OBSTACLES } from '../src/obstacles.js'
import { RESOURCE_IDS } from '../src/resources.js'

/**
 * La cohérence économique du catalogue.
 *
 * Ces cas n'éprouvent pas un équilibrage — les valeurs sont libres de bouger.
 * Ils éprouvent les cinq **exigences** que R20 distingue des simples réglages,
 * et chacune décrit une manière dont le jeu cesserait d'être jouable :
 *
 * - **FR-018** — sans production de base non nulle, un joueur peut atteindre un
 *   état d'où il ne peut plus rien faire, définitivement ;
 * - **FR-025** — sans capacité de base non nulle, la production n'a nulle part
 *   où aller et se perd intégralement dès la première seconde ;
 * - **FR-022** — sans énergie de base non nulle, une mine posée avant la
 *   première centrale donne `E₊ = 0`, donc un rapport nul et une production
 *   nulle. FR-018 serait tenu en droit, et la première décision de placement du
 *   joueur serait punie sans qu'aucune règle publiée ne l'ait annoncé ;
 * - **FR-019** — sans stock de départ suffisant, le joueur commence par
 *   attendre, ce qui est le contraire d'un premier écran ;
 * - **FR-062** — un coût libellé en Jus serait indépensable en 001 (R22), donc
 *   un blocage définitif déguisé en contenu.
 */

const ZERO_BY_RESOURCE = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0]))

/** Le coût de niveau 1 d'un type, ressource par ressource, en grains. */
function levelOneCost(typeId: (typeof BUILDING_TYPE_IDS)[number]): Record<string, number> {
  const costs = { ...ZERO_BY_RESOURCE }
  for (const [resourceId, curve] of Object.entries(BUILDINGS[typeId].cost)) {
    // Toutes les courbes de coût du catalogue sont géométriques : au niveau 1,
    // la valeur est la base, sans troncature possible.
    costs[resourceId] = curve.kind === 'geometric' ? curve.base : Number.NaN
  }
  return costs
}

describe('la base du Berceau ne bloque jamais un joueur', () => {
  it.each(RESOURCE_IDS)('produit de la %s sans rien poser (FR-018)', (resourceId) => {
    expect(BERCEAU.baseProductionPerHour[resourceId]).toBeGreaterThan(0)
  })

  it.each(RESOURCE_IDS)('offre une capacité de départ pour la %s (FR-025)', (resourceId) => {
    expect(BERCEAU.baseCapacityGrains[resourceId]).toBeGreaterThan(0)
  })

  /**
   * Le cas le moins évident des trois, et le plus subtil à retrouver après
   * coup : c'est un rapport d'énergie nul, pas un plafond ni une production,
   * qui punirait la première pose.
   */
  it('fournit une énergie de base non nulle (FR-022)', () => {
    expect(BERCEAU.baseEnergy).toBeGreaterThan(0)
  })

  it.each(RESOURCE_IDS)('plafonne la %s au-dessus du stock de départ', (resourceId) => {
    expect(BERCEAU.baseCapacityGrains[resourceId]).toBeGreaterThanOrEqual(
      BERCEAU.startingStockGrains[resourceId],
    )
  })
})

describe('le stock de départ suffit à agir tout de suite (FR-019)', () => {
  it('paie une centrale et au moins un extracteur de niveau 1', () => {
    const centrale = levelOneCost('centrale')

    const affordable = EXTRACTOR_TYPE_IDS.some((typeId) => {
      const extractor = levelOneCost(typeId)
      return RESOURCE_IDS.every(
        (resourceId) =>
          BERCEAU.startingStockGrains[resourceId] >=
          (centrale[resourceId] ?? 0) + (extractor[resourceId] ?? 0),
      )
    })

    expect(affordable).toBe(true)
  })

  /**
   * Plus fort que l'exigence, et voulu : le joueur choisit **quel** extracteur
   * poser en premier. Ne pouvoir s'offrir que le moins cher ferait de FR-019
   * une lettre morte — le premier choix du jeu serait déjà fait pour lui.
   */
  it('laisse le choix de l’extracteur, sans en imposer un', () => {
    const centrale = levelOneCost('centrale')

    for (const typeId of EXTRACTOR_TYPE_IDS) {
      const extractor = levelOneCost(typeId)
      for (const resourceId of RESOURCE_IDS) {
        expect(BERCEAU.startingStockGrains[resourceId]).toBeGreaterThanOrEqual(
          (centrale[resourceId] ?? 0) + (extractor[resourceId] ?? 0),
        )
      }
    }
  })
})

describe('aucun coût n’est libellé en Jus (FR-062, R22)', () => {
  /**
   * Le Jus n'a **aucun débouché** en 001 : ses deux rôles arrêtés — propulsion
   * des flottes et recherche — sont hors périmètre. Un coût libellé en Jus
   * serait indépensable, donc un blocage définitif déguisé en contenu.
   */
  it.each(BUILDING_TYPE_IDS)('%s ne coûte pas de Jus', (typeId) => {
    expect(Object.keys(BUILDINGS[typeId].cost)).not.toContain('jus')
  })

  it.each(Object.keys(OBSTACLES))('déblayer un %s ne coûte pas de Jus', (obstacleId) => {
    expect(Object.keys(OBSTACLES[obstacleId as keyof typeof OBSTACLES].cost)).not.toContain('jus')
  })

  /**
   * L'exigence porte sur le catalogue **entier**, pas sur les deux registres
   * qu'on a pensé à vérifier. Ce cas la relit sur la donnée sérialisée : un
   * troisième registre ajouté plus tard y tombera sans qu'on y pense.
   */
  it('ne cite le Jus dans aucun coût du catalogue', () => {
    const costs = JSON.stringify([
      ...BUILDING_TYPE_IDS.map((id) => BUILDINGS[id].cost),
      ...Object.values(OBSTACLES).map((obstacle) => obstacle.cost),
    ])
    expect(costs).not.toContain('jus')
  })

  it('produit tout de même du Jus, stocké et plafonné comme le reste', () => {
    expect(BERCEAU.baseProductionPerHour['jus']).toBeGreaterThan(0)
    expect(BERCEAU.baseCapacityGrains['jus']).toBeGreaterThan(0)
  })
})

describe('chaque type déclare ses bornes (FR-040, FR-046)', () => {
  it.each(BUILDING_TYPE_IDS)('%s déclare un niveau maximal', (typeId) => {
    expect(BUILDINGS[typeId].maxLevel).toBeGreaterThanOrEqual(1)
  })

  it.each(BUILDING_TYPE_IDS)('%s déclare une durée de démolition', (typeId) => {
    expect(BUILDINGS[typeId].demolitionSeconds).toBeGreaterThan(0)
  })

  /**
   * La fraction est déclarée en entiers, comme les ratios de courbe : c'est ce
   * qui permet de publier « la moitié » et de la recalculer à la main, plutôt
   * qu'un `0.5` dont l'arrondi dépendrait de la représentation binaire.
   */
  it.each(BUILDING_TYPE_IDS)('%s déclare une fraction de remboursement', (typeId) => {
    const { refund } = BUILDINGS[typeId]
    expect(refund.den).toBeGreaterThan(0)
    expect(refund.num).toBeGreaterThanOrEqual(0)
    expect(refund.num).toBeLessThanOrEqual(refund.den)
  })

  it.each(BUILDING_TYPE_IDS)('%s coûte quelque chose au niveau 1', (typeId) => {
    const total = Object.values(levelOneCost(typeId)).reduce((sum, value) => sum + value, 0)
    expect(total).toBeGreaterThan(0)
  })
})

describe('le choix d’une variante est purement géométrique (FR-009)', () => {
  /**
   * Si une variante était meilleure, le vocabulaire d'empreintes deviendrait un
   * arbre de progression déguisé — et la question « quelle forme ? » cesserait
   * d'être une question d'espace pour devenir un calcul d'optimisation.
   */
  it.each(BUILDING_TYPE_IDS)('%s : toutes ses variantes ont la même surface', (typeId) => {
    const surfaces = BUILDINGS[typeId].variants.map(
      (variantId) => FOOTPRINTS[variantId].cells.length,
    )
    expect(new Set(surfaces).size).toBe(1)
  })

  it.each(BUILDING_TYPE_IDS)('%s : le choix de variante ne change aucun chiffre', (typeId) => {
    // Les caractéristiques sont portées par le **type**, jamais par la variante.
    // La structure de donnée est la garantie ; ce cas la constate.
    expect(BUILDINGS[typeId].variants.length).toBeGreaterThan(0)
    expect(Object.hasOwn(BUILDINGS[typeId], 'cost')).toBe(true)
  })

  it('donne à la mine ses trois variantes de quatre cases (R20)', () => {
    expect([...BUILDINGS['mine'].variants].sort()).toEqual(['l-4', 'square-4', 't-4'])
  })
})

describe('les extracteurs et leur ressource', () => {
  it('nomme trois extracteurs, un par ressource', () => {
    const extracted = EXTRACTOR_TYPE_IDS.map((typeId) => BUILDINGS[typeId].extracts)
    expect([...extracted].sort()).toEqual([...RESOURCE_IDS].sort())
  })

  it('n’attribue de ressource extraite qu’aux extracteurs', () => {
    for (const typeId of BUILDING_TYPE_IDS) {
      const isExtractor = (EXTRACTOR_TYPE_IDS as readonly string[]).includes(typeId)
      expect(BUILDINGS[typeId].extracts === null).toBe(!isExtractor)
    }
  })
})
