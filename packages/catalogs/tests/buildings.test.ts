import { describe, expect, it } from 'vitest'
import {
  BUILDING_TYPE_IDS,
  BUILDINGS,
  type BuildingTypeId,
  EXTRACTOR_TYPE_IDS,
} from '../src/buildings.js'
import type { GeometricCurve, LinearCurve } from '../src/curves.js'
import { FOOTPRINTS } from '../src/footprints.js'
import { BERCEAU } from '../src/layouts/berceau.js'

/**
 * Les cinq types de bâtiment (R20).
 *
 * Ce fichier est l'autorité sur quatre propriétés que rien d'autre ne garantit :
 * l'association type → variantes, l'**absence de tout chiffre porté par une
 * variante** (FR-009), la croissance des coûts, et l'existence des trois valeurs
 * sans lesquelles un refus n'a rien à opposer — niveau maximal, durée de
 * démolition, fraction de remboursement.
 *
 * **Les courbes sont évaluées ici, à la main.** `catalogs` est la feuille du
 * graphe et n'importe rien, `evaluateCurve` vivant dans `domain` : ce test ne
 * peut pas l'appeler. La contrainte est une chance — la valeur attendue est
 * recalculée par un second chemin, et une erreur d'implémentation de la courbe
 * ne peut donc pas se cacher derrière elle-même.
 */

/** `⌊ base × num^(n−1) ÷ den^(n−1) ⌋` — une seule troncature, à la fin (R19). */
function geometric(curve: GeometricCurve, level: number): number {
  const exponent = BigInt(level - 1)
  return Number(
    (BigInt(curve.base) * BigInt(curve.num) ** exponent) / BigInt(curve.den) ** exponent,
  )
}

/** `base + step × (n − 1)`. */
function linear(curve: LinearCurve, level: number): number {
  return curve.base + curve.step * (level - 1)
}

const surfaceOf = (typeId: BuildingTypeId): readonly number[] =>
  BUILDINGS[typeId].variants.map((variantId) => FOOTPRINTS[variantId].cells.length)

describe('le catalogue nomme les cinq types de R20, et pas un de plus', () => {
  it('compte exactement cinq types', () => {
    expect(BUILDING_TYPE_IDS).toHaveLength(5)
  })

  it('les nomme', () => {
    expect([...BUILDING_TYPE_IDS].sort()).toEqual(
      ['centrale', 'entrepot', 'mine', 'puits', 'racloir'].sort(),
    )
  })

  it('associe chaque identifiant au type qui le porte', () => {
    for (const id of BUILDING_TYPE_IDS) {
      expect(BUILDINGS[id].id).toBe(id)
    }
  })
})

describe('les variantes d’empreinte sont celles de R20', () => {
  it.each([
    ['mine', ['square-4', 'l-4', 't-4']],
    ['puits', ['rect-6']],
    ['racloir', ['square-9']],
    ['centrale', ['line-2']],
    ['entrepot', ['single']],
  ] as const)('%s admet %j', (typeId, variants) => {
    expect(BUILDINGS[typeId].variants).toEqual(variants)
  })

  it('ne référence que des empreintes du vocabulaire fermé', () => {
    for (const id of BUILDING_TYPE_IDS) {
      for (const variantId of BUILDINGS[id].variants) {
        expect(FOOTPRINTS[variantId], `${id} → ${variantId}`).toBeDefined()
      }
    }
  })

  it('ne propose jamais deux fois la même variante', () => {
    for (const id of BUILDING_TYPE_IDS) {
      const variants = BUILDINGS[id].variants
      expect(new Set(variants).size, `${id} répète une variante`).toBe(variants.length)
    }
  })
})

