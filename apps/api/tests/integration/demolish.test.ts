import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'
import { buildTestServer, type TestServer } from './server-harness.js'

/**
 * **La démolition, écrite dans un vrai PostgreSQL** (US6).
 *
 * Les tests de domaine éprouvent le remboursement et l'écrêtement, le parcours de
 * bout en bout les montre au joueur. Trois affirmations ne tiennent qu'ici, et
 * chacune porte sur une table :
 *
 * - **les cases du bâtiment disparaissent avec lui**, par la cascade de
 *   `game.building_cells` (R10). C'est ce qui libère réellement le terrain : une
 *   ligne oubliée dans cette table rendrait la case définitivement inconstructible,
 *   et la clé primaire `(planet_id, x, y)` refuserait le prochain bâtiment ;
 * - **la ligne de chantier résolue subsiste.** `syncWork` promet que les lignes
 *   résolues sont l'histoire de la planète et ne sont jamais supprimées. La
 *   démolition est la première mécanique qui supprime la *cible* d'un chantier, et
 *   c'est donc la première occasion de vérifier que la promesse tient ;
 * - **le remboursement atteint la base**, et il est crédité à l'échéance et non au
 *   lancement.
 */

let harness: Harness
let server: TestServer

/** Le seul carré de quatre qui couvre la veine de Camelote de R7. */
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
 * échéance tombe dans la fenêtre `[consolidatedAt, at]` (R3).
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

/** Pose la mine et laisse son chantier échu. Rend l'identifiant du bâtiment. */
async function mineBuiltAndDue(playerId: string, planetId: string): Promise<string> {
  const response = await server.startWork(playerId, MINE_ON_VEIN)
  expect(response.statusCode).toBe(201)
  const workId = response.json().work.id as string
  await backdateDueWork(planetId)
  return workId
}

async function buildingCount(planetId: string): Promise<number> {
  const [row] = await harness.sql<{ total: string }[]>`
    select count(*)::text as total from game.buildings where planet_id = ${planetId}
  `
  return Number(row?.total ?? '0')
}

async function cellCount(planetId: string): Promise<number> {
  const [row] = await harness.sql<{ total: string }[]>`
    select count(*)::text as total from game.building_cells where planet_id = ${planetId}
  `
  return Number(row?.total ?? '0')
}

interface WorkHistoryRow {
  readonly id: string
  readonly nature: string
  readonly targetBuildingId: string | null
  readonly resolved: boolean
}

/** **Toutes** les lignes de chantier, résolues comprises : l'histoire de la planète. */
async function workHistory(planetId: string): Promise<readonly WorkHistoryRow[]> {
  return harness.sql<WorkHistoryRow[]>`
    select id, nature, target_building_id as "targetBuildingId",
           (resolved_at is not null) as resolved
      from game.works
     where planet_id = ${planetId}
     order by started_at
  `
}

describe('la ligne de chantier de démolition passe la contrainte de la base', () => {
  it('répond 201 et porte la cible dans l’instantané', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    const response = await server.startWork(playerId, { nature: 'demolish', buildingId })
    expect(response.statusCode).toBe(201)

    expect(response.json().work.target).toEqual({ nature: 'demolish', buildingId })
  })

  /**
   * `works_target_matches_nature` traite `demolish` comme `upgrade` : un bâtiment
   * cible, et rien d'autre. Une colonne laissée renseignée par mégarde ferait
   * échouer l'insertion à l'exécution seulement.
   */
  it('n’écrit que la colonne de bâtiment cible', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)
    expect((await server.startWork(playerId, { nature: 'demolish', buildingId })).statusCode).toBe(
      201,
    )

    const [row] = await harness.sql<
      {
        nature: string
        targetBuildingId: string | null
        targetX: number | null
        typeId: string | null
        variantId: string | null
        orientation: number | null
      }[]
    >`
      select nature, target_building_id as "targetBuildingId", target_x as "targetX",
             type_id as "typeId", variant_id as "variantId", orientation
        from game.works
       where planet_id = ${planetId} and resolved_at is null
    `

    expect(row).toEqual({
      nature: 'demolish',
      targetBuildingId: buildingId,
      targetX: null,
      typeId: null,
      variantId: null,
      orientation: null,
    })
  })
})

