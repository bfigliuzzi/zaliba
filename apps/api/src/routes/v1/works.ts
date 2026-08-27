import { randomUUID } from 'node:crypto'
import type { WorkIntentV1 as WorkIntent } from '@zaliba/contracts'
import { PlanetSnapshotV1, WorkIntentV1 } from '@zaliba/contracts'
import type { GameSql } from '@zaliba/db'
import { lockPlanetByOwner, writePlanet } from '@zaliba/db'
import type {
  BuildCommand,
  BuildRefusal,
  Catalogs,
  ClearCommand,
  ClearRefusal,
  PlanetSnapshot,
  UpgradeCommand,
  UpgradeRefusal,
} from '@zaliba/domain'
import {
  applyEffects,
  consolidatePlanet,
  decideBuild,
  decideClear,
  decideUpgrade,
  type ProjectedState,
  projectPlanet,
} from '@zaliba/domain'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { type Decision, executeCommand, type Transaction } from '../../command/execute.js'
import { IDEMPOTENCY_REPLAYED_HEADER, idempotencyKeyOf } from '../../command/idempotency.js'
import { toContract, toSnapshot, toWrite } from '../../mapping/snapshot.js'
import type { Authenticator } from '../../plugins/auth.js'
import { requireAuth } from '../../plugins/auth.js'
import { AppError } from '../../plugins/errors.js'

/**
 * `POST /v1/me/planet/works` — lancer un chantier.
 *
 * La route est **mince, et c'est le but**. Elle authentifie, analyse la charge,
 * engendre un identifiant de chantier, et confie tout le reste à la forme unique
 * de commande. Elle ne décide rien : le oui et le non appartiennent au domaine,
 * et le domaine ne mute rien — il retourne des effets que la forme applique.
 *
 * **Une route pour toutes les natures, et non une par mécanique.** « Au plus un
 * chantier par planète » (FR-033) est une règle qui porte sur la planète et non
 * sur une mécanique : quatre routes devraient chacune la vérifier, et la première
 * qui l'oublierait ouvrirait la porte à deux chantiers simultanés. Ici il n'y a
 * qu'une séquence verrouillée, et le domaine tranche à l'intérieur.
 * L'aiguillage — `commandOf` puis `decideWork` — repose sur deux `switch` **sans
 * branche par défaut** : déclarer une nature au contrat sans l'honorer ici fait
 * échouer la compilation.
 *
 * **Le client n'envoie qu'une intention** : un type, une variante, une
 * orientation, une position pour une pose ; une cible pour une amélioration ; une
 * case pour un déblaiement. Le coût, la durée, l'échéance et — depuis US5 — le
 * **résultat** ne sont pas seulement recalculés : ils sont **absents du contrat**,
 * donc impossibles à annoncer (FR-055, FR-056, FR-044). Et l'instant de référence
 * est le `now()` de la transaction, donc antidater est hors d'atteinte (FR-057).
 *
 * **Le `201` porte l'instantané d'après débit et planification.** Le client n'a
 * ainsi aucun `GET` à enchaîner, et son extrapolation locale reprend
 * immédiatement sur une base fraîche — ce qui compte sur un réseau instable,
 * où l'aller-retour supplémentaire est précisément celui qui se perd.
 */

export interface WorksRouteDependencies {
  readonly sql: GameSql
  readonly authenticator: Authenticator
  readonly catalogs: Catalogs
  readonly catalogVersion: string
  /** Injectable pour rendre les identifiants prévisibles en test. */
  readonly newId?: () => string
}

/** Ce que la route rend, et ce que le reçu d'idempotence rejoue à l'identique. */
type WorkResponse = ReturnType<typeof toContract>

/**
 * Les commandes et les refus des mécaniques que cette route honore.
 *
 * Les unions grandissent tranche par tranche, et elles grandissent **ici** : la
 * route est le seul endroit qui les voit ensemble. Le domaine, lui, garde ses
 * mécaniques séparées — `build.ts` ne sait rien de `upgrade.ts`.
 */
