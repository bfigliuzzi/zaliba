import type { GameSql, GameTransaction } from '@zaliba/db'
import type { Instant } from '@zaliba/domain'
import { instant } from '@zaliba/domain'
import { AppError } from '../plugins/errors.js'
import { findReceipt, writeReceipt } from './idempotency.js'

/**
 * La forme unique de toute mutation — sans exception (doc de stack § 4.5).
 *
 * ```
 * verrouiller la planète (SELECT … FOR UPDATE)
 *   → vérifier l'autorisation sur l'état verrouillé   (FR-007)
 *   → résoudre le chantier échu, s'il y en a un       (FR-032, R3)
 *   → projeter au now() de la transaction             (R2)
 *   → decide() : le domaine dit oui ou non            (FR-056)
 *   → apply() : les effets
 *   → écrire l'instantané daté + le reçu
 * ```
 *
 * Une seule forme à écrire, à tester et à auditer. **La couche serveur ne
 * décide rien** : elle verrouille, elle ordonne, elle écrit. Le oui et le non
 * appartiennent au domaine, et le domaine ne mute rien — il retourne des
 * effets que cette fonction applique.
 *
 * L'ordre n'est pas une commodité de lecture. « Verrouiller **puis** autoriser »
 * est la différence entre une règle et une fenêtre de course : les planètes
 * changent d'occupant, et vérifier avant de verrouiller laisse entre les deux un
 * intervalle pendant lequel la réponse cesse d'être vraie. Ici, l'intervalle
 * n'existe pas.
 *
 * Les collaborateurs sont injectés. Ce n'est pas de l'abstraction gratuite :
 * c'est ce qui rend la forme éprouvable **avant** que le domaine et le dépôt
 * d'instantanés n'existent, et ce qui interdit à une route future d'écrire sa
 * propre variante de la séquence.
 */

/**
 * Une transaction PostgreSQL en cours. Aucune écriture ne se fait hors d'elle.
 *
 * Le type vient du paquet `db`, et non de `postgres` directement : c'est lui
 * qui porte l'enregistrement des `bigint` du pilote. Reprendre le type nu ferait
 * refuser au compilateur un paramètre `bigint` — c'est-à-dire des grains — dans
 * une requête qui l'accepte parfaitement à l'exécution.
 */
export type Transaction = GameTransaction

/** Le domaine dit oui avec des effets, ou non avec un motif. Rien d'autre. */
export type Decision<Effect, Refusal> =
  | { readonly outcome: 'accepted'; readonly effects: readonly Effect[] }
  | { readonly outcome: 'refused'; readonly refusal: Refusal }

export interface CommandShape<Snapshot, State, Command, Effect, Refusal, Response> {
  /**
   * Charge l'instantané **en verrouillant** la ligne de planète.
   * `undefined` signifie « aucune planète », et se rend en 404.
   */
  loadLockedSnapshot(tx: Transaction, planetId: string): Promise<Snapshot | undefined>

  /** L'occupant de l'instantané verrouillé. L'autorisation porte sur lui (FR-007). */
  occupantOf(snapshot: Snapshot): string

  /**
   * Les effets d'achèvement du chantier échu, **redérivés** et non lus.
   * Vide s'il n'y a rien à résoudre.
   */
  completionEffects(snapshot: Snapshot, at: Instant): readonly Effect[]

  /** Note dans l'instantané que le chantier échu a été résolu. */
  markWorkResolved(snapshot: Snapshot, at: Instant): Snapshot

  /** Fonction **pure** : `at` est un argument, jamais un appel d'horloge. */
  project(snapshot: Snapshot, at: Instant): State

  decide(
    state: State,
    command: Command,
  ): Decision<Effect, Refusal> | Promise<Decision<Effect, Refusal>>

  apply(snapshot: Snapshot, effects: readonly Effect[], at: Instant): Snapshot

  writeSnapshot(tx: Transaction, snapshot: Snapshot): Promise<void>