describe('le choix d’une variante est purement géométrique (FR-009)', () => {
  /**
   * La mine est le seul type à plusieurs variantes, donc le seul endroit où
   * FR-009 a un objet. Ses trois empreintes doivent occuper la même surface :
   * sinon « quelle forme ? » cesserait d'être une question d'espace pour
   * devenir un calcul d'optimisation.
   */
  it('donne la même surface à toutes les variantes d’un même type', () => {
    for (const id of BUILDING_TYPE_IDS) {
      const surfaces = surfaceOf(id)
      expect(new Set(surfaces).size, `${id} mélange des surfaces : ${surfaces.join(', ')}`).toBe(1)
    }
  })

  it('donne quatre cases aux trois variantes de la mine', () => {
    expect(surfaceOf('mine')).toEqual([4, 4, 4])
  })

  /**
   * La propriété la plus forte du fichier, et la moins visible : une variante
   * est un **identifiant**, pas une structure. Elle n'a donc aucun endroit où
   * porter un chiffre, et FR-009 devient inviolable par la forme de la donnée
   * plutôt que par une vérification qu'on pourrait oublier.
   */
  it('ne laisse aucune variante porter de valeur — c’est un identifiant, rien de plus', () => {
    for (const id of BUILDING_TYPE_IDS) {
      for (const variant of BUILDINGS[id].variants) {
        expect(typeof variant, `${id} → ${String(variant)}`).toBe('string')
      }
    }
  })
})

describe('les bornes et les valeurs de refus existent (FR-040, FR-046)', () => {
  it.each(BUILDING_TYPE_IDS)('%s porte un niveau maximal ≥ 1', (id) => {
    expect(Number.isInteger(BUILDINGS[id].maxLevel)).toBe(true)
    expect(BUILDINGS[id].maxLevel).toBeGreaterThanOrEqual(1)
  })

  it.each(BUILDING_TYPE_IDS)('%s porte une durée de démolition > 0', (id) => {
    expect(BUILDINGS[id].demolitionGongs).toBeGreaterThan(0)
  })

  /**
   * La fraction est en entiers, jamais en flottant (R19), et elle ne dépasse
   * pas l'unité : rembourser plus que le coût cumulé ferait de la démolition
   * une source de ressources.
   */
  it.each(BUILDING_TYPE_IDS)('%s porte une fraction de remboursement dans ]0, 1]', (id) => {
    const { num, den } = BUILDINGS[id].refund
    expect(Number.isInteger(num) && Number.isInteger(den)).toBe(true)
    expect(den).toBeGreaterThan(0)
    expect(num).toBeGreaterThan(0)
    expect(num / den).toBeLessThanOrEqual(1)
  })
})

/**
 * **Le catalogue déclare en gongs, jamais en secondes** (003, G16).
 *
 * Ces assertions ont changé d'unité avec la tranche : `300` y est devenu `30`.
 * C'est l'un des deux seuls endroits du dépôt où une valeur attendue a été
 * réécrite plutôt que redirigée, et c'est une conséquence de la règle
 * `catalogs-n-importe-rien` : ce paquet ne peut pas résoudre, puisque résoudre
 * vit dans `domain`. Il n'éprouve donc que le catalogue **déclaré**.
 *
 * Ce que ces tests tiennent est l'**intégrité de la déclaration** : un nombre
 * de gongs fractionnaire, ou un taux qui ne serait pas un entier de grains par
 * gong, rendrait la résolution approximative au gong canonique et ferait tomber
 * l'égalité stricte de FR-010 — silencieusement, puisque la troncature d'une
 * base ne lève rien.
 */
