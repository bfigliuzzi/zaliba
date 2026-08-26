import { describe, expect, it, vi } from 'vitest'
import {
  type AuthPort,
  createSession,
  type RawSession,
  SAFETY_MARGIN_SECONDS,
} from '../src/lib/session.js'

/**
 * La session : la **seule** source du jeton.
 *
 * Trois exigences, et deux d'entre elles portent sur ce qui ne doit pas
 * exister :
 *
 * - le jeton ne figure **jamais** dans une URL ni dans un journal. Une URL part
 *   dans l'historique du navigateur, dans le `Referer` de la requête suivante
 *   et dans les journaux d'accès de tout ce qui se trouve sur le chemin ; un
 *   jeton qui y passe est un jeton qu'on ne peut plus rappeler. La parade
 *   retenue n'est pas une convention : le jeton **n'est pas une propriété** de
 *   l'objet de session, il ne s'obtient que par un appel. On ne peut donc pas
 *   le sérialiser par mégarde ;
 * - `@supabase/supabase-js` est employé **exclusivement** comme client
 *   d'authentification. Le port déclaré ici n'a ni `from` ni `rpc` : l'accès
 *   direct à la base est inatteignable par construction, et non forbidden par
 *   une garde qu'on pourrait contourner ;
 * - un jeton expiré est renouvelé **silencieusement**, et une seule fois pour
 *   plusieurs appels concurrents. La déduplication n'est pas une optimisation :
 *   Supabase fait tourner ses tokens de rafraîchissement, et cinq requêtes
 *   simultanées qui rafraîchissent chacune de leur côté s'invalident
 *   mutuellement — le joueur est alors déconnecté au moment où il agit.
 */

const NOW = 1_787_750_000
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJqb3VldXItMSJ9.signature-fictive'
const RENEWED = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJqb3VldXItMSJ9.signature-renouvelee'
const PLAYER_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

function rawSession(accessToken: string, expiresAt: number): RawSession {
  return { access_token: accessToken, expires_at: expiresAt, user: { id: PLAYER_ID } }
}

interface FakePort extends AuthPort {
  readonly getCalls: () => number
  readonly refreshCalls: () => number
}

function fakePort(initial: RawSession | null, renewed: RawSession | null = null): FakePort {
  let current = initial
  let gets = 0
  let refreshes = 0

  return {
    async getSession() {
      gets += 1
      return current
    },
    async refreshSession() {
      refreshes += 1
      // Un rafraîchissement n'est pas instantané : le délai est ce qui rend le
      // cas de concurrence observable plutôt que théorique.
      await new Promise((resolve) => setTimeout(resolve, 10))
      current = renewed
      return renewed
    },
    async signInWithPassword() {
      return { session: initial, error: null }
    },
    async signUp() {
      return { session: initial, error: null }
    },
    async signOut() {
      current = null
    },
    onAuthStateChange() {
      return () => {}
    },
    getCalls: () => gets,
    refreshCalls: () => refreshes,
  }
}

/** L'horloge est un argument, jamais un appel — y compris côté client. */
function sessionAt(port: AuthPort, now = NOW) {
  return createSession(port, { now: () => now })
}

describe('sans session, rien ne part', () => {
  it('ne rend aucun jeton', async () => {
    const session = sessionAt(fakePort(null))
    expect(await session.freshAccessToken()).toBeNull()
  })

  /**
   * Ne pas tenter de rafraîchir quand il n'y a rien à rafraîchir. Un client qui
   * appellerait quand même produirait un aller-retour réseau à chaque écran, et
   * une file d'échecs dans la console pour un joueur simplement déconnecté.
   */
  it('ne tente pas de rafraîchir ce qui n’existe pas', async () => {
    const port = fakePort(null)
    await sessionAt(port).freshAccessToken()
    expect(port.refreshCalls()).toBe(0)
  })

  it('ne rend aucune information de joueur', async () => {
    expect(await sessionAt(fakePort(null)).current()).toBeNull()
  })
})

describe('avec une session valide, le jeton vient d’elle et de nulle part ailleurs', () => {
  it('rend le jeton de la session', async () => {
    const port = fakePort(rawSession(TOKEN, NOW + 3600))
    expect(await sessionAt(port).freshAccessToken()).toBe(TOKEN)
  })

  it('rend l’identifiant du joueur et l’instant d’expiration', async () => {
    const port = fakePort(rawSession(TOKEN, NOW + 3600))
    expect(await sessionAt(port).current()).toEqual({
      playerId: PLAYER_ID,
      expiresAt: NOW + 3600,
    })
  })

  it('ne rafraîchit pas un jeton encore largement valide', async () => {
    const port = fakePort(rawSession(TOKEN, NOW + 3600))
    await sessionAt(port).freshAccessToken()
    expect(port.refreshCalls()).toBe(0)
  })
})

