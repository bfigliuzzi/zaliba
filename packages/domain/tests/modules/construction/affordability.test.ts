import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../../src/game.js'
import type { Catalogs } from '../../../src/kernel/catalogs.js'
import type { ResourceAmount } from '../../../src/kernel/effects.js'
import type { ProjectedState } from '../../../src/kernel/projection.js'
import { grains } from '../../../src/kernel/resources.js'
import { emptySnapshot, type PlanetSnapshot } from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import { secondsUntilAffordable } from '../../../src/modules/construction/build.js'
import { CATALOGS } from '../../catalogs.js'

/**
 * « Payable dans » — le chiffre qui distingue un refus d'une impasse.
 *
 * « Ressources insuffisantes » n'apprend rien. « Il manque 150 Camelote, payable
 * dans trois minutes » dit à la fois quoi faire et quand revenir, et c'est ce que
 * SC-007 et US4-3 exigent. Ce fichier détient le **contrat de la fonction** ;
 * `build.test.ts` et `upgrade.test.ts` n'éprouvent que sa remontée dans un motif
 * de refus.
 *
 * Trois propriétés portent tout le sens, et aucune ne se lit dans le code :
 *
 * - le délai est **exact**, `⌈manque ÷ taux⌉`, et non un ordre de grandeur ;
 * - la borne est le **maximum** sur les ressources manquantes, jamais leur somme :
 *   elles s'accumulent en parallèle. Sommer surestimerait l'attente, donc
 *   découragerait une action que le jeu autorise ;
 * - `null` n'est **pas un cas d'erreur**. Il dit que le rythme courant n'y
 *   suffira jamais — la ressource sature avant, ou ne progresse pas — donc
 *   qu'attendre ne servira à rien et qu'il faut d'abord un entrepôt. Le confondre
 *   avec un défaut ferait afficher une erreur là où le jeu donne un conseil.
 */

const T0 = instant(1_787_750_000)

/** Les taux de base du Berceau, en grains par seconde (R1, R7). */
const BASE_RATE = { camelote: 20, jus: 10, 'bave-etoiles': 5 } as const

/** La mine de référence, sur la veine de Camelote : un gisement recouvert. */
const MINE = {
  id: '88888888-8888-4888-8888-888888888888',
  typeId: 'mine' as const,
  variantId: 'square-4' as const,
  orientation: 0,
  anchor: { x: 0, y: 4 },
  level: 1,
}

/** Le racloir : le seul carré de neuf entièrement libre de la disposition. */
const RACLOIR = {
  id: '77777777-7777-4777-8777-777777777777',
  typeId: 'racloir' as const,
  variantId: 'square-9' as const,
  orientation: 0,
  anchor: { x: 3, y: 3 },
  level: 1,
}

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

/** Une planète sans un grain : le manque vaut alors exactement le coût. */
function broke(overrides: Partial<PlanetSnapshot> = {}): PlanetSnapshot {
  return {
    ...fresh(),
    holdings: {
      camelote: { amount: grains(0), lost: grains(0), saturatedSince: null },
      jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
      'bave-etoiles': { amount: grains(0), lost: grains(0), saturatedSince: null },
    },
    ...overrides,
  }
}

function stateOf(snapshot: PlanetSnapshot, catalogs: Catalogs = CATALOGS): ProjectedState {
  return projectPlanet(snapshot, catalogs, T0)
}

/** Le manque vaut le coût sur une planète vide : les deux arguments coïncident. */
function delay(state: ProjectedState, cost: readonly ResourceAmount[]): number | null {
  return secondsUntilAffordable(state, cost, cost)
}

describe('le délai est exact, et non un ordre de grandeur', () => {
  it('vaut ⌈manque ÷ taux courant⌉', () => {
    const state = stateOf(broke())
    expect(delay(state, [{ resourceId: 'camelote', grains: 3_600 }])).toBe(
      3_600 / BASE_RATE.camelote,
    )
  })

  /**
   * L'arrondi va vers le **haut**. Annoncer « payable dans 5 s » quand il en faut
   * 5,1 ferait refuser une commande que l'écran venait de présenter comme
   * payable — la seule direction d'arrondi qui coûte au joueur.
   */
  it('arrondit la seconde entamée vers le haut', () => {
    const state = stateOf(broke())
    expect(delay(state, [{ resourceId: 'camelote', grains: BASE_RATE.camelote + 1 }])).toBe(2)
  })

  it('rend zéro quand il ne manque rien', () => {
    expect(delay(stateOf(fresh()), [])).toBe(0)
  })
})

