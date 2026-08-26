import type { PlanetSnapshotV1 } from '@zaliba/contracts'
import { PlanetSnapshotV1 as PlanetSnapshotSchema, planetContractV1 } from '@zaliba/contracts'
import type { PlanetGateway } from '../features/auth/gateway.js'
import { createApiClient } from './api.js'
import type { Session } from './session.js'

/**
 * Le pont entre le client `ts-rest` et ce dont l'écran a besoin.
 *
 * Deux choses s'y jouent, et aucune n'est de la plomberie.
 *
 * **Le refus devient une erreur portant son code.** Le serveur répond `404` avec
 * `{ code: 'planet-not-provisioned' }` ; l'écran doit reconnaître ce motif pour
 * en faire un déclencheur plutôt qu'une page d'erreur (FR-001). Le code est
 * repris tel quel, jamais le message : le message est un libellé lisible et
 * n'est jamais la source de vérité (contrats § 5).
 *
 * **La réponse est analysée, jamais transtypée.** Une charge que le contrat
 * refuse doit échouer ici, à la frontière, et non trois composants plus loin
 * sous la forme d'un `undefined` inexplicable.
 */

export class PlanetRefusal extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'PlanetRefusal'
    this.status = status
    this.code = code
  }
}

interface ErrorLikeBody {
  readonly code?: unknown
  readonly message?: unknown
}

function refuse(status: number, body: unknown): never {
  const { code, message } = (body ?? {}) as ErrorLikeBody
  throw new PlanetRefusal(
    status,
    typeof code === 'string' ? code : 'server-fault',
    typeof message === 'string' ? message : 'La requête a échoué.',
  )
}

export interface PlanetGatewayOptions {
  readonly baseUrl: string
  readonly session: Session
}

export function createPlanetGateway(options: PlanetGatewayOptions): PlanetGateway {
  const client = createApiClient(planetContractV1, options)

  return {
    async read() {
      const response = await client.readPlanet()
      if (response.status !== 200) refuse(response.status, response.body)
      return PlanetSnapshotSchema.parse(response.body) satisfies PlanetSnapshotV1
    },

    async provision() {
      const response = await client.provisionPlanet({ body: {} })
      // `201` créée, `200` déjà existante — les deux sont un succès, et le
      // client n'a aucune raison de les distinguer : la planète est là.
      if (response.status !== 201 && response.status !== 200) {
        refuse(response.status, response.body)
      }
      return PlanetSnapshotSchema.parse(response.body) satisfies PlanetSnapshotV1
    },
  }
}
