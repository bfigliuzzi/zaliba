import { CATALOG_VERSION } from '@zaliba/catalogs'
import type { GameSql } from '@zaliba/db'
import { type Catalogs, DEFAULT_CATALOGS } from '@zaliba/domain'
import type { FastifyInstance } from 'fastify'
import type { Authenticator } from './plugins/auth.js'
import { registerPlanetRoutes } from './routes/v1/planet.js'
import { buildServer, type ServerOptions } from './server.js'

/**
 * L'assemblage complet : le socle HTTP et les routes.
 *
 * `buildServer` construit un serveur **sans routes** — c'est ce qui rend le
 * socle éprouvable seul. `buildApi` y ajoute les dépendances d'exécution et les
 * routes. La séparation n'est pas une couche de plus : c'est ce qui permet à un
 * test de corrélation ou de journalisation de ne rien monter d'autre, et donc de
 * n'échouer que pour ce qu'il éprouve.
 */

export interface ApiDependencies {
  readonly sql: GameSql
  readonly authenticator: Authenticator
  readonly catalogs?: Catalogs
  readonly catalogVersion?: string
  /** Injectable pour rendre les identifiants prévisibles en test. */
  readonly newId?: () => string
}

export type ApiOptions = ServerOptions & ApiDependencies

export function buildApi(options: ApiOptions): FastifyInstance {
  const app = buildServer(options)

  registerPlanetRoutes(app, {
    sql: options.sql,
    authenticator: options.authenticator,
    catalogs: options.catalogs ?? DEFAULT_CATALOGS,
    catalogVersion: options.catalogVersion ?? CATALOG_VERSION,
    ...(options.newId === undefined ? {} : { newId: options.newId }),
  })

  return app
}