type WorkCommand = BuildCommand | UpgradeCommand | ClearCommand
type WorkRefusal = BuildRefusal | UpgradeRefusal | ClearRefusal
type WorkEffect = Parameters<typeof applyEffects>[1][number]

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

/**
 * Analyse la charge, ou **400**.
 *
 * `parse`, jamais `as`. Une clé inconnue, une orientation à sept, une
 * coordonnée non entière : toutes refusées ici, avant qu'aucune règle de jeu
 * n'ait été consultée. La frontière entre 400 et 409 est celle entre « la
 * requête est malformée » et « le jeu répond non », et un client qui traite les
 * 400 comme des bogues afficherait le mauvais écran si on les confondait.
 */
function intentOf(body: unknown) {
  const parsed = WorkIntentV1.safeParse(body)
  if (!parsed.success) {
    throw new AppError({
      category: 'schema-violation',
      code: 'invalid-work-intent',
      message: 'La charge ne décrit pas une intention de chantier valide.',
      details: { issues: parsed.error.issues.map((issue) => issue.path.join('.')) },
    })
  }
  return parsed.data
}

/**
 * Le refus du domaine, rendu en refus HTTP.
 *
 * La traduction est **structurelle** : le `code` du domaine *est* celui du
 * contrat, et `details` reprend le reste du motif tel quel. Un dictionnaire de
 * correspondance entre deux vocabulaires serait un endroit de plus où oublier
 * une entrée — et l'oubli donnerait un 500 là où le jeu voulait dire non.
 */
export function refusalToError(refusal: WorkRefusal): AppError {
  const { code, ...details } = refusal

  return new AppError({
    category: 'game-rule-refusal',
    code,
    message: REFUSAL_MESSAGES[code],
    details,
  })
}

/**
 * Les libellés, lisibles et **jamais source de vérité** (contrats § 5).
 *
 * Le client dérive son affichage de `code` et de `details`. Ces phrases servent
 * aux journaux, au diagnostic et au client qui n'aurait rien de mieux — pas à
 * être analysées.
 */
export const REFUSAL_MESSAGES: Readonly<Record<WorkRefusal['code'], string>> = {
  'work-in-progress': 'Un chantier est déjà en cours sur cette planète.',
  'insufficient-resources': 'Les ressources ne suffisent pas à payer ce chantier.',
  'placement-out-of-grid': 'L’empreinte sortirait de la grille.',
  'placement-on-obstructed-cell': 'L’empreinte recouvrirait une case obstruée.',
  'placement-on-occupied-cell': 'L’empreinte recouvrirait une case déjà occupée.',
  'variant-not-available-for-type': 'Ce type de bâtiment n’admet pas cette empreinte.',
  'building-not-found': 'Ce bâtiment n’est pas sur cette planète.',
  'max-level-reached': 'Ce bâtiment est au niveau maximal du catalogue.',
  'cell-not-obstructed': 'Cette case ne porte aucun obstacle à déblayer.',
}

/**
 * L'intention du contrat, enrichie de l'identifiant que **le serveur** engendre.
 *
 * Un domaine pur ne tire rien au sort, et le client n'a aucun champ pour proposer
 * un identifiant de chantier. Le `switch` n'a pas de branche par défaut : ajouter
 * une nature au contrat sans l'honorer ici fait échouer la compilation, plutôt que
 * de rendre un défaut serveur là où le jeu voulait dire « pas encore ».
 */
