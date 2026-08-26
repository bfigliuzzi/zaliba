import type { FastifyInstance } from 'fastify'
import { buildApi } from '../../src/app.js'
import type { Authenticator } from '../../src/plugins/auth.js'
import { AppError } from '../../src/plugins/errors.js'
import type { Harness } from './harness.js'

/**
 * Un serveur d'intégration branché sur le PostgreSQL du harnais.
 *
 * **L'authentification est substituée**, et R12 le prévoit explicitement : « les
 * tests d'intégration injectent l'identifiant directement ; ils vérifient
 * l'autorisation *dans la transaction*, pas la cryptographie ». La vérification
 * de signature a ses propres cas, sur des jetons de fixture, dans `auth.test.ts`.
 *
 * Les faire ici coûterait une paire de clés et une signature par requête pour
 * éprouver une chose déjà éprouvée — et rendrait ces cas-ci plus lents et moins
 * lisibles sans rien attraper de plus.
 */

/** L'identifiant du joueur voyage tel quel dans l'en-tête. */
export const passthroughAuthenticator: Authenticator = {
  async authenticate(header) {
    const matched = header === undefined ? null : /^bearer[ \t]+(\S+)$/i.exec(header.trim())
    const playerId = matched?.[1]
    if (playerId === undefined) {
      throw new AppError({
        category: 'authentication',
        code: 'unauthenticated',
        message: 'Authentification requise.',
      })
    }
    return playerId
  },
}

/**
 * L'intention de chantier, telle que le contrat l'accepte.
 *
 * Volontairement typée `object` et non `WorkIntentV1` : plusieurs cas envoient
 * des charges que le contrat doit **refuser** — un champ dérivable, une borne
 * dépassée. Les typer au contrat rendrait ces cas inécrivables, c'est-à-dire
 * qu'on ne pourrait pas éprouver ce qui compte le plus.
 */
export type WorkPayload = Record<string, unknown>

export interface TestServer {
  readonly app: FastifyInstance
  provision(playerId: string, options?: { idempotencyKey?: string | null }): Promise<Response>
  provisionAnonymous(): Promise<Response>
  read(playerId: string): Promise<Response>
  readAnonymous(): Promise<Response>
  startWork(
    playerId: string,
    payload: WorkPayload,
    options?: { idempotencyKey?: string | null },
  ): Promise<Response>
  startWorkAnonymous(payload: WorkPayload): Promise<Response>
  close(): Promise<void>
}

type Response = Awaited<ReturnType<FastifyInstance['inject']>>

let counter = 0

/** Une clé d'idempotence valide et distincte à chaque appel. */
function nextKey(): string {
  counter += 1
  return `3f2504e0-4f89-11d3-9a0c-${counter.toString(16).padStart(12, '0')}`
}

export async function buildTestServer(harness: Harness): Promise<TestServer> {
  const app = buildApi({
    sql: harness.sql,
    authenticator: passthroughAuthenticator,
    logLevel: 'silent',
  })
  await app.ready()

  function headers(playerId: string, idempotencyKey?: string | null) {
    return {
      authorization: `Bearer ${playerId}`,
      ...(idempotencyKey === null ? {} : { 'idempotency-key': idempotencyKey ?? nextKey() }),
    }
  }

  return {
    app,
    provision: (playerId, options = {}) =>
      app.inject({
        method: 'POST',
        url: '/v1/me/planet',
        headers: headers(playerId, options.idempotencyKey),
        payload: {},
      }),
    provisionAnonymous: () =>
      app.inject({
        method: 'POST',
        url: '/v1/me/planet',
        headers: { 'idempotency-key': nextKey() },
        payload: {},
      }),
    read: (playerId) =>
      app.inject({
        method: 'GET',
        url: '/v1/me/planet',
        headers: { authorization: `Bearer ${playerId}` },
      }),
    readAnonymous: () => app.inject({ method: 'GET', url: '/v1/me/planet' }),
    startWork: (playerId, payload, options = {}) =>
      app.inject({
        method: 'POST',
        url: '/v1/me/planet/works',
        headers: headers(playerId, options.idempotencyKey),
        payload,
      }),
    startWorkAnonymous: (payload) =>
      app.inject({
        method: 'POST',
        url: '/v1/me/planet/works',
        headers: { 'idempotency-key': nextKey() },
        payload,
      }),
    close: () => app.close(),
  }
}
