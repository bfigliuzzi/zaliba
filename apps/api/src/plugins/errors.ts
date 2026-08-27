import {
  categoryOfStatus,
  type ErrorBodyV1,
  type ErrorCategory,
  HTTP_STATUS_BY_CATEGORY,
} from '@zaliba/contracts'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

/**
 * Le mapping d'erreurs : **une seule** forme de corps sort de cette API.
 *
 * Les greffons de ce dossier sont des fonctions ordinaires appliquées à
 * l'instance racine, et non des greffons enregistrés par `register`. Fastify
 * encapsule ce qu'on enregistre : un `setErrorHandler` posé dans un contexte
 * encapsulé ne couvrirait pas les routes déclarées ailleurs, et il faudrait
 * `fastify-plugin` pour rompre l'encapsulation. Une dépendance de plus pour
 * décrire un appel de fonction : le principe V dit non.
 */

/** Ce qu'une erreur doit porter pour se rendre en réponse. */
export interface AppErrorInit {
  readonly category: ErrorCategory
  /** Appartient à une union fermée, documentée route par route. */
  readonly code: string
  readonly message: string
  readonly details?: Record<string, unknown>
}

/**
 * Une erreur dont la traduction en réponse est **décidée à la levée**.
 *
 * La catégorie n'est pas devinée par le gestionnaire à partir du message ou du
 * type : elle est portée par l'erreur. C'est ce qui permet à un refus de règle
 * de jeu de se rendre en 409 plutôt qu'en 500, sans que le gestionnaire ait à
 * connaître la mécanique qui l'a produit.
 */
export class AppError extends Error {
  readonly category: ErrorCategory
  readonly code: string
  readonly details: Record<string, unknown> | undefined

  constructor(init: AppErrorInit) {
    super(init.message)
    this.name = 'AppError'
    this.category = init.category
    this.code = init.code
    this.details = init.details
  }

  /** Le statut HTTP de la catégorie, tenu par le contrat et non par l'API. */
  get statusCode(): number {
    return HTTP_STATUS_BY_CATEGORY[this.category]
  }
}

/**
 * Le corps d'erreur, construit clé par clé.
 *
 * `details` est omis plutôt que posé à `undefined` : le schéma des contrats est
 * fermé, et `exactOptionalPropertyTypes` distingue les deux.
 */
function errorBody(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ErrorBodyV1 {
  return { code, message, requestId, ...(details === undefined ? {} : { details }) }
}

/** Une erreur Fastify de validation de schéma — donc 400, avant toute règle. */
function isSchemaViolation(error: unknown): boolean {
  return (error as FastifyError | undefined)?.validation !== undefined
}

/**
 * Le statut annoncé par une erreur Fastify, s'il appartient à la table § 7.
 *
 * Un statut hors table — 415, 429 — n'est pas traduit en catégorie inventée :
 * il retombe en défaut serveur, ce qui le rend visible plutôt que plausible.
 */
function categoryOfFastifyError(error: unknown): ErrorCategory | null {
  const status = (error as FastifyError | undefined)?.statusCode
  return typeof status === 'number' ? categoryOfStatus(status) : null
}

/**
 * Traduit toute erreur en `{ code, message, details?, requestId }`.
 *
 * Le cas par défaut est le plus important : **rien de ce que porte une erreur
 * inattendue ne sort**. Ni son message, ni sa pile, ni les identifiants de
 * connexion qu'elle pourrait citer. Le `requestId` est ce qui rend l'incident
 * retrouvable malgré ce silence — le journal, lui, garde tout.
 */
export function registerErrorMapping(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id

    if (error instanceof AppError) {
      request.log.info(
        { code: error.code, category: error.category },
        'la requête est refusée par une règle',
      )
      reply
        .status(error.statusCode)
        .send(errorBody(error.code, error.message, requestId, error.details))
      return
    }

    if (isSchemaViolation(error)) {
      request.log.info({ err: error }, 'la requête viole le schéma')
      reply
        .status(HTTP_STATUS_BY_CATEGORY['schema-violation'])
        .send(
          errorBody('schema-violation', 'La requête ne respecte pas le schéma attendu.', requestId),
        )
      return
    }

    const category = categoryOfFastifyError(error)
    if (category !== null && category !== 'server-fault') {
      request.log.info({ err: error }, 'la requête est rejetée par le socle HTTP')
      reply
        .status(HTTP_STATUS_BY_CATEGORY[category])
        .send(errorBody(category, 'La requête ne peut pas être traitée.', requestId))
      return
    }

    // Le journal garde tout ; la réponse ne garde rien.
    request.log.error({ err: error }, 'défaut serveur non rattrapé')
    reply
      .status(HTTP_STATUS_BY_CATEGORY['server-fault'])
      .send(
        errorBody(
          'server-fault',
          'Une erreur interne est survenue. Communiquez l’identifiant de requête pour toute enquête.',
          requestId,
        ),
      )
  })

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply
      .status(HTTP_STATUS_BY_CATEGORY['not-found'])
      .send(errorBody('not-found', 'La route demandée n’existe pas.', request.id))
  })
}
