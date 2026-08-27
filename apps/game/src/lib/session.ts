import type { SupabaseClient, Session as SupabaseSession } from '@supabase/supabase-js'

/**
 * La session : la **seule** source du jeton.
 *
 * `@supabase/supabase-js` est employé **exclusivement** comme client
 * d'authentification (doc de stack § 6.1). Le client n'accède jamais à la base :
 * le schéma `game` n'est pas exposé à PostgREST, et son seul interlocuteur est
 * l'API.
 *
 * Ce module rend cette règle **structurelle** plutôt que disciplinaire. Le port
 * `AuthPort` déclare la part de Supabase qu'on emploie, et rien d'autre : ni
 * `from`, ni `rpc`, ni `storage`. L'accès direct à la base n'est pas interdit
 * par une garde qu'un code futur pourrait contourner — il est **inatteignable**
 * depuis ce qu'on tient en main.
 *
 * Deuxième règle structurelle : le jeton **n'est pas une propriété** de l'objet
 * de session. Il ne s'obtient que par un appel. Un `console.log(session)`, un
 * rapport d'erreur automatique ou une trace d'analyse ne peuvent donc pas
 * l'emporter par mégarde — et un jeton parti dans une URL ou un journal est un
 * jeton qu'on ne peut plus rappeler.
 */

/**
 * La session telle que Supabase la rend. Traduite tout de suite, jamais gardée.
 *
 * Les deux champs sont **repris** du type de Supabase plutôt que redéclarés :
 * leur nommage est celui du protocole, pas un choix, et les recopier à la main
 * imposerait de désactiver la convention de nommage du dépôt pour une forme
 * qui ne nous appartient pas. Le `Pick` a un second effet, celui qui compte : le
 * jour où Supabase renomme ou retire l'un d'eux, la compilation le dit.
 */
export type RawSession = Pick<SupabaseSession, 'access_token' | 'expires_at'> & {
  readonly user: { readonly id: string }
}

/**
 * La part de Supabase que le jeu emploie — et l'exhaustivité est le sujet.
 *
 * Ajouter une méthode ici est une décision, visible en revue. C'est ce qui
 * distingue « nous n'accédons pas à la base » d'une intention.
 */
export interface AuthPort {
  getSession(): Promise<RawSession | null>
  refreshSession(): Promise<RawSession | null>
  signInWithPassword(credentials: Credentials): Promise<AuthAttempt>
  signUp(credentials: Credentials): Promise<AuthAttempt>
  signOut(): Promise<void>
  /** Rend la fonction de désabonnement. */
  onAuthStateChange(listener: (session: SessionInfo | null) => void): () => void
}

export interface Credentials {
  readonly email: string
  readonly password: string
}

export interface AuthAttempt {
  readonly session: RawSession | null
  /** Un motif destiné à l'affichage, jamais une trace technique. */
  readonly error: string | null
}

/**
 * Ce que le reste de l'application sait d'une session.
 *
 * **Aucun jeton ici.** C'est ce qui rend `JSON.stringify(session)` inoffensif.
 */
export interface SessionInfo {
  readonly playerId: string
  readonly expiresAt: number
}

/**
 * La marge avant expiration au-delà de laquelle on renouvelle par anticipation.
 *
 * Elle couvre l'aller-retour réseau. Sans elle, un jeton qui expire pendant le
 * trajet arrive périmé : le serveur répond 401, et le joueur voit une erreur
 * pour une session qui était parfaitement valide au moment où il a cliqué.
 */
export const SAFETY_MARGIN_SECONDS = 60

export interface Session {
  /** Les informations publiques de la session, ou `null` si déconnecté. */
  current(): Promise<SessionInfo | null>
  /**
   * Un jeton utilisable **maintenant**, renouvelé si besoin. `null` si le
   * joueur n'est pas connecté, ou si le renouvellement a échoué.
   */
  freshAccessToken(): Promise<string | null>
  signIn(credentials: Credentials): Promise<AuthAttempt>
  signUp(credentials: Credentials): Promise<AuthAttempt>
  signOut(): Promise<void>
  onChange(listener: (session: SessionInfo | null) => void): () => void
}

export interface SessionOptions {
  /**
   * L'horloge, en secondes UTC. Un argument, jamais un appel enfoui : c'est ce
   * qui rend l'expiration éprouvable sans attendre une heure.
   */
  readonly now?: () => number
}

function toInfo(raw: RawSession | null): SessionInfo | null {
  if (raw === null) return null
  return { playerId: raw.user.id, expiresAt: raw.expires_at ?? 0 }
}

export function createSession(port: AuthPort, options: SessionOptions = {}): Session {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000))

  /**
   * Le rafraîchissement en cours, partagé.
   *
   * Supabase fait tourner ses jetons de rafraîchissement : cinq requêtes
   * simultanées qui renouvellent chacune de leur côté s'invalident
   * mutuellement, et le joueur est déconnecté au moment précis où il agit. La
   * promesse partagée est ce qui transforme cinq renouvellements en un seul.
   */
  let inFlight: Promise<RawSession | null> | null = null

  async function refreshOnce(): Promise<RawSession | null> {
    inFlight ??= port.refreshSession().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  return {
    async current() {
      return toInfo(await port.getSession())
    },

    async freshAccessToken() {
      const raw = await port.getSession()
      // Rien à rafraîchir : ne pas appeler produirait un aller-retour par écran
      // et une file d'échecs pour un joueur simplement déconnecté.
      if (raw === null) return null

      const expiresAt = raw.expires_at ?? 0
      if (expiresAt - SAFETY_MARGIN_SECONDS > now()) return raw.access_token

      const renewed = await refreshOnce()
      return renewed?.access_token ?? null
    },

    signIn: (credentials) => port.signInWithPassword(credentials),
    signUp: (credentials) => port.signUp(credentials),
    signOut: () => port.signOut(),
    onChange: (listener) => port.onAuthStateChange(listener),
  }
}

/**
 * Adapte le client Supabase réel au port.
 *
 * Toute la surface de `supabase-js` s'arrête ici : ce qui traverse est
 * exactement ce que `AuthPort` déclare. Le message d'erreur d'une tentative est
 * repris tel quel — Supabase les rédige pour être montrés, et les réécrire
 * ferait perdre la distinction entre « mot de passe erroné » et « courriel non
 * confirmé », que le joueur a besoin de connaître.
 */
export function createSupabaseAuthPort(client: SupabaseClient): AuthPort {
  const auth = client.auth

  return {
    async getSession() {
      const { data } = await auth.getSession()
      return (data.session as RawSession | null) ?? null
    },
    async refreshSession() {
      const { data } = await auth.refreshSession()
      return (data.session as RawSession | null) ?? null
    },
    async signInWithPassword(credentials) {
      const { data, error } = await auth.signInWithPassword(credentials)
      return { session: (data.session as RawSession | null) ?? null, error: error?.message ?? null }
    },
    async signUp(credentials) {
      const { data, error } = await auth.signUp(credentials)
      return { session: (data.session as RawSession | null) ?? null, error: error?.message ?? null }
    },
    async signOut() {
      await auth.signOut()
    },
    onAuthStateChange(listener) {
      const { data } = auth.onAuthStateChange((_event, session) => {
        listener(toInfo((session as RawSession | null) ?? null))
      })
      return () => data.subscription.unsubscribe()
    },
  }
}
