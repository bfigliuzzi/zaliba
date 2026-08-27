import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'
import { buildTestServer, type TestServer } from './server-harness.js'

/**
 * **Le test le moins intuitif de la tranche, et le plus important.**
 *
 * FR-007 ne demande pas « vérifier l'autorisation » — n'importe quel code le
 * fait. Il demande de la vérifier **d'après l'occupant constaté au moment de la
 * modification**, et non d'après une vérification antérieure. La nuance a l'air
 * théorique et ne l'est pas : les planètes changent d'occupant, et c'est une
 * mécanique de jeu annoncée. « Vérifier puis muter » laisse entre les deux un
 * intervalle pendant lequel la réponse cesse d'être vraie.
 *
 * D'où la forme du cas central : l'occupant change **pendant** que la commande
 * est en vol, et la commande doit être refusée. Un code qui aurait lu
 * l'occupant avant de verrouiller la ligne accepterait — et aucun test
 * séquentiel ne le distinguerait d'un code correct.
 *
 * L'autre moitié de la garantie n'est pas ici : c'est le `SELECT … FOR UPDATE`
 * du dépôt, sans lequel l'intervalle existerait quand même. Ce fichier vérifie
 * qu'il est bien là, par ses conséquences observables.
 */

let harness: Harness
let server: TestServer

const MINE_ON_VEIN = {
  nature: 'build',
  typeId: 'mine',
  variantId: 'square-4',
  orientation: 0,
  anchorX: 0,
  anchorY: 4,
} as const

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

async function provisioned(): Promise<string> {
  const playerId = randomUUID()
  expect((await server.provision(playerId)).statusCode).toBe(201)
  return playerId
}

async function setOccupant(ownerId: string, occupantId: string): Promise<void> {
  await harness.sql`
    update game.planets set occupant_id = ${occupantId} where owner_id = ${ownerId}
  `
}

