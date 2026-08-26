import type { BuildingTypeId } from '@zaliba/catalogs'
import type { Catalogs } from '../../kernel/catalogs.js'
import type { BuildingId, Effect, ResourceAmount, WorkId } from '../../kernel/effects.js'
import type { BuildingView, ProjectedState } from '../../kernel/projection.js'
import { addDuration, type Duration, type Instant } from '../../kernel/time.js'
import { buildCost, buildDuration, secondsUntilAffordable, shortfallOf } from './build.js'
import {
  type InsufficientResourcesRefusal,
  insufficientResources,
  type WorkInProgressRefusal,
  workInProgress,
} from './refusals.js'

/**
 * L'amélioration : porter un bâtiment au niveau suivant.
 *
 * **Ce module ne mute rien** (doc de stack § 5.3). Il reçoit un état projeté et
 * retourne des effets que le noyau applique — `debit-resources` et
 * `schedule-work` au lancement, `set-building-level` à l'échéance, redérivé par
 * `effectsOnCompletion`.
 *
 * **Ce que le module ne fait pas, et c'est tout son sujet.** Il ne touche pas à la
 * grille. Aucun effet qu'il émet ne sait déplacer, poser ni retirer une case, et
 * la commande qu'il reçoit n'a **aucun champ** de variante, d'orientation ni
 * d'ancre. C'est ainsi que FR-039 est tenu : non par une vérification, mais par
 * l'absence de tout moyen de la violer. Une garde vivrait dans un chemin
 * d'écriture, et un second chemin la contournerait un jour ; un champ qui n'existe
 * pas ne s'envoie pas. L'invariant I-7 en est la contrepartie éprouvée.
 *
 * **La courbe est celle de la pose, évaluée au niveau visé** (FR-040). Pas une
 * seconde courbe « d'amélioration », et l'identité n'est pas une économie : le
 * remboursement d'une démolition vaut `fraction × Σ(k=1..N) coût(k)` et il est
 * **dérivé** de la courbe, jamais stocké (R9). Cette somme n'est le total
 * réellement dépensé que si monter au niveau `k` a coûté exactement `coût(k)`. Le
 * jour où l'amélioration prendrait sa propre courbe, la démolition rembourserait
 * un montant que personne n'a payé — et elle le ferait en silence.
 */

/**
 * L'intention d'amélioration, telle que le serveur la reçoit **enrichie**.
 *
 * `workId` n'est pas un champ du contrat : il est engendré par la couche serveur,
 * parce qu'un domaine pur ne tire pas d'identifiant au sort. Le joueur, lui,
 * n'envoie qu'une cible — et il n'a aucun champ pour envoyer autre chose (FR-055).
 */
export interface UpgradeCommand {
  readonly kind: 'upgrade'
  readonly workId: WorkId
  readonly buildingId: BuildingId
}

/**
 * Les motifs de refus, en **union fermée** discriminée par `code`.
 *
 * Deux sont partagés avec toute mécanique de construction et vivent dans
 * `refusals.ts` ; deux sont propres à l'amélioration.
 */
export type UpgradeRefusal =
  | WorkInProgressRefusal
  | InsufficientResourcesRefusal
  /**
   * La cible n'est pas sur cette planète.
   *
   * C'est un refus de **règle de jeu** — 409 — et non une requête malformée : le
   * contrat accepte n'importe quel UUID, et rien dans un schéma ne peut dire
   * qu'une planète porte ce bâtiment. Le ranger en 400 dirait au joueur « votre
   * requête est malformée » quand la vérité est « ce bâtiment n'existe plus ».
   */
  | { readonly code: 'building-not-found'; readonly buildingId: BuildingId }
  /**
   * Le plafond du catalogue est atteint (FR-040).
   *
   * Le plafond est **dans le motif**. Un refus qui dirait seulement « niveau
   * maximal » laisserait chercher lequel, alors que c'est une donnée publiée.
   */
  | {
      readonly code: 'max-level-reached'
      readonly buildingId: BuildingId
      readonly maxLevel: number
    }

/** Le domaine dit oui avec des effets, ou non avec un motif. Rien d'autre. */
export type UpgradeDecision =
  | { readonly outcome: 'accepted'; readonly effects: readonly Effect[] }
  | { readonly outcome: 'refused'; readonly refusal: UpgradeRefusal }

/**
 * Le coût d'une amélioration : la courbe de coût au **niveau visé** (FR-040, R9).
 *
 * Le nom existe parce que l'appel nu — `buildCost(typeId, level + 1)` — se lirait
 * comme une astuce, alors que c'est la règle publiée. Il n'y a qu'une courbe de
 * coût par type, et le niveau `N` coûte le même prix qu'on l'atteigne par une pose
 * ou par une amélioration.
 */
export function upgradeCost(
  typeId: BuildingTypeId,
  levelAfter: number,
  catalogs: Catalogs,
): readonly ResourceAmount[] {
  return buildCost(typeId, levelAfter, catalogs)
}

/** La durée d'une amélioration : la courbe de durée au niveau visé. */
export function upgradeDuration(
  typeId: BuildingTypeId,
  levelAfter: number,
  catalogs: Catalogs,
): Duration {
  return buildDuration(typeId, levelAfter, catalogs)
}