  /** La réponse rendue — et **rejouée telle quelle** si la clé revient. */
  respond(snapshot: Snapshot, state: State, at: Instant): Response

  /** Traduit un motif de refus du domaine en refus HTTP (409). */
  refusalToError(refusal: Refusal): AppError
}

export interface CommandRequest<Command> {
  readonly planetId: string
  readonly playerId: string
  readonly command: Command
  /** Exigée de toute commande (contrats § 5). Son absence est un 400, en amont. */
  readonly idempotencyKey: string
}

export interface CommandOutcome<Response> {
  readonly response: Response
  /** Vrai si la réponse vient d'un reçu, et qu'aucun effet n'a eu lieu. */
  readonly replayed: boolean
}

/**
 * L'instant de référence : le `now()` de la transaction, tronqué à la seconde.
 *
 * `transaction_timestamp()` et non `clock_timestamp()` : il est **constant**
 * pour toute la durée de la transaction, ce qui rend cohérentes entre elles
 * toutes les lectures d'une même commande. Et surtout pas `Date.now()` :
 * l'horloge du processus Node dérive de celle de la base, et un instantané daté
 * par la première serait en avance ou en retard sur le `now()` que la
 * transaction suivante observera — c'est-à-dire une production négative, ou
 * gratuite.
 *
 * La troncature à la seconde est celle de R2 : `Instant` est un entier de
 * secondes UTC, et l'arrondi se fait ici, une fois, à la frontière.
 */
export async function transactionInstant(tx: Transaction): Promise<Instant> {
  const [row] = await tx<{ at: string }[]>`
    select floor(extract(epoch from transaction_timestamp()))::text as at
  `
  if (row === undefined) throw new Error('PostgreSQL n’a pas rendu son instant de transaction.')
  return instant(Number(row.at))
}

function planetNotFound(): never {
  throw new AppError({
    category: 'not-found',
    code: 'planet-not-provisioned',
    message: 'Aucune planète n’est provisionnée pour ce joueur.',
  })
}

function notOccupant(): never {
  throw new AppError({
    category: 'authorization',
    code: 'not-occupant',
    message: 'Cette planète n’est pas la vôtre.',
  })
}

export async function executeCommand<Snapshot, State, Command, Effect, Refusal, Response>(
  sql: GameSql,
  request: CommandRequest<Command>,
  shape: CommandShape<Snapshot, State, Command, Effect, Refusal, Response>,
): Promise<CommandOutcome<Response>> {
  const outcome = await sql.begin(async (tx) => {
    const locked = await shape.loadLockedSnapshot(tx, request.planetId)
    if (locked === undefined) planetNotFound()

    // Sur la ligne verrouillée, et nulle part ailleurs.
    if (shape.occupantOf(locked) !== request.playerId) notOccupant()

    // Derrière le verrou : une réémission simultanée a attendu, et voit ici le
    // reçu que la première a écrit. Lire avant le verrou les ferait toutes deux
    // conclure « aucun reçu », et la seconde ré-exécuterait la commande.
    const receipt = await findReceipt(tx, request.playerId, request.idempotencyKey)
    if (receipt !== undefined) {
      return { response: receipt as Response, replayed: true }
    }

    const at = await transactionInstant(tx)

    const completion = shape.completionEffects(locked, at)
    const resolved = completion.length === 0 ? locked : shape.markWorkResolved(locked, at)

    const state = shape.project(resolved, at)

    const decision = await shape.decide(state, request.command)
    if (decision.outcome === 'refused') {
      // La transaction s'annule : rien n'est écrit, et la clé d'idempotence
      // n'est pas consommée. Un refus est une réponse du jeu, pas une dépense.
      throw shape.refusalToError(decision.refusal)
    }

    const next = shape.apply(resolved, [...completion, ...decision.effects], at)

    await shape.writeSnapshot(tx, next)

    const rendered = shape.respond(next, state, at)
    await writeReceipt(tx, request.playerId, request.idempotencyKey, rendered)
    return { response: rendered, replayed: false }
  })

  return outcome as CommandOutcome<Response>
}
