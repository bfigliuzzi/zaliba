import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'
import { buildTestServer, type TestServer } from './server-harness.js'

/**
 * `GET /v1/me/planet` — **fonction pure** (FR-031, R11).
 *
 * Aucune écriture, aucune consolidation, aucun provisionnement. C'est l'exigence
 * la plus facile à violer sans s'en apercevoir : consolider à la lecture paraît
 * économique — « puisqu'on est là » —, et transforme chaque affichage en
 * écriture. Un joueur qui laisse un onglet ouvert écrirait alors en base à
 * chaque rafraîchissement, et deux onglets se disputeraient le verrou d'une
 * planète que personne ne modifie.
 *
 * Le cas qui tranche est celui du **chantier échu depuis trois semaines** : il
 * doit rester présent dans `work`, non résolu, et la base ne doit pas bouger
 * d'un octet. C'est la projection locale du client qui l'applique, à `dueAt`.
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

/** L'empreinte complète de la base, pour prouver qu'une lecture n'écrit rien. */
async function databaseFingerprint(): Promise<string> {
  const [planets, resources, buildings, cleared, works, receipts] = await Promise.all([
    harness.sql`select * from game.planets order by id`,
    harness.sql`select * from game.planet_resources order by planet_id, resource_id`,
    harness.sql`select * from game.buildings order by id`,
    harness.sql`select * from game.cleared_cells order by planet_id, x, y`,
    harness.sql`select * from game.works order by id`,
    harness.sql`select * from game.command_receipts order by player_id, idempotency_key`,
  ])
  // Les grains sont des `bigint` : `JSON.stringify` les refuse.
  return JSON.stringify([planets, resources, buildings, cleared, works, receipts], (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  )
}

describe('sans planète, le GET ne provisionne rien', () => {
  it('répond 404 avec le motif exact', async () => {
    const response = await server.read(randomUUID())

    expect(response.statusCode).toBe(404)
    expect(response.json().code).toBe('planet-not-provisioned')
  })

  /**
   * L'erreur la plus tentante : provisionner à la première lecture, « pour la
   * commodité ». Elle ferait du `GET` une mutation, et R11 l'écarte
   * nommément — le provisionnement est une commande explicite, pour que le
   * `GET` reste pur.
   */
  it('ne crée aucune planète au passage', async () => {
    await server.read(randomUUID())
    const rows = await harness.sql`select id from game.planets`
    expect(rows).toHaveLength(0)
  })

  it('répond 401 sans jeton, avant même de chercher', async () => {
    const response = await server.readAnonymous()
    expect(response.statusCode).toBe(401)
  })
})

describe('avec une planète, le GET la rend sans rien écrire', () => {
  it('répond 200 avec l’instantané', async () => {
    const playerId = randomUUID()
    await server.provision(playerId)

    const response = await server.read(playerId)
    expect(response.statusCode).toBe(200)
    expect(response.json().planet.ownerId).toBe(playerId)
  })

  it('laisse la base rigoureusement inchangée', async () => {
    const playerId = randomUUID()
    await server.provision(playerId)

    const before = await databaseFingerprint()
    await server.read(playerId)
    await server.read(playerId)
    expect(await databaseFingerprint()).toBe(before)
  })

  it('rend le même instantané à deux lectures successives', async () => {
    const playerId = randomUUID()
    await server.provision(playerId)

    const first = (await server.read(playerId)).json()
    const second = (await server.read(playerId)).json()

    expect(second.planet).toEqual(first.planet)
    expect(second.holdings).toEqual(first.holdings)
  })

  /**
   * `consolidatedAt` ne bouge pas d'une lecture à l'autre. S'il bougeait, c'est
   * que le `GET` aurait consolidé — et le joueur perdrait la trace de son
   * dernier écrit réel.
   */
  it('ne fait pas avancer l’instant de consolidation', async () => {
    const playerId = randomUUID()
    const provisioned = (await server.provision(playerId)).json()

    const read = (await server.read(playerId)).json()
    expect(read.planet.consolidatedAt).toBe(provisioned.planet.consolidatedAt)
  })

  /**
   * L'instant serveur, lui, **avance** : c'est la référence du décalage
   * d'horloge du client, pas une date d'écriture.
   */
  it('rend un instant serveur courant, distinct de la consolidation', async () => {
    const playerId = randomUUID()
    await server.provision(playerId)
    await harness.sql`update game.planets set consolidated_at = now() - interval '1 hour'`

    const read = (await server.read(playerId)).json()
    expect(read.serverInstant).toBeGreaterThan(read.planet.consolidatedAt)
  })
})

describe('un chantier échu depuis trois semaines reste là (FR-031, R3)', () => {
  async function withOverdueWork(playerId: string): Promise<string> {
    await server.provision(playerId)
    const [planet] = await harness.sql<{ id: string }[]>`
      select id from game.planets where owner_id = ${playerId}
    `
    const workId = randomUUID()
    await harness.sql`
      insert into game.works (id, planet_id, nature, started_at, due_at, target_x, target_y)
      values (
        ${workId}, ${planet?.id ?? ''}, 'clear',
        now() - interval '22 days', now() - interval '21 days', 3, 0
      )
    `
    return workId
  }

  it('le rend dans la réponse, non résolu', async () => {
    const playerId = randomUUID()
    const workId = await withOverdueWork(playerId)

    const body = (await server.read(playerId)).json()
    expect(body.work?.id).toBe(workId)
    expect(body.work?.target).toEqual({ nature: 'clear', x: 3, y: 0 })
  })

  /**
   * Le cas décisif. Trois semaines de retard, une lecture, et **rien** ne bouge :
   * ni `resolved_at`, ni `consolidated_at`, ni les quantités. La consolidation
   * attend la prochaine mutation.
   */
  it('n’écrit rien, malgré l’échéance dépassée', async () => {
    const playerId = randomUUID()
    await withOverdueWork(playerId)

    const before = await databaseFingerprint()
    await server.read(playerId)
    expect(await databaseFingerprint()).toBe(before)
  })

  it('laisse le chantier non résolu en base', async () => {
    const playerId = randomUUID()
    const workId = await withOverdueWork(playerId)

    await server.read(playerId)
    const [row] = await harness.sql<{ resolvedAt: Date | null }[]>`
      select resolved_at as "resolvedAt" from game.works where id = ${workId}
    `
    expect(row?.resolvedAt).toBeNull()
  })

  /**
   * Le `dueAt` transmis est celui de l'échéance, pas celui de la constatation.
   * C'est ce qui permet au client d'appliquer l'effet **au bon instant** et
   * d'afficher la production des trois semaines écoulées depuis (FR-032).
   */
  it('transmet l’échéance passée telle quelle', async () => {
    const playerId = randomUUID()
    await withOverdueWork(playerId)

    const body = (await server.read(playerId)).json()
    expect(body.work.dueAt).toBeLessThan(body.serverInstant)
    expect(body.work.startedAt).toBeLessThan(body.work.dueAt)
  })
})
