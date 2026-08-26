import {
  type ApiFetcher,
  type ApiFetcherArgs,
  type AppRouter,
  initClient,
  tsRestFetchApi,
} from '@ts-rest/core'
import type { Session } from './session.js'

/**
 * Le client d'API typé.
 *
 * Il ne fait que du transport, et chacune de ses trois responsabilités ferme
 * une porte :
 *
 * - **le jeton vient de la session, et va dans un en-tête.** Jamais dans l'URL :
 *   une URL part dans l'historique du navigateur, dans le `Referer` de la
 *   requête suivante et dans les journaux d'accès de tout ce qui se trouve sur
 *   le chemin. Un jeton qui y passe ne peut plus être rappelé ;
 * - **une `Idempotency-Key` par commande** (contrats § 5). La cible est une
 *   application mobile sur réseau instable : sans clé, une requête réémise
 *   dépense deux fois ;
 * - **un 401 est rattrapé une fois, jamais deux.** Un jeton peut expirer entre
 *   la vérification locale et l'arrivée au serveur ; une session révoquée, elle,
 *   répondra 401 quoi qu'on fasse. Sans borne, la seconde situation devient une
 *   boucle de requêtes pour un joueur qui aurait dû être renvoyé à l'écran de
 *   connexion.
 */

/** L'en-tête que toute commande doit porter (contrats § 5). */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key'

/** Les méthodes qui mutent, donc celles qui exigent une clé. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export class NoSessionError extends Error {
  constructor() {
    super('Aucune session : la requête n’a pas été émise.')
    this.name = 'NoSessionError'
  }
}

export interface ApiClientOptions {
  readonly baseUrl: string
  readonly session: Session
  /** Substituable en test. En production, le `fetch` de ts-rest. */
  readonly fetcher?: ApiFetcher
}

/**
 * Construit le client.
 *
 * Le `fetcher` est enveloppé plutôt que remplacé : la sérialisation, la
 * validation des réponses et le traitement des codes de statut restent ceux de
 * ts-rest. Ce qu'on ajoute est exactement ce qui manque — l'identité et
 * l'idempotence.
 */
export function createApiClient<T extends AppRouter>(contract: T, options: ApiClientOptions) {
  const underlying = options.fetcher ?? tsRestFetchApi

  const authenticatedFetch: ApiFetcher = async (args: ApiFetcherArgs) => {
    const token = await options.session.freshAccessToken()
    // Rien n'est émis sans jeton : une requête anonyme reviendrait en 401 et
    // ferait voir une erreur à un joueur simplement déconnecté.
    if (token === null) throw new NoSessionError()

    const headers = withCommandHeaders(args, token)
    const first = await underlying({ ...args, headers })
    if (first.status !== 401) return first

    // Une seule reprise. Le renouvellement est celui de la session, qui
    // déduplique ses appels concurrents.
    const renewed = await options.session.freshAccessToken()
    if (renewed === null || renewed === token) return first

    // **La même** clé d'idempotence : c'est une seconde tentative de la même
    // commande, pas une commande nouvelle. Une clé fraîche ferait dépenser deux
    // fois si la première tentative avait en réalité abouti côté serveur.
    return underlying({ ...args, headers: { ...headers, authorization: `Bearer ${renewed}` } })
  }

  return initClient(contract, {
    baseUrl: options.baseUrl,
    api: authenticatedFetch,
  })
}

function withCommandHeaders(args: ApiFetcherArgs, token: string): Record<string, string> {
  const headers: Record<string, string> = { ...args.headers, authorization: `Bearer ${token}` }

  if (!MUTATING_METHODS.has(args.method.toUpperCase())) return headers

  // Une clé fournie par l'appelant est conservée : c'est ainsi qu'une
  // réémission délibérée — après une coupure réseau — retrouve son reçu.
  headers[IDEMPOTENCY_KEY_HEADER] ??= crypto.randomUUID()
  return headers
}