describe('la borne est le maximum sur les ressources, jamais leur somme', () => {
  /**
   * Les trois ressources s'accumulent **en parallèle** : attendre la plus lente
   * suffit. La somme serait 25 s là où 20 suffisent — et un joueur qui lit 25
   * repousse une action que le jeu lui accordait déjà.
   */
  it('retient la ressource la plus lente à combler', () => {
    const state = stateOf(broke())
    const cost = [
      { resourceId: 'camelote' as const, grains: 100 },
      { resourceId: 'bave-etoiles' as const, grains: 100 },
    ]

    const slowest = Math.ceil(100 / BASE_RATE['bave-etoiles'])
    const fastest = Math.ceil(100 / BASE_RATE.camelote)

    expect(delay(state, cost)).toBe(slowest)
    expect(delay(state, cost)).not.toBe(slowest + fastest)
  })
})

describe('« jamais » est une information, pas une erreur', () => {
  it('rend null quand le coût dépasse le plafond de la ressource', () => {
    const state = stateOf(broke())
    const beyondCap = state.holdings.camelote.cap + 1
    expect(delay(state, [{ resourceId: 'camelote', grains: beyondCap }])).toBeNull()
  })

  /**
   * Le plafond **atteint** n'est pas le plafond dépassé.
   *
   * Un coût qui vaut exactement la capacité est payable : la ressource s'y arrête
   * sans jamais la franchir (I-1). Décaler cette borne d'un grain rendrait
   * inatteignable le dernier niveau que le jeu promet.
   */
  it('chiffre le délai quand le coût vaut exactement le plafond', () => {
    const state = stateOf(broke())
    const cap = state.holdings.camelote.cap
    expect(delay(state, [{ resourceId: 'camelote', grains: cap }])).toBe(
      Math.ceil(cap / BASE_RATE.camelote),
    )
  })

  it('rend null quand la ressource ne progresse pas', () => {
    // Un catalogue synthétique à production nulle : c'est tout l'intérêt de
    // passer le catalogue en argument plutôt que de l'importer en dur.
    const barren: Catalogs = {
      ...CATALOGS,
      layouts: {
        'berceau-v1': {
          ...CATALOGS.layouts['berceau-v1'],
          baseProductionPerHour: { camelote: 0, jus: 0, 'bave-etoiles': 0 },
        },
      },
    }
    expect(delay(stateOf(broke(), barren), [{ resourceId: 'camelote', grains: 3_600 }])).toBeNull()
  })
})

describe('le délai suit le taux effectif, énergie appliquée', () => {
  /**
   * Le taux lu est celui de `HoldingView.rate`, c'est-à-dire l'**effectif**
   * (FR-024). Lire le nominal annoncerait un délai que le déficit rend faux, et
   * le joueur attendrait plus longtemps que promis sans comprendre pourquoi.
   *
   * La mine seule ne crée pas de déficit ; la mine **et** le racloir portent la
   * consommation à 22 pour 20 produits, et le rapport mord alors sur la part des
   * bâtiments — jamais sur la base du Berceau (FR-018, R5).
   */
  it('un déficit allonge le délai, sans jamais le rendre infini', () => {
    const cost = [{ resourceId: 'camelote' as const, grains: 360_000 }]

    const sober = stateOf(broke({ buildings: [MINE] }))
    const strained = stateOf(broke({ buildings: [MINE, RACLOIR] }))

    expect(strained.energy.deficit).toBe(true)
    expect(strained.holdings.camelote.rate).toBeLessThan(sober.holdings.camelote.rate)

    const slower = delay(strained, cost)
    const faster = delay(sober, cost)
    expect(slower).not.toBeNull()
    expect(faster).not.toBeNull()
    expect(slower).toBeGreaterThan(faster as number)

    // Le chiffre exact, refait à la main depuis le taux publié (SC-002).
    expect(slower).toBe(Math.ceil(360_000 / strained.holdings.camelote.rate))
  })
})
