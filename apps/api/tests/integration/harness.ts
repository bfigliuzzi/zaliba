import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  /**
   * Le nombre d'instructions de migration réellement exécutées. Zéro veut dire
   * « base nue » — ce qui est légitime avant que le schéma n'existe, et une
   * anomalie après.
   */
  readonly appliedStatements: number
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

  const appliedStatements = await applyMigrations(sql)

  return {
    sql,
    url,
    appliedStatements,
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

/**
 * Le répertoire des migrations, résolu **depuis ce fichier**.
 *
 * Surtout pas depuis `process.cwd()` : Vitest exécute les projets depuis la
 * racine du dépôt, quel que soit le `root` déclaré du projet. Un chemin relatif
 * au répertoire courant pointait donc à côté, `existsSync` répondait « non », et
 * les migrations étaient sautées **en silence** — la base restait nue et les
 * quarante-trois cas échouaient en dénonçant un schéma manquant plutôt que le
 * chemin fautif. Une porte qui ne traite rien et n'en dit rien est pire qu'une
 * porte absente.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  // apps/api/tests/integration → racine du dépôt
  return join(here, '..', '..', '..', '..', 'packages', 'db', 'migrations')
}

/**
 * Applique les migrations et **rend compte** de ce qu'elle a fait.
 *
 * Le compte retourné n'est pas décoratif : il permet à l'appelant de
 * distinguer « aucune migration à appliquer » de « les migrations n'ont pas été
 * trouvées », deux situations que le silence confondait.
 */
async function applyMigrations(sql: postgres.Sql): Promise<number> {
  const dir = migrationsDir()
  if (!existsSync(dir)) return 0

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let applied = 0
  for (const file of files) {
    const statements = readFileSync(join(dir, file), 'utf8')
    // Drizzle sépare ses instructions par ce marqueur. Les exécuter une à une
    // donne un message d'erreur qui nomme l'instruction fautive.
    for (const statement of statements.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed.length > 0) {
        await sql.unsafe(trimmed)
        applied += 1
      }
    }
  }
  return applied
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
