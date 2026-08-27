import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'
import { buildTestServer, type TestServer } from './server-harness.js'

/**
 * **Depuis quand la saturation dure, écrit dans un vrai PostgreSQL** (US1/AC5).
 *
 * Le domaine éprouve la règle, et le fait au grain près. Ce qui ne peut être
 * affirmé qu'ici, c'est que la grandeur **survit à un aller-retour en base** :
 *
 * - la colonne existe, et la traduction domaine → colonnes plates l'écrit ;
 * - une consolidation **ne redate pas** une saturation antérieure. C'est le
 *   cœur de l'exigence : sans la colonne, chaque action du joueur remettrait
 *   l'ancienneté à zéro, et le jeu répondrait « saturée depuis un instant » à
 *   une planète qui déborde depuis trois semaines ;
 * - une ressource qui n'a pas atteint son plafond garde `null`, et non
 *   l'instant de la consolidation.
 *
 * Le test agit **par les routes**, jamais en écrivant l'état à la main : c'est
 * le chemin d'écriture réel qui doit porter la grandeur, pas un `update` de
 * test qui prouverait seulement que PostgreSQL sait stocker un `timestamptz`.
 */

let harness: Harness
let server: TestServer

/** (3,0) : un éboulis dans la disposition du Berceau (R7). De quoi consolider. */
const EBOULIS = { nature: 'clear', x: 3, y: 0 } as const

beforeAll(async () => {
  harness = await startHarness()
  server = await buildTestServer(harness)
}, 180_000)

afterAll(async () => {
  await server?.close()
  await harness?.stop()
})

beforeEach(async () => {
  await harness.reset()
})

async function provisioned(): Promise<{ playerId: string; planetId: string }> {
  const playerId = randomUUID()
  const response = await server.provision(playerId)
  expect(response.statusCode).toBe(201)
  return { playerId, planetId: response.json().planet.id as string }
}

/**
 * Recule la consolidation de quatre cents heures.
 *
 * La valeur est choisie pour séparer les trois ressources, chacune illustrant un
 * cas différent — c'est tout son intérêt. Les délais se recalculent depuis le
 * catalogue du Berceau, `(plafond − stock initial) ÷ taux` :
 *
 * | Ressource | Stock | Plafond | Taux | Saturation |
 * | --- | --- | --- | --- | --- |
 * | Camelote | 400 | 5 000 | 20 / h | **230 h** |
 * | Bave d'étoiles | 120 | 2 000 | 5 / h | **376 h** |
 * | Jus | 0 | 5 000 | 10 / h | **500 h** |
 *
 * À quatre cents heures, la Camelote et la Bave sont saturées, le Jus non. Et le
 * déblaiement d'un éboulis coûte **de la Camelote et rien d'autre** : la Camelote
 * cesse donc d'être saturée par la dépense elle-même, tandis que la Bave reste
 * saturée depuis un instant vieux de vingt-quatre heures.
 */
const BACKDATE_HOURS = 400

/** La saturation de la Bave d'étoiles : (2 000 − 120) ÷ 5 = 376 heures. */
const BAVE_SATURATION_HOURS = 376

async function backdate(planetId: string): Promise<number> {
  const [row] = await harness.sql<{ consolidatedAt: Date }[]>`
    update game.planets
       set consolidated_at = now() - (${BACKDATE_HOURS} * interval '1 hour')
     where id = ${planetId}
    returning consolidated_at as "consolidatedAt"
  `
  if (row === undefined) throw new Error('planète introuvable')
  return Math.floor(row.consolidatedAt.getTime() / 1000)
}

async function saturatedSinceInDb(planetId: string, resourceId: string): Promise<number | null> {
  const [row] = await harness.sql<{ saturatedSince: Date | null }[]>`
    select saturated_since as "saturatedSince"
      from game.planet_resources
     where planet_id = ${planetId} and resource_id = ${resourceId}
  `
  if (row === undefined) throw new Error(`possession introuvable : ${resourceId}`)
  return row.saturatedSince === null ? null : Math.floor(row.saturatedSince.getTime() / 1000)
}

describe('la fondation ne date aucune saturation', () => {
  it('laisse la colonne nulle pour les trois ressources', async () => {
    const { planetId } = await provisioned()

    for (const resourceId of ['camelote', 'jus', 'bave-etoiles']) {
      expect(await saturatedSinceInDb(planetId, resourceId), resourceId).toBeNull()
    }
  })

  it('rend null dans la réponse du GET', async () => {
    const { playerId } = await provisioned()
    const response = await server.read(playerId)

    expect(response.statusCode).toBe(200)
    for (const holding of response.json().holdings) {
      expect(holding.saturatedSince, holding.resourceId).toBeNull()
    }
  })
})

describe('une consolidation postérieure à la saturation ne la redate pas', () => {
  it('écrit l’instant où le plafond a été atteint, pas celui de la commande', async () => {
    const { playerId, planetId } = await provisioned()
    const consolidatedAt = await backdate(planetId)

    // Une commande quelconque : c'est elle qui consolide, et donc qui écrit.
    const started = await server.startWork(playerId, EBOULIS)
    expect(started.statusCode).toBe(201)

    const since = await saturatedSinceInDb(planetId, 'bave-etoiles')
    expect(since).not.toBeNull()
    expect((since as number) - consolidatedAt).toBe(BAVE_SATURATION_HOURS * 3_600)

    // Et surtout : bien avant l'instant de la commande, qui est « maintenant ».
    // C'est là tout l'enjeu — sans la colonne, la saturation daterait d'ici.
    const now = Math.floor(Date.now() / 1000)
    expect(since as number).toBeLessThan(now - 12 * 3_600)
  })

  it('remonte le même instant par le GET', async () => {
    const { playerId, planetId } = await provisioned()
    await backdate(planetId)
    expect((await server.startWork(playerId, EBOULIS)).statusCode).toBe(201)

    const inDb = await saturatedSinceInDb(planetId, 'bave-etoiles')
    expect(inDb).not.toBeNull()

    const response = await server.read(playerId)
    const holding = response
      .json()
      .holdings.find((h: { resourceId: string }) => h.resourceId === 'bave-etoiles')

    expect(holding.saturatedSince).toBe(inDb)
  })

  it('laisse null la ressource qui n’a pas atteint son plafond', async () => {
    const { playerId, planetId } = await provisioned()
    await backdate(planetId)
    expect((await server.startWork(playerId, EBOULIS)).statusCode).toBe(201)

    // Le Jus mettrait cinq cents heures ; quatre cents ne suffisent pas. La
    // colonne doit rester nulle, et non porter l'instant de la consolidation.
    expect(await saturatedSinceInDb(planetId, 'jus')).toBeNull()
  })

  /**
   * **La dépense met fin à la saturation, et c'est la bonne réponse.** Le
   * déblaiement coûte de la Camelote : la quantité redescend sous le plafond, la
   * ressource n'est donc plus saturée, et la garder datée mentirait au joueur.
   * La prochaine saturation sera datée de son propre instant.
   */
  it('annule la date de la ressource que la commande a dépensée', async () => {
    const { playerId, planetId } = await provisioned()
    await backdate(planetId)
    expect((await server.startWork(playerId, EBOULIS)).statusCode).toBe(201)

    expect(await saturatedSinceInDb(planetId, 'camelote')).toBeNull()
  })
})
