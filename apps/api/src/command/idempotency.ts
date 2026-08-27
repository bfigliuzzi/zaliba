import type { GameTransaction } from '@zaliba/db'
import type { FastifyRequest } from 'fastify'
import { AppError } from '../plugins/errors.js'

/**
 * Le reçu de commande et le rejeu à l'identique (contrats § 5).
 *
 * Le motif est concret : la cible est une application mobile sur réseau
 * instable. Une requête part, le réseau tombe, le client ne sait pas si elle a
 * abouti et la réémet. Sans reçu, le joueur dépense deux fois — et il ne s'en
 * aperçoit qu'à la comptabilité, longtemps après.
 *
 * Le reçu est écrit dans la **même transaction** que l'instantané. Un reçu
 * écrit à part pourrait survivre à l'annulation de la commande, et la
 * réémission suivante rejouerait alors une réponse décrivant des effets qui
 * n'ont jamais eu lieu.
 */

/** L'en-tête que le client génère, et sans lequel une commande est refusée. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key'

/** L'en-tête par lequel le serveur annonce « rien n'a été exécuté ». */
export const IDEMPOTENCY_REPLAYED_HEADER = 'idempotency-replayed'

/** UUID, 36 caractères (contrats § 5). Une forme close, pas une chaîne libre. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function malformed(): never {
  throw new AppError({
    category: 'schema-violation',
    code: 'invalid-idempotency-key',
    message: `L’en-tête ${IDEMPOTENCY_KEY_HEADER} est requis, au format UUID.`,
  })
}

/**
 * La clé de la requête, ou un 400.
 *
 * Exiger la clé **avant** toute exécution, et non l'inventer côté serveur si
 * elle manque : une clé engendrée par le serveur serait différente à chaque
 * tentative, donc inutile — c'est précisément la réémission qu'elle doit
 * reconnaître. Une commande sans clé est irrattrapable ; mieux vaut la refuser
 * que la laisser dépenser deux fois.
 */
export function idempotencyKeyOf(request: FastifyRequest): string {
  const header = request.headers[IDEMPOTENCY_KEY_HEADER]
  const key = Array.isArray(header) ? header[0] : header
  if (typeof key !== 'string' || !UUID.test(key)) malformed()
  return key
}

/**
 * Le reçu déjà enregistré pour cette clé, s'il y en a un.
 *
 * Lu **dans la transaction et après le verrou de planète**. L'ordre n'est pas
 * indifférent : deux réémissions simultanées liraient toutes deux « aucun
 * reçu » si la lecture précédait le verrou, et la seconde ré-exécuterait la
 * commande avant de buter sur la clé primaire du reçu. Derrière le verrou, la
 * seconde attend, puis lit un instantané frais où le reçu de la première est
 * visible.
 */
export async function findReceipt(
  tx: GameTransaction,
  playerId: string,
  idempotencyKey: string,
): Promise<unknown | undefined> {
  const [row] = await tx<{ response: unknown }[]>`
    select response from game.command_receipts
    where player_id = ${playerId} and idempotency_key = ${idempotencyKey}
  `
  return row?.response
}

/** Écrit le reçu. À n'appeler que dans la transaction de la commande. */
export async function writeReceipt(
  tx: GameTransaction,
  playerId: string,
  idempotencyKey: string,
  response: unknown,
): Promise<void> {
  await tx`
    insert into game.command_receipts (player_id, idempotency_key, response, created_at)
    values (${playerId}, ${idempotencyKey}, ${tx.json(response as never)}, transaction_timestamp())
  `
}
