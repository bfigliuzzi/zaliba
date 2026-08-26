import { randomUUID } from 'node:crypto'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import type { GameSql, PlanetRecord } from '@zaliba/db'
import { insertPlanet, lockPlanetByOwner, readPlanetByOwner } from '@zaliba/db'
import { type Catalogs, emptySnapshot, layoutOf } from '@zaliba/domain'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { transactionInstant } from '../../command/execute.js'
import { idempotencyKeyOf } from '../../command/idempotency.js'
import { toContract, toSnapshot } from '../../mapping/snapshot.js'
import type { Authenticator } from '../../plugins/auth.js'
import { requireAuth } from '../../plugins/auth.js'
import { AppError } from '../../plugins/errors.js'

/**
 * Les routes de la planète (contrats `v1-planet.md`).
 *
 * Deux en US1 — provisionner et lire. La troisième, `POST /works`, arrive avec
 * US2 : la déclarer vide dès maintenant ferait mentir l'API sur ce qu'elle sait
 * faire, et un `501` est une réponse qu'aucun client ne sait traiter utilement.
 *
 * **Chaque réponse traverse `PlanetSnapshotV1.parse`.** Ce n'est pas une
 * précaution redondante : c'est ce qui rend le principe IV mécanique à
 * l'exécution. Le serveur ne peut structurellement pas émettre une forme que le
 * contrat interdit — un champ dérivable ajouté par mégarde fait échouer la
 * requête ici, chez nous, plutôt que d'entrer en production et de devenir une
 * dépendance de fait pour un client qu'on ne peut pas forcer à se mettre à jour.
 */

export interface PlanetRouteDependencies {
  readonly sql: GameSql
  readonly authenticator: Authenticator
  readonly catalogs: Catalogs
  readonly catalogVersion: string
  readonly newId?: () => string
}

function planetNotProvisioned(): never {
  throw new AppError({
    category: 'not-found',
    code: 'planet-not-provisioned',
    message: 'Aucune planète n’est provisionnée pour ce joueur.',
  })
}

function playerOf(request: FastifyRequest): string {
  const playerId = request.playerId
  if (playerId === null) {
    throw new AppError({
      category: 'authentication',
      code: 'unauthenticated',
      message: 'Authentification requise.',
    })
  }
  return playerId
}

export function registerPlanetRoutes(app: FastifyInstance, deps: PlanetRouteDependencies): void {
  const authenticate = requireAuth(deps.authenticator)
  const newId = deps.newId ?? randomUUID

  /**
   * `POST /v1/me/planet` — provisionner.
   *
   * Idempotente par **l'index unique sur `owner_id`**, et non par un verrou
   * applicatif (R11). De deux transactions simultanées, la seconde n'insère
   * aucune ligne et répond `200` avec la planète existante. Vérifier puis
   * insérer laisserait entre les deux un intervalle exploitable qu'aucun code
   * applicatif ne peut refermer ; la base, elle, est la seule à pouvoir arbitrer.
   */
  app.post('/v1/me/planet', { preHandler: authenticate }, async (request, reply) => {
    // La clé est exigée avant toute écriture : une commande sans clé est
    // irrattrapable sur un réseau instable (contrats § 5).
    idempotencyKeyOf(request)
    const playerId = playerOf(request)

    const { created, record, at } = await deps.sql.begin(async (tx) => {
      const now = await transactionInstant(tx)

      const existing = await lockPlanetByOwner(tx, playerId)
      if (existing !== undefined) return { created: false, record: existing, at: now }

      const layout = layoutOf(deps.catalogs, 'berceau-v1')
      const fresh = emptySnapshot({
        planetId: newId(),
        ownerId: playerId,
        // Propriétaire **et** occupant (FR-006). Les deux notions sont
        // distinctes dès maintenant, pour que FR-007 soit vérifiable.
        occupantId: playerId,
        archetypeId: 'berceau',
        layoutId: layout.id,
        consolidatedAt: now,
        catalogs: deps.catalogs,
      })

      const inserted = await insertPlanet(tx, {
        id: fresh.planetId,
        ownerId: fresh.ownerId,
        occupantId: fresh.occupantId,
        archetypeId: fresh.archetypeId,
        layoutId: fresh.layoutId,
        consolidatedAt: fresh.consolidatedAt,
        holdings: Object.entries(fresh.holdings).map(([resourceId, holding]) => ({
          resourceId,
          amountGrains: holding.amount,
          lostGrains: holding.lost,
        })),
      })

      if (!inserted) {
        // Une transaction concurrente a gagné la course. On relit la sienne.
        const winner = await lockPlanetByOwner(tx, playerId)
        if (winner === undefined) planetNotProvisioned()
        return { created: false, record: winner, at: now }
      }

      const record = await lockPlanetByOwner(tx, playerId)
      if (record === undefined) planetNotProvisioned()
      return { created: true, record, at: now }
    })

    return respond(reply, record, at, deps, created ? 201 : 200)
  })

  /**
   * `GET /v1/me/planet` — lire. **Fonction pure** (FR-031, R11).
   *
   * Aucune écriture, aucune consolidation, aucun provisionnement — y compris
   * quand un chantier est échu depuis trois semaines. C'est la projection locale
   * du client qui l'applique, à `dueAt`.
   */
  app.get('/v1/me/planet', { preHandler: authenticate }, async (request, reply) => {
    const playerId = playerOf(request)

    const { record, at } = await deps.sql.begin(async (tx) => {
      const now = await transactionInstant(tx)
      const found = await readPlanetByOwner(tx, playerId)
      if (found === undefined) planetNotProvisioned()
      return { record: found, at: now }
    })

    return respond(reply, record, at, deps, 200)
  })
}

/**
 * Rend l'instantané, **validé contre le contrat**.
 *
 * La réponse porte l'instantané brut, jamais l'état projeté : le client rejoue
 * la projection avec le même code (R8), et l'envoyer dupliquerait un calcul
 * qu'il fait déjà — en créant deux vérités là où le monorepo n'en veut qu'une.
 */
function respond(
  reply: FastifyReply,
  record: PlanetRecord,
  at: number,
  deps: PlanetRouteDependencies,
  status: 200 | 201,
) {
  const snapshot = toSnapshot(record, deps.catalogs)
  const body = PlanetSnapshotV1.parse(toContract(snapshot, at, deps.catalogVersion))
  return reply.status(status).send(body)
}
