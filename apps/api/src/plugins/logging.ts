import { stdSerializers } from 'pino'

/**
 * Le journal structuré et sa liste noire.
 *
 * Le journal est ce qu'on garde le plus longtemps, qu'on recopie sur un
 * agrégateur tiers et qu'on ouvre à plusieurs. Un jeton qui y entre est
 * réutilisable par quiconque lit l'écran ; une adresse de courriel qui y entre
 * est une donnée personnelle qu'on ne sait plus effacer.
 *
 * L'expurgation tient sur **trois filets**, parce qu'aucun ne suffit seul :
 *
 * 1. **une liste noire de clés** — `authorization`, `cookie`, `password`… La
 *    valeur part quel que soit son contenu. C'est le seul filet qui attrape un
 *    jeton opaque, celui qui ne ressemble à rien de reconnaissable ;
 * 2. **des motifs de valeur** — jeton à trois segments, adresse de courriel,
 *    paramètre de requête sensible. C'est le seul filet qui attrape une valeur
 *    rangée sous une clé anodine, ou citée au milieu d'une phrase ;
 * 3. **une liste de secrets déclarés** — la clé de service n'a aucune forme
 *    reconnaissable ; elle ne peut être expurgée que si on la nomme.
 *
 * Le placement n'est pas indifférent, et il a été tranché par mesure, non par
 * lecture de la documentation : `formatters.log` reçoit l'objet **avant** que
 * les sérialiseurs ne s'appliquent, et n'y voit donc qu'un `err: {}` vide. Les
 * messages d'exception ne peuvent être expurgés que dans le sérialiseur `err`,
 * et l'URL — qui porte la chaîne de requête — que dans le sérialiseur `req`.
 * Le reste passe par `hooks.logMethod`, qui voit les arguments tels que le code
 * appelant les a écrits.
 */

/** Ce qui remplace une valeur expurgée. Une marque, pas une disparition. */
export const REDACTED = '[expurgé]'

/**
 * Les clés dont la valeur ne sort jamais, quel que soit son contenu.
 *
 * La comparaison se fait en minuscules : `Authorization` et `authorization`
 * désignent le même en-tête, et un en-tête HTTP n'a pas de casse.
 */
export const REDACTED_KEYS: readonly string[] = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'jwt',
  'bearer',
  'password',
  'passphrase',
  'secret',
  'apikey',
  'api_key',
  'x-api-key',
  'x-service-key',
  'service_role_key',
  'servicerolekey',
  'email',
  'mail',
  'courriel',
]

const REDACTED_KEY_SET = new Set(REDACTED_KEYS)

/** Un jeton à trois segments — la forme d'un JWT, préfixe d'en-tête compris. */
const TOKEN_PATTERN = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g

/** Un identifiant présenté à la manière d'un en-tête d'autorisation. */
const BEARER_PATTERN = /\b(bearer)\s+\S+/gi

/** Une adresse de courriel. Le jeu d'accents est explicite : `\w` l'ignore. */
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu

/** Un paramètre de requête sensible, valeur comprise. */
const QUERY_PATTERN = /\b(access_token|refresh_token|id_token|token|api[-_]?key|password)=[^&\s]*/gi

/**
 * La profondeur au-delà de laquelle on cesse de descendre.
 *
 * Elle n'est pas là pour économiser : elle est là pour qu'une structure
 * inattendue — un graphe profond, une chaîne de prototypes — ne puisse pas
 * transformer une ligne de journal en boucle. Au-delà, la valeur est expurgée
 * plutôt que recopiée : l'inspection incomplète ne doit jamais valoir laissez-passer.
 */
const MAX_DEPTH = 12

/** Un objet ordinaire — pas une instance, pas une requête, pas une erreur. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Applique les motifs et les secrets déclarés à une chaîne. */
export function redactText(text: string, secrets: readonly string[] = []): string {
  let redacted = text
  for (const secret of secrets) {
    if (secret.length === 0) continue
    redacted = redacted.split(secret).join(REDACTED)
  }
  return redacted
    .replace(QUERY_PATTERN, (_match, key: string) => `${key}=${REDACTED}`)
    .replace(BEARER_PATTERN, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(TOKEN_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
}

/**
 * Recopie une valeur en l'expurgeant.
 *
 * Ne descend que dans les objets **ordinaires** et les tableaux. Une instance —
 * une requête Fastify, une erreur — est laissée telle quelle : la parcourir
 * déclencherait ses accesseurs et suivrait ses références circulaires, alors
 * qu'un sérialiseur dédié en tire déjà une forme plate et expurgeable.
 */
export function redactValue(value: unknown, secrets: readonly string[] = [], depth = 0): unknown {
  if (typeof value === 'string') return redactText(value, secrets)
  if (depth >= MAX_DEPTH) return isPlainObject(value) || Array.isArray(value) ? REDACTED : value
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets, depth + 1))
  if (!isPlainObject(value)) return value

  const redacted: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = REDACTED_KEY_SET.has(key.toLowerCase())
      ? REDACTED
      : redactValue(entry, secrets, depth + 1)
  }
  return redacted
}

/** Ce que le sérialiseur de requête sait d'une requête, et rien de plus. */
interface LoggableRequest {
  readonly method: string
  readonly url: string
  readonly host?: string | undefined
  readonly ip?: string | undefined
}

export interface LoggingOptions {
  readonly level?: string
  readonly stream?: { write(line: string): void }
  /**
   * Les valeurs littérales à ne jamais journaliser. La clé de service en est
   * une : aucun motif ne la reconnaît, seule sa déclaration la protège.
   */
  readonly secrets?: readonly string[]
}

/**
 * Les options de journalisation à passer à Fastify.
 *
 * Retourner un objet plutôt que d'enregistrer un greffon : le journal doit
 * exister **avant** la première requête, donc avant tout greffon. Ce qui se
 * configure à la construction ne peut pas être oublié à l'exécution.
 */
export function loggerOptions(options: LoggingOptions = {}): Record<string, unknown> {
  const secrets = options.secrets ?? []

  return {
    level: options.level ?? 'info',
    ...(options.stream === undefined ? {} : { stream: options.stream }),

    serializers: {
      /** L'URL porte la chaîne de requête, donc parfois un jeton. */
      req(request: LoggableRequest) {
        return {
          method: request.method,
          url: redactText(request.url, secrets),
          host: request.host,
          remoteAddress: request.ip,
        }
      },

      /**
       * Le message et la pile d'une exception sont du texte libre écrit par
       * un tiers — pilote de base, bibliothèque de crypto. C'est le chemin de
       * fuite le plus fréquent, et le moins prévisible.
       */
      err(error: unknown) {
        const serialized = stdSerializers.err(error as Error) as unknown as Record<string, unknown>
        const flattened: Record<string, unknown> = {}
        // `for…in` et non `Object.entries` : pino porte `type`, `message` et
        // `stack` sur un prototype, et les clés propres seules les rateraient.
        for (const key in serialized) {
          flattened[key] = serialized[key]
        }
        return redactValue(flattened, secrets)
      },
    },

    hooks: {
      /**
       * Le dernier filet, et le plus large : il voit les arguments tels que le
       * code appelant les a écrits — l'objet fusionné comme le message libre.
       */
      logMethod(this: unknown, args: unknown[], method: (...called: unknown[]) => void): void {
        method.apply(
          this,
          args.map((argument) => redactValue(argument, secrets)),
        )
      },
    },
  }
}