/** Le niveau au-delà duquel `max-level-reached` est opposé (FR-040). */
export function maxLevelOf(typeId: BuildingTypeId, catalogs: Catalogs): number {
  const type = catalogs.buildings[typeId]
  if (type === undefined) {
    // Le contrat n'accepte que les identifiants de l'union littérale : arriver
    // ici est une faute de programmation, pas une action de joueur.
    throw new RangeError(`Type de bâtiment inconnu : ${typeId}.`)
  }
  return type.maxLevel
}

/**
 * Ce que le module doit trancher **avant** de calculer quoi que ce soit.
 *
 * Rendu séparément pour que l'arbitrage et l'aperçu partagent exactement les
 * mêmes contrôles, dans le même ordre (R8) : ce sont les deux moitiés d'un même
 * calcul, et une divergence entre elles se manifesterait comme un aperçu qui
 * promet ce que le serveur refuse.
 */
function reject(
  state: ProjectedState,
  command: UpgradeCommand,
  catalogs: Catalogs,
): UpgradeRefusal | null {
  // 1. La planète est-elle disponible ? Au plus un chantier (FR-033), et la
  //    projection a déjà résolu ceux qui sont échus : ce qui reste ici est un
  //    chantier réellement en cours.
  //
  //    **Ce contrôle passe avant celui de la cible**, et le parcours d'intégration
  //    a montré pourquoi : un joueur qui lance une pose puis tente d'améliorer le
  //    bâtiment qu'elle produira entendrait « ce bâtiment n'est pas sur la
  //    planète ». C'est vrai — il n'existe pas encore — et c'est inutile, parce que
  //    la cause est le chantier, et que le chantier *explique* l'absence. Un refus
  //    doit nommer la cause qui permet d'agir, pas la conséquence la plus proche.
  if (state.work !== null) return workInProgress(state.work)

  // 2. L'intention est-elle formable ? Une cible absente ne décrit aucune
  //    amélioration possible — le cas arrive pour de bon quand une seconde vue du
  //    jeu a démoli le bâtiment entre l'aperçu et l'envoi.
  const building = state.buildings.find((one) => one.id === command.buildingId)
  if (building === undefined) {
    return { code: 'building-not-found', buildingId: command.buildingId }
  }

  // 3. La cible peut-elle encore monter ?
  const maxLevel = maxLevelOf(building.typeId, catalogs)
  if (building.level >= maxLevel) {
    return { code: 'max-level-reached', buildingId: building.id, maxLevel }
  }

  return null
}

/**
 * La cible, une fois les contrôles passés.
 *
 * Le `find` est refait plutôt que remonté de `reject` : rendre la cible depuis une
 * fonction qui rend aussi un refus obligerait à un type somme dont les deux
 * moitiés ne servent jamais ensemble.
 *
 * La levée n'est pas une garde de plus, c'est l'énoncé d'une **précondition** :
 * arriver ici sans cible veut dire que `reject` a été oublié, et c'est une faute
 * de programmation, pas une action de joueur. `reject` et cette fonction forment
 * une paire — contrôler, puis résoudre —, et l'aperçu emploie la même (R8).
 */
function targetOf(state: ProjectedState, buildingId: BuildingId): BuildingView {
  const building = state.buildings.find((one) => one.id === buildingId)
  if (building === undefined) {
    throw new RangeError(`Bâtiment introuvable après contrôle : ${buildingId}.`)
  }
  return building
}

/**
 * L'arbitrage.
 *
 * L'ordre des contrôles va de la cause la plus générale à la plus
 * circonstancielle, et ce n'est pas une commodité de lecture : c'est ce que le
 * joueur doit entendre en premier. Opposer « ressources insuffisantes » à
 * quelqu'un dont le bâtiment est au plafond l'enverrait attendre une production
 * qui ne débloquera rien — et opposer « bâtiment introuvable » à quelqu'un dont la
 * pose est en cours l'enverrait chercher un bâtiment que le chantier est en train
 * de construire.
 */
export function decideUpgrade(
  state: ProjectedState,
  command: UpgradeCommand,
  catalogs: Catalogs,
): UpgradeDecision {
  const refusal = reject(state, command, catalogs)
  if (refusal !== null) return { outcome: 'refused', refusal }

  const building = targetOf(state, command.buildingId)
  const levelAfter = building.level + 1

  // 4. Le joueur peut-il payer ?
  const cost = upgradeCost(building.typeId, levelAfter, catalogs)
  const shortfall = shortfallOf(state, cost)
  if (shortfall.length > 0) {
    return {
      outcome: 'refused',
      refusal: insufficientResources(shortfall, secondsUntilAffordable(state, shortfall, cost)),
    }
  }

  const dueAt: Instant = addDuration(
    state.at,
    upgradeDuration(building.typeId, levelAfter, catalogs),
  )

  return {
    outcome: 'accepted',
    effects: [
      // Le coût est débité **au lancement** (FR-036) ; la montée de niveau n'aura
      // lieu qu'à l'échéance, et elle sera redérivée par `effectsOnCompletion`.
      { kind: 'debit-resources', amounts: cost },
      {
        kind: 'schedule-work',
        workId: command.workId,
        nature: 'upgrade',
        // La cible ne porte **aucune géométrie**, et c'est FR-039 dans la forme
        // même de la donnée : la contrainte `works_target_matches_nature` refuse
        // en base une ligne d'amélioration qui en porterait une.
        target: { kind: 'building', buildingId: building.id },
        startedAt: state.at,
        dueAt,
      },
    ],
  }
}

export { reject as upgradeRefusalOf, targetOf as upgradeTargetOf }
