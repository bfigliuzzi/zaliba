import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  type FetchImplementation,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose'
import { AppError } from './errors.js'

/**
 * L'adaptateur d'authentification : la frontière `jeton → identifiant`.
 *
 * La signature est vérifiée **localement**, par clé asymétrique, contre un JWKS
 * mis en cache (R12). Deux conséquences, et elles sont le motif du choix :
 * aucun appel réseau ne s'ajoute à une requête de jeu, et l'API ne détient
 * jamais de clé capable de **forger** un jeton — elle ne peut que vérifier.
 *
 * Une seule information sort d'ici : *qui*. Aucun droit n'est lu dans le jeton,
 * parce que les planètes changent d'occupant (doc de stack § 6.2) : un droit
 * gravé dans un jeton émis il y a une heure décrirait un monde qui n'existe
 * plus. L'autorisation se vérifie dans la transaction de mutation, sur l'état
 * verrouillé, et nulle part ailleurs.
 */

/** L'identifiant d'un joueur — l'`auth.users.id` de Supabase. */
export type PlayerId = string

declare module 'fastify' {
  interface FastifyRequest {
    /** Renseigné par `requireAuth`, et par rien d'autre. */
    playerId: PlayerId | null
  }
}

/**
 * Les algorithmes acceptés, énumérés plutôt que déduits du jeton.
 *
 * Un vérificateur qui suit l'en-tête `alg` du jeton suit une valeur écrite par
 * l'attaquant. La famille des confusions d'algorithme vit entièrement dans ce
 * détail ; la liste close la rend inatteignable.
 */
const ACCEPTED_ALGORITHMS = ['RS256', 'ES256'] as const

/**
 * Le refus, **unique**.
 *
 * Distinguer « expiré » de « signature invalide » offrirait un oracle : de quoi
 * apprendre qu'un jeton a existé, donc qu'un compte existe. Tous les chemins
 * d'échec passent par ici, et le motif ne quitte pas le serveur — il part au
 * journal, corrélé par `requestId`.
 */
function refuse(): never {
  throw new AppError({
    category: 'authentication',
    code: 'unauthenticated',
    message: 'Authentification requise.',
  })
}

/** `Bearer <jeton>`, la casse du schéma étant libre (RFC 7235). */
const BEARER = /^bearer[ \t]+(\S+)$/i

function tokenFromHeader(header: string | undefined): string {
  const matched = header === undefined ? null : BEARER.exec(header.trim())
  const token = matched?.[1]
  if (token === undefined) refuse()
  return token
}

export interface Authenticator {
  /** `Authorization: Bearer <jwt>` → l'identifiant du joueur, ou un refus. */
  authenticate(authorizationHeader: string | undefined): Promise<PlayerId>
}

export interface AuthOptions {
  /** L'URL du JWKS du projet. Le cache de `jose` évite l'appel par requête. */
  readonly jwksUrl?: string
  /** Un JWKS déjà en main — les tests s'en servent pour rester hors réseau. */
  readonly keys?: JSONWebKeySet
  readonly issuer: string
  readonly audience: string
  /** Tolérance de dérive d'horloge entre l'émetteur et l'API. */
  readonly clockToleranceSeconds?: number
  /** Injection de `fetch`, pour observer que le JWKS n'est récupéré qu'une fois. */
  readonly fetchImplementation?: FetchImplementation
}

/**
 * Le résolveur de clés, construit **une fois** par authentificateur.
 *
 * C'est là que se joue « aucun appel réseau par requête » : `jose` conserve le
 * JWKS et sa fenêtre de refroidissement dans la fermeture du résolveur. Le
 * reconstruire à chaque requête rétablirait l'appel réseau qu'on cherche à
 * éviter, sans qu'aucun test de correction ne s'en aperçoive.
 */
function keyResolver(options: AuthOptions): JWTVerifyGetKey {
  if (options.keys !== undefined) return createLocalJWKSet(options.keys)
  if (options.jwksUrl === undefined) {
    throw new Error('createAuthenticator exige `jwksUrl` ou `keys`.')
  }
  return createRemoteJWKSet(new URL(options.jwksUrl), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { [customFetch]: options.fetchImplementation }),
  })
}

export function createAuthenticator(options: AuthOptions): Authenticator {
  const resolve = keyResolver(options)

  return {
    async authenticate(authorizationHeader: string | undefined): Promise<PlayerId> {
      const token = tokenFromHeader(authorizationHeader)

      let subject: unknown
      try {
        const { payload } = await jwtVerify(token, resolve, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: [...ACCEPTED_ALGORITHMS],
          clockTolerance: options.clockToleranceSeconds ?? 0,
        })
        subject = payload.sub
      } catch {
        // Le motif reste ici. Il n'a rien à faire dans une réponse.
        refuse()
      }

      if (typeof subject !== 'string' || subject.length === 0) refuse()
      return subject
    },
  }
}

/**
 * Déclare `request.playerId` sur l'instance.
 *
 * Fastify veut connaître la forme d'une requête avant la première : une
 * propriété posée à la volée déoptimise l'objet, et rend surtout indécidable
 * la question « cette route est-elle authentifiée ? ». Ici, la réponse est
 * `null` tant qu'aucun `requireAuth` n'est passé.
 */
export function registerPlayerIdentity(app: FastifyInstance): void {
  app.decorateRequest('playerId', null)
}

/**
 * Le garde de route : authentifie, puis pose l'identifiant.
 *
 * Opt-in par route, et non global : une route publique future ne doit pas
 * s'obtenir en **retirant** une protection, ce qui se fait par inadvertance,
 * mais en ne l'ajoutant pas, ce qui se lit dans la déclaration de la route.
 */
export function requireAuth(authenticator: Authenticator) {
  return async function authenticateRequest(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    request.playerId = await authenticator.authenticate(request.headers.authorization)
  }
}
