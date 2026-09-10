import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../src/game.js'
import { productionBreakdown, recomposeBreakdown } from '../../src/kernel/breakdown.js'
import { evaluateCurve } from '../../src/kernel/curves.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'
import { CATALOGS } from '../catalogs.js'

/**
 * **La décomposition d'une production en ses facteurs** (FR-053, US8-1).
 *
 * L'exigence est plus forte qu'elle n'en a l'air : « toute production affichée MUST
 * être décomposable en ses facteurs, **dont le produit redonne la valeur
 * affichée** ». Une décomposition approximative ne vaudrait rien — elle donnerait au
 * joueur un calcul qui *presque* tombe juste, ce qui est pire que pas de calcul du
 * tout : il croirait s'être trompé.
 *
 * La difficulté est dans les **troncatures**. Il y en a exactement deux, et elles ne
 * sont pas au même endroit :
 *
 * ```
 * parNiveau = ⌊base × num^(n−1) ÷ den^(n−1)⌋      ← une seule troncature (R19)
 * nominal   = parNiveau × gisements                ← exacte, aucun arrondi
 * effectif  = ⌊nominal × E₊ ÷ E₋⌋                  ← une seule troncature (R5)
 * ```
 *
 * Publier « base × facteur de niveau × gisements × rapport » sans dire *où* tombent
 * les deux planchers donnerait un produit faux d'une unité une fois sur deux. La
 * décomposition publie donc les valeurs intermédiaires **déjà tronquées**, et c'est
 * ce qui la rend refaisable à la main.
 */

const T0 = instant(1_787_750_000)
const EXTRACTORS = ['mine', 'puits', 'racloir'] as const

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
  const variantId = CATALOGS.buildings[typeId].variants[0]
  if (variantId === undefined) throw new Error(`${typeId} n’a aucune variante.`)
  return { id: `b-${counter}`, typeId, variantId, orientation: 0, anchor, level }
}

describe('les quatre facteurs sont publiés, et nommés', () => {
  it.each(EXTRACTORS)('%s : base, facteur de niveau, gisements, rapport', (typeId) => {
    const breakdown = productionBreakdown(typeId, 4, 2, { numerator: 3, denominator: 4 }, CATALOGS)
    if (breakdown === null) throw new Error(`${typeId} devait se décomposer`)

    // 1. La valeur de base du type : la production au niveau 1, par gisement.
    expect(breakdown.base).toBe(evaluateCurve(CATALOGS.buildings[typeId].production as never, 1))
    // 2. Le facteur de niveau, en **fraction entière** — jamais un flottant (R19).
    expect(breakdown.levelFactor).toEqual({ num: 11, den: 10, exponent: 3 })
    // 3. Les gisements recouverts.
    expect(breakdown.coveredDeposits).toBe(2)
    // 4. Le rapport d'énergie, en fraction entière (R5).
    expect(breakdown.ratio).toEqual({ numerator: 3, denominator: 4 })
  })

  /**
   * **Un type qui n'extrait rien ne se décompose pas**, et rend `null` plutôt qu'une
   * décomposition à zéro. Publier « 0 = 0 × 1 × 0 × 1 » pour une centrale ferait
   * chercher au joueur une production qui n'existe pas — et lui laisserait croire
   * qu'un gisement sous sa centrale la ferait produire.
   */
  it.each(['centrale', 'entrepot'] as const)('%s ne se décompose pas', (typeId) => {
    expect(productionBreakdown(typeId, 3, 1, { numerator: 1, denominator: 1 }, CATALOGS)).toBeNull()
  })
})

describe('le produit des facteurs redonne exactement la valeur affichée (FR-053)', () => {
  /**
   * L'énoncé central. `recomposeBreakdown` **refait le calcul** depuis les seuls
   * facteurs publiés, comme un joueur le ferait avec un papier et un crayon, et le
   * résultat doit tomber au grain près.
   */
  it.each(EXTRACTORS)('%s : la recomposition tombe juste, à tout niveau', (typeId) => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: CATALOGS.buildings[typeId].maxLevel }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 200 }),
        (level, deposits, numerator, denominator) => {
          const ratio = { numerator, denominator }
          const breakdown = productionBreakdown(typeId, level, deposits, ratio, CATALOGS)
          if (breakdown === null) return false

          return recomposeBreakdown(breakdown) === breakdown.effective
        },
      ),
    )
  })

  /**
   * **Et la valeur recomposée est celle que le jeu affiche.**
   *
   * C'est la moitié qui compte : une décomposition cohérente avec elle-même mais
   * incohérente avec la projection serait une seconde vérité. L'énoncé passe donc par
   * l'état projeté, celui-là même qui alimente l'écran.
   */
  it('la décomposition d’un bâtiment posé vaut son taux effectif projeté', () => {
    // La mine sur la veine de (0,4) : un gisement recouvert. Le racloir de (3,3) n'en
    // recouvre aucun, et c'est un cas utile — zéro doit se décomposer aussi.
    const snapshot: PlanetSnapshot = {
      ...fresh(),
      buildings: [placed('mine', { x: 0, y: 4 }, 5), placed('racloir', { x: 3, y: 3 }, 2)],
    }
    const state = projectPlanet(snapshot, CATALOGS, T0)

    for (const building of state.buildings) {
      const breakdown = productionBreakdown(
        building.typeId,
        building.level,
        building.coveredDeposits,
        state.energy.ratio,
        CATALOGS,
      )
      if (breakdown === null) continue

      expect(breakdown.nominal, `${building.typeId} nominal`).toBe(building.nominalRate)
      expect(breakdown.effective, `${building.typeId} effectif`).toBe(building.effectiveRate)
      expect(recomposeBreakdown(breakdown)).toBe(building.effectiveRate)
    }
  })
})

