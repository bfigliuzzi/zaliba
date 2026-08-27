import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'
import { buildTestServer, type TestServer } from './server-harness.js'

/**
 * **L'amélioration, écrite dans un vrai PostgreSQL** (US4).
 *
 * Les tests de domaine éprouvent la règle, l'invariant I-7 la généralise à toutes
 * les empreintes, et le parcours de bout en bout la montre au joueur. Il reste une
 * affirmation que seul ce niveau peut tenir : **la ligne de chantier passe la
 * contrainte de la base**.
 *
 * `works_target_matches_nature` exige d'un `upgrade` qu'il porte un bâtiment cible
 * **et rien d'autre** — ni coordonnées, ni type, ni variante, ni orientation. La
 * traduction du domaine vers les colonnes plates est écrite à la main
 * (`mapping/snapshot.ts`), et une colonne laissée renseignée par mégarde ferait
 * échouer l'insertion **à l'exécution seulement** : aucune compilation ne la
 * regarde, et aucun test de domaine ne voit une table.
 *
 * La seconde affirmation, aussi invisible ailleurs : à l'achèvement, les lignes de
 * `game.building_cells` sont **intactes**. C'est I-7 au niveau de la persistance,
 * et c'est là qu'il compte le plus — la clé primaire `(planet_id, x, y)` refuserait
 * une réécriture qui déplacerait une case, donc un achèvement fautif se
 * manifesterait comme une amélioration qui échoue au lieu d'une géométrie qui
 * bouge.
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

/**
 * Un joueur installé, et **l'identifiant de sa planète**.
 *
 * Les deux sont distincts, et les confondre coûte cher : la route désigne la
 * planète par son propriétaire (R11 — une planète par joueur), mais la clé de
 * `game.planets` reste propre à la planète. Un `update … where id = playerId` ne
 * met alors rien à jour **et ne dit rien** : le test échoue plus loin, sur un refus
 * qui n'a plus rien à voir.
 */
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
 * jamais — un test qui semblerait attendre l'achèvement pour toujours.
 *
 * Le procédé est honnête : il ne triche pas sur la règle, il déplace l'échéance.
 * L'instant de référence reste le `now()` de la transaction (R2), et c'est bien la
 * projection qui applique l'effet à `due_at` et non à l'instant du constat
 * (FR-032).
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

  // L'identifiant du bâtiment **est** celui du chantier : c'est
  // `effectsOnCompletion` qui le décide, et rien ne le tire au sort à l'échéance.
  const workId = response.json().work.id as string
  await backdateDueWork(planetId)
  return workId
}

/**
 * La ligne de chantier, colonnes **aliasées** en camelCase.
 *
 * L'alias est là pour la convention d'identifiants du dépôt, et il a une vertu de
 * plus : il nomme explicitement chaque colonne lue, donc un renommage de schéma
 * fait échouer la requête au lieu de rendre `undefined` en silence.
 */
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

/** Les cases occupées, telles que la base les porte : bâtiment et coordonnées. */
async function cellsOf(planetId: string): Promise<readonly string[]> {
  const rows = await harness.sql<{ x: number; y: number; buildingId: string }[]>`
    select x, y, building_id as "buildingId"
      from game.building_cells
     where planet_id = ${planetId}
  `
  return rows.map((row) => `${row.buildingId}:${row.x},${row.y}`).toSorted()
}

describe('la ligne de chantier d’amélioration passe la contrainte de la base', () => {
  it('répond 201 et porte la cible dans l’instantané', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    const response = await server.startWork(playerId, { nature: 'upgrade', buildingId })
    expect(response.statusCode).toBe(201)

    const body = response.json()
    // La cible du contrat ne porte **aucune géométrie** (FR-039) : c'est la même
    // absence côté réponse que côté intention.
    expect(body.work.target).toEqual({ nature: 'upgrade', buildingId })
  })

  /**
   * Les colonnes non concernées sont **nulles**, et la contrainte l'exige. Ce test
   * ne double pas celui du schéma : celui-là insérait à la main, celui-ci fait
   * écrire l'application.
   */
  it('n’écrit que la colonne de bâtiment cible', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)
    expect((await server.startWork(playerId, { nature: 'upgrade', buildingId })).statusCode).toBe(
      201,
    )

    expect(await unresolvedWork(planetId)).toEqual({
      nature: 'upgrade',
      targetBuildingId: buildingId,
      targetX: null,
      targetY: null,
      typeId: null,
      variantId: null,
      orientation: null,
    })
  })

  /**
   * Le coût est débité **au lancement** (FR-036), et le débit atteint la base.
   *
   * Le montant exact est éprouvé par le domaine ; ce qui ne peut se voir qu'ici,
   * c'est qu'il est *écrit*. L'énoncé retenu le rend concluant sans arithmétique
   * fragile : la même transaction crédite **trois heures** de production et débite
   * le coût, et la quantité stockée **baisse quand même**. Sans le débit, elle ne
   * pourrait que monter.
   */
  it('débite le coût au lancement, et le débit est écrit', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    const held = (body: { holdings: { resourceId: string; amountGrains: number }[] }) =>
      body.holdings.find((one) => one.resourceId === 'camelote')?.amountGrains ?? 0

    // Le `GET` ne consolide pas (FR-031) : cette quantité est celle qui est
    // **stockée**, datée de la consolidation reculée de trois heures.
    const before = held((await server.read(playerId)).json())

    const response = await server.startWork(playerId, { nature: 'upgrade', buildingId })
    expect(response.statusCode).toBe(201)
    const after = held(response.json())

    expect(after).toBeLessThan(before)
    // Et jamais sous zéro : un débit qui passerait sous zéro **lève**, il
    // n'écrête pas — l'écrêtement ferait une construction à moitié gratuite.
    expect(after).toBeGreaterThan(0)
  })
})

