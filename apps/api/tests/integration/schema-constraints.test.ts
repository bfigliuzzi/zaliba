import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'

/**
 * Les contraintes de schéma, éprouvées sur un **vrai** PostgreSQL.
 *
 * Ce fichier est écrit **avant** le schéma qu'il éprouve, et c'est délibéré :
 * l'ordre de ce bloc n'est pas celui de l'intuition. Il échoue d'abord parce
 * que les relations n'existent pas, et c'est l'échec attendu.
 *
 * Ce qui se joue ici n'est pas de la validation défensive. Trois de ces
 * contraintes **portent des règles de jeu** :
 *
 * - l'unicité de `owner_id` rend `POST /v1/me/planet` idempotente sous
 *   concurrence, sans qu'aucun verrou applicatif soit nécessaire ;
 * - l'index partiel sur `works` fait de FR-033 une contrainte de base : deux
 *   onglets ouverts ne peuvent pas lancer deux chantiers, et c'est la seconde
 *   transaction qui échoue, pas une vérification préalable qui aurait pu être
 *   contournée ;
 * - la clé primaire de `building_cells` rend la superposition **impossible à
 *   écrire**, y compris par un futur chemin d'écriture qui aurait oublié la
 *   validation du domaine.
 *
 * Une règle de jeu portée par une contrainte ne se dégrade pas avec la
 * fatigue ; une règle portée par de la discipline, si.
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

/** Insère une planète et rend son identifiant. */
async function insertPlanet(ownerId = randomUUID(), occupantId = ownerId): Promise<string> {
  const id = randomUUID()
  await harness.sql`
    insert into game.planets (id, owner_id, occupant_id, archetype_id, layout_id, consolidated_at)
    values (${id}, ${ownerId}, ${occupantId}, 'berceau', 'berceau-v1', now())
  `
  return id
}

async function insertBuilding(planetId: string, anchorX = 0, anchorY = 0): Promise<string> {
  const id = randomUUID()
  await harness.sql`
    insert into game.buildings
      (id, planet_id, type_id, variant_id, orientation, anchor_x, anchor_y, level)
    values (${id}, ${planetId}, 'mine', 'square-4', 0, ${anchorX}, ${anchorY}, 1)
  `
  return id
}

describe('game.planets — une planète par joueur (R11)', () => {
  it('refuse deux planètes pour un même owner_id', async () => {
    const ownerId = randomUUID()
    await insertPlanet(ownerId)
    await expect(insertPlanet(ownerId)).rejects.toThrow(/unique|duplicate/i)
  })

  it('accepte deux planètes pour deux propriétaires distincts', async () => {
    await insertPlanet()
    await expect(insertPlanet()).resolves.toBeDefined()
  })

  /**
   * L'occupant est une notion **distincte** du propriétaire (FR-006). Rien en
   * 001 ne les dissocie, mais la colonne existe déjà et l'autorisation porte
   * sur elle : c'est ce qui rend FR-007 vérifiable dès maintenant.
   */
  it('n’impose aucune unicité sur occupant_id', async () => {
    const occupantId = randomUUID()
    await insertPlanet(randomUUID(), occupantId)
    await expect(insertPlanet(randomUUID(), occupantId)).resolves.toBeDefined()
  })
})

describe('game.building_cells — la superposition est impossible à écrire (I-5, R10)', () => {
  it('refuse deux bâtiments sur la même case d’une même planète', async () => {
    const planetId = await insertPlanet()
    const first = await insertBuilding(planetId, 0, 0)
    const second = await insertBuilding(planetId, 2, 2)

    await harness.sql`
      insert into game.building_cells (planet_id, x, y, building_id)
      values (${planetId}, 3, 3, ${first})
    `
    await expect(
      harness.sql`
        insert into game.building_cells (planet_id, x, y, building_id)
        values (${planetId}, 3, 3, ${second})
      `,
    ).rejects.toThrow(/unique|duplicate|primary key/i)
  })

  it('accepte la même case sur deux planètes différentes', async () => {
    const a = await insertPlanet()
    const b = await insertPlanet()
    const buildingA = await insertBuilding(a)
    const buildingB = await insertBuilding(b)

    await harness.sql`
      insert into game.building_cells (planet_id, x, y, building_id)
      values (${a}, 3, 3, ${buildingA})
    `
    await expect(
      harness.sql`
        insert into game.building_cells (planet_id, x, y, building_id)
        values (${b}, 3, 3, ${buildingB})
      `,
    ).resolves.toBeDefined()
  })

  it('supprime les cases en cascade à la démolition du bâtiment', async () => {
    const planetId = await insertPlanet()
    const buildingId = await insertBuilding(planetId)
    await harness.sql`
      insert into game.building_cells (planet_id, x, y, building_id)
      values (${planetId}, 1, 1, ${buildingId})
    `
    await harness.sql`delete from game.buildings where id = ${buildingId}`

    const rows = await harness.sql`
      select 1 from game.building_cells where planet_id = ${planetId}
    `
    expect(rows).toHaveLength(0)
  })
})

