import { randomUUID } from 'node:crypto'
import { ErrorBodyV1 } from '@zaliba/contracts'
import type { Instant } from '@zaliba/domain'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type CommandShape, executeCommand } from '../../src/command/execute.js'
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  idempotencyKeyOf,
} from '../../src/command/idempotency.js'
import { AppError } from '../../src/plugins/errors.js'
import { buildServer } from '../../src/server.js'
import { type Harness, startHarness } from './harness.js'

/**
 * L'idempotence des commandes.
 *
 * Le motif est concret et n'a rien d'une précaution générale : la cible est une
 * application mobile sur réseau instable. Une requête part, le réseau tombe, le
 * client ne sait pas si elle a abouti et la réémet. Sans reçu, le joueur
 * dépense deux fois — et il ne s'en aperçoit qu'à la comptabilité, longtemps
 * après.
 *
 * Trois exigences, et la troisième est celle qu'on oublie :
 *
 * 1. la clé est **obligatoire** — une commande sans clé est irrattrapable, donc
 *    refusée avant d'avoir rien fait ;
 * 2. une seconde tentative rejoue la **première réponse à l'identique**, sans
 *    dépenser ni lancer quoi que ce soit ;
 * 3. un **refus ne consomme pas** la clé. « Pas assez de Camelote » est une
 *    réponse du jeu, pas une dépense : le joueur doit pouvoir réessayer la même
 *    commande une seconde plus tard, quand la production l'aura rendue possible.
 */

let harness: Harness

beforeAll(async () => {
  harness = await startHarness()
}, 180_000)

afterAll(async () => {
  await harness?.stop()
})

beforeEach(async () => {
  await harness.reset()
})

// ─── Un instantané de substitution, adossé aux vraies tables ────────────────

interface TestSnapshot {
  readonly planetId: string
  readonly occupantId: string
  readonly camelote: bigint
}

type TestCommand =
  | { readonly kind: 'credit'; readonly grains: bigint }
  | { readonly kind: 'refuse' }

interface TestEffect {
  readonly credit: bigint
}

interface TestResponse {
  readonly camelote: string
  /** Un jeton tiré à chaque exécution : un rejeu doit rendre **le premier**. */
  readonly executionId: string
}

function shapeUnderTest(): CommandShape<
  TestSnapshot,
  { at: Instant },
  TestCommand,
  TestEffect,
  string,
  TestResponse
> {
  return {
    async loadLockedSnapshot(tx, planetId) {
      const [planet] = await tx<{ occupantId: string }[]>`
        select occupant_id as "occupantId" from game.planets where id = ${planetId} for update
      `
      if (planet === undefined) return undefined

      const [resource] = await tx<{ amountGrains: string }[]>`
        select amount_grains::text as "amountGrains" from game.planet_resources
        where planet_id = ${planetId} and resource_id = 'camelote'
      `
      return {
        planetId,
        occupantId: planet.occupantId,
        camelote: BigInt(resource?.amountGrains ?? '0'),
      }
    },
    occupantOf: (snapshot) => snapshot.occupantId,
    completionEffects: () => [],
    markWorkResolved: (snapshot) => snapshot,
    project: (_snapshot, at) => ({ at }),
    decide(_state, command) {
      if (command.kind === 'refuse') return { outcome: 'refused', refusal: 'work-in-progress' }
      return { outcome: 'accepted', effects: [{ credit: command.grains }] }
    },
    apply: (snapshot, effects) => ({
      ...snapshot,
      camelote: effects.reduce((total, effect) => total + effect.credit, snapshot.camelote),
    }),
    async writeSnapshot(tx, snapshot) {
      await tx`
        insert into game.planet_resources (planet_id, resource_id, amount_grains, lost_grains)
        values (${snapshot.planetId}, 'camelote', ${snapshot.camelote}, 0)
        on conflict (planet_id, resource_id) do update set amount_grains = excluded.amount_grains
      `
    },
    // `executionId` change à chaque appel : c'est ce qui distingue « rejoué »
    // de « ré-exécuté avec le même résultat ».
    respond: (snapshot) => ({ camelote: snapshot.camelote.toString(), executionId: randomUUID() }),
    refusalToError: (refusal) =>
      new AppError({
        category: 'game-rule-refusal',
        code: refusal,
        message: 'Le jeu refuse cette commande.',
      }),
  }
}

async function insertPlanet(occupantId: string, camelote = 0n): Promise<string> {
  const id = randomUUID()
  await harness.sql`
    insert into game.planets (id, owner_id, occupant_id, archetype_id, layout_id, consolidated_at)
    values (${id}, ${randomUUID()}, ${occupantId}, 'berceau', 'berceau-v1', now())
  `
  await harness.sql`
    insert into game.planet_resources (planet_id, resource_id, amount_grains, lost_grains)
    values (${id}, 'camelote', ${camelote}, 0)
  `
  return id
}

async function cameloteDe(planetId: string): Promise<bigint> {
  const [row] = await harness.sql<{ amountGrains: string }[]>`
    select amount_grains::text as "amountGrains" from game.planet_resources
    where planet_id = ${planetId} and resource_id = 'camelote'
  `
  return BigInt(row?.amountGrains ?? '0')
}

// ─── Le rejeu, au niveau de la commande ─────────────────────────────────────