/** Une pause courte : le temps qu'un verrou se pose ou qu'une requête se mette en attente. */
function settle(millis = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

describe('l’autorisation porte sur l’occupant, pas sur le jeton (FR-007)', () => {
  it('accepte le propriétaire tant qu’il est l’occupant', async () => {
    const playerId = await provisioned()
    expect((await server.startWork(playerId, MINE_ON_VEIN)).statusCode).toBe(201)
  })

  /**
   * Le jeton dit *qui*, et rien d'autre. Aucun droit n'y est lu : le
   * propriétaire d'une planète qu'il n'occupe plus n'a pas le droit d'y
   * construire, et son jeton n'en sait rien.
   */
  it('refuse le propriétaire qui n’est plus l’occupant, en 403', async () => {
    const playerId = await provisioned()
    await setOccupant(playerId, randomUUID())

    const response = await server.startWork(playerId, MINE_ON_VEIN)
    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe('not-occupant')
  })

  it('n’expose aucun détail sur l’occupant réel', async () => {
    const playerId = await provisioned()
    const intruder = randomUUID()
    await setOccupant(playerId, intruder)

    const body = (await server.startWork(playerId, MINE_ON_VEIN)).json()
    expect(JSON.stringify(body)).not.toContain(intruder)
  })

  it('ne débite rien et n’écrit aucun chantier quand il refuse', async () => {
    const playerId = await provisioned()
    const before = (await server.read(playerId)).json()
    await setOccupant(playerId, randomUUID())

    await server.startWork(playerId, MINE_ON_VEIN)

    const rows = await harness.sql<{ total: string }[]>`
      select count(*)::text as total from game.works
    `
    expect(Number(rows[0]?.total)).toBe(0)

    const resources = await harness.sql<{ resourceId: string; amount: string }[]>`
      select resource_id as "resourceId", amount_grains::text as amount
      from game.planet_resources where resource_id = 'camelote'
    `
    const held = before.holdings.find(
      (holding: { resourceId: string }) => holding.resourceId === 'camelote',
    ).amountGrains
    expect(Number(resources[0]?.amount)).toBe(held)
  })

  /**
   * La lecture reste ouverte au **propriétaire**, et c'est une décision, pas un
   * oubli : FR-007 porte sur les actions qui *modifient* une planète. Le rendre
   * explicite ici évite qu'un durcissement futur passe pour une correction de
   * bogue — il faudrait alors dire à quel écran le propriétaire dépossédé a
   * droit, ce qu'aucune exigence de 001 ne tranche.
   */
  it('laisse le propriétaire lire sa planète, occupée par un autre', async () => {
    const playerId = await provisioned()
    await setOccupant(playerId, randomUUID())

    expect((await server.read(playerId)).statusCode).toBe(200)
  })
})

describe('l’occupant change pendant que la commande est en vol', () => {
  /**
   * Le cas qui distingue un code correct d'un code qui *paraît* correct.
   *
   * Le déroulement est forcé, et il ne l'est pas par commodité : une
   * transaction extérieure verrouille la ligne de planète et change l'occupant,
   * puis la commande HTTP est émise. Elle **bute sur le verrou** — c'est ce
   * qu'on veut prouver — et ne lit donc l'occupant qu'après la validation de la
   * transaction extérieure. Elle voit alors le nouvel occupant, et refuse.
   *
   * Un code qui aurait vérifié l'autorisation avant de verrouiller aurait lu
   * l'ancien occupant et accepté. C'est exactement l'écart que ce cas mesure.
   */
  it('refuse la commande, parce qu’elle lit l’occupant après le verrou', async () => {
    const ownerId = await provisioned()
    const intruderId = randomUUID()

    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    const locking = harness.sql.begin(async (tx) => {
      await tx`select id from game.planets where owner_id = ${ownerId} for update`
      await tx`update game.planets set occupant_id = ${intruderId} where owner_id = ${ownerId}`
      await held
    })

    // Le verrou est posé et l'occupant déjà changé, mais rien n'est validé.
    await settle()
    const pending = server.startWork(ownerId, MINE_ON_VEIN)

    // La commande est en attente du verrou. On la laisse patienter, puis on
    // valide la transaction extérieure : elle repart sur l'état d'après.
    await settle()
    release?.()
    await locking

    const response = await pending
    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe('not-occupant')
  })

  /**
   * La contrepartie, sans laquelle le cas précédent serait satisfait par un
   * refus systématique : si la transaction extérieure ne change **pas**
   * l'occupant, la commande passe une fois le verrou libéré.
   */
  it('accepte la commande quand la transaction concurrente ne change pas l’occupant', async () => {
    const ownerId = await provisioned()

    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    const locking = harness.sql.begin(async (tx) => {
      await tx`select id from game.planets where owner_id = ${ownerId} for update`
      await held
    })

    await settle()
    const pending = server.startWork(ownerId, MINE_ON_VEIN)
    await settle()
    release?.()
    await locking

    expect((await pending).statusCode).toBe(201)
  })

  /**
   * Le verrou est bien un verrou : la commande n'a pas pu s'exécuter pendant que
   * la transaction extérieure tenait la ligne. Sans cette observation, les deux
   * cas ci-dessus pourraient passer sur un code qui ne verrouille rien et se
   * trouve simplement ordonnancé favorablement.
   */
  it('fait attendre la commande tant que la ligne est tenue', async () => {
    const ownerId = await provisioned()
    let released = false

    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    const locking = harness.sql.begin(async (tx) => {
      await tx`select id from game.planets where owner_id = ${ownerId} for update`
      await held
    })

    await settle()
    const pending = server.startWork(ownerId, MINE_ON_VEIN).then((response) => {
      expect(released, 'la commande a abouti avant la libération du verrou').toBe(true)
      return response
    })

    await settle(500)
    released = true
    release?.()
    await locking
    expect((await pending).statusCode).toBe(201)
  })
})
