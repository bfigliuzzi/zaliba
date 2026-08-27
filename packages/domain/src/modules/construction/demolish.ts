import type { BuildingTypeId, ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from '../../kernel/catalogs.js'
import { cumulativeCost } from '../../kernel/curves.js'
import type { BuildingId, Cell, Effect, ResourceAmount, WorkId } from '../../kernel/effects.js'
import type { BuildingView, ProjectedState } from '../../kernel/projection.js'
import { addDuration, type Duration, duration } from '../../kernel/time.js'
import { type WorkInProgressRefusal, workInProgress } from './refusals.js'

/**
 * La démolition : le second antidote à la grille figée.
 *
 * **Ce module ne mute rien** (doc de stack § 5.3). Il reçoit un état projeté et
 * retourne des effets que le noyau applique — `schedule-work` au lancement,
 * `remove-building` puis `credit-resources` à l'échéance, redérivés par
 * `effectsOnCompletion`.
 *
 * **Ce que la mécanique promet, et qui n'est pas évident : une erreur de placement
 * n'est plus définitive.** Sans elle, une planète mal rangée reste mal rangée pour
 * toujours, et le jeu punit l'apprentissage — l'inverse exact de ce qu'un jeu de
 * rangement doit faire.
 *
 * **La démolition ne coûte rien** — une durée, et rien d'autre. Il n'y a donc ici
 * aucun `debit-resources`, et aucun refus pour compte insuffisant : une planète
 * saturée d'erreurs doit pouvoir se corriger même sans trésorerie, sinon la seule
 * mécanique censée garantir qu'aucun état de jeu n'est bloquant serait elle-même
 * bloquée par le blocage.
 *
 * **Le remboursement est dérivé, jamais stocké** (R9, FR-046) : il vaut
 * `fraction × Σ(k=1..N) coût(k)`, recalculé depuis la courbe du catalogue. C'est ce
 * qui garantit que la page de règles, l'aperçu du client et l'arbitrage du serveur
 * donnent le **même** nombre. Un coût cumulé figé à la pose deviendrait faux au
 * premier rééquilibrage, et faux en silence.
 *
 * Et c'est la raison pour laquelle l'amélioration n'a **pas** de courbe propre
 * (voir `upgrade.ts`) : cette somme n'est le total réellement dépensé que si monter
 * au niveau `k` a coûté exactement `coût(k)`.
 */

/**
 * L'intention de démolition, telle que le serveur la reçoit **enrichie**.
 *
 * `workId` n'est pas un champ du contrat : il est engendré par la couche serveur,
 * parce qu'un domaine pur ne tire pas d'identifiant au sort. Le joueur, lui,
 * n'envoie qu'une cible — ni remboursement, ni durée, ni montant écrêté (FR-055).
 */
export interface DemolishCommand {
  readonly kind: 'demolish'
  readonly workId: WorkId
  readonly buildingId: BuildingId
}

/**
 * Les motifs de refus, en **union fermée** discriminée par `code`.
 *
 * Un seul est partagé — le chantier en cours — et deux sont propres à la
 * démolition. Il n'y a **pas** de `insufficient-resources` : la démolition ne coûte
 * rien, et déclarer un motif que le module ne peut pas produire serait une promesse
 * vide dans le vocabulaire que l'API publie.
 */
export type DemolishRefusal =
  | WorkInProgressRefusal
  /**
   * La cible n'est pas sur cette planète.
   *
   * Le même motif que pour l'amélioration, et le même raisonnement : le contrat
   * accepte n'importe quel UUID, et rien dans un schéma ne peut dire qu'une planète
   * porte ce bâtiment. Le cas arrive pour de bon quand une seconde vue du jeu a
   * démoli le bâtiment entre l'aperçu et l'envoi.
   */
  | { readonly code: 'building-not-found'; readonly buildingId: BuildingId }
  /**
   * La cible **est** celle du chantier en cours.
   *
   * Plus précis que `work-in-progress`, et c'est pourquoi ce motif existe. Les deux
   * nomment la même cause — un chantier est en cours —, mais celui-ci dit *pourquoi
   * ce bâtiment-là*. Un joueur qui améliore sa mine et tente de la démolir
   * entendrait sinon « un chantier est en cours » et pourrait croire qu'un autre
   * bâtiment est concerné. C'est la leçon de la phase 6 poussée d'un cran : la plus
   * précise des deux causes vraies est celle qui permet d'agir.
   *
   * `workId` est dans le motif pour que le client sache quel chantier consulter —
   * son échéance dit quand revenir.
   */
  | { readonly code: 'building-is-work-target'; readonly workId: WorkId }

/** Le domaine dit oui avec des effets, ou non avec un motif. Rien d'autre. */
export type DemolishDecision =
  | { readonly outcome: 'accepted'; readonly effects: readonly Effect[] }
  | { readonly outcome: 'refused'; readonly refusal: DemolishRefusal }

function typeOf(typeId: BuildingTypeId, catalogs: Catalogs) {
  const type = catalogs.buildings[typeId]
  if (type === undefined) {
    // Un bâtiment posé porte forcément un type du catalogue : arriver ici est une
    // faute de programmation, pas une action de joueur.
    throw new RangeError(`Type de bâtiment inconnu : ${typeId}.`)
  }
  return type
}

/**
 * Le remboursement **brut** : `fraction × Σ(k=1..N) coût(k)` (R9, FR-046).
 *
 * La somme porte sur les valeurs **déjà tronquées** de la courbe (R19), et la
 * fraction est appliquée en entiers avec une troncature vers le bas : le joueur ne
 * peut pas récupérer plus qu'il n'a dépensé.
 *
 * « Brut » veut dire *avant plafond*. L'écrêtement dépend de l'état à l'échéance,
 * donc il n'appartient pas à cette fonction — qui ne connaît qu'un type, un niveau
 * et un catalogue, et reste ainsi la formule que la page de règles publiera.
 */
export function grossRefund(
  typeId: BuildingTypeId,
  level: number,
  catalogs: Catalogs,
): readonly ResourceAmount[] {
  const type = typeOf(typeId, catalogs)

  return (
    Object.entries(type.cost)
      .map(([resourceId, curve]) => ({
        resourceId: resourceId as ResourceId,
        grains: Math.floor((cumulativeCost(curve, level) * type.refund.num) / type.refund.den),
      }))
      // Un remboursement nul n'est pas listé : une ligne « 0 Jus » ferait chercher au
      // joueur une ressource que ce bâtiment n'a jamais coûtée.
      .filter((amount) => amount.grains > 0)
  )
}

/**
 * La durée d'une démolition, lue du catalogue.
 *
 * Elle **ne dépend pas du niveau**, et c'est un choix d'équilibrage lisible :
 * démolir est une correction, pas une seconde construction. La faire croître avec
 * le niveau punirait deux fois la même erreur.
 */
export function demolishDuration(typeId: BuildingTypeId, catalogs: Catalogs): Duration {
  return duration(typeOf(typeId, catalogs).demolitionSeconds)
}

/** Ce qu'une ressource pourra encore recevoir : quantité et plafond, à l'échéance. */
export interface Room {
  readonly amount: number
  readonly cap: number
}

/** Le remboursement, écrêté par les plafonds — et ce que l'écrêtement a coûté. */
export interface ClippedRefund {
  /** Ce que le joueur reçoit réellement. Les montants nuls sont absents. */
  readonly refund: readonly ResourceAmount[]
  /** Ce qu'un plafond retient (FR-049). Vide quand rien n'est écrêté. */
  readonly clipped: readonly ResourceAmount[]
}

/**
 * Écrête un remboursement brut par la place disponible **à l'échéance**.
 *
 * Le même calcul sert à l'aperçu et à l'achèvement, et c'est indispensable : FR-049
 * exige que le montant écrêté soit annoncé *avant confirmation*, donc prédit au
 * lancement pour un crédit qui aura lieu plus tard. Deux implémentations
 * divergeraient d'un grain, et le grain divergent serait un joueur à qui l'on a
 * promis autre chose que ce qu'il reçoit.
 *
 * **Les listes sont creuses** : ni `refund` ni `clipped` ne portent d'entrée nulle.
 * Une ligne « 0 Camelote écrêtée » ferait chercher au joueur une perte qui n'existe
 * pas ; l'absence se dit par l'absence.
 */
export function clipRefund(
  gross: readonly ResourceAmount[],
  room: Readonly<Partial<Record<ResourceId, Room>>>,
): ClippedRefund {
  const refund: ResourceAmount[] = []
  const clipped: ResourceAmount[] = []

  for (const amount of gross) {
    const available = room[amount.resourceId]
    // Une ressource sans place connue est traitée comme sans place : écrêter par
    // défaut est le sens prudent, puisque l'inverse créerait de la ressource.
    const free = available === undefined ? 0 : Math.max(0, available.cap - available.amount)
    const granted = Math.min(amount.grains, free)

    if (granted > 0) refund.push({ resourceId: amount.resourceId, grains: granted })
    if (amount.grains > granted) {
      clipped.push({ resourceId: amount.resourceId, grains: amount.grains - granted })
    }
  }

  return { refund, clipped }
}

/**
 * Ce que le module doit trancher **avant** de calculer quoi que ce soit.
 *
 * Rendu séparément pour que l'arbitrage et l'aperçu partagent exactement les mêmes
 * contrôles, dans le même ordre (R8).
 */
function reject(state: ProjectedState, command: DemolishCommand): DemolishRefusal | null {
  // 1. La planète est-elle disponible ? Au plus un chantier (FR-033).
  //
  //    Le refus se **précise** quand le chantier porte sur la cible visée : c'est
  //    la même cause, mais dite de la façon qui permet d'agir. Ce contrôle passe
  //    avant celui de la cible pour la raison établie en phase 6 — une pose en
  //    cours explique l'absence du bâtiment qu'elle produira, et opposer « bâtiment
  //    introuvable » enverrait chercher un bâtiment qui se construit.
  if (state.work !== null) {
    const target = state.work.target
    if (target.kind === 'building' && target.buildingId === command.buildingId) {
      return { code: 'building-is-work-target', workId: state.work.id }
    }
    return workInProgress(state.work)
  }

  // 2. L'intention est-elle formable ? Une cible absente ne décrit aucune
  //    démolition possible.
  const building = state.buildings.find((one) => one.id === command.buildingId)
  if (building === undefined) {
    return { code: 'building-not-found', buildingId: command.buildingId }
  }

  return null
}

/**
 * La cible, une fois les contrôles passés.
 *
 * La levée n'est pas une garde de plus, c'est l'énoncé d'une **précondition** :
 * arriver ici sans cible veut dire que `reject` a été oublié.
 */
function targetOf(state: ProjectedState, buildingId: BuildingId): BuildingView {
  const building = state.buildings.find((one) => one.id === buildingId)
  if (building === undefined) {
    throw new RangeError(`Bâtiment introuvable après contrôle : ${buildingId}.`)
  }
  return building
}

/**
 * Les gisements que les cases du bâtiment portent, **et qui survivront** (FR-047).
 *
 * Publié parce que le joueur ne peut pas le deviner : recouvrir n'efface pas un
 * gisement (FR-020), et rien ne dit *a priori* que démolir ne l'effacera pas. Sans
 * cette annonce, un joueur qui a posé sa mine sur la veine hésiterait à corriger son
 * erreur de peur de détruire la veine — c'est-à-dire renoncerait à la mécanique
 * même qui rend l'erreur réparable.
 */
export interface PreservedDeposit {
  readonly x: number
  readonly y: number
  readonly depositOf: ResourceId
}

export function preservedDeposits(
  state: ProjectedState,
  building: BuildingView,
): readonly PreservedDeposit[] {
  const owned = new Set(building.cells.map((cell) => `${cell.x},${cell.y}`))

  return state.grid
    .filter((view) => view.depositOf !== null && owned.has(`${view.x},${view.y}`))
    .map((view) => ({ x: view.x, y: view.y, depositOf: view.depositOf as ResourceId }))
}

/** Les cases que la démolition libérera. */
export function freedCells(building: BuildingView): readonly Cell[] {
  return building.cells.map((cell) => ({ x: cell.x, y: cell.y }))
}

/**
 * L'arbitrage.
 *
 * Il n'y a que deux contrôles, et aucun n'est une question d'argent : la démolition
 * ne coûte rien. Le remboursement, lui, n'est pas calculé ici — il est redérivé à
 * l'échéance par `effectsOnCompletion`, depuis l'instantané *tel qu'il est à ce
 * moment-là*. Le figer au lancement le rendrait faux dès qu'un plafond aurait
 * changé entre-temps, et l'écrêtement porte précisément sur ce plafond.
 */
export function decideDemolish(
  state: ProjectedState,
  command: DemolishCommand,
  catalogs: Catalogs,
): DemolishDecision {
  const refusal = reject(state, command)
  if (refusal !== null) return { outcome: 'refused', refusal }

  const building = targetOf(state, command.buildingId)
  const dueAt = addDuration(state.at, demolishDuration(building.typeId, catalogs))

  return {
    outcome: 'accepted',
    effects: [
      {
        kind: 'schedule-work',
        workId: command.workId,
        nature: 'demolish',
        // La cible ne porte **aucune géométrie** : les cases se redérivent de la
        // variante, de l'orientation et de l'ancre du bâtiment, et la contrainte
        // `works_target_matches_nature` refuse en base une autre forme.
        target: { kind: 'building', buildingId: building.id },
        startedAt: state.at,
        dueAt,
      },
    ],
  }
}

export { reject as demolishRefusalOf, targetOf as demolishTargetOf }
