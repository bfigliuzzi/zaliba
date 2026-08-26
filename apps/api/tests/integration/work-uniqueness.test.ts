import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'
import { buildTestServer, type TestServer } from './server-harness.js'

/**
 * **I-9 éprouvé de bout en bout** : au plus un chantier non résolu par planète.
 *
 * T030 l'éprouvait au niveau du schéma — deux insertions directes, la seconde
 * refusée. Ici, ce sont deux **requêtes HTTP** qui traversent la forme unique de
 * commande, et c'est une autre affirmation : elle dit que le chemin applicatif
 * n'a pas de fenêtre par laquelle deux chantiers pourraient passer.
 *
 * Le point à comprendre, et il est contre-intuitif : ce n'est **pas** une
 * vérification préalable qui l'assure. Le code ne demande pas « y a-t-il déjà un
 * chantier ? » pour décider ; il tente, et c'est l'index unique partiel
 * `(planet_id) where resolved_at is null` qui arbitre. Vérifier puis écrire
 * laisserait entre les deux un intervalle, et cet intervalle serait exactement
 * le cas limite « deux vues du jeu ouvertes » de la spécification — c'est-à-dire
 * une mécanique de jeu, pas une hypothèse improbable.
 */

let harness: Harness
let server: TestServer

/** Une pose de mine sur la veine de Camelote de R7 : le placement valide type. */
const MINE_ON_VEIN = {
  nature: 'build',
  typeId: 'mine',
  variantId: 'square-4',
  orientation: 0,
  anchorX: 0,
  anchorY: 4,
} as const

/** Une centrale ailleurs : un second chantier parfaitement valide, s'il était seul. */
const CENTRALE = {
  nature: 'build',
  typeId: 'centrale',
  variantId: 'line-2',
  orientation: 0,
  anchorX: 3,
  anchorY: 3,
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

describe('le premier chantier est accepté', () => {
  it('répond 201 avec l’instantané, chantier compris', async () => {
    const playerId = await provisioned()
    const response = await server.startWork(playerId, MINE_ON_VEIN)

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.work).not.toBeNull()
    expect(body.work.target).toEqual(MINE_ON_VEIN)
  })

  /**
   * Le coût est débité **au lancement** (FR-036), et la réponse porte
   * l'instantané *après* débit : le client n'a aucun `GET` à enchaîner, et son
   * extrapolation reprend immédiatement sur une base fraîche.
   */
  it('débite le coût et rend l’instantané d’après débit', async () => {
    const playerId = await provisioned()
    const before = (await server.read(playerId)).json()
    const after = (await server.startWork(playerId, MINE_ON_VEIN)).json()

    const held = (body: { holdings: { resourceId: string; amountGrains: number }[] }, id: string) =>
      body.holdings.find((holding) => holding.resourceId === id)?.amountGrains ?? 0

    expect(held(after, 'camelote')).toBeLessThan(held(before, 'camelote'))
    expect(held(after, 'bave-etoiles')).toBeLessThan(held(before, 'bave-etoiles'))
    // Aucun coût en Jus (FR-062, R22) : il ne bouge que par la production.
    expect(held(after, 'jus')).toBeGreaterThanOrEqual(held(before, 'jus'))
  })

  it('écrit une ligne de chantier non résolue', async () => {
    const playerId = await provisioned()
    await server.startWork(playerId, MINE_ON_VEIN)

    const rows = await harness.sql<{ total: string }[]>`
      select count(*)::text as total from game.works where resolved_at is null
    `
    expect(Number(rows[0]?.total)).toBe(1)
  })

  /**
   * Le bâtiment n'existe **pas encore**. Les effets s'appliquent à l'échéance
   * (FR-032), et l'instantané ne porte donc que le chantier. C'est ce qui rend
   * l'aperçu exactement prédictible : entre le lancement et l'échéance, aucune
   * autre transition ne peut survenir.
   */
  it('ne pose aucun bâtiment au lancement', async () => {
    const playerId = await provisioned()
    const body = (await server.startWork(playerId, MINE_ON_VEIN)).json()

    expect(body.buildings).toEqual([])
    const rows = await harness.sql<{ total: string }[]>`
      select count(*)::text as total from game.buildings
    `
    expect(Number(rows[0]?.total)).toBe(0)
  })
})

