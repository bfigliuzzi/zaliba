import { randomUUID } from 'node:crypto'
import type { Instant } from '@zaliba/domain'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type CommandShape, executeCommand } from '../../src/command/execute.js'
import { AppError } from '../../src/plugins/errors.js'
import { type Harness, startHarness } from './harness.js'

/**
 * La forme unique de toute mutation, éprouvée sur un **vrai** PostgreSQL.
 *
 * ```
 * verrouiller la planète (SELECT … FOR UPDATE)
 *   → vérifier l'autorisation sur l'état verrouillé   (FR-007)
 *   → résoudre le chantier échu, s'il y en a un       (FR-032)
 *   → projeter au now() de la transaction             (R2)
 *   → decide() : le domaine dit oui ou non            (FR-056)
 *   → apply() : les effets
 *   → écrire l'instantané daté + le reçu
 * ```
 *
 * Ce que ces cas éprouvent n'est pas une préférence de style. L'ordre
 * « verrouiller **puis** autoriser » est la différence entre une règle et une
 * fenêtre de course : les planètes changent d'occupant, et vérifier avant de
 * verrouiller laisse entre les deux un intervalle pendant lequel la réponse
 * cesse d'être vraie. Ici, l'intervalle n'existe pas.
 *
 * Le domaine et le dépôt d'instantanés n'existent pas encore — ils arrivent
 * avec US1. Ce qui est éprouvé ici est donc la **forme**, sur des collaborateurs
 * substitués, mais contre une vraie base : ce sont le verrou, la transaction et
 * l'horloge de PostgreSQL qui sont en jeu, et aucun d'eux ne se simule.
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
  readonly consolidatedAt: number
  readonly camelote: bigint
  readonly dueWorkId: string | null
  readonly workResolved: boolean
}

interface TestState {
  readonly at: Instant
  readonly snapshot: TestSnapshot
}

type TestCommand =
  | { readonly kind: 'credit'; readonly grains: bigint }
  | { readonly kind: 'refuse' }

interface TestEffect {
  readonly credit: bigint
}

interface Recorder {
  readonly steps: string[]
  readonly txids: Set<string>
  /** L'instant que la forme a passé à la projection. */
  at: number | null
  /** Ce que PostgreSQL disait de son propre `transaction_timestamp()`. */
  transactionEpoch: number | null
  /** Le nombre de secondes qu'attend `decide`, pour éprouver le verrou. */
  decideDelayMs: number
}

function recorder(): Recorder {
  return {
    steps: [],
    txids: new Set(),
    at: null,
    transactionEpoch: null,
    decideDelayMs: 0,
  }
}

/** Le crédit que la résolution d'un chantier échu apporte. */
const WORK_COMPLETION_CREDIT = 1_000n

