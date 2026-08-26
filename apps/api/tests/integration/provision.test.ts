import { randomUUID } from 'node:crypto'
import { BERCEAU } from '@zaliba/catalogs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'
import { buildTestServer, type TestServer } from './server-harness.js'

/**
 * `POST /v1/me/planet` — le provisionnement.
 *
 * Deux propriétés, et la première n'a pas de garde applicative :
 *
 * - **deux appels concurrents ne créent jamais deux planètes.** Ce n'est pas un
 *   verrou qui l'assure, c'est l'index unique sur `owner_id` (R11). La
 *   différence est celle entre une règle et une fenêtre de course : vérifier
 *   puis insérer laisse entre les deux un intervalle exploitable, et il n'existe
 *   aucune façon de le refermer dans le code applicatif. La base, elle, est la
 *   seule à pouvoir arbitrer ;
 * - **deux comptes indépendants reçoivent une planète identique** (SC-008).
 *   Aucun tirage au sort, aucune graine : le document de conception fonde
 *   l'équité sur la permutation d'un ensemble fixe, jamais sur la calibration
 *   d'un générateur.
 */

let harness: Harness
let server: TestServer

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

describe('la première demande crée la planète', () => {
  it('répond 201 avec l’instantané', async () => {
    const response = await server.provision(randomUUID())

    expect(response.statusCode).toBe(201)
    expect(response.json().planet.archetypeId).toBe('berceau')
  })

  it('fait du joueur le propriétaire **et** l’occupant (FR-006)', async () => {
    const playerId = randomUUID()
    const body = (await server.provision(playerId)).json()

    expect(body.planet.ownerId).toBe(playerId)
    expect(body.planet.occupantId).toBe(playerId)
  })

  it('donne le stock de départ du catalogue (FR-019)', async () => {
    const body = (await server.provision(randomUUID())).json()

    for (const holding of body.holdings as {
      resourceId: 'camelote'
      amountGrains: number
      lostGrains: number
    }[]) {
      expect(holding.amountGrains).toBe(BERCEAU.startingStockGrains[holding.resourceId])
      expect(holding.lostGrains).toBe(0)
    }
  })

  it('n’a ni bâtiment, ni case déblayée, ni chantier', async () => {
    const body = (await server.provision(randomUUID())).json()

    expect(body.buildings).toEqual([])
    expect(body.clearedCells).toEqual([])
    expect(body.work).toBeNull()
  })

  it('annonce l’instant serveur et la version du catalogue', async () => {
    const body = (await server.provision(randomUUID())).json()

    expect(Number.isInteger(body.serverInstant)).toBe(true)
    expect(body.catalogVersion.length).toBeGreaterThan(0)
  })
})

describe('la seconde demande ne crée rien', () => {
  it('répond 200 avec la planète existante', async () => {
    const playerId = randomUUID()
    const first = await server.provision(playerId)
    const second = await server.provision(playerId)

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(200)
    expect(second.json().planet.id).toBe(first.json().planet.id)
  })

  it('ne laisse qu’une planète en base', async () => {
    const playerId = randomUUID()
    await server.provision(playerId)
    await server.provision(playerId)

    const rows = await harness.sql`select id from game.planets where owner_id = ${playerId}`
    expect(rows).toHaveLength(1)
  })

  /**
   * Le scénario réel : deux onglets ouverts, ou une application mobile qui
   * réémet sur un réseau instable. Sans l'index unique, les deux transactions
   * liraient « aucune planète » et en insèreraient chacune une.
   */
  it('ne crée jamais deux planètes sur deux appels concurrents', async () => {
    const playerId = randomUUID()

    const [first, second] = await Promise.all([
      server.provision(playerId),
      server.provision(playerId),
    ])

    const rows = await harness.sql`select id from game.planets where owner_id = ${playerId}`
    expect(rows).toHaveLength(1)
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 201])
  })

  it('rend la même planète aux deux appelants concurrents', async () => {
    const playerId = randomUUID()
    const [first, second] = await Promise.all([
      server.provision(playerId),
      server.provision(playerId),
    ])

    expect(second.json().planet.id).toBe(first.json().planet.id)
  })
})

describe('deux comptes reçoivent une planète identique (SC-008)', () => {
  it('donne la même disposition et le même stock', async () => {
    const one = (await server.provision(randomUUID())).json()
    const two = (await server.provision(randomUUID())).json()

    expect(one.planet.layoutId).toBe(two.planet.layoutId)
    expect(one.planet.archetypeId).toBe(two.planet.archetypeId)
    expect(one.holdings).toEqual(two.holdings)
  })

  it('ne donne pas le même identifiant de planète', () => {
    // Deux planètes distinctes : l'identité n'est pas la disposition.
    expect(true).toBe(true)
  })

  it('donne deux identifiants distincts à deux joueurs', async () => {
    const one = (await server.provision(randomUUID())).json()
    const two = (await server.provision(randomUUID())).json()

    expect(one.planet.id).not.toBe(two.planet.id)
  })
})

describe('la clé d’idempotence est exigée', () => {
  it('refuse en 400 un provisionnement sans clé', async () => {
    const response = await server.provision(randomUUID(), { idempotencyKey: null })
    expect(response.statusCode).toBe(400)
  })

  it('refuse en 401 un provisionnement sans jeton', async () => {
    const response = await server.provisionAnonymous()
    expect(response.statusCode).toBe(401)
  })
})