describe('le jeton ne peut pas fuir par mégarde', () => {
  /**
   * L'objet de session **n'a pas** de champ pour le jeton. Ce n'est pas une
   * précaution de style : c'est ce qui rend impossible un
   * `console.log(session)` ou un `JSON.stringify(session)` qui l'emporterait
   * dans un journal, un rapport d'erreur ou une trace d'analyse.
   */
  it('ne porte pas le jeton dans l’objet de session', async () => {
    const port = fakePort(rawSession(TOKEN, NOW + 3600))
    const info = await sessionAt(port).current()

    expect(JSON.stringify(info)).not.toContain(TOKEN)
    expect(Object.values(info ?? {})).not.toContain(TOKEN)
  })

  it('n’expose le jeton que par un appel explicite', async () => {
    const port = fakePort(rawSession(TOKEN, NOW + 3600))
    const session = sessionAt(port)

    expect(JSON.stringify(session)).not.toContain(TOKEN)
    expect(await session.freshAccessToken()).toBe(TOKEN)
  })
})

describe('un jeton expiré est renouvelé silencieusement', () => {
  it('rafraîchit et rend le jeton renouvelé', async () => {
    const port = fakePort(rawSession(TOKEN, NOW - 1), rawSession(RENEWED, NOW + 3600))
    expect(await sessionAt(port).freshAccessToken()).toBe(RENEWED)
  })

  /**
   * La marge de sûreté couvre l'aller-retour. Sans elle, un jeton qui expire
   * pendant le trajet arrive périmé : le serveur répond 401, et le joueur voit
   * une erreur pour une session qui était valide au moment où il a cliqué.
   */
  it('rafraîchit par anticipation un jeton sur le point d’expirer', async () => {
    const port = fakePort(
      rawSession(TOKEN, NOW + SAFETY_MARGIN_SECONDS - 1),
      rawSession(RENEWED, NOW + 3600),
    )
    expect(await sessionAt(port).freshAccessToken()).toBe(RENEWED)
    expect(port.refreshCalls()).toBe(1)
  })

  /**
   * Supabase fait tourner ses tokens de rafraîchissement : cinq requêtes
   * simultanées qui rafraîchissent chacune de leur côté s'invalident
   * mutuellement, et le joueur est déconnecté au moment précis où il agit.
   */
  it('ne rafraîchit qu’une fois pour plusieurs appels concurrents', async () => {
    const port = fakePort(rawSession(TOKEN, NOW - 1), rawSession(RENEWED, NOW + 3600))
    const session = sessionAt(port)

    const tokens = await Promise.all([
      session.freshAccessToken(),
      session.freshAccessToken(),
      session.freshAccessToken(),
      session.freshAccessToken(),
      session.freshAccessToken(),
    ])

    expect(port.refreshCalls()).toBe(1)
    expect(new Set(tokens)).toEqual(new Set([RENEWED]))
  })

  it('rend null si le rafraîchissement échoue, sans boucler', async () => {
    const port = fakePort(rawSession(TOKEN, NOW - 1), null)
    const session = sessionAt(port)

    expect(await session.freshAccessToken()).toBeNull()
    expect(await session.freshAccessToken()).toBeNull()
    // Un second appel réessaie une fois, il ne boucle pas.
    expect(port.refreshCalls()).toBeLessThanOrEqual(2)
  })
})

describe('supabase-js n’est employé que pour authentifier', () => {
  /**
   * Le port déclaré n'a ni `from` ni `rpc`. Ce cas éprouve la conséquence
   * pratique : même muni d'un client complet, la session n'en touche que la
   * part d'authentification. Le schéma `game` n'est de toute façon pas exposé
   * à PostgREST — mais une garde en profondeur ne coûte rien ici.
   */
  it('ne touche jamais à autre chose qu’à l’authentification', async () => {
    const forbidden = vi.fn(() => {
      throw new Error('accès direct à la base')
    })
    const port = fakePort(rawSession(TOKEN, NOW + 3600))
    const client = { ...port, from: forbidden, rpc: forbidden } as AuthPort

    const session = createSession(client, { now: () => NOW })
    await session.current()
    await session.freshAccessToken()

    expect(forbidden).not.toHaveBeenCalled()
  })
})
