import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import { REQUEST_ID_HEADER } from './correlation.js'

/**
 * Le partage de ressources entre origines.
 *
 * CORS ne protège pas le serveur : un client non navigateur l'ignore purement
 * et simplement. Il protège le **joueur** — sans lui, une page ouverte dans un
 * autre onglet ferait émettre au navigateur des commandes portant la session en
 * cours, et le joueur perdrait sa planète sans avoir rien cliqué.
 *
 * La liste d'origines est donc **close et déclarée**, jamais `*` : le joker
 * n'autorise de toute façon pas les requêtes porteuses d'identifiants, et il
 * masque la question de savoir qui appelle.
 */

/** L'en-tête d'idempotence, exigé de toute commande (contrats § 5). */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key'

/** L'en-tête qui signale un rejeu, et non une exécution (contrats § 5). */
export const IDEMPOTENCY_REPLAYED_HEADER = 'idempotency-replayed'

/** Ce que le client a le droit d'envoyer. */
const ALLOWED_HEADERS = ['authorization', 'content-type', IDEMPOTENCY_KEY_HEADER]

/**
 * Ce que le client a le droit de **lire**.
 *
 * Un navigateur ne laisse au script que les en-têtes exposés. Sans
 * `x-request-id`, l'identifiant de corrélation existe mais reste invisible au
 * joueur, et l'enquête commence par « avez-vous un numéro ? » sans que personne
 * n'ait pu en donner un. Sans `idempotency-replayed`, le client ne distingue
 * pas « la commande vient de s'exécuter » de « elle avait déjà été exécutée ».
 */
const EXPOSED_HEADERS = [REQUEST_ID_HEADER, IDEMPOTENCY_REPLAYED_HEADER]

export function registerCors(app: FastifyInstance, origins: readonly string[]): void {
  app.register(cors, {
    origin: [...origins],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
    // Les jetons voyagent dans `Authorization`, jamais dans un témoin : rien
    // ne doit partir « tout seul » avec une requête entre origines.
    credentials: false,
    maxAge: 600,
  })
}
