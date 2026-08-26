import { ErrorBodyV1 } from '@zaliba/contracts'
import { type CryptoKey, exportJWK, generateKeyPair, type JSONWebKeySet, SignJWT } from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuthenticator, requireAuth } from '../src/plugins/auth.js'
import { AppError } from '../src/plugins/errors.js'
import { buildServer } from '../src/server.js'

/**
 * L'adaptateur d'authentification : la frontière `jeton → identifiant`.
 *
 * Elle ne fait qu'une chose, et le test est là pour qu'elle continue à n'en
 * faire qu'une : dire **qui**. Aucun droit n'est lu dans le jeton, parce que
 * les planètes changent d'occupant (doc de stack § 6.2) — un droit gravé dans
 * un jeton émis il y a une heure décrirait un monde qui n'existe plus.
 *
 * Les jetons sont signés ici par une paire de clés de test, et vérifiés contre
 * un JWKS local. Aucun réseau : ce qui est éprouvé est la cryptographie et le
 * refus, pas la disponibilité de Supabase.
 */

const ISSUER = 'https://projet.supabase.test/auth/v1'
const AUDIENCE = 'authenticated'
const PLAYER_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const KEY_ID = 'cle-de-test'

let privateKey: CryptoKey
let jwks: JSONWebKeySet
/** Une seconde paire, jamais publiée : de quoi forger une signature crédible. */
let intruderKey: CryptoKey

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  privateKey = pair.privateKey
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KEY_ID, alg: 'RS256', use: 'sig' }] }

  const intruder = await generateKeyPair('RS256', { extractable: true })
  intruderKey = intruder.privateKey
})

interface TokenOptions {
  readonly subject?: string | undefined
  readonly expiresAt?: number
  readonly issuer?: string
  readonly audience?: string
  readonly claims?: Record<string, unknown>
  readonly signWith?: CryptoKey
}

async function makeToken(options: TokenOptions = {}): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const jwt = new SignJWT({ ...options.claims })
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setIssuedAt(issuedAt)
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expiresAt ?? issuedAt + 3600)

  const subject = options.subject === undefined ? PLAYER_ID : options.subject
  if (subject !== '') jwt.setSubject(subject)

  return jwt.sign(options.signWith ?? privateKey)
}

function authenticator() {
  return createAuthenticator({ keys: jwks, issuer: ISSUER, audience: AUDIENCE })
}

describe('un jeton valide donne un identifiant de joueur, et rien d’autre', () => {
  it('rend le sujet du jeton', async () => {
    const playerId = await authenticator().authenticate(`Bearer ${await makeToken()}`)
    expect(playerId).toBe(PLAYER_ID)
  })

  /**
   * Le retour est une **chaîne**, pas un objet. Ce n'est pas une commodité :
   * c'est la place qu'on refuse de créer. Un objet finirait tôt ou tard par
   * porter un `role` ou un `isAdmin` recopié du jeton, et l'autorisation aurait
   * quitté la transaction sans que personne n'ait pris la décision.
   */
  it('ne rend qu’une chaîne, sans place où loger un droit', async () => {
    const token = await makeToken({
      claims: {
        role: 'service_role',
        app_metadata: { provider: 'email', roles: ['admin'] },
        user_metadata: { pseudonyme: 'Zorg' },
        email: 'joueuse@exemple.test',
      },
    })

    const result = await authenticator().authenticate(`Bearer ${token}`)

    expect(typeof result).toBe('string')
    expect(result).toBe(PLAYER_ID)
  })

  it('accepte le préfixe Bearer quelle que soit sa casse', async () => {
    const token = await makeToken()
    await expect(authenticator().authenticate(`bearer ${token}`)).resolves.toBe(PLAYER_ID)
    await expect(authenticator().authenticate(`BEARER ${token}`)).resolves.toBe(PLAYER_ID)
  })
})

