import type { GongLength } from '@zaliba/catalogs'
import type { GameSql } from '@zaliba/db'
import { type Catalogs, DECLARED_CATALOGS, resolveCatalogs } from '@zaliba/domain'
import type { FastifyInstance } from 'fastify'
import type { Authenticator } from './plugins/auth.js'
import { registerPlanetRoutes } from './routes/v1/planet.js'
import { registerWorksRoutes } from './routes/v1/works.js'
import { buildServer, type ServerOptions } from './server.js'

/**
 * L'assemblage complet : le socle HTTP et les routes.
 *
 * `buildServer` construit un serveur **sans routes** — c'est ce qui rend le
 * socle éprouvable seul. `buildApi` y ajoute les dépendances d'exécution et les
 * routes. La séparation n'est pas une couche de plus : c'est ce qui permet à un
 * test de corrélation ou de journalisation de ne rien monter d'autre, et donc de
 * n'échouer que pour ce qu'il éprouve.
 *
 * **Le catalogue est résolu ici, une fois.** Il l'est à partir de la longueur de
 * gong reçue, et le faisceau résolu porte cette longueur : le serveur ne peut
 * donc annoncer au client que ce qu'il applique, parce qu'il n'a plus d'autre
 * endroit où la lire. Un serveur qui annoncerait autre chose devient un état
 * **impossible à écrire**, plutôt qu'un état qu'un test surveille (G10). Pour la
 * même raison, `catalogVersion` a disparu des dépendances : la version se lit
 * sur le catalogue, jamais sur un second argument qui pourrait le contredire.
 *
 * La résolution a lieu **au démarrage**, jamais par requête. Un catalogue résolu
 * à chaque appel rendrait chaque réponse tributaire d'un travail qui ne dépend
 * que de la configuration.
 */

export interface ApiDependencies {
  readonly sql: GameSql
  readonly authenticator: Authenticator
  /**
   * La longueur du gong, **obligatoire et sans valeur par défaut**.
   *
   * Un repli `gong ?? GONG_CANONICAL` a été envisagé puis écarté : il placerait
   * un défaut silencieux au cœur exact du composant dont FR-007 exige qu'il
   * refuse, et le refus ne vivrait plus que dans `main.ts`, qu'aucun test ne
   * monte. Le confort qu'il apportait aux harnais de test leur est rendu par
   * leur propre valeur par défaut, où un défaut est à sa place.
   */
  readonly gong: GongLength
  /**
   * Un catalogue **déjà résolu**, pour les tests qui veulent un monde
   * synthétique. En son absence, celui du jeu est résolu avec `gong`.
   *
   * Le fournir **et** donner une autre longueur serait contradictoire ; c'est
   * pourquoi la longueur annoncée est toujours lue sur le catalogue retenu, et
   * jamais sur cet argument-ci.
   */
  readonly catalogs?: Catalogs
  /** Injectable pour rendre les identifiants prévisibles en test. */
  readonly newId?: () => string
}

export type ApiOptions = ServerOptions & ApiDependencies

export function buildApi(options: ApiOptions): FastifyInstance {
  // La résolution vient **avant** le montage du serveur : une longueur
  // inutilisable doit refuser le démarrage sans avoir rien ouvert (FR-006).
  const catalogs = options.catalogs ?? resolveCatalogs(DECLARED_CATALOGS, options.gong)

  const app = buildServer(options)

  const dependencies = {
    sql: options.sql,
    authenticator: options.authenticator,
    catalogs,
    ...(options.newId === undefined ? {} : { newId: options.newId }),
  }

  registerPlanetRoutes(app, dependencies)
  registerWorksRoutes(app, dependencies)

  return app
}