describe('à l’achèvement, le niveau monte et les cases ne bougent pas (I-7)', () => {
  /**
   * Le chemin complet : poser, échoir, améliorer, échoir, muter.
   *
   * La dernière mutation est ce qui **consolide** : un `GET` ne consolide pas
   * (FR-031). C'est donc la seconde commande d'amélioration qui écrit le niveau 2,
   * puis planifie la montée vers 3 — et l'instantané qu'elle rend porte les deux
   * faits.
   */
  it('le niveau écrit passe à 2, les lignes de cases sont intactes', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    expect((await server.startWork(playerId, { nature: 'upgrade', buildingId })).statusCode).toBe(
      201,
    )
    const cellsBefore = await cellsOf(planetId)
    expect(cellsBefore).toHaveLength(4)

    await backdateDueWork(planetId)
    const response = await server.startWork(playerId, { nature: 'upgrade', buildingId })
    expect(response.statusCode).toBe(201)

    const [building] = await harness.sql<
      { level: number; variantId: string; orientation: number; anchorX: number }[]
    >`
      select level,
             variant_id as "variantId",
             orientation,
             anchor_x as "anchorX"
        from game.buildings
       where id = ${buildingId}
    `
    expect(building?.level).toBe(2)
    // Ni la variante, ni l'orientation, ni l'ancre : le seul champ qui bouge est
    // le niveau (FR-039, I-7).
    expect(building?.variantId).toBe('square-4')
    expect(building?.orientation).toBe(0)
    expect(building?.anchorX).toBe(0)

    // I-7 à l'endroit où il compte le plus : les lignes de `building_cells` sont
    // les **mêmes**, à la case et au bâtiment près.
    expect(await cellsOf(planetId)).toEqual(cellsBefore)
  })
})

describe('les refus traversent la couche serveur intacts', () => {
  it('refuse en 409 une cible qui n’est pas sur la planète', async () => {
    const { playerId } = await provisioned()
    const response = await server.startWork(playerId, {
      nature: 'upgrade',
      buildingId: randomUUID(),
    })

    expect(response.statusCode).toBe(409)
    const body = response.json()
    expect(body.code).toBe('building-not-found')
    // Le détail est repris tel quel : c'est ce qui permet au client de retirer de
    // sa vue un repère périmé, plutôt que de faire réessayer le joueur.
    expect(body.details.buildingId).toBeDefined()
  })

  it('refuse en 409 tant qu’un chantier est en cours (FR-033)', async () => {
    const { playerId } = await provisioned()
    const response = await server.startWork(playerId, MINE_ON_VEIN)
    expect(response.statusCode).toBe(201)

    // Le chantier de pose n'est **pas** échu : il est réellement en cours.
    const refused = await server.startWork(playerId, {
      nature: 'upgrade',
      buildingId: response.json().work.id,
    })
    expect(refused.statusCode).toBe(409)
    expect(refused.json().code).toBe('work-in-progress')
  })

  /**
   * Une charge d'amélioration portant une géométrie est refusée en **400**, avant
   * toute règle de jeu : c'est le schéma qui la rejette, pas le module. La
   * vérification n'existe nulle part — le champ n'existe pas (FR-039, FR-055).
   */
  it('refuse en 400 une charge portant une empreinte', async () => {
    const { playerId, planetId } = await provisioned()
    const buildingId = await mineBuiltAndDue(playerId, planetId)

    const response = await server.startWork(playerId, {
      nature: 'upgrade',
      buildingId,
      variantId: 'l-4',
    })
    expect(response.statusCode).toBe(400)
  })

  /** Un refus n'écrit rien, et ne consomme pas la clé d'idempotence. */
  it('n’écrit aucun chantier quand le domaine refuse', async () => {
    const { playerId, planetId } = await provisioned()
    expect(
      (await server.startWork(playerId, { nature: 'upgrade', buildingId: randomUUID() }))
        .statusCode,
    ).toBe(409)

    expect(await unresolvedWork(planetId)).toBeUndefined()
  })
})