describe('les deux troncatures sont publiées là où elles tombent', () => {
  /**
   * **La troncature du niveau est publiée en tant que valeur**, pas seulement en tant
   * que fraction. Un joueur qui multiplierait `base × (11/10)^4` obtiendrait 21,96 là
   * où le jeu compte 21 : le plancher tombe *avant* la multiplication par les
   * gisements, et le taire donnerait un produit faux dès deux gisements.
   */
  it('publie la valeur par gisement, déjà tronquée', () => {
    const breakdown = productionBreakdown('mine', 5, 3, { numerator: 1, denominator: 1 }, CATALOGS)
    if (breakdown === null) throw new Error('la mine devait se décomposer')

    const exact = (15 * 11 ** 4) / 10 ** 4
    expect(breakdown.perDeposit).toBe(Math.floor(exact))
    expect(breakdown.perDeposit).toBeLessThan(exact)
    // Et le nominal est le produit **exact** de la valeur tronquée : trois fois 21,
    // et non le plancher de trois fois 21,96.
    expect(breakdown.nominal).toBe(breakdown.perDeposit * 3)
  })

  /**
   * **La troncature du rapport tombe sur le taux, une seule fois** (R5). Elle porte
   * sur le nominal *total*, pas sur la valeur par gisement — sans quoi la production
   * d'un extracteur dépendrait du nombre de gisements autrement que
   * proportionnellement, et I-13 tomberait.
   */
  it('applique le rapport au nominal total, et non par gisement', () => {
    const ratio = { numerator: 2, denominator: 3 }
    const one = productionBreakdown('mine', 1, 1, ratio, CATALOGS)
    const three = productionBreakdown('mine', 1, 3, ratio, CATALOGS)
    if (one === null || three === null) throw new Error('la mine devait se décomposer')

    // ⌊15 × 2/3⌋ = 10, mais ⌊45 × 2/3⌋ = 30 — et non 3 × 10 = 30 par coïncidence.
    // Le cas qui distingue les deux : un nominal dont le tiers n'est pas entier.
    expect(three.effective).toBe(Math.floor((three.nominal * 2) / 3))
    expect(one.effective).toBe(Math.floor((one.nominal * 2) / 3))
  })

  it('hors déficit, l’effectif égale le nominal — aucune troncature de plus', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 0, max: 9 }),
        (level, deposits) => {
          const breakdown = productionBreakdown(
            'mine',
            level,
            deposits,
            { numerator: 1, denominator: 1 },
            CATALOGS,
          )
          return breakdown !== null && breakdown.effective === breakdown.nominal
        },
      ),
    )
  })
})

describe('les cas limites se décomposent aussi', () => {
  /**
   * **Zéro gisement donne zéro**, et la décomposition le dit sans se dérober (I-12,
   * FR-017). C'est le cœur de la mécanique : un extracteur qui ne recouvre rien
   * produit zéro, et non la valeur de base de son type. Le joueur doit pouvoir le
   * *vérifier* sur la page de règles, pas seulement le constater sur sa planète.
   */
  it('zéro gisement recouvert donne zéro, facteurs compris', () => {
    const breakdown = productionBreakdown('mine', 12, 0, { numerator: 1, denominator: 1 }, CATALOGS)
    if (breakdown === null) throw new Error('la mine devait se décomposer')

    expect(breakdown.coveredDeposits).toBe(0)
    expect(breakdown.nominal).toBe(0)
    expect(breakdown.effective).toBe(0)
    // Mais la valeur par gisement reste publiée : c'est elle qui dit au joueur ce
    // qu'il gagnerait à déplacer son extracteur.
    expect(breakdown.perDeposit).toBeGreaterThan(0)
    expect(recomposeBreakdown(breakdown)).toBe(0)
  })

  it('un rapport nul annule la production sans casser la recomposition', () => {
    const breakdown = productionBreakdown('mine', 3, 2, { numerator: 0, denominator: 7 }, CATALOGS)
    if (breakdown === null) throw new Error('la mine devait se décomposer')

    expect(breakdown.effective).toBe(0)
    expect(recomposeBreakdown(breakdown)).toBe(0)
  })

  it('le niveau 1 a un facteur de niveau neutre', () => {
    const breakdown = productionBreakdown('puits', 1, 1, { numerator: 1, denominator: 1 }, CATALOGS)
    if (breakdown === null) throw new Error('le puits devait se décomposer')

    expect(breakdown.levelFactor.exponent).toBe(0)
    expect(breakdown.perDeposit).toBe(breakdown.base)
  })
})