describe('la même clé rejoue la première réponse, à l’identique', () => {
  it('ne dépense qu’une fois', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)
    const key = randomUUID()
    const attempt = {
      planetId,
      playerId: player,
      command: { kind: 'credit', grains: 500n } as const,
      idempotencyKey: key,
    }

    await executeCommand(harness.sql, attempt, shapeUnderTest())
    await executeCommand(harness.sql, attempt, shapeUnderTest())

    expect(await cameloteDe(planetId)).toBe(1_500n)
  })

  /**
   * « À l'identique » veut dire **la première réponse**, pas une réponse
   * équivalente recalculée. `executionId` change à chaque exécution : s'il
   * diffère entre les deux appels, la commande a été rejouée pour de bon.
   */
  it('rend la première réponse, et non une réponse recalculée', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)
    const attempt = {
      planetId,
      playerId: player,
      command: { kind: 'credit', grains: 500n } as const,
      idempotencyKey: randomUUID(),
    }

    const premier = await executeCommand(harness.sql, attempt, shapeUnderTest())
    const second = await executeCommand(harness.sql, attempt, shapeUnderTest())

    expect(second.response).toEqual(premier.response)
  })

  it('signale le rejeu, et ne le signale pas la première fois', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)
    const attempt = {
      planetId,
      playerId: player,
      command: { kind: 'credit', grains: 500n } as const,
      idempotencyKey: randomUUID(),
    }

    const premier = await executeCommand(harness.sql, attempt, shapeUnderTest())
    const second = await executeCommand(harness.sql, attempt, shapeUnderTest())

    expect(premier.replayed).toBe(false)
    expect(second.replayed).toBe(true)
  })

  it('n’exécute pas la commande une seconde fois', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)
    const attempt = {
      planetId,
      playerId: player,
      command: { kind: 'credit', grains: 500n } as const,
      idempotencyKey: randomUUID(),
    }

    await executeCommand(harness.sql, attempt, shapeUnderTest())

    let decided = false
    const observed = shapeUnderTest()
    await executeCommand(harness.sql, attempt, {
      ...observed,
      decide(state, command) {
        decided = true
        return observed.decide(state, command)
      },
    })

    expect(decided).toBe(false)
  })

  it('deux clés distinctes dépensent deux fois', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)
    const command = { kind: 'credit', grains: 500n } as const

    await executeCommand(
      harness.sql,
      { planetId, playerId: player, command, idempotencyKey: randomUUID() },
      shapeUnderTest(),
    )
    await executeCommand(
      harness.sql,
      { planetId, playerId: player, command, idempotencyKey: randomUUID() },
      shapeUnderTest(),
    )

    expect(await cameloteDe(planetId)).toBe(2_000n)
  })

  /**
   * Le reçu est **par joueur**. Deux joueurs qui tirent la même clé — un UUID,
   * mais rien n'oblige un client à en tirer un bon — ne doivent pas se rejouer
   * la réponse l'un de l'autre.
   */
  it('ne partage pas un reçu entre deux joueurs', async () => {
    const premier = randomUUID()
    const second = randomUUID()
    const planetUn = await insertPlanet(premier, 1_000n)
    const planetDeux = await insertPlanet(second, 1_000n)
    const key = randomUUID()
    const command = { kind: 'credit', grains: 500n } as const

    await executeCommand(
      harness.sql,
      { planetId: planetUn, playerId: premier, command, idempotencyKey: key },
      shapeUnderTest(),
    )
    const autre = await executeCommand(
      harness.sql,
      { planetId: planetDeux, playerId: second, command, idempotencyKey: key },
      shapeUnderTest(),
    )

    expect(autre.replayed).toBe(false)
    expect(await cameloteDe(planetDeux)).toBe(1_500n)
  })
})

describe('un refus ne consomme pas la clé', () => {
  it('laisse la même clé réutilisable après un refus', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)
    const key = randomUUID()

    await expect(
      executeCommand(
        harness.sql,
        { planetId, playerId: player, command: { kind: 'refuse' }, idempotencyKey: key },
        shapeUnderTest(),
      ),
    ).rejects.toMatchObject({ category: 'game-rule-refusal' })

    const rattrapage = await executeCommand(
      harness.sql,
      {
        planetId,
        playerId: player,
        command: { kind: 'credit', grains: 500n },
        idempotencyKey: key,
      },
      shapeUnderTest(),
    )

    expect(rattrapage.replayed).toBe(false)
    expect(await cameloteDe(planetId)).toBe(1_500n)
  })
})

// ─── La clé, au niveau HTTP ─────────────────────────────────────────────────

describe('l’en-tête Idempotency-Key est obligatoire', () => {
  function serverUnderTest(): FastifyInstance {
    const app = buildServer({ logLevel: 'silent' })
    app.post('/probe/commande', async (request, reply) => {
      const key = idempotencyKeyOf(request)
      reply.header(IDEMPOTENCY_REPLAYED_HEADER, 'false')
      return { key }
    })
    return app
  }

  it('refuse en 400 une commande sans clé', async () => {
    const response = await serverUnderTest().inject({
      method: 'POST',
      url: '/probe/commande',
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(() => ErrorBodyV1.parse(response.json())).not.toThrow()
  })

  it.each([
    ['une clé vide', ''],
    ['une clé qui n’est pas un UUID', 'pas-un-uuid'],
    ['une clé trop courte', '3f2504e0-4f89-11d3-9a0c'],
  ])('refuse en 400 %s', async (_label, key) => {
    const response = await serverUnderTest().inject({
      method: 'POST',
      url: '/probe/commande',
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })

  it('accepte une clé au format UUID', async () => {
    const key = randomUUID()
    const response = await serverUnderTest().inject({
      method: 'POST',
      url: '/probe/commande',
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
      payload: {},
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ key })
  })
})