function shapeUnderTest(
  log: Recorder,
): CommandShape<TestSnapshot, TestState, TestCommand, TestEffect, string, { camelote: string }> {
  return {
    async loadLockedSnapshot(tx, planetId) {
      const [planet] = await tx<
        { occupantId: string; consolidatedAt: Date; txid: string; epoch: string }[]
      >`
        select p.occupant_id as "occupantId",
               p.consolidated_at as "consolidatedAt",
               txid_current()::text as txid,
               extract(epoch from transaction_timestamp())::text as epoch
        from game.planets p
        where p.id = ${planetId}
        for update
      `
      if (planet === undefined) return undefined

      log.steps.push('load')
      log.txids.add(planet.txid)
      log.transactionEpoch = Number(planet.epoch)

      const [resource] = await tx<{ amountGrains: string }[]>`
        select amount_grains::text as "amountGrains" from game.planet_resources
        where planet_id = ${planetId} and resource_id = 'camelote'
      `
      const [work] = await tx<{ id: string }[]>`
        select id from game.works
        where planet_id = ${planetId} and resolved_at is null and due_at <= transaction_timestamp()
      `

      return {
        planetId,
        occupantId: planet.occupantId,
        consolidatedAt: Math.floor(planet.consolidatedAt.getTime() / 1000),
        camelote: BigInt(resource?.amountGrains ?? '0'),
        dueWorkId: work?.id ?? null,
        workResolved: false,
      }
    },

    occupantOf(snapshot) {
      log.steps.push('authorize')
      return snapshot.occupantId
    },

    completionEffects(snapshot, at) {
      log.steps.push('resolve')
      // Pas d'ordonnanceur, pas de tâche de fond (R3) : le temps se rattrape à
      // la lecture. Les effets d'achèvement sont **redérivés** ici, jamais lus
      // d'une charge sérialisée — une charge stockée deviendrait une surface de
      // confiance, et fausse le jour où l'équilibrage change.
      void at
      return snapshot.dueWorkId === null ? [] : [{ credit: WORK_COMPLETION_CREDIT }]
    },

    markWorkResolved(snapshot) {
      return snapshot.dueWorkId === null ? snapshot : { ...snapshot, workResolved: true }
    },

    project(snapshot, at) {
      log.steps.push('project')
      log.at = at
      return { at, snapshot }
    },

    async decide(state, command) {
      log.steps.push('decide')
      if (log.decideDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, log.decideDelayMs))
      }
      if (command.kind === 'refuse') return { outcome: 'refused', refusal: 'work-in-progress' }
      void state
      return { outcome: 'accepted', effects: [{ credit: command.grains }] }
    },

    apply(snapshot, effects, at) {
      log.steps.push('apply')
      const credited = effects.reduce((total, effect) => total + effect.credit, snapshot.camelote)
      return { ...snapshot, camelote: credited, consolidatedAt: at }
    },

    async writeSnapshot(tx, snapshot) {
      const [row] = await tx<{ txid: string }[]>`select txid_current()::text as txid`
      log.steps.push('write')
      if (row !== undefined) log.txids.add(row.txid)

      await tx`
        update game.planets
        set consolidated_at = to_timestamp(${snapshot.consolidatedAt})
        where id = ${snapshot.planetId}
      `
      await tx`
        insert into game.planet_resources (planet_id, resource_id, amount_grains, lost_grains)
        values (${snapshot.planetId}, 'camelote', ${snapshot.camelote}, 0)
        on conflict (planet_id, resource_id)
        do update set amount_grains = excluded.amount_grains
      `
      if (snapshot.workResolved && snapshot.dueWorkId !== null) {
        await tx`
          update game.works set resolved_at = transaction_timestamp()
          where id = ${snapshot.dueWorkId}
        `
      }
    },

    respond(snapshot) {
      return { camelote: snapshot.camelote.toString() }
    },

    refusalToError(refusal) {
      return new AppError({
        category: 'game-rule-refusal',
        code: refusal,
        message: 'Le jeu refuse cette commande.',
      })
    },
  }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

async function insertPlanet(occupantId: string, camelote = 0n): Promise<string> {
  const id = randomUUID()
  await harness.sql`
    insert into game.planets (id, owner_id, occupant_id, archetype_id, layout_id, consolidated_at)
    values (${id}, ${randomUUID()}, ${occupantId}, 'berceau', 'berceau-v1', now() - interval '1 hour')
  `
  await harness.sql`
    insert into game.planet_resources (planet_id, resource_id, amount_grains, lost_grains)
    values (${id}, 'camelote', ${camelote}, 0)
  `
  return id
}

/** Un chantier de déblaiement déjà échu. */
async function insertDueWork(planetId: string): Promise<string> {
  const id = randomUUID()
  await harness.sql`
    insert into game.works (id, planet_id, nature, started_at, due_at, target_x, target_y)
    values (${id}, ${planetId}, 'clear', now() - interval '2 hours', now() - interval '1 hour', 3, 4)
  `
  return id
}

function request(planetId: string, playerId: string, command: TestCommand) {
  return { planetId, playerId, command, idempotencyKey: randomUUID() }
}

async function cameloteDe(planetId: string): Promise<bigint> {
  const [row] = await harness.sql<{ amountGrains: string }[]>`
    select amount_grains::text as "amountGrains" from game.planet_resources
    where planet_id = ${planetId} and resource_id = 'camelote'
  `
  return BigInt(row?.amountGrains ?? '0')
}

// ─── Les cas ────────────────────────────────────────────────────────────────

describe('la forme s’exécute dans l’ordre, et dans une seule transaction', () => {
  it('suit l’ordre verrouiller → autoriser → résoudre → projeter → décider → appliquer → écrire', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player)
    const log = recorder()

    await executeCommand(
      harness.sql,
      request(planetId, player, { kind: 'credit', grains: 500n }),
      shapeUnderTest(log),
    )

    expect(log.steps).toEqual([
      'load',
      'authorize',
      'resolve',
      'project',
      'decide',
      'apply',
      'write',
    ])
  })

  /**
   * `txid_current()` est constant à l'intérieur d'une transaction et distinct
   * d'une transaction à l'autre. Un seul identifiant relevé du chargement à
   * l'écriture est donc une preuve, et non un indice.
   */
  it('charge et écrit sous le même identifiant de transaction', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player)
    const log = recorder()

    await executeCommand(
      harness.sql,
      request(planetId, player, { kind: 'credit', grains: 500n }),
      shapeUnderTest(log),
    )

    expect(log.txids.size).toBe(1)
  })
})

