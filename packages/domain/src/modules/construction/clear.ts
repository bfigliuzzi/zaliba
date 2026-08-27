import type { ObstacleId, ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from '../../kernel/catalogs.js'
import type { Cell, Effect, ResourceAmount, WorkId } from '../../kernel/effects.js'
import type { CellView } from '../../kernel/grid.js'
import type { ProjectedState } from '../../kernel/projection.js'
import { addDuration, type Duration, duration } from '../../kernel/time.js'
import { secondsUntilAffordable, shortfallOf } from './build.js'
import {
  type InsufficientResourcesRefusal,
  insufficientResources,
  type WorkInProgressRefusal,
  workInProgress,
} from './refusals.js'

/**
 * Le déblaiement : libérer du terrain contre des ressources et du temps.
 *
 * **Ce module ne mute rien** (doc de stack § 5.3). Il reçoit un état projeté et
 * retourne des effets que le noyau applique — `debit-resources` et
 * `schedule-work` au lancement, `clear-cell` à l'échéance, redérivé par
 * `effectsOnCompletion`.
 *
 * **Ce que cette mécanique a de propre, et que les trois autres n'ont pas : elle
 * produit un résultat qualitatif.** Une pose donne un bâtiment, une amélioration
 * un niveau, une démolition un remboursement — trois choses que le joueur connaît
 * d'avance. Un déblaiement laisse derrière lui soit du terrain nu, soit un
 * gisement nommé, et c'est ce qui décide si l'opération valait son prix. D'où
 * l'exigence centrale de la tranche : le résultat est **annoncé avant paiement**
 * (FR-042, FR-043).
 *
 * **Le résultat appartient au type d'obstacle, jamais à la case** (FR-044,
 * US5-3). Ce n'est pas une commodité d'implémentation, c'est ce qui rend la
 * planète lisible : qui a déblayé un `filon-enfoui` sait ce que le prochain lui
 * donnera. Un bonus caché sous une case particulière ferait du déblaiement une
 * loterie, et P4 ne pourrait plus rien calculer. Le déterminisme n'est donc pas
 * tenu par l'absence d'un tirage au sort — il est tenu par la **forme de la
 * donnée** : il n'y a nulle part où un tirage pourrait se ranger.
 *
 * **Il n'existe aucun effet inverse de `clear-cell`.** C'est ainsi que FR-045 et
 * l'invariant I-8 sont tenus : une case déblayée ne redevient jamais obstruée
 * parce qu'aucun chemin d'écriture ne le permet, pas parce qu'une garde le
 * refuse. Une garde vit dans un chemin de code, et un second chemin la contourne
 * un jour.
 */

/**
 * L'intention de déblaiement, telle que le serveur la reçoit **enrichie**.
 *
 * `workId` n'est pas un champ du contrat : il est engendré par la couche serveur,
 * parce qu'un domaine pur ne tire pas d'identifiant au sort. Le joueur, lui,
 * n'envoie qu'une case — et il n'a aucun champ pour envoyer autre chose (FR-055).
 * Ni le coût, ni la durée, ni surtout le **résultat** : un champ `reveals` dans
 * l'intention serait la porte ouverte à réclamer un geyser sous un éboulis.
 */
export interface ClearCommand {
  readonly kind: 'clear'
  readonly workId: WorkId
  readonly cell: Cell
}

/**
 * Ce qu'un déblaiement laissera derrière lui.
 *
 * La forme diffère de `ClearingResult` du catalogue — `{ kind: 'deposit',
 * resourceId }` là-bas, `{ depositOf }` ici — et la traduction est volontaire.
 * Le catalogue décrit un **contenu de jeu** ; l'aperçu décrit ce que l'écran doit
 * annoncer, et il le nomme comme la grille nomme un gisement (`depositOf` de
 * `CellView`). Reprendre la forme du catalogue obligerait l'écran à connaître
 * deux vocabulaires pour une seule notion.
 */
export type ClearReveal = 'bare-ground' | { readonly depositOf: ResourceId }

/**
 * Les motifs de refus, en **union fermée** discriminée par `code`.
 *
 * Deux sont partagés avec toute mécanique de construction et vivent dans
 * `refusals.ts` ; deux portent sur la case.
 *
 * **`placement-out-of-grid` est réemployé, et non doublé.** Une case hors de la
 * planète n'a aucun état à examiner : dire d'elle qu'elle « n'est pas obstruée »
 * serait inventer une réponse, exactement comme `grid.ts` refuse de dire d'elle
 * qu'elle est obstruée. Le code existe, son détail énumère les cases fautives, et
 * son sens est exact — le mot « placement » désigne ici la désignation d'une
 * case. Un code jumeau `cell-out-of-grid` obligerait le client et l'API à tenir
 * deux entrées pour une seule situation.
 */
export type ClearRefusal =
  | WorkInProgressRefusal
  | InsufficientResourcesRefusal
  | { readonly code: 'placement-out-of-grid'; readonly cells: readonly Cell[] }
  /**
   * La case visée ne porte pas d'obstacle — libre, occupée, ou **déjà
   * déblayée**.
   *
   * Les trois cas donnent le même motif, et c'est juste : le joueur n'a rien à
   * déblayer, et la raison qui l'y aurait autorisé — un obstacle — est absente.
   * Le détail porte la case, pour que le client sache laquelle de ses lectures
   * est périmée quand un second onglet a déblayé entre-temps.
   */
  | { readonly code: 'cell-not-obstructed'; readonly x: number; readonly y: number }

/** Le domaine dit oui avec des effets, ou non avec un motif. Rien d'autre. */
export type ClearDecision =
  | { readonly outcome: 'accepted'; readonly effects: readonly Effect[] }
  | { readonly outcome: 'refused'; readonly refusal: ClearRefusal }

function obstacleOf(obstacleId: ObstacleId, catalogs: Catalogs) {
  const obstacle = catalogs.obstacles[obstacleId]
  if (obstacle === undefined) {
    // La grille ne nomme que des obstacles du catalogue : arriver ici est une
    // faute de programmation, pas une action de joueur.
    throw new RangeError(`Type d’obstacle inconnu : ${obstacleId}.`)
  }
  return obstacle
}

/**
 * Le coût d'un déblaiement, lu du **type d'obstacle** (FR-042).
 *
 * Pas d'une courbe : un obstacle n'a pas de niveau. C'est la seule mécanique dont
 * le prix est une donnée plate, et c'est ce qui la rend énonçable en une ligne à
 * la page de règles — « déblayer une poche scellée coûte ceci », sans exposant.
 */
export function clearCost(obstacleId: ObstacleId, catalogs: Catalogs): readonly ResourceAmount[] {
  return Object.entries(obstacleOf(obstacleId, catalogs).cost).map(([resourceId, grains]) => ({
    resourceId: resourceId as ResourceId,
    grains,
  }))
}

/** La durée d'un déblaiement, lue du type d'obstacle. */
export function clearDuration(obstacleId: ObstacleId, catalogs: Catalogs): Duration {
  return duration(obstacleOf(obstacleId, catalogs).durationSeconds)
}

/**
 * Ce que le déblaiement révélera — **déterminé par le type**, jamais tiré au sort.
 *
 * La fonction est totale et pure : mêmes arguments, même résultat, pour tous les
 * joueurs. C'est le sens exact de FR-044, et la raison pour laquelle l'aperçu
 * peut promettre un geyser sans que le serveur ait à le confirmer.
 */
export function clearReveals(obstacleId: ObstacleId, catalogs: Catalogs): ClearReveal {
  const reveals = obstacleOf(obstacleId, catalogs).reveals
  return reveals.kind === 'deposit' ? { depositOf: reveals.resourceId } : 'bare-ground'
}

/**
 * Ce que le module doit trancher **avant** de calculer quoi que ce soit.
 *
 * Rendu séparément pour que l'arbitrage et l'aperçu partagent exactement les
 * mêmes contrôles, dans le même ordre (R8) : ce sont les deux moitiés d'un même
 * calcul, et une divergence entre elles se manifesterait comme un aperçu qui
 * promet ce que le serveur refuse.
 */
function reject(state: ProjectedState, command: ClearCommand): ClearRefusal | null {
  // 1. La planète est-elle disponible ? Au plus un chantier (FR-033), et la
  //    projection a déjà résolu ceux qui sont échus : ce qui reste ici est un
  //    chantier réellement en cours.
  //
  //    **Ce contrôle passe avant celui de la case**, et c'est la leçon de la
  //    tranche précédente : un joueur dont un chantier est en cours entendrait
  //    « cette case n'est pas obstruée » alors que la cause est le chantier. Un
  //    refus doit nommer la cause qui permet d'agir, pas la plus proche.
  if (state.work !== null) return workInProgress(state.work)

  // 2. La case est-elle sur la planète ? Une case absente n'a aucun état à
  //    examiner, et lui en prêter un serait inventer une réponse.
  const view = state.grid.find((one) => one.x === command.cell.x && one.y === command.cell.y)
  if (view === undefined) {
    return { code: 'placement-out-of-grid', cells: [command.cell] }
  }

  // 3. Y a-t-il quelque chose à déblayer ?
  if (view.obstacleId === null) {
    return { code: 'cell-not-obstructed', x: command.cell.x, y: command.cell.y }
  }

  return null
}

/**
 * La case visée, une fois les contrôles passés.
 *
 * La levée n'est pas une garde de plus, c'est l'énoncé d'une **précondition** :
 * arriver ici sans obstacle veut dire que `reject` a été oublié, et c'est une
 * faute de programmation. `reject` et cette fonction forment une paire —
 * contrôler, puis résoudre —, et l'aperçu emploie la même (R8).
 */
function targetOf(
  state: ProjectedState,
  cell: Cell,
): CellView & { readonly obstacleId: ObstacleId } {
  const view = state.grid.find((one) => one.x === cell.x && one.y === cell.y)
  if (view === undefined || view.obstacleId === null) {
    throw new RangeError(`Case sans obstacle après contrôle : (${cell.x},${cell.y}).`)
  }
  return view as CellView & { readonly obstacleId: ObstacleId }
}

/**
 * L'arbitrage.
 *
 * L'ordre des contrôles va de la cause la plus générale à la plus
 * circonstancielle, et ce n'est pas une commodité de lecture : c'est ce que le
 * joueur doit entendre en premier. Opposer « ressources insuffisantes » à
 * quelqu'un qui visait une case libre l'enverrait attendre une production qui ne
 * débloquera rien.
 */
export function decideClear(
  state: ProjectedState,
  command: ClearCommand,
  catalogs: Catalogs,
): ClearDecision {
  const refusal = reject(state, command)
  if (refusal !== null) return { outcome: 'refused', refusal }

  const target = targetOf(state, command.cell)

  // 4. Le joueur peut-il payer ?
  const cost = clearCost(target.obstacleId, catalogs)
  const shortfall = shortfallOf(state, cost)
  if (shortfall.length > 0) {
    return {
      outcome: 'refused',
      refusal: insufficientResources(shortfall, secondsUntilAffordable(state, shortfall, cost)),
    }
  }

  const dueAt = addDuration(state.at, clearDuration(target.obstacleId, catalogs))

  return {
    outcome: 'accepted',
    effects: [
      // Le coût est débité **au lancement** (FR-036) ; le déblaiement n'aura lieu
      // qu'à l'échéance, et il sera redérivé par `effectsOnCompletion`.
      { kind: 'debit-resources', amounts: cost },
      {
        kind: 'schedule-work',
        workId: command.workId,
        nature: 'clear',
        // La cible est une case, et **rien qu'une case** : la contrainte
        // `works_target_matches_nature` refuse en base une ligne de déblaiement
        // qui porterait une géométrie de bâtiment.
        target: { kind: 'cell', cell: command.cell },
        startedAt: state.at,
        dueAt,
      },
    ],
  }
}

export { reject as clearRefusalOf, targetOf as clearTargetOf }