describe('deux commandes simultanées : exactement une réussit (FR-033, I-9)', () => {
  /**
   * Deux sessions du même joueur, deux clés d'idempotence distinctes, émises
   * **sans attendre** l'une l'autre. C'est le cas limite « deux vues du jeu
   * ouvertes », et il est réel : rien côté client ne coordonne deux onglets.
   */
  it('accepte l’une et refuse l’autre en 409', async () => {
    const playerId = await provisioned()

    const [first, second] = await Promise.all([
      server.startWork(playerId, MINE_ON_VEIN),
      server.startWork(playerId, CENTRALE),
    ])

    const statuses = [first.statusCode, second.statusCode].sort()
    expect(statuses).toEqual([201, 409])
  })

  it('n’écrit qu’une seule ligne de chantier', async () => {
    const playerId = await provisioned()

    await Promise.all([
      server.startWork(playerId, MINE_ON_VEIN),
      server.startWork(playerId, CENTRALE),
    ])

    const rows = await harness.sql<{ total: string }[]>`
      select count(*)::text as total from game.works
    `
    expect(Number(rows[0]?.total)).toBe(1)
  })

  /**
   * **Le refus ne dépense rien.** La transaction perdante s'annule tout entière :
   * ni débit, ni reçu d'idempotence consommé. Sans cela, le second onglet
   * paierait un chantier qu'il n'a pas obtenu — la pire des issues, parce
   * qu'elle est invisible.
   */
  it('ne débite rien pour la commande refusée', async () => {
    const playerId = await provisioned()
    const before = (await server.read(playerId)).json()

    const results = await Promise.all([
      server.startWork(playerId, MINE_ON_VEIN),
      server.startWork(playerId, MINE_ON_VEIN),
    ])
    const accepted = results.find((response) => response.statusCode === 201)
    if (accepted === undefined) throw new Error('aucune des deux commandes n’a abouti')

    const held = (body: { holdings: { resourceId: string; amountGrains: number }[] }) =>
      body.holdings.find((holding) => holding.resourceId === 'camelote')?.amountGrains ?? 0

    // Un seul débit a eu lieu : la quantité manquante est celle d'un chantier.
    expect(held(before) - held(accepted.json())).toBeGreaterThan(0)

    const rows = await harness.sql<{ amount: string }[]>`
      select amount_grains::text as amount from game.planet_resources
      where resource_id = 'camelote'
    `
    expect(Number(rows[0]?.amount)).toBe(held(accepted.json()))
  })
})

describe('une seconde demande séquentielle est refusée avec l’échéance (FR-034, SC-006)', () => {
  it('répond 409 `work-in-progress`', async () => {
    const playerId = await provisioned()
    await server.startWork(playerId, MINE_ON_VEIN)

    const refused = await server.startWork(playerId, CENTRALE)
    expect(refused.statusCode).toBe(409)
    expect(refused.json().code).toBe('work-in-progress')
  })

  /**
   * SC-006 exige le motif **et** l'échéance. « Occupé » n'apprend rien ; « la
   * mine est finie dans deux minutes » dit au joueur quand revenir.
   */
  it('énonce l’identifiant, la nature et l’échéance du chantier en cours', async () => {
    const playerId = await provisioned()
    const started = (await server.startWork(playerId, MINE_ON_VEIN)).json()

    const details = (await server.startWork(playerId, CENTRALE)).json().details
    expect(details.workId).toBe(started.work.id)
    expect(details.nature).toBe('build')
    expect(details.dueAt).toBe(started.work.dueAt)
  })

  it('porte un identifiant de corrélation, comme toute réponse d’erreur', async () => {
    const playerId = await provisioned()
    await server.startWork(playerId, MINE_ON_VEIN)

    expect((await server.startWork(playerId, CENTRALE)).json().requestId).toBeTypeOf('string')
  })

  /**
   * Un refus **ne consomme pas** la clé d'idempotence : le joueur peut corriger
   * son intention et réémettre avec la même clé. C'est écrit au contrat, et
   * c'est ce qui distingue « le jeu a répondu non » de « la requête a eu lieu ».
   */
  it('laisse la clé d’idempotence libre après un refus', async () => {
    const playerId = await provisioned()
    await server.startWork(playerId, MINE_ON_VEIN)

    const key = randomUUID()
    expect((await server.startWork(playerId, CENTRALE, { idempotencyKey: key })).statusCode).toBe(
      409,
    )

    const rows = await harness.sql<{ total: string }[]>`
      select count(*)::text as total from game.command_receipts
      where idempotency_key = ${key}
    `
    expect(Number(rows[0]?.total)).toBe(0)
  })
})

