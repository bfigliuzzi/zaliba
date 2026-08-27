import { initContract } from '@ts-rest/core'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApiClient } from '../src/lib/api.js'
import type { Session } from '../src/lib/session.js'

/**
 * Le client d'API.
 *
 * Trois responsabilités, et chacune ferme une porte :
 *
 * - **le jeton vient de la session, et va dans un en-tête.** Jamais dans l'URL :
 *   une URL part dans l'historique du navigateur, dans le `Referer` de la
 *   requête suivante et dans les journaux d'accès de tout ce qui se trouve sur
 *   le chemin. Un jeton qui y passe est un jeton qu'on ne peut plus rappeler ;
 * - **une `Idempotency-Key` par commande.** La cible est une application mobile
 *   sur réseau instable : sans elle, une requête réémise dépense deux fois
 *   (contrats § 5) ;
 * - **un 401 est rattrapé une fois, jamais deux.** Un jeton peut expirer entre
 *   la vérification locale et l'arrivée au serveur. Réessayer sans limite
 *   transformerait une session révoquée en boucle de requêtes.
 *
 * Le contrat employé ici est un contrat jouet : les routes de 001 arrivent avec
 * US1, et ce qui est éprouvé est le **transport**, qui leur est commun.
 */

const c = initContract()

const contract = c.router({
  readPlanet: {
    method: 'GET',
    path: '/v1/me/planet',
    responses: { 200: z.object({ ok: z.boolean() }) },
  },
  sendCommand: {
    method: 'POST',
    path: '/v1/me/planet/works',
    body: z.object({ intent: z.string() }),
    responses: { 201: z.object({ ok: z.boolean() }) },
  },
})

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJqb3VldXNlIn0.signature-fictive'
const RENEWED = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJqb3VldXNlIn0.signature-renouvelee'

function sessionWith(tokens: (string | null)[]): Session {
  let index = 0
  return {
    current: async () => null,
    freshAccessToken: async () => tokens[Math.min(index++, tokens.length - 1)] ?? null,
    signIn: async () => ({ session: null, error: null }),
    signUp: async () => ({ session: null, error: null }),
    signOut: async () => {},
    onChange: () => () => {},
  }
}

interface Call {
  readonly url: string
  readonly headers: Record<string, string>
  readonly method: string
}

function recordingFetch(statuses: number[] = [200]) {
  const calls: Call[] = []
  let index = 0

  const api = vi.fn(
    async (args: { path: string; headers: Record<string, string>; method: string }) => {
      calls.push({ url: args.path, headers: { ...args.headers }, method: args.method })
      const status = statuses[Math.min(index++, statuses.length - 1)] ?? 200
      return { status, body: { ok: status < 400 }, headers: new Headers() }
    },
  )

  return { api, calls }
}

function clientWith(
  session: Session,
  statuses?: number[],
): {
  client: ReturnType<typeof createApiClient<typeof contract>>
  calls: Call[]
  api: ReturnType<typeof recordingFetch>['api']
} {
  const { api, calls } = recordingFetch(statuses)
  const client = createApiClient(contract, {
    baseUrl: 'https://api.zaliba.test',
    session,
    // biome-ignore lint/suspicious/noExplicitAny: le fetcher de ts-rest est structurel
    fetcher: api as any,
  })
  return { client, calls, api }
}

describe('le jeton vient de la session et voyage en en-tête', () => {
  it('pose un en-tête Authorization porteur du jeton', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN]))
    await client.readPlanet()

    expect(calls[0]?.headers['authorization']).toBe(`Bearer ${TOKEN}`)
  })

  /**
   * L'URL est le seul endroit d'où un jeton ne peut plus être retiré. Ce cas
   * est écrit par la négative parce que la faute est facile : un paramètre de
   * requête « pour déboguer » suffit à l'y mettre.
   */
  it('ne met jamais le jeton dans l’URL', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN]))
    await client.readPlanet()

    expect(calls[0]?.url).not.toContain(TOKEN)
    expect(calls[0]?.url).toContain('/v1/me/planet')
  })

  it('n’émet aucune requête sans jeton', async () => {
    const { client, api } = clientWith(sessionWith([null]))

    await expect(client.readPlanet()).rejects.toThrow(/session/i)
    expect(api).not.toHaveBeenCalled()
  })
})

describe('chaque commande porte sa clé d’idempotence', () => {
  it('pose une Idempotency-Key sur une commande', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN]))
    await client.sendCommand({ body: { intent: 'build' } })

    expect(calls[0]?.headers['idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  /**
   * Une lecture n'a rien à rejouer. Lui donner une clé encombrerait la table
   * des reçus d'entrées qui ne protègent de rien.
   */
  it('n’en pose pas sur une lecture', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN]))
    await client.readPlanet()

    expect(calls[0]?.headers['idempotency-key']).toBeUndefined()
  })

  it('tire une clé distincte par commande', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN]))
    await client.sendCommand({ body: { intent: 'build' } })
    await client.sendCommand({ body: { intent: 'build' } })

    expect(calls[0]?.headers['idempotency-key']).not.toBe(calls[1]?.headers['idempotency-key'])
  })

  /**
   * Le rejeu doit rester possible : une **réémission** de la même commande
   * porte la même clé. C'est le cas d'usage entier de l'en-tête, et une clé
   * tirée à chaque tentative le viderait de son sens.
   */
  it('conserve la clé fournie par l’appelant', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN]))
    const key = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

    await client.sendCommand({
      body: { intent: 'build' },
      extraHeaders: { 'idempotency-key': key },
    })

    expect(calls[0]?.headers['idempotency-key']).toBe(key)
  })
})

describe('un 401 est rattrapé une fois, jamais deux', () => {
  it('renouvelle le jeton et réémet la requête', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN, RENEWED]), [401, 200])
    const response = await client.readPlanet()

    expect(calls).toHaveLength(2)
    expect(calls[1]?.headers['authorization']).toBe(`Bearer ${RENEWED}`)
    expect(response.status).toBe(200)
  })

  /**
   * Une session révoquée répond 401 quel que soit le jeton. Sans borne, le
   * client boucle et le serveur voit une avalanche pour un joueur qui aurait
   * simplement dû être renvoyé à l'écran de connexion.
   */
  it('ne réessaie pas indéfiniment', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN, RENEWED]), [401, 401])
    const response = await client.readPlanet()

    expect(calls).toHaveLength(2)
    expect(response.status).toBe(401)
  })

  it('ne réessaie pas un refus de règle de jeu', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN]), [409])
    const response = await client.sendCommand({ body: { intent: 'build' } })

    expect(calls).toHaveLength(1)
    expect(response.status).toBe(409)
  })

  /**
   * La clé d'idempotence doit être **la même** à la réémission : c'est une
   * seconde tentative de la même commande, pas une commande nouvelle. Une clé
   * fraîche ferait dépenser deux fois si la première tentative avait en réalité
   * abouti côté serveur.
   */
  it('réémet une commande avec la même clé d’idempotence', async () => {
    const { client, calls } = clientWith(sessionWith([TOKEN, RENEWED]), [401, 201])
    await client.sendCommand({ body: { intent: 'build' } })

    expect(calls).toHaveLength(2)
    expect(calls[1]?.headers['idempotency-key']).toBe(calls[0]?.headers['idempotency-key'])
  })
})
