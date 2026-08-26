import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'

/**
 * Le harnais d'intégration : un **vrai** PostgreSQL, jamais un simulacre.
 *
 * Un simulacre testerait le simulacre, pas le SQL. Or ce qui doit être vérifié
 * ici — verrous `FOR UPDATE`, isolation transactionnelle, index uniques
 * partiels, contraintes de cohérence, RLS — n'existe que dans PostgreSQL. Un
 * double en mémoire répondrait « oui » à tout et ne prouverait rien.
 *
 * **Condition d'exécution** : un démon Docker en fonctionnement. Ce n'est pas
 * une décision d'architecture, c'est un prérequis de la porte de CI
 * correspondante (R17).
 */

/**
 * La version majeure de PostgreSQL.
 *
 * Elle doit suivre celle que fournit Supabase — sinon le test valide un moteur
 * que la production n'exécute pas. À relever et consigner à la création du
 * projet Supabase (doc de stack § 8).
 */
const POSTGRES_IMAGE = 'postgres:17-alpine'

export interface Harness {
  readonly sql: postgres.Sql
  readonly url: string
  /** Vide toutes les tables du schéma `game`, sans toucher au schéma lui-même. */
  reset(): Promise<void>
  stop(): Promise<void>
}

let container: StartedPostgreSqlContainer | undefined

/**
 * Démarre un PostgreSQL, applique les migrations **si elles existent**, et rend
 * un harnais.
 *
 * Le « si elles existent » n'est pas de la complaisance : le test des
 * contraintes de schéma (T030) est écrit **avant** le schéma qu'il éprouve, et
 * doit donc pouvoir démarrer sur une base nue. Il échoue alors parce que les
 * relations n'existent pas — et c'est précisément l'échec que le principe III
 * demande d'observer.
 */
export async function startHarness(): Promise<Harness> {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('zaliba_test')
    .withUsername('zaliba')
    .withPassword('zaliba')
    .start()

  const url = container.getConnectionUri()
  const sql = postgres(url, { max: 5, prepare: true, onnotice: () => {} })

  await applyMigrations(sql)

  return {
    sql,
    url,
    async reset() {
      await truncateGameSchema(sql)
    },
    async stop() {
      await sql.end({ timeout: 5 })
      await container?.stop()
      container = undefined
    },
  }
}

/** Le répertoire des migrations, relatif à la racine du dépôt. */
function migrationsDir(): string {
  return join(process.cwd(), '..', '..', 'packages', 'db', 'migrations')
}

async function applyMigrations(sql: postgres.Sql): Promise<void> {
  const dir = migrationsDir()
  if (!existsSync(dir)) return

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const statements = readFileSync(join(dir, file), 'utf8')
    // Drizzle sépare ses instructions par ce marqueur. Les exécuter une à une
    // donne un message d'erreur qui nomme l'instruction fautive.
    for (const statement of statements.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed.length > 0) {
        await sql.unsafe(trimmed)
      }
    }
  }
}

/**
 * Vide les tables entre deux cas, sans les recréer.
 *
 * `truncate … cascade` plutôt que `drop schema` : recréer le schéma à chaque cas
 * coûterait plusieurs secondes par test, et le prix se paierait à chaque
 * exécution de la porte de CI.
 */
async function truncateGameSchema(sql: postgres.Sql): Promise<void> {
  const tables = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'game'
  `
  if (tables.length === 0) return

  const names = tables.map((t) => `game.${sql(t.tablename)}`)
  await sql.unsafe(
    `truncate ${tables.map((t) => `game."${t.tablename}"`).join(', ')} restart identity cascade`,
  )
  void names
}