describe('le catalogue déclare ses durées en gongs entiers (003)', () => {
  it('déclare une base de construction entière, en gongs', () => {
    for (const id of BUILDING_TYPE_IDS) {
      const base = BUILDINGS[id].buildDuration.base
      expect(Number.isInteger(base), `${id} : ${base}`).toBe(true)
      expect(base, id).toBeGreaterThan(0)
    }
  })

  it('donne aux cinq types les gongs de la table de vérité', () => {
    expect(BUILDINGS.mine.buildDuration.base).toBe(12)
    expect(BUILDINGS.puits.buildDuration.base).toBe(15)
    expect(BUILDINGS.racloir.buildDuration.base).toBe(20)
    expect(BUILDINGS.centrale.buildDuration.base).toBe(9)
    expect(BUILDINGS.entrepot.buildDuration.base).toBe(10)
  })

  it('déclare une durée de démolition entière, en gongs', () => {
    for (const id of BUILDING_TYPE_IDS) {
      const gongs = BUILDINGS[id].demolitionGongs
      expect(Number.isInteger(gongs), `${id} : ${gongs}`).toBe(true)
      expect(gongs, id).toBeGreaterThan(0)
    }
  })

  it('donne aux cinq démolitions les gongs de la table de vérité', () => {
    expect(BUILDINGS.mine.demolitionGongs).toBe(30)
    expect(BUILDINGS.puits.demolitionGongs).toBe(42)
    expect(BUILDINGS.racloir.demolitionGongs).toBe(60)
    expect(BUILDINGS.centrale.demolitionGongs).toBe(24)
    expect(BUILDINGS.entrepot.demolitionGongs).toBe(18)
  })

  it('déclare une base de production entière, en grains par gong', () => {
    for (const id of EXTRACTOR_TYPE_IDS) {
      const curve = BUILDINGS[id].production
      expect(curve, id).not.toBeNull()
      if (curve === null) continue
      expect(Number.isInteger(curve.base), `${id} : ${curve.base}`).toBe(true)
      expect(curve.base, id).toBeGreaterThan(0)
    }
  })

  it('donne aux trois extracteurs les grains par gong de la table de vérité', () => {
    expect(BUILDINGS.mine.production?.base).toBe(150)
    expect(BUILDINGS.puits.production?.base).toBe(80)
    expect(BUILDINGS.racloir.production?.base).toBe(40)
  })
})

describe('les coûts sont strictement croissants avec le niveau', () => {
  it('croît à chaque niveau, pour chaque ressource et chaque type', () => {
    for (const id of BUILDING_TYPE_IDS) {
      for (const [resourceId, curve] of Object.entries(BUILDINGS[id].cost)) {
        for (let level = 2; level <= BUILDINGS[id].maxLevel; level += 1) {
          expect(
            geometric(curve, level),
            `${id} / ${resourceId} au niveau ${level}`,
          ).toBeGreaterThan(geometric(curve, level - 1))
        }
      }
    }
  })

  it('donne une durée de construction strictement croissante', () => {
    for (const id of BUILDING_TYPE_IDS) {
      const curve = BUILDINGS[id].buildDuration
      for (let level = 2; level <= BUILDINGS[id].maxLevel; level += 1) {
        expect(geometric(curve, level), `${id} au niveau ${level}`).toBeGreaterThan(
          geometric(curve, level - 1),
        )
      }
    }
  })

  it('donne une durée de construction non nulle au niveau 1', () => {
    for (const id of BUILDING_TYPE_IDS) {
      expect(geometric(BUILDINGS[id].buildDuration, 1), id).toBeGreaterThan(0)
    }
  })
})

describe('tout type sauf la centrale consomme de l’énergie (FR-022, R21)', () => {
  it('donne une courbe de consommation à la mine, au puits, au racloir et à l’entrepôt', () => {
    for (const id of BUILDING_TYPE_IDS.filter((typeId) => typeId !== 'centrale')) {
      expect(BUILDINGS[id].energyConsumption, `${id} ne consomme rien`).not.toBeNull()
    }
  })

  /**
   * L'entrepôt est le cas qui se serait oublié : il ne produit rien, donc rien
   * n'attirait l'attention sur sa consommation. Elle est pourtant ce qui fait
   * que le poser sans centrale se paie — simplement, le prix est payé par les
   * extracteurs, dont il grossit le dénominateur (R21).
   */
  it('fait consommer l’entrepôt, lui aussi', () => {
    expect(BUILDINGS.entrepot.energyConsumption).not.toBeNull()
  })

  it('est le seul type que la centrale ne partage pas', () => {
    expect(BUILDINGS.centrale.energyConsumption).toBeNull()
  })

  it('donne une consommation strictement positive et croissante', () => {
    for (const id of BUILDING_TYPE_IDS) {
      const curve = BUILDINGS[id].energyConsumption
      if (curve === null) continue
      expect(linear(curve, 1), `${id} au niveau 1`).toBeGreaterThan(0)
      expect(linear(curve, 2), `${id} au niveau 2`).toBeGreaterThan(linear(curve, 1))
    }
  })
})