describe('game.works — au plus un chantier non résolu par planète (I-9, FR-033)', () => {
  const insertWork = (planetId: string, resolvedAt: string | null = null) => harness.sql`
    insert into game.works
      (id, planet_id, nature, started_at, due_at, resolved_at, target_x, target_y)
    values (${randomUUID()}, ${planetId}, 'clear', now(), now() + interval '10 minutes',
            ${resolvedAt}, 3, 2)
  `

  it('refuse un second chantier non résolu sur la même planète', async () => {
    const planetId = await insertPlanet()
    await insertWork(planetId)
    await expect(insertWork(planetId)).rejects.toThrow(/unique|duplicate/i)
  })

  /**
   * Les lignes résolues **restent** : elles sont l'histoire de la planète. Le
   * caractère *partiel* de l'index est donc essentiel — un index unique simple
   * interdirait au joueur d'entreprendre un second chantier de sa vie.
   */
  it('accepte un nouveau chantier une fois le précédent résolu', async () => {
    const planetId = await insertPlanet()
    await insertWork(planetId)
    await harness.sql`update game.works set resolved_at = now() where planet_id = ${planetId}`
    await expect(insertWork(planetId)).resolves.toBeDefined()
  })

  it('accepte plusieurs chantiers résolus sur la même planète', async () => {
    const planetId = await insertPlanet()
    await insertWork(planetId, new Date().toISOString())
    await expect(insertWork(planetId, new Date().toISOString())).resolves.toBeDefined()
  })

  it('accepte un chantier en cours sur chacune de deux planètes', async () => {
    const a = await insertPlanet()
    const b = await insertPlanet()
    await insertWork(a)
    await expect(insertWork(b)).resolves.toBeDefined()
  })
})

