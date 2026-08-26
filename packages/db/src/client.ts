import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

/**
 * Le pilote PostgreSQL (R13).
 *
 * `postgres.js` est le pilote recommandé par Drizzle, et le seul qui traite
 * correctement les deux poolers de Supabase.
 *
 * **Le piège du pooler de transaction.** Supabase en offre deux. Le pooler de
 * *session* attribue une connexion pour toute la session : les requêtes
 * préparées y fonctionnent. Le pooler de *transaction* recycle la connexion
 * entre deux transactions : une requête préparée nommée dans l'une devient
 * introuvable dans l'autre, et l'erreur est intermittente — donc invisible en
 * développement et coûteuse en production. La parade n'est pas d'éviter le
 * pooler de transaction, c'est de désactiver les requêtes préparées quand on
 * l'emploie.
 */

export interface DbConfig {
  readonly url: string
  /**
   * Vrai si l'URL vise le **pooler de transaction** de Supabase. Les requêtes
   * préparées sont alors désactivées (R13).
   */
  readonly transactionPooler?: boolean
  readonly maxConnections?: number
}

/**
 * Reconnaît le pooler de transaction de Supabase à son port.
 *
 * Le port 6543 est celui du pooler de transaction, le 5432 celui de la session
 * ou de la connexion directe. La détection est faite ici plutôt que laissée à
 * la configuration : une variable d'environnement mal renseignée produirait
 * exactement le bug intermittent qu'on cherche à éviter.
 */
export function usesTransactionPooler(url: string): boolean {
  try {
    return new URL(url).port === '6543'
  } catch {
    return false
  }
}

export function createSql(config: DbConfig): postgres.Sql {
  const transactionPooler = config.transactionPooler ?? usesTransactionPooler(config.url)
  return postgres(config.url, {
    // `prepare: false` est obligatoire derrière le pooler de transaction, et
    // sans conséquence ailleurs sinon une perte de performance mineure.
    prepare: !transactionPooler,
    max: config.maxConnections ?? 10,
    // Les grandeurs de jeu passent par des `bigint` en base (grains). La
    // conversion en `number` est faite explicitement à la frontière du paquet,
    // avec son assertion de sûreté — jamais par une coercion silencieuse.
    types: {
      bigint: postgres.BigInt,
    },
    onnotice: () => {
      // Les avis de PostgreSQL — « la relation existe déjà », etc. — n'ont rien
      // à faire dans le journal applicatif.
    },
  })
}

export function createDb(config: DbConfig) {
  return drizzle(createSql(config))
}

export type Database = ReturnType<typeof createDb>