describe('le verrou tient : deux commandes simultanées ne se perdent pas', () => {
  /**
   * Le scénario du doublon de clic, ou des deux onglets ouverts. Sans
   * `FOR UPDATE`, les deux commandes lisent la même quantité, écrivent chacune
   * `lu + 500`, et l'un des deux crédits disparaît sans qu'aucune erreur ne
   * soit levée. C'est la panne la plus discrète qu'un jeu de gestion puisse
   * avoir, parce qu'elle ne se voit qu'à la comptabilité.
   */
  it('n’en perd aucune : les deux crédits sont là', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)

    const premier = recorder()
    premier.decideDelayMs = 150
    const second = recorder()

    await Promise.all([
      executeCommand(
        harness.sql,
        request(planetId, player, { kind: 'credit', grains: 500n }),
        shapeUnderTest(premier),
      ),
      executeCommand(
        harness.sql,
        request(planetId, player, { kind: 'credit', grains: 500n }),
        shapeUnderTest(second),
      ),
    ])

    expect(await cameloteDe(planetId)).toBe(2_000n)
  })

  it('les deux commandes s’exécutent bien dans deux transactions distinctes', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)

    const premier = recorder()
    premier.decideDelayMs = 150
    const second = recorder()

    await Promise.all([
      executeCommand(
        harness.sql,
        request(planetId, player, { kind: 'credit', grains: 500n }),
        shapeUnderTest(premier),
      ),
      executeCommand(
        harness.sql,
        request(planetId, player, { kind: 'credit', grains: 500n }),
        shapeUnderTest(second),
      ),
    ])

    const [un] = [...premier.txids]
    const [deux] = [...second.txids]
    expect(un).not.toBe(deux)
  })
})

describe('l’autorisation se vérifie sur la ligne verrouillée (FR-007)', () => {
  it('refuse en 403 un appelant qui n’est pas l’occupant', async () => {
    const occupant = randomUUID()
    const intrus = randomUUID()
    const planetId = await insertPlanet(occupant)

    await expect(
      executeCommand(
        harness.sql,
        request(planetId, intrus, { kind: 'credit', grains: 500n }),
        shapeUnderTest(recorder()),
      ),
    ).rejects.toMatchObject({ category: 'authorization' })
  })

  it('n’écrit rien quand l’appelant n’est pas l’occupant', async () => {
    const occupant = randomUUID()
    const planetId = await insertPlanet(occupant, 1_000n)

    await expect(
      executeCommand(
        harness.sql,
        request(planetId, randomUUID(), { kind: 'credit', grains: 500n }),
        shapeUnderTest(recorder()),
      ),
    ).rejects.toBeInstanceOf(AppError)

    expect(await cameloteDe(planetId)).toBe(1_000n)
  })

  /**
   * L'ordre est le sujet. Autoriser **avant** de verrouiller laisserait entre
   * les deux un intervalle pendant lequel l'occupant peut changer — et la
   * réponse « vous êtes l'occupant » cesserait d'être vraie au moment où on
   * s'en sert.
   */
  it('n’autorise jamais avant d’avoir verrouillé', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player)
    const log = recorder()

    await executeCommand(
      harness.sql,
      request(planetId, player, { kind: 'credit', grains: 500n }),
      shapeUnderTest(log),
    )

    expect(log.steps.indexOf('load')).toBeLessThan(log.steps.indexOf('authorize'))
  })

  it('rend 404 pour une planète qui n’existe pas', async () => {
    await expect(
      executeCommand(
        harness.sql,
        request(randomUUID(), randomUUID(), { kind: 'credit', grains: 500n }),
        shapeUnderTest(recorder()),
      ),
    ).rejects.toMatchObject({ category: 'not-found' })
  })
})

describe('l’instant de référence est celui de PostgreSQL, tronqué à la seconde', () => {
  it('projette à un entier de secondes', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player)
    const log = recorder()

    await executeCommand(
      harness.sql,
      request(planetId, player, { kind: 'credit', grains: 500n }),
      shapeUnderTest(log),
    )

    expect(Number.isInteger(log.at)).toBe(true)
  })

  /**
   * L'instant vient de `transaction_timestamp()`, pas de `Date.now()`. La
   * différence n'est pas théorique : l'horloge de la machine qui exécute Node
   * dérive de celle de la base, et une commande qui daterait ses écritures avec
   * la première produirait un instantané en avance ou en retard sur le `now()`
   * que la transaction suivante observera.
   */
  it('prend l’instant de la transaction, et non l’horloge du processus', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player)
    const log = recorder()

    await executeCommand(
      harness.sql,
      request(planetId, player, { kind: 'credit', grains: 500n }),
      shapeUnderTest(log),
    )

    expect(log.at).toBe(Math.floor(log.transactionEpoch ?? Number.NaN))
  })

  it('date l’instantané écrit du même instant', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player)
    const log = recorder()

    await executeCommand(
      harness.sql,
      request(planetId, player, { kind: 'credit', grains: 500n }),
      shapeUnderTest(log),
    )

    const [row] = await harness.sql<{ epoch: string }[]>`
      select extract(epoch from consolidated_at)::text as epoch
      from game.planets where id = ${planetId}
    `
    expect(Number(row?.epoch)).toBe(log.at)
  })
})