describe('game.works — la nature et ses colonnes de cible sont cohérentes', () => {
  it('refuse un clear qui porterait un bâtiment cible', async () => {
    const planetId = await insertPlanet()
    const buildingId = await insertBuilding(planetId)
    await expect(
      harness.sql`
        insert into game.works
          (id, planet_id, nature, started_at, due_at, target_x, target_y, target_building_id)
        values (${randomUUID()}, ${planetId}, 'clear', now(), now() + interval '1 hour',
                3, 2, ${buildingId})
      `,
    ).rejects.toThrow(/constraint|check/i)
  })

  it('refuse un build sans variante ni orientation', async () => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.works (id, planet_id, nature, started_at, due_at, type_id)
        values (${randomUUID()}, ${planetId}, 'build', now(), now() + interval '1 hour', 'mine')
      `,
    ).rejects.toThrow(/constraint|check/i)
  })

  it('refuse un upgrade sans bâtiment cible', async () => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.works (id, planet_id, nature, started_at, due_at)
        values (${randomUUID()}, ${planetId}, 'upgrade', now(), now() + interval '1 hour')
      `,
    ).rejects.toThrow(/constraint|check/i)
  })

  it('accepte un build complet', async () => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.works
          (id, planet_id, nature, started_at, due_at, type_id, variant_id, orientation,
           target_x, target_y)
        values (${randomUUID()}, ${planetId}, 'build', now(), now() + interval '1 hour',
                'mine', 'square-4', 0, 0, 4)
      `,
    ).resolves.toBeDefined()
  })

  it('refuse une nature hors du vocabulaire', async () => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.works (id, planet_id, nature, started_at, due_at, target_x, target_y)
        values (${randomUUID()}, ${planetId}, 'cancel', now(), now() + interval '1 hour', 1, 1)
      `,
    ).rejects.toThrow(/constraint|check|invalid/i)
  })

  it('refuse une échéance antérieure ou égale au lancement', async () => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.works (id, planet_id, nature, started_at, due_at, target_x, target_y)
        values (${randomUUID()}, ${planetId}, 'clear', now(), now(), 1, 1)
      `,
    ).rejects.toThrow(/constraint|check/i)
  })
})

describe('game.planet_resources — les quantités ne descendent jamais sous zéro', () => {
  it('refuse une quantité négative', async () => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.planet_resources (planet_id, resource_id, amount_grains, lost_grains)
        values (${planetId}, 'camelote', -1, 0)
      `,
    ).rejects.toThrow(/constraint|check/i)
  })

  it('refuse une perte cumulée négative', async () => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.planet_resources (planet_id, resource_id, amount_grains, lost_grains)
        values (${planetId}, 'camelote', 0, -1)
      `,
    ).rejects.toThrow(/constraint|check/i)
  })

  it('refuse deux lignes pour la même ressource d’une même planète', async () => {
    const planetId = await insertPlanet()
    await harness.sql`
      insert into game.planet_resources (planet_id, resource_id, amount_grains, lost_grains)
      values (${planetId}, 'camelote', 100, 0)
    `
    await expect(
      harness.sql`
        insert into game.planet_resources (planet_id, resource_id, amount_grains, lost_grains)
        values (${planetId}, 'camelote', 200, 0)
      `,
    ).rejects.toThrow(/unique|duplicate|primary key/i)
  })
})

describe('game.buildings — les bornes du domaine sont dans la base', () => {
  it.each([-1, 4, 7])('refuse une orientation de %i', async (orientation) => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.buildings
          (id, planet_id, type_id, variant_id, orientation, anchor_x, anchor_y, level)
        values (${randomUUID()}, ${planetId}, 'mine', 'square-4', ${orientation}, 0, 0, 1)
      `,
    ).rejects.toThrow(/constraint|check/i)
  })

  it('refuse un niveau inférieur à 1', async () => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.buildings
          (id, planet_id, type_id, variant_id, orientation, anchor_x, anchor_y, level)
        values (${randomUUID()}, ${planetId}, 'mine', 'square-4', 0, 0, 0, 0)
      `,
    ).rejects.toThrow(/constraint|check/i)
  })

  it('refuse une ancre négative', async () => {
    const planetId = await insertPlanet()
    await expect(
      harness.sql`
        insert into game.buildings
          (id, planet_id, type_id, variant_id, orientation, anchor_x, anchor_y, level)
        values (${randomUUID()}, ${planetId}, 'mine', 'square-4', 0, -1, 0, 1)
      `,
    ).rejects.toThrow(/constraint|check/i)
  })
})

describe('game.cleared_cells — une case déblayée l’est une fois pour toutes (I-8)', () => {
  it('refuse de déblayer deux fois la même case', async () => {
    const planetId = await insertPlanet()
    await harness.sql`
      insert into game.cleared_cells (planet_id, x, y, cleared_at)
      values (${planetId}, 3, 2, now())
    `
    await expect(
      harness.sql`
        insert into game.cleared_cells (planet_id, x, y, cleared_at)
        values (${planetId}, 3, 2, now())
      `,
    ).rejects.toThrow(/unique|duplicate|primary key/i)
  })
})

describe('game.command_receipts — une clé d’idempotence par joueur', () => {
  it('refuse deux reçus pour la même clé et le même joueur', async () => {
    const playerId = randomUUID()
    await harness.sql`
      insert into game.command_receipts (player_id, idempotency_key, response, created_at)
      values (${playerId}, 'k-1', '{"status":201}'::jsonb, now())
    `
    await expect(
      harness.sql`
        insert into game.command_receipts (player_id, idempotency_key, response, created_at)
        values (${playerId}, 'k-1', '{"status":409}'::jsonb, now())
      `,
    ).rejects.toThrow(/unique|duplicate|primary key/i)
  })

  it('accepte la même clé pour deux joueurs distincts', async () => {
    await harness.sql`
      insert into game.command_receipts (player_id, idempotency_key, response, created_at)
      values (${randomUUID()}, 'k-1', '{}'::jsonb, now())
    `
    await expect(
      harness.sql`
        insert into game.command_receipts (player_id, idempotency_key, response, created_at)
        values (${randomUUID()}, 'k-1', '{}'::jsonb, now())
      `,
    ).resolves.toBeDefined()
  })
})

describe('RLS — active et en refus par défaut sur les sept tables', () => {
  const Tables = [
    'planets',
    'planet_resources',
    'buildings',
    'building_cells',
    'cleared_cells',
    'works',
    'command_receipts',
  ]

  it('couvre exactement sept tables et pas une de plus', async () => {
    const rows = await harness.sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'game' order by tablename
    `
    expect(rows.map((r) => r.tablename)).toEqual([...Tables].sort())
  })

  it.each(Tables)('%s a RLS activée', async (table) => {
    const rows = await harness.sql<{ relrowsecurity: boolean }[]>`
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'game' and c.relname = ${table}
    `
    expect(rows[0]?.relrowsecurity, `RLS inactive sur game.${table}`).toBe(true)
  })

  /**
   * **Aucune politique permissive.** RLS activée sans politique signifie refus
   * total : c'est exactement la posture voulue. Le serveur passe par le rôle
   * `service_role`, qui contourne RLS ; RLS est ici la **seconde ligne de
   * défense**, celle qui tient si le schéma se retrouvait exposé par accident.
   *
   * Ajouter une politique permissive « pour que ça marche » serait la seule
   * façon de perdre cette protection — d'où ce test.
   */
  it.each(Tables)('%s ne porte aucune politique', async (table) => {
    const rows = await harness.sql<{ policyname: string }[]>`
      select policyname from pg_policies where schemaname = 'game' and tablename = ${table}
    `
    expect(
      rows.map((r) => r.policyname),
      `game.${table} porte une politique`,
    ).toEqual([])
  })

  it('n’expose pas le schéma game à PostgREST', async () => {
    // Le schéma ne doit figurer dans aucun `search_path` par défaut destiné à
    // l'API de données. La configuration côté Supabase est hors de ce test ;
    // ce qui est vérifiable ici, c'est que le schéma est bien nommé `game` et
    // distinct de `public`.
    const rows = await harness.sql<{ nspname: string }[]>`
      select nspname from pg_namespace where nspname = 'game'
    `
    expect(rows).toHaveLength(1)

    const publicTables = await harness.sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'
    `
    expect(publicTables.map((r) => r.tablename)).not.toContain('planets')
  })
})