describe('les chantiers de deux planètes ne se gênent pas', () => {
  /**
   * L'index est partiel **et** porté par `planet_id`. Sans le second point, le
   * premier chantier du serveur bloquerait ceux de tous les autres joueurs — un
   * défaut qu'un test à un seul joueur ne verrait jamais.
   */
  it('accepte un chantier sur chacune de deux planètes distinctes', async () => {
    const [first, second] = [await provisioned(), await provisioned()]

    expect((await server.startWork(first, MINE_ON_VEIN)).statusCode).toBe(201)
    expect((await server.startWork(second, MINE_ON_VEIN)).statusCode).toBe(201)
  })
})

describe('les refus de placement traversent l’API en 409 (FR-013)', () => {
  it.each([
    ['hors de la grille', { ...MINE_ON_VEIN, anchorX: 5, anchorY: 5 }, 'placement-out-of-grid'],
    [
      'sur une case obstruée',
      { ...MINE_ON_VEIN, anchorX: 0, anchorY: 2 },
      'placement-on-obstructed-cell',
    ],
  ] as const)('%s → %s', async (_label, payload, code) => {
    const playerId = await provisioned()
    const response = await server.startWork(playerId, payload)

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe(code)
    expect(response.json().details.cells.length).toBeGreaterThan(0)
  })

  it('refuse une variante étrangère au type', async () => {
    const playerId = await provisioned()
    const response = await server.startWork(playerId, {
      ...MINE_ON_VEIN,
      typeId: 'centrale',
      variantId: 'square-9',
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('variant-not-available-for-type')
  })

  /**
   * La frontière entre 400 et 409 est celle entre « la requête est malformée »
   * et « le jeu répond non ». Un client qui traite les 400 comme des bogues
   * afficherait le mauvais écran si on les confondait.
   */
  it('sépare la violation de schéma (400) du refus de jeu (409)', async () => {
    const playerId = await provisioned()

    expect((await server.startWork(playerId, { ...MINE_ON_VEIN, orientation: 7 })).statusCode).toBe(
      400,
    )
    expect((await server.startWork(playerId, { ...MINE_ON_VEIN, cost: 1 })).statusCode).toBe(400)
    expect(
      (await server.startWork(playerId, { ...MINE_ON_VEIN, anchorX: 5, anchorY: 5 })).statusCode,
    ).toBe(409)
  })

  it('exige une clé d’idempotence, comme toute commande', async () => {
    const playerId = await provisioned()
    expect(
      (await server.startWork(playerId, MINE_ON_VEIN, { idempotencyKey: null })).statusCode,
    ).toBe(400)
  })

  it('refuse un anonyme en 401, sans détail', async () => {
    expect((await server.startWorkAnonymous(MINE_ON_VEIN)).statusCode).toBe(401)
  })

  it('refuse en 404 un joueur sans planète', async () => {
    expect((await server.startWork(randomUUID(), MINE_ON_VEIN)).statusCode).toBe(404)
  })
})