describe('tout jeton douteux se rend en 401, sans détail', () => {
  /** Chaque cas doit échouer de la **même** façon : un oracle est un indice. */
  async function refusal(header: string | undefined): Promise<AppError> {
    try {
      await authenticator().authenticate(header)
    } catch (error: unknown) {
      return error as AppError
    }
    throw new Error('l’authentification aurait dû échouer')
  }

  it.each([
    ['un en-tête absent', undefined],
    ['un en-tête vide', ''],
    ['un en-tête sans le schéma Bearer', 'abcdef.ghijkl.mnopqr'],
    ['un schéma inconnu', 'Basic am91ZXVzZTpzZWNyZXQ='],
    ['un Bearer sans jeton', 'Bearer '],
    ['un jeton qui n’est pas un JWT', 'Bearer pas-un-jeton'],
  ])('refuse %s', async (_label, header) => {
    const error = await refusal(header)
    expect(error).toBeInstanceOf(AppError)
    expect(error.category).toBe('authentication')
  })

  it('refuse un jeton expiré', async () => {
    const past = Math.floor(Date.now() / 1000) - 60
    const error = await refusal(`Bearer ${await makeToken({ expiresAt: past })}`)
    expect(error.category).toBe('authentication')
  })

  /**
   * La signature intruse est le cas qui compte : le jeton est parfaitement
   * formé, ses claims sont exacts, seule la clé est fausse. C'est ce que
   * produit une attaque, pas une erreur de client.
   */
  it('refuse un jeton signé par une clé étrangère', async () => {
    const error = await refusal(`Bearer ${await makeToken({ signWith: intruderKey })}`)
    expect(error.category).toBe('authentication')
  })

  it('refuse un jeton émis par un autre émetteur', async () => {
    const error = await refusal(`Bearer ${await makeToken({ issuer: 'https://ailleurs.test' })}`)
    expect(error.category).toBe('authentication')
  })

  it('refuse un jeton destiné à une autre audience', async () => {
    const error = await refusal(`Bearer ${await makeToken({ audience: 'autre-service' })}`)
    expect(error.category).toBe('authentication')
  })

  it('refuse un jeton sans sujet — il ne dit pas qui', async () => {
    const error = await refusal(`Bearer ${await makeToken({ subject: '' })}`)
    expect(error.category).toBe('authentication')
  })

  /**
   * Tous les refus portent **le même code et le même message**. Distinguer
   * « expiré » de « signature invalide » offrirait un oracle : de quoi savoir
   * qu'un jeton a existé, donc qu'un compte existe.
   */
  it('refuse toujours de la même façon, sans dire pourquoi', async () => {
    const past = Math.floor(Date.now() / 1000) - 60
    const errors = [
      await refusal(undefined),
      await refusal(`Bearer ${await makeToken({ expiresAt: past })}`),
      await refusal(`Bearer ${await makeToken({ signWith: intruderKey })}`),
    ]

    const shapes = new Set(errors.map((error) => `${error.code}|${error.message}`))
    expect(shapes.size).toBe(1)
    for (const error of errors) expect(error.details).toBeUndefined()
  })
})

describe('le JWKS est mis en cache : aucun appel réseau par requête', () => {
  it('ne récupère les clés qu’une fois pour plusieurs vérifications', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )

    const remote = createAuthenticator({
      jwksUrl: 'https://projet.supabase.test/auth/v1/.well-known/jwks.json',
      issuer: ISSUER,
      audience: AUDIENCE,
      fetchImplementation: fetchSpy,
    })

    const token = await makeToken()
    await remote.authenticate(`Bearer ${token}`)
    await remote.authenticate(`Bearer ${token}`)
    await remote.authenticate(`Bearer ${token}`)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('sur une route protégée, le refus est un 401 conforme au contrat', () => {
  function protectedServer() {
    const app = buildServer({ logLevel: 'silent' })
    app.get('/protege', { preHandler: requireAuth(authenticator()) }, async (request) => ({
      playerId: request.playerId,
    }))
    return app
  }

  it('laisse passer un jeton valide et expose l’identifiant à la route', async () => {
    const response = await protectedServer().inject({
      method: 'GET',
      url: '/protege',
      headers: { authorization: `Bearer ${await makeToken()}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ playerId: PLAYER_ID })
  })

  it('rend 401 sans jeton, dans la forme unique du contrat', async () => {
    const response = await protectedServer().inject({ method: 'GET', url: '/protege' })

    expect(response.statusCode).toBe(401)
    expect(() => ErrorBodyV1.parse(response.json())).not.toThrow()
    expect(response.json().details).toBeUndefined()
    expect(response.json().requestId).toBe(response.headers['x-request-id'])
  })

  it('ne divulgue dans le corps ni le motif, ni le jeton présenté', async () => {
    const token = await makeToken({ signWith: intruderKey })
    const response = await protectedServer().inject({
      method: 'GET',
      url: '/protege',
      headers: { authorization: `Bearer ${token}` },
    })
    const body = JSON.stringify(response.json())

    expect(response.statusCode).toBe(401)
    expect(body).not.toContain(token)
    expect(body.toLowerCase()).not.toContain('signature')
    expect(body.toLowerCase()).not.toContain('expir')
  })
})
