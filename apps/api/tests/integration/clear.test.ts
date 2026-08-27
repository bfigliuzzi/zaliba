import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'
import { buildTestServer, type TestServer } from './server-harness.js'

/**
 * **Le déblaiement, écrit dans un vrai PostgreSQL** (US5).
 *
 * Les tests de domaine éprouvent la règle, l'invariant I-8 garde
 * l'irréversibilité, et le parcours de bout en bout la montre au joueur. Trois
 * affirmations ne tiennent qu'ici :
 *
 * - **la ligne de chantier passe la contrainte de la base.**
 *   `works_target_matches_nature` exige d'un `clear` qu'il porte des coordonnées
 *   **et rien d'autre** — ni bâtiment cible, ni type, ni variante, ni orientation.
 *   La traduction du domaine vers les colonnes plates est écrite à la main
 *   (`mapping/snapshot.ts`), et une colonne laissée renseignée par mégarde ferait
 *   échouer l'insertion **à l'exécution seulement** ;
 * - **l'état obstrué est une soustraction, jamais une table de trente-six
 *   lignes** : à l'achèvement, `game.cleared_cells` gagne *une* ligne, et rien
 *   d'autre n'est écrit — aucun bâtiment, aucune case de bâtiment ;
 * - **I-8 vu de l'API** : redéblayer une case déjà déblayée est refusé, et le
 *   refus est un 409 de règle de jeu et non un défaut serveur. C'est la façon dont
 *   l'irréversibilité se manifeste à un client — et il n'existe aucune route qui
 *   pourrait la contourner.
 */

let harness: Harness
let server: TestServer

/** (3,0) : un éboulis dans la disposition du Berceau (R7). Terrain nu. */
const EBOULIS = { nature: 'clear', x: 3, y: 0 } as const

/** (3,2) : une poche scellée. Elle révèle un geyser de Jus. */
const POCHE = { nature: 'clear', x: 3, y: 2 } as const

/** (5,5) : libre dans la disposition. Rien à déblayer. */
const LIBRE = { nature: 'clear', x: 5, y: 5 } as const

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
 * Ramène dans le passé l'échéance du chantier en cours, **et la consolidation**.
 *
 * Les deux, et c'est le piège : la projection ne résout un chantier que si son
 * échéance tombe dans la fenêtre `[consolidatedAt, at]` (R3). Reculer `due_at`
 * seul le ferait passer *avant* la consolidation, et le chantier ne s'achèverait
 * jamais.
 */
async function backdateDueWork(planetId: string): Promise<void> {
  await harness.sql`
    update game.planets
       set consolidated_at = now() - interval '3 hours'
     where id = ${planetId}
  `
  await harness.sql`
    update game.works
       set started_at = now() - interval '2 hours',
           due_at = now() - interval '1 hour'
     where planet_id = ${planetId} and resolved_at is null
  `
}

interface WorkRow {
  readonly nature: string
  readonly targetBuildingId: string | null
  readonly targetX: number | null
  readonly targetY: number | null
  readonly typeId: string | null
  readonly variantId: string | null
  readonly orientation: number | null
}

async function unresolvedWork(planetId: string): Promise<WorkRow | undefined> {
  const [row] = await harness.sql<WorkRow[]>`
    select nature,
           target_building_id as "targetBuildingId",
           target_x as "targetX",
           target_y as "targetY",
           type_id as "typeId",
           variant_id as "variantId",
           orientation
      from game.works
     where planet_id = ${planetId} and resolved_at is null
  `
  return row
}

/** Les cases déblayées, telles que la base les porte. */
async function clearedCells(planetId: string): Promise<readonly string[]> {
  const rows = await harness.sql<{ x: number; y: number }[]>`
    select x, y from game.cleared_cells where planet_id = ${planetId} order by x, y
  `
  return rows.map((row) => `${row.x},${row.y}`)
}

describe('la ligne de chantier de déblaiement passe la contrainte de la base', () => {
  it('répond 201 et porte la case dans l’instantané', async () => {
    const { playerId } = await provisioned()

    const response = await server.startWork(playerId, EBOULIS)
    expect(response.statusCode).toBe(201)

    // La cible du contrat ne porte **aucun bâtiment** : c'est la même absence
    // côté réponse que côté intention.
    expect(response.json().work.target).toEqual({ nature: 'clear', x: 3, y: 0 })
  })

  /**
   * Les colonnes non concernées sont **nulles**, et la contrainte l'exige. Ce test
   * ne double pas celui du schéma : celui-là insérait à la main, celui-ci fait
   * écrire l'application.
   */
  it('n’écrit que les colonnes de coordonnées', async () => {
    const { playerId, planetId } = await provisioned()
    expect((await server.startWork(playerId, EBOULIS)).statusCode).toBe(201)

    expect(await unresolvedWork(planetId)).toEqual({
      nature: 'clear',
      targetBuildingId: null,
      targetX: 3,
      targetY: 0,
      typeId: null,
      variantId: null,
      orientation: null,
    })
  })

  /**
   * Le coût est débité **au lancement** (FR-036), et le débit atteint la base.
   *
   * L'énoncé est celui de l'amélioration, et il est concluant sans arithmétique
   * fragile : la même transaction crédite **trois heures** de production et débite
   * le coût, et la quantité stockée **baisse quand même**. Sans le débit, elle ne
   * pourrait que monter. La poche scellée est choisie pour cela — deux cents
   * Camelote pèsent plus que trois heures de production de base.
   */
  it('débite le coût au lancement, et le débit est écrit', async () => {
    const { playerId, planetId } = await provisioned()
    await harness.sql`
      update game.planets set consolidated_at = now() - interval '3 hours' where id = ${planetId}
    `

    const held = (body: { holdings: { resourceId: string; amountGrains: number }[] }) =>
      body.holdings.find((one) => one.resourceId === 'camelote')?.amountGrains ?? 0

    // Le `GET` ne consolide pas (FR-031) : cette quantité est celle qui est
    // **stockée**, datée de la consolidation reculée de trois heures.
    const before = held((await server.read(playerId)).json())

    const response = await server.startWork(playerId, POCHE)
    expect(response.statusCode).toBe(201)

    expect(held(response.json())).toBeLessThan(before)
  })
})

