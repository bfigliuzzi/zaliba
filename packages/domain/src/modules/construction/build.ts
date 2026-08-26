import type { BuildingTypeId, FootprintId, ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from '../../kernel/catalogs.js'
import { evaluateCurve } from '../../kernel/curves.js'
import type { Cell, Effect, ResourceAmount, WorkId, WorkNature } from '../../kernel/effects.js'
import { placementCells, validatePlacement } from '../../kernel/grid.js'
import type { ProjectedState } from '../../kernel/projection.js'
import { addDuration, type Duration, duration, type Instant } from '../../kernel/time.js'

/**
 * La construction : lancer un chantier de pose.
 *
 * **Ce module ne mute rien** (doc de stack § 5.3). Il reçoit un état projeté et
 * retourne des effets que le noyau applique. La séparation n'est pas
 * décorative : c'est elle qui permet à l'aperçu (`preview.ts`) et à l'arbitrage
 * (`decide`) d'être *le même code*, donc de ne jamais divergerd'une version à
 * l'autre (R8).
 *
 * **Ce que le module ne fait pas, et pourquoi.** Il ne pose aucun bâtiment : le
 * lancement débite le coût et planifie une échéance, et c'est
 * `effectsOnCompletion` qui redérive la pose à `dueAt` (FR-032, R3). Les effets
 * d'un chantier ne sont donc jamais sérialisés — une charge d'effets stockée
 * deviendrait une surface de confiance qu'il faudrait valider à la relecture.
 *
 * Il n'appelle pas non plus l'horloge : l'instant du lancement est `state.at`,
 * qui vient de la transaction côté serveur et de l'horloge serveur côté client.
 * Aucune date fournie par le joueur n'entre ici — le contrat n'a pas de champ
 * pour en porter une (FR-057).
 */

/**
 * L'intention de pose, telle que le serveur la reçoit **enrichie**.
 *
 * `workId` n'est pas un champ du contrat : il est engendré par la couche
 * serveur, parce qu'un domaine pur ne tire pas d'identifiant au sort. Le joueur,
 * lui, n'envoie que type, variante, orientation et position — et il n'a aucun
 * champ pour envoyer autre chose (FR-055).
 */
export interface BuildCommand {
  readonly kind: 'build'
  readonly workId: WorkId
  readonly typeId: BuildingTypeId
  readonly variantId: FootprintId
  readonly orientation: number
  readonly anchor: Cell
}

/**
 * Les motifs de refus, en **union fermée** discriminée par `code`.
 *
 * Le discriminant est nommé `code` et non `kind` pour une raison précise : ces
 * motifs sont exactement ceux que le contrat expose en 409, et la couche serveur
 * n'a donc rien à traduire. Un dictionnaire de correspondance entre deux
 * vocabulaires serait un endroit de plus où oublier une entrée — et l'oubli
 * donnerait un 500 là où le jeu voulait dire non.
 */
export type BuildRefusal =
  | {
      readonly code: 'work-in-progress'
      readonly workId: WorkId
      readonly nature: WorkNature
      readonly dueAt: Instant
    }
  | {
      readonly code: 'variant-not-available-for-type'
      readonly typeId: BuildingTypeId
      readonly variantId: FootprintId
    }
  | { readonly code: 'placement-out-of-grid'; readonly cells: readonly Cell[] }
  | { readonly code: 'placement-on-obstructed-cell'; readonly cells: readonly Cell[] }
  | { readonly code: 'placement-on-occupied-cell'; readonly cells: readonly Cell[] }
  | {
      readonly code: 'insufficient-resources'
      readonly shortfall: readonly ResourceAmount[]
      /** `null` quand le rythme courant ne permettra jamais d'y arriver. */
      readonly secondsUntilAffordable: number | null
    }

/** Le domaine dit oui avec des effets, ou non avec un motif. Rien d'autre. */
export type BuildDecision =
  | { readonly outcome: 'accepted'; readonly effects: readonly Effect[] }
  | { readonly outcome: 'refused'; readonly refusal: BuildRefusal }

/** Le niveau auquel un bâtiment est posé. Toujours le premier (FR-039). */
export const INITIAL_LEVEL = 1

function typeOf(typeId: BuildingTypeId, catalogs: Catalogs) {
  const type = catalogs.buildings[typeId]
  if (type === undefined) {
    // Le contrat n'accepte que les identifiants de l'union littérale : arriver
    // ici est une faute de programmation, pas une action de joueur.
    throw new RangeError(`Type de bâtiment inconnu : ${typeId}.`)
  }
  return type
}

/** Le coût d'un niveau, lu des courbes du catalogue (R19). */
export function buildCost(
  typeId: BuildingTypeId,
  level: number,
  catalogs: Catalogs,
): readonly ResourceAmount[] {
  return Object.entries(typeOf(typeId, catalogs).cost).map(([resourceId, curve]) => ({
    resourceId: resourceId as ResourceId,
    grains: evaluateCurve(curve, level),
  }))
}

/** La durée d'un chantier de pose, lue de la courbe du catalogue. */
export function buildDuration(typeId: BuildingTypeId, level: number, catalogs: Catalogs): Duration {
  return duration(evaluateCurve(typeOf(typeId, catalogs).buildDuration, level))
}

/** Ce qui manque pour payer, par ressource. Vide si le compte y est. */
export function shortfallOf(
  state: ProjectedState,
  cost: readonly ResourceAmount[],
): readonly ResourceAmount[] {
  return cost
    .map(({ resourceId, grains }) => ({
      resourceId,
      grains: Math.max(0, grains - (state.holdings[resourceId]?.amount ?? 0)),
    }))
    .filter((amount) => amount.grains > 0)
}

/**
 * Le temps qu'il faudra pour combler le manque, au rythme courant.
 *
 * `null` quand ce rythme n'y suffira **jamais** : soit la ressource ne progresse
 * pas, soit son plafond est sous le montant demandé. Ce `null` est une
 * information utile et non un cas d'erreur — il dit au joueur qu'attendre ne
 * servira à rien, et qu'il lui faut d'abord un entrepôt.
 *
 * La borne retenue est le **maximum** sur les ressources manquantes, et non leur
 * somme : elles s'accumulent en parallèle.
 */
export function secondsUntilAffordable(
  state: ProjectedState,
  shortfall: readonly ResourceAmount[],
  cost: readonly ResourceAmount[],
): number | null {
  let longest = 0

  for (const { resourceId, grains } of shortfall) {
    const holding = state.holdings[resourceId]
    if (holding === undefined) return null

    const required = cost.find((amount) => amount.resourceId === resourceId)?.grains ?? 0
    // Le plafond passera sous le montant demandé : la ressource saturera avant.
    if (required > holding.cap) return null
    if (holding.rate <= 0) return null

    longest = Math.max(longest, Math.ceil(grains / holding.rate))
  }
  return longest
}

/**
 * L'arbitrage.
 *
 * L'ordre des contrôles va de la cause la plus générale à la plus
 * circonstancielle, et ce n'est pas une commodité de lecture : c'est ce que le
 * joueur doit entendre en premier. Opposer « case obstruée » à quelqu'un dont un
 * chantier est déjà en cours l'enverrait corriger un placement qui n'était pas le
 * problème.
 */
export function decideBuild(
  state: ProjectedState,
  command: BuildCommand,
  catalogs: Catalogs,
): BuildDecision {
  const type = typeOf(command.typeId, catalogs)

  // 1. L'intention est-elle formable ? Une variante étrangère au type ne décrit
  //    aucun bâtiment possible — le catalogue, et non la grille, la refuse.
  if (!type.variants.includes(command.variantId)) {
    return {
      outcome: 'refused',
      refusal: {
        code: 'variant-not-available-for-type',
        typeId: command.typeId,
        variantId: command.variantId,
      },
    }
  }

  // 2. La planète est-elle disponible ? Au plus un chantier (FR-033), et la
  //    projection a déjà résolu ceux qui sont échus : ce qui reste ici est un
  //    chantier réellement en cours.
  if (state.work !== null) {
    return {
      outcome: 'refused',
      refusal: {
        code: 'work-in-progress',
        workId: state.work.id,
        nature: state.work.nature,
        dueAt: state.work.dueAt,
      },
    }
  }

  // 3. Le placement tient-il ?
  const cells = placementCells(command.variantId, command.orientation, command.anchor, catalogs)
  const placement = validatePlacement(state.grid, cells)
  if (placement.kind !== 'ok') {
    return { outcome: 'refused', refusal: placementRefusal(placement) }
  }

  // 4. Le joueur peut-il payer ?
  const cost = buildCost(command.typeId, INITIAL_LEVEL, catalogs)
  const shortfall = shortfallOf(state, cost)
  if (shortfall.length > 0) {
    return {
      outcome: 'refused',
      refusal: {
        code: 'insufficient-resources',
        shortfall,
        secondsUntilAffordable: secondsUntilAffordable(state, shortfall, cost),
      },
    }
  }

  const dueAt = addDuration(state.at, buildDuration(command.typeId, INITIAL_LEVEL, catalogs))

  return {
    outcome: 'accepted',
    effects: [
      // Le coût est débité **au lancement** (FR-036) ; la pose n'aura lieu qu'à
      // l'échéance, et elle sera redérivée par `effectsOnCompletion`.
      { kind: 'debit-resources', amounts: cost },
      {
        kind: 'schedule-work',
        workId: command.workId,
        nature: 'build',
        target: {
          kind: 'build',
          typeId: command.typeId,
          variantId: command.variantId,
          orientation: command.orientation,
          anchor: command.anchor,
        },
        startedAt: state.at,
        dueAt,
      },
    ],
  }
}

/**
 * Le motif géométrique traduit en motif de refus.
 *
 * La grille parle de terrain — « hors grille », « obstruée », « occupée » — et
 * le contrat parle de placement. Les deux vocabulaires restent distincts parce
 * qu'ils ne changent pas au même rythme : un archétype futur peut ajouter un
 * état de case sans qu'un client ancien doive apprendre un code nouveau.
 */
function placementRefusal(
  placement: Exclude<ReturnType<typeof validatePlacement>, { kind: 'ok' }>,
): BuildRefusal {
  switch (placement.kind) {
    case 'out-of-grid':
      return { code: 'placement-out-of-grid', cells: placement.cells }
    case 'obstructed':
      return { code: 'placement-on-obstructed-cell', cells: placement.cells }
    case 'occupied':
      return { code: 'placement-on-occupied-cell', cells: placement.cells }
  }
}

export { placementRefusal }
