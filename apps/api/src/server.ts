import Fastify, { type FastifyInstance } from 'fastify'
import { registerPlayerIdentity } from './plugins/auth.js'
import { generateRequestId, registerCorrelation } from './plugins/correlation.js'
import { registerCors } from './plugins/cors.js'
import { registerErrorMapping } from './plugins/errors.js'
import { loggerOptions } from './plugins/logging.js'

/**
 * Le serveur autoritaire.
 *
 * `buildServer` construit une instance **sans l'écouter**. La séparation entre
 * construire et écouter est ce qui rend le socle HTTP testable par `inject`,
 * sans port, sans attente et sans ordre entre les cas.
 */

export interface ServerOptions {
  /**
   * Destination du journal. Les tests y branchent un tampon pour relire ce qui
   * a été écrit — et surtout ce qui ne l'a pas été.
   */
  readonly logStream?: { write(line: string): void }
  readonly logLevel?: string
  /**
   * Les valeurs littérales que le journal n'écrira jamais. La clé de service
   * en est une : aucun motif ne la reconnaît, seule sa déclaration la protège.
   */
  readonly secrets?: readonly string[]
  /**
   * Les origines autorisées à appeler l'API depuis un navigateur. La liste est
   * close : `*` n'est pas une valeur acceptable ici.
   */
  readonly corsOrigins?: readonly string[]
}

/**
 * Les secrets de l'environnement, quand ils y sont.
 *
 * Lus **une fois, à la construction**, et jamais depuis le journal lui-même :
 * une liste noire qui interrogerait l'environnement à chaque ligne écrite
 * dépendrait de l'ordre de chargement des variables, ce qui est exactement le
 * genre de condition qu'on ne remarque qu'après la fuite.
 */
function secretsFromEnvironment(): readonly string[] {
  return [process.env['SUPABASE_SERVICE_ROLE_KEY']].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
}

/**
 * Les origines déclarées dans l'environnement, séparées par des virgules.
 *
 * Aucune valeur par défaut permissive : sans déclaration, la liste est vide et
 * aucun navigateur ne passe. Un oubli de configuration doit se voir en
 * développement, pas s'ouvrir en silence en production.
 */
function corsOriginsFromEnvironment(): readonly string[] {
  return (process.env['CORS_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({
    // L'identifiant de corrélation est engendré ici, et jamais lu d'un en-tête
    // entrant : voir `plugins/correlation.ts`.
    genReqId: generateRequestId,
    requestIdHeader: false,
    logger: loggerOptions({
      ...(options.logLevel === undefined ? {} : { level: options.logLevel }),
      ...(options.logStream === undefined ? {} : { stream: options.logStream }),
      secrets: options.secrets ?? secretsFromEnvironment(),
    }),
  })

  registerPlayerIdentity(app)
  registerCorrelation(app)
  registerCors(app, options.corsOrigins ?? corsOriginsFromEnvironment())
  registerErrorMapping(app)

  return app
}