describe('le chantier échu est résolu par la projection (R3, FR-032)', () => {
  it('applique le crédit d’achèvement en plus de celui de la commande', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 0n)
    await insertDueWork(planetId)

    await executeCommand(
      harness.sql,
      request(planetId, player, { kind: 'credit', grains: 500n }),
      shapeUnderTest(recorder()),
    )

    expect(await cameloteDe(planetId)).toBe(WORK_COMPLETION_CREDIT + 500n)
  })

  /**
   * La ligne résolue **reste** : elle est l'histoire de la planète. C'est
   * d'ailleurs ce qui impose que l'index d'unicité de `works` soit partiel.
   */
  it('marque le chantier résolu sans le supprimer', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player)
    const workId = await insertDueWork(planetId)

    await executeCommand(
      harness.sql,
      request(planetId, player, { kind: 'credit', grains: 500n }),
      shapeUnderTest(recorder()),
    )

    const [row] = await harness.sql<{ resolvedAt: Date | null }[]>`
      select resolved_at as "resolvedAt" from game.works where id = ${workId}
    `
    expect(row?.resolvedAt).not.toBeNull()
  })

  it('laisse intact un chantier non échu', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player)
    const workId = randomUUID()
    await harness.sql`
      insert into game.works (id, planet_id, nature, started_at, due_at, target_x, target_y)
      values (${workId}, ${planetId}, 'clear', now(), now() + interval '1 hour', 1, 1)
    `

    await executeCommand(
      harness.sql,
      request(planetId, player, { kind: 'credit', grains: 500n }),
      shapeUnderTest(recorder()),
    )

    const [row] = await harness.sql<{ resolvedAt: Date | null }[]>`
      select resolved_at as "resolvedAt" from game.works where id = ${workId}
    `
    expect(row?.resolvedAt).toBeNull()
  })
})

describe('l’instantané et le reçu sont écrits dans la même transaction', () => {
  it('écrit le reçu de la commande acceptée', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player)
    const attempt = request(planetId, player, { kind: 'credit', grains: 500n })

    await executeCommand(harness.sql, attempt, shapeUnderTest(recorder()))

    const [row] = await harness.sql<{ response: { camelote: string } }[]>`
      select response from game.command_receipts
      where player_id = ${player} and idempotency_key = ${attempt.idempotencyKey}
    `
    expect(row?.response).toEqual({ camelote: '500' })
  })

  /**
   * Un refus n'est pas un échec technique : la transaction s'annule, mais la
   * clé d'idempotence **n'est pas consommée**. Un joueur à qui l'on répond
   * « pas assez de Camelote » doit pouvoir réessayer la même commande une
   * seconde plus tard, quand la production l'aura rendue possible.
   */
  it('n’écrit ni instantané ni reçu quand le domaine refuse', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)
    const attempt = request(planetId, player, { kind: 'refuse' })

    await expect(
      executeCommand(harness.sql, attempt, shapeUnderTest(recorder())),
    ).rejects.toMatchObject({ category: 'game-rule-refusal', code: 'work-in-progress' })

    expect(await cameloteDe(planetId)).toBe(1_000n)
    const receipts = await harness.sql`
      select 1 from game.command_receipts
      where player_id = ${player} and idempotency_key = ${attempt.idempotencyKey}
    `
    expect(receipts).toHaveLength(0)
  })

  /**
   * Rien ne doit survivre à une transaction annulée — pas même l'écriture qui
   * avait déjà réussi avant que la suivante n'échoue.
   */
  it('n’écrit rien quand l’écriture de l’instantané échoue', async () => {
    const player = randomUUID()
    const planetId = await insertPlanet(player, 1_000n)
    const log = recorder()
    const shape = shapeUnderTest(log)
    const attempt = request(planetId, player, { kind: 'credit', grains: 500n })

    await expect(
      executeCommand(harness.sql, attempt, {
        ...shape,
        async writeSnapshot(tx, snapshot) {
          await shape.writeSnapshot(tx, snapshot)
          throw new Error('panne après écriture')
        },
      }),
    ).rejects.toThrow(/panne/)

    expect(await cameloteDe(planetId)).toBe(1_000n)
    const receipts = await harness.sql`
      select 1 from game.command_receipts where player_id = ${player}
    `
    expect(receipts).toHaveLength(0)
  })
})