describe('la centrale, et elle seule, produit de l’énergie (FR-022, R20)', () => {
  it('donne une courbe de production d’énergie à la centrale', () => {
    expect(BUILDINGS.centrale.energyProduction).not.toBeNull()
  })

  it('ne l’accorde à aucun autre type', () => {
    for (const id of BUILDING_TYPE_IDS.filter((typeId) => typeId !== 'centrale')) {
      expect(BUILDINGS[id].energyProduction, `${id} produit de l’énergie`).toBeNull()
    }
  })

  /**
   * Les deux colonnes se répondent, et c'est la propriété qui compte : un type
   * qui ne remplirait ni l'une ni l'autre serait invisible dans le rapport
   * d'énergie — ni au numérateur, ni au dénominateur —, donc gratuit sans
   * qu'aucune règle publiée ne le dise.
   */
  it('fait remplir à chaque type exactement une des deux colonnes', () => {
    for (const id of BUILDING_TYPE_IDS) {
      const produces = BUILDINGS[id].energyProduction !== null
      const consumes = BUILDINGS[id].energyConsumption !== null
      expect(
        produces !== consumes,
        `${id} remplit ${produces && consumes ? 'les deux' : 'aucune'} colonne`,
      ).toBe(true)
    }
  })

  it('donne une production strictement positive et croissante', () => {
    const curve = BUILDINGS.centrale.energyProduction
    expect(curve).not.toBeNull()
    if (curve === null) return
    expect(linear(curve, 1)).toBeGreaterThan(0)
    expect(linear(curve, 2)).toBeGreaterThan(linear(curve, 1))
  })

  /**
   * L'équilibrage que la tranche promet : les vingt de base du Berceau **plus**
   * une centrale de niveau 1 suffisent à alimenter un de chaque autre type au
   * niveau 1. Sans cette borne, le premier écran du jeu serait un déficit, et le
   * joueur apprendrait la mécanique en étant puni par elle.
   */
  it('alimente, avec la base du Berceau, un de chaque type au niveau 1', () => {
    const curve = BUILDINGS.centrale.energyProduction
    if (curve === null) throw new Error('La centrale ne produit rien.')

    const consumed = BUILDING_TYPE_IDS.reduce((total, id) => {
      const consumption = BUILDINGS[id].energyConsumption
      return consumption === null ? total : total + linear(consumption, 1)
    }, 0)

    expect(BERCEAU.baseEnergy + linear(curve, 1)).toBeGreaterThanOrEqual(consumed)
  })
})

describe('les extracteurs, et eux seuls, portent une courbe de production', () => {
  it('nomme les trois extracteurs de R20', () => {
    expect([...EXTRACTOR_TYPE_IDS].sort()).toEqual(['mine', 'puits', 'racloir'].sort())
  })

  it('associe à chacun la ressource qu’il extrait', () => {
    expect(BUILDINGS.mine.extracts).toBe('camelote')
    expect(BUILDINGS.puits.extracts).toBe('jus')
    expect(BUILDINGS.racloir.extracts).toBe('bave-etoiles')
  })

  it('donne une courbe de production à tout type qui extrait, et à lui seul', () => {
    for (const id of BUILDING_TYPE_IDS) {
      const extracts = BUILDINGS[id].extracts !== null
      expect(BUILDINGS[id].production !== null, `${id}`).toBe(extracts)
    }
  })

  it('donne une production strictement positive et croissante', () => {
    for (const id of EXTRACTOR_TYPE_IDS) {
      const curve = BUILDINGS[id].production
      expect(curve, id).not.toBeNull()
      if (curve === null) continue
      expect(geometric(curve, 1), `${id} au niveau 1`).toBeGreaterThan(0)
      expect(geometric(curve, BUILDINGS[id].maxLevel), `${id} au niveau maximal`).toBeGreaterThan(
        geometric(curve, 1),
      )
    }
  })
})
