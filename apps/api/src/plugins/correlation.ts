import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

/** L'en-tête qui porte l'identifiant de corrélation vers le client. */
export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * L'identifiant de corrélation est **émis par le serveur**, jamais reçu.
 *
 * Fastify sait reprendre un identifiant proposé dans un en-tête entrant. C'est
 * commode derrière un proxy de confiance, et dangereux ici : le client est un
 * navigateur ou une application mobile, donc hostile par hypothèse. Reprendre
 * sa valeur lui offrirait d'écrire dans le journal l'identifiant de son choix —
 * y compris celui d'une requête voisine, ce qui rendrait douteuse la seule
 * trace dont dispose une enquête.
 *
 * D'où `requestIdHeader: false` dans les options du serveur, et cette fonction
 * qui n'a plus qu'à publier ce que Fastify a engendré.
 */
export function generateRequestId(): string {
  return randomUUID()
}

/**
 * Renvoie l'identifiant au client dès l'entrée de la requête.
 *
 * Le poser en `onRequest` et non en `onSend` n'est pas un détail : une réponse
 * d'erreur produite avant les greffons suivants doit le porter elle aussi,
 * sans quoi les seules réponses non corrélées seraient exactement celles qu'on
 * cherche à retrouver.
 */
export function registerCorrelation(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header(REQUEST_ID_HEADER, request.id)
  })
}
