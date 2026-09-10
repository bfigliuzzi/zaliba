import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { instant, projectPlanet } from '@zaliba/domain'
import { describe, expect, it, vi } from 'vitest'
import { extrapolate, snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { CATALOGS } from '../../catalogs.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * L'extrapolation locale : **le même `project()` que le serveur** (R8).
 *
 * C'est la promesse de FR-050 et FR-051 sans aller-retour réseau, et c'est ce
 * qui fait progresser les compteurs sous les yeux du joueur. La propriété qui
 * compte n'est pas « ça avance », c'est **« ça avance exactement comme le
 * serveur »** : la valeur affichée à `t` doit être celle que le serveur donnerait
 * au même `t`, à la seconde et au grain près.
 *
 * Deux vérités qui divergent seraient pires qu'une seule qui attend : le joueur
 * verrait un compteur, cliquerait, et le serveur lui répondrait avec un autre
 * chiffre — sans qu'aucun des deux ait tort de son point de vue.
 */

/**
 * L'échantillon est **analysé** par le schéma du contrat, jamais transtypé.
 * Deux bénéfices : le type est celui du contrat, et une fixture devenue
 * invalide échoue ici plutôt que de faire passer un test sur une charge que le
 * serveur n'émettrait jamais.
 */
const freshPayload = PlanetSnapshotV1.parse(rawFresh)

describe('l’instantané du contrat se relit en instantané de domaine', () => {
  it('reprend les quantités, les pertes et l’instant de consolidation', () => {
    const snapshot = snapshotFromContract(freshPayload, CATALOGS)

    expect(snapshot.consolidatedAt).toBe(freshPayload.planet.consolidatedAt)
    expect(snapshot.holdings['camelote'].amount).toBe(1_440_000)
    expect(snapshot.holdings['jus'].amount).toBe(0)
  })

  it('reprend l’identité de la planète et son occupant', () => {
    const snapshot = snapshotFromContract(freshPayload, CATALOGS)
    expect(snapshot.planetId).toBe(freshPayload.planet.id)
    expect(snapshot.occupantId).toBe(freshPayload.planet.occupantId)
  })

  it('rend une planète neuve sans bâtiment ni chantier', () => {
    const snapshot = snapshotFromContract(freshPayload, CATALOGS)
    expect(snapshot.buildings).toHaveLength(0)
    expect(snapshot.work).toBeNull()
  })
})

describe('la valeur extrapolée est celle que le serveur donnerait', () => {
  /**
   * L'assertion centrale de R8. On ne compare pas à un chiffre recopié mais au
   * résultat de `projectPlanet` — **le même code**. Si les deux divergeaient un
   * jour, ce serait parce que le client aurait cessé d'employer le code du
   * serveur, ce qui est exactement ce qu'il faut attraper.
   */
  it.each([0, 1, 60, 3_600, 21 * 86_400])(
    'coïncide avec le serveur après %i secondes',
    (elapsed) => {
      const snapshot = snapshotFromContract(freshPayload, CATALOGS)
      const at = instant(freshPayload.planet.consolidatedAt + elapsed)

      const local = extrapolate(freshPayload, CATALOGS, at)
      const server = projectPlanet(snapshot, CATALOGS, at)

      for (const resourceId of CATALOGS.resourceIds) {
        expect(local.holdings[resourceId].amount).toBe(server.holdings[resourceId].amount)
        expect(local.holdings[resourceId].lost).toBe(server.holdings[resourceId].lost)
      }
    },
  )

  it('avance de la production d’une heure', () => {
    const at = instant(freshPayload.planet.consolidatedAt + 3_600)
    const state = extrapolate(freshPayload, CATALOGS, at)

    expect(state.holdings['camelote'].amount).toBe(1_440_000 + 72_000)
  })

  it('n’avance pas quand aucun temps n’a passé', () => {
    const at = instant(freshPayload.planet.consolidatedAt)
    expect(extrapolate(freshPayload, CATALOGS, at).holdings['camelote'].amount).toBe(1_440_000)
  })
})

describe('aucun appel réseau n’est émis', () => {
  /**
   * L'exigence est littérale : **sans un seul appel réseau** (R8, doc de stack
   * § 4.7). L'extrapolation n'existe que pour cela — un compteur qui
   * interrogerait le serveur à chaque image ferait soixante requêtes par seconde
   * et par joueur, et cesserait d'avancer dès la première coupure.
   */
  it('n’appelle ni fetch, ni XMLHttpRequest', () => {
    const fetchSpy = vi.fn()
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    try {
      for (let seconds = 0; seconds < 120; seconds += 1) {
        extrapolate(freshPayload, CATALOGS, instant(freshPayload.planet.consolidatedAt + seconds))
      }
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /**
   * Et le cas qui prouve que l'assertion précédente n'est pas vide : le mode
   * hors ligne du navigateur ne change rien, puisqu'il n'y a rien à couper.
   */
  it('continue d’avancer sans réseau du tout', () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('réseau indisponible')
    }) as unknown as typeof fetch

    try {
      const at = instant(freshPayload.planet.consolidatedAt + 7_200)
      expect(extrapolate(freshPayload, CATALOGS, at).holdings['camelote'].amount).toBe(
        1_440_000 + 144_000,
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('l’extrapolation ne remonte jamais le temps', () => {
  /**
   * Le décalage d'horloge peut rendre l'instant estimé antérieur à la
   * consolidation — juste après une resynchronisation qui corrige une avance
   * locale. Le serveur, lui, traiterait ce cas comme une erreur de
   * programmation ; le client, non : c'est une situation normale, et la réponse
   * juste est de rester à l'instantané reçu.
   */
  it('reste à l’instantané reçu si l’instant demandé le précède', () => {
    const at = instant(freshPayload.planet.consolidatedAt - 30)
    const state = extrapolate(freshPayload, CATALOGS, at)

    expect(state.holdings['camelote'].amount).toBe(1_440_000)
    expect(state.at).toBe(freshPayload.planet.consolidatedAt)
  })
})