describe('à l’achèvement, la case est déblayée par soustraction', () => {
  /**
   * Le chemin complet : lancer, échoir, muter.
   *
   * La seconde commande est ce qui **consolide** : un `GET` ne consolide pas
   * (FR-031). Elle est refusée — la case n'est plus obstruée —, et le refus
   * annule la transaction : rien n'est écrit, et la clé d'idempotence n'est pas
   * consommée. C'est donc un déblaiement d'une **autre** case qui consolide le
   * premier.
   */
  it('écrit une ligne dans cleared_cells, et rien d’autre', async () => {
    const { playerId, planetId } = await provisioned()
    expect((await server.startWork(playerId, EBOULIS)).statusCode).toBe(201)
    expect(await clearedCells(planetId)).toEqual([])

    await backdateDueWork(planetId)

    // Une seconde commande, sur une autre case : elle consolide le déblaiement
    // échu avant d'arbitrer la sienne.
    expect((await server.startWork(playerId, POCHE)).statusCode).toBe(201)

    expect(await clearedCells(planetId)).toEqual(['3,0'])

    // Aucun bâtiment n'est né d'un déblaiement, et aucune case n'est réclamée.
    const [buildings] = await harness.sql<{ total: string }[]>`
      select count(*)::text as total from game.buildings where planet_id = ${planetId}
    `
    const [cells] = await harness.sql<{ total: string }[]>`
      select count(*)::text as total from game.building_cells where planet_id = ${planetId}
    `
    expect(buildings?.total).toBe('0')
    expect(cells?.total).toBe('0')
  })

  /**
   * **I-8 vu de l'API.** La case déblayée ne redevient pas obstruée, donc la
   * redéblayer est refusé — et le refus est un 409 de règle de jeu.
   *
   * Ce n'est pas une garde : il n'existe aucune route qui saurait réobstruer, et
   * `cells.ts` n'a délibérément pas de fonction inverse. Ce test constate que
   * l'absence tient jusqu'au bord du réseau.
   */
  it('refuse de déblayer deux fois la même case', async () => {
    const { playerId, planetId } = await provisioned()
    expect((await server.startWork(playerId, EBOULIS)).statusCode).toBe(201)
    await backdateDueWork(planetId)
    expect((await server.startWork(playerId, POCHE)).statusCode).toBe(201)
    await backdateDueWork(planetId)

    const response = await server.startWork(playerId, EBOULIS)
    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('cell-not-obstructed')
    expect(response.json().details).toEqual({ x: 3, y: 0 })

    // **Un refus n'écrit rien**, et cela s'observe ici de la façon la plus nette :
    // le déblaiement de (3,2) est échu depuis une heure, la projection l'a bien
    // appliqué **en mémoire** pour arbitrer — sans quoi le refus n'aurait pas pu
    // être calculé —, et pourtant sa ligne n'est pas en base. La transaction s'est
    // annulée tout entière, consolidation comprise (FR-031).
    expect(await clearedCells(planetId)).toEqual(['3,0'])
  })
})

describe('les refus de règle de jeu, en 409', () => {
  it('refuse `cell-not-obstructed` sur une case libre', async () => {
    const { playerId } = await provisioned()

    const response = await server.startWork(playerId, LIBRE)
    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('cell-not-obstructed')
    expect(response.json().details).toEqual({ x: 5, y: 5 })
  })

  /**
   * Hors de la planète : le schéma borne les coordonnées à 0..15 — le
   * **protocole**, pas le contenu —, et c'est le domaine qui sait que la grille
   * fait 6×6. Le refus est donc un 409 et non un 400.
   */
  it('refuse `placement-out-of-grid` sur une case hors de la planète', async () => {
    const { playerId } = await provisioned()

    const response = await server.startWork(playerId, { nature: 'clear', x: 9, y: 9 })
    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('placement-out-of-grid')
    expect(response.json().details).toEqual({ cells: [{ x: 9, y: 9 }] })
  })

  it('refuse `work-in-progress` quand un chantier est déjà en cours (FR-033)', async () => {
    const { playerId } = await provisioned()
    expect((await server.startWork(playerId, EBOULIS)).statusCode).toBe(201)

    const response = await server.startWork(playerId, POCHE)
    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('work-in-progress')
  })

  /** Une coordonnée hors du **protocole** est un 400, avant toute règle de jeu. */
  it('refuse une coordonnée hors bornes en 400', async () => {
    const { playerId } = await provisioned()

    const response = await server.startWork(playerId, { nature: 'clear', x: 99, y: 0 })
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('invalid-work-intent')
  })
})