describe('à l’achèvement, le bâtiment et ses cases disparaissent ensemble (R10, FR-047)', () => {
  /**
   * Le chemin complet : poser, échoir, démolir, échoir, muter.
   *
   * La dernière mutation est ce qui **consolide** : un `GET` ne consolide pas
   * (FR-031). C'est donc un déblaiement — une commande qui n'a rien à voir — qui
   * écrit la démolition achevée.
   */
  it('les quatre lignes de cases sont supprimées avec le bâtiment', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    expect((await server.startWork(playerId, { nature: 'demolish', buildingId })).statusCode).toBe(
      201,
    )
    expect(await buildingCount(planetId)).toBe(1)
    expect(await cellCount(planetId)).toBe(4)

    await backdateDueWork(planetId)
    // Une commande quelconque, qui consolide : déblayer l'éboulis de (3,0).
    expect((await server.startWork(playerId, { nature: 'clear', x: 3, y: 0 })).statusCode).toBe(201)

    expect(await buildingCount(planetId)).toBe(0)
    // **La cascade**, et c'est ce qui libère réellement le terrain : une ligne
    // oubliée ici rendrait la case définitivement inconstructible.
    expect(await cellCount(planetId)).toBe(0)
  })

  /**
   * **La ligne de chantier résolue subsiste**, cible comprise.
   *
   * `syncWork` promet que les lignes résolues sont l'histoire de la planète et ne
   * sont jamais supprimées — c'est ce qui impose que l'index d'unicité soit
   * *partiel*. La démolition est la première mécanique qui supprime la *cible* d'un
   * chantier : si une contrainte référentielle cascadait depuis `game.buildings`,
   * elle emporterait l'histoire au moment même où elle devient intéressante, et
   * personne ne pourrait plus enquêter sur ce qui a été démoli.
   */
  it('l’histoire de la planète survit à la disparition de la cible', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    expect((await server.startWork(playerId, { nature: 'demolish', buildingId })).statusCode).toBe(
      201,
    )
    await backdateDueWork(planetId)
    expect((await server.startWork(playerId, { nature: 'clear', x: 3, y: 0 })).statusCode).toBe(201)

    const history = await workHistory(planetId)

    // Trois lignes : la pose, la démolition, le déblaiement. Les deux premières
    // résolues, la troisième en cours.
    expect(history.map((row) => row.nature)).toEqual(['build', 'demolish', 'clear'])
    expect(history.map((row) => row.resolved)).toEqual([true, true, false])

    // Et la démolition dit encore **quel** bâtiment elle a emporté.
    expect(history[1]?.targetBuildingId).toBe(buildingId)
  })

  /**
   * Le remboursement est crédité **à l'échéance**, et il atteint la base.
   *
   * L'énoncé est concluant sans arithmétique fragile : la même transaction crédite
   * trois heures de production **et** le remboursement, donc la quantité stockée
   * monte plus que la seule production ne l'expliquerait. Le montant exact est
   * éprouvé par le domaine ; ce qui ne peut se voir qu'ici, c'est qu'il est *écrit*.
   */
  it('le remboursement est écrit à la consolidation', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    const held = (body: { holdings: { resourceId: string; amountGrains: number }[] }) =>
      body.holdings.find((one) => one.resourceId === 'bave-etoiles')?.amountGrains ?? 0

    const launched = await server.startWork(playerId, { nature: 'demolish', buildingId })
    expect(launched.statusCode).toBe(201)
    const before = held(launched.json())

    await backdateDueWork(planetId)
    const consolidating = await server.startWork(playerId, { nature: 'clear', x: 3, y: 0 })
    expect(consolidating.statusCode).toBe(201)

    // La Bave d'étoiles est choisie parce que la mine n'en produit pas : la hausse
    // au-delà de la production de base ne peut venir que du remboursement. Le
    // déblaiement de l'éboulis n'en coûte pas non plus (il ne coûte que de la
    // Camelote), donc rien ne la débite dans cette transaction.
    const base = 5 * 3_600 // cinq unités par heure sur une heure, en grains
    expect(held(consolidating.json())).toBeGreaterThan(before + base)
  })
})

describe('les refus de règle de jeu, en 409', () => {
  it('refuse `building-not-found` sur une cible absente', async () => {
    const { playerId } = await provisioned()

    const response = await server.startWork(playerId, {
      nature: 'demolish',
      buildingId: '77777777-7777-4777-8777-777777777777',
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('building-not-found')
  })

  /**
   * **Le motif précis, et non le générique.** Un joueur qui améliore sa mine et
   * tente de la démolir doit entendre que *ce bâtiment-là* est retenu, pas qu'un
   * chantier quelconque est en cours.
   */
  it('refuse `building-is-work-target` quand la cible est celle du chantier', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    const upgrade = await server.startWork(playerId, { nature: 'upgrade', buildingId })
    expect(upgrade.statusCode).toBe(201)
    const workId = upgrade.json().work.id as string

    const response = await server.startWork(playerId, { nature: 'demolish', buildingId })
    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('building-is-work-target')
    // L'identifiant du **chantier** : c'est de lui que vient l'échéance, donc le
    // « quand revenir » que SC-006 exige.
    expect(response.json().details).toEqual({ workId })
  })

  it('refuse `work-in-progress` quand le chantier porte sur autre chose', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    expect((await server.startWork(playerId, { nature: 'clear', x: 3, y: 0 })).statusCode).toBe(201)

    const response = await server.startWork(playerId, { nature: 'demolish', buildingId })
    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('work-in-progress')
  })
})