function commandOf(intent: WorkIntent, workId: string): WorkCommand {
  switch (intent.nature) {
    case 'build':
      return {
        kind: 'build',
        workId,
        typeId: intent.typeId,
        variantId: intent.variantId,
        orientation: intent.orientation,
        anchor: { x: intent.anchorX, y: intent.anchorY },
      }
    case 'upgrade':
      // Aucune géométrie n'est transmise, et il n'y en a aucune à transmettre :
      // c'est FR-039 dans la forme du contrat (voir `upgrade-absence.test.ts`).
      return { kind: 'upgrade', workId, buildingId: intent.buildingId }
    case 'clear':
      // Aucun résultat n'est transmis, et il n'y en a aucun à transmettre : le
      // type d'obstacle est lu de la disposition, et ce qu'il révèle du catalogue.
      // C'est FR-044 dans la forme du contrat (voir `clear-absence.test.ts`).
      return { kind: 'clear', workId, cell: { x: intent.x, y: intent.y } }
  }
}

/**
 * L'arbitrage, aiguillé sur la mécanique.
 *
 * **La couche serveur ne décide rien** : elle nomme la fonction de domaine qui
 * décide. Le `switch` est exhaustif par le même mécanisme que ci-dessus.
 */
function decideWork(
  state: ProjectedState,
  command: WorkCommand,
  catalogs: Catalogs,
): Decision<WorkEffect, WorkRefusal> {
  switch (command.kind) {
    case 'build':
      return decideBuild(state, command, catalogs)
    case 'upgrade':
      return decideUpgrade(state, command, catalogs)
    case 'clear':
      return decideClear(state, command, catalogs)
  }
}

export function registerWorksRoutes(app: FastifyInstance, deps: WorksRouteDependencies): void {
  const authenticate = requireAuth(deps.authenticator)
  const newId = deps.newId ?? randomUUID

  app.post('/v1/me/planet/works', { preHandler: authenticate }, async (request, reply) => {
    // La clé est exigée **avant** toute écriture : une commande sans clé est
    // irrattrapable sur un réseau instable (contrats § 5).
    const idempotencyKey = idempotencyKeyOf(request)
    const playerId = playerOf(request)
    const intent = intentOf(request.body)

    // L'identifiant est engendré **par le serveur** : un domaine pur ne tire rien
    // au sort, et le client n'a aucun champ pour en proposer un.
    const command = commandOf(intent, newId())

    const outcome = await executeCommand<
      PlanetSnapshot,
      ProjectedState,
      WorkCommand,
      WorkEffect,
      WorkRefusal,
      WorkResponse
    >(
      deps.sql,
      // En 001, une planète par joueur (R11) : l'identifiant qui la désigne est
      // celui de son propriétaire.
      { planetId: playerId, playerId, command, idempotencyKey },
      {
        async loadLockedSnapshot(tx: Transaction, ownerId: string) {
          const record = await lockPlanetByOwner(tx, ownerId)
          return record === undefined ? undefined : toSnapshot(record, deps.catalogs)
        },

        occupantOf: (snapshot) => snapshot.occupantId,

        // Accumulation et achèvement du chantier échu, en un seul appel : c'est
        // la projection qui les fait ensemble, à l'échéance et non à l'instant
        // de constatation (R3, FR-032).
        consolidate: (snapshot, at) => consolidatePlanet(snapshot, deps.catalogs, at),

        project: (snapshot, at) => projectPlanet(snapshot, deps.catalogs, at),

        decide: (state, given) => decideWork(state, given, deps.catalogs),

        apply: (snapshot, effects, at) => applyEffects(snapshot, effects, at),

        writeSnapshot: (tx: Transaction, snapshot) =>
          writePlanet(tx, toWrite(snapshot, deps.catalogs)),

        respond: (snapshot, _state, at) => toContract(snapshot, at, deps.catalogVersion),

        refusalToError,
      },
    )

    // Le rejeu est annoncé : le client sait que rien n'a été exécuté, et qu'il
    // lit la réponse de sa première tentative.
    if (outcome.replayed) reply.header(IDEMPOTENCY_REPLAYED_HEADER, 'true')

    // La réponse traverse le schéma, comme celles des deux autres routes : le
    // serveur ne peut structurellement pas émettre une forme que le contrat
    // interdit.
    return reply.status(201).send(PlanetSnapshotV1.parse(outcome.response))
  })
}
