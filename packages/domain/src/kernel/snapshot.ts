import type {
  ArchetypeId,
  BuildingTypeId,
  FootprintId,
  LayoutId,
  ResourceId,
} from '@zaliba/catalogs'
import type { Catalogs } from './catalogs.js'
import { layoutOf } from './catalogs.js'
import type { BuildingId, Cell, Effect, WorkId, WorkNature, WorkTarget } from './effects.js'
import { type Grains, grains } from './resources.js'
import { type Instant, instant } from './time.js'

/**
 * L'instantané daté : le **seul** état qui existe en base (data-model § 1.2).
 *
 * Il ne contient **aucune valeur dérivable**. Ni les cases occupées d'un
 * bâtiment — elles se déduisent de sa variante, de son orientation et de son
 * ancre —, ni le coût cumulé d'un niveau, ni les gisements, ni les plafonds, ni
 * les taux, ni même la quantité *courante* d'une ressource.
 *
 * Cette discipline a un prix — tout se recalcule — et une contrepartie qui le
 * vaut : une valeur dérivable et stockée devient **fausse** au premier
 * rééquilibrage, et fausse en silence. Ici, changer une courbe change le monde
 * de tous les joueurs sans migration.
 */

export interface PlacedBuilding {
  readonly id: BuildingId
  readonly typeId: BuildingTypeId
  /** Figée à la pose (FR-010) : une amélioration ne change pas la forme. */
  readonly variantId: FootprintId
  /** Figée à la pose, de 0 à 3 quarts de tour. */
  readonly orientation: number
  /** Coin haut-gauche de l'empreinte normalisée. */
  readonly anchor: Cell
  readonly level: number
}

export type { WorkTarget }

export interface ScheduledWork {
  readonly id: WorkId
  readonly nature: WorkNature
  readonly target: WorkTarget
  readonly startedAt: Instant
  readonly dueAt: Instant
}

export interface Holding {
  readonly amount: Grains
  /** Cumulée, jamais remise à zéro : c'est ce qui rend la projection additive. */
  readonly lost: Grains
  /**
   * L'instant d'entrée en saturation, ou `null` si la ressource ne l'est pas
   * (US1/AC5).
   *
   * **Porté, parce qu'il n'est pas dérivable.** Au plafond, la quantité ne dit
   * plus depuis quand ; et `perdu ÷ taux` serait faux dès que le taux a changé
   * depuis. Une consolidation efface tout ce qui précède : sans cette
   * grandeur, l'ancienneté de la saturation se réinitialiserait à chaque
   * action du joueur.
   *
   * Il n'a de sens **que** tant que `amount ≥ plafond`. En dessous, il est
   * ignoré et la projection le remet à `null` — le plafond n'appartient pas à
   * l'instantané, donc l'instantané ne peut pas en juger seul.
   */
  readonly saturatedSince: Instant | null
}

export interface PlanetSnapshot {
  readonly planetId: string
  readonly ownerId: string
  /** Notion **distincte** du propriétaire (FR-006). L'autorisation porte sur lui. */
  readonly occupantId: string
  readonly archetypeId: ArchetypeId
  readonly layoutId: LayoutId
  /** L'instant du dernier écrit. La projection part de là. */
  readonly consolidatedAt: Instant
  readonly holdings: Readonly<Record<ResourceId, Holding>>
  readonly buildings: readonly PlacedBuilding[]
  /** Les cases déblayées, **par écart** au catalogue. */
  readonly clearedCells: readonly Cell[]
  /** Au plus un (FR-033, I-9) — et c'est ce qui borne la segmentation à deux. */
  readonly work: ScheduledWork | null
}

export interface EmptySnapshotInput {
  readonly planetId: string
  readonly ownerId: string
  readonly occupantId: string
  readonly archetypeId: ArchetypeId
  readonly layoutId: LayoutId
  readonly consolidatedAt: Instant
  readonly catalogs: Catalogs
}

/**
 * L'instantané d'une planète qui vient d'être fondée.
 *
 * Le stock de départ vient du **catalogue**, jamais d'une constante recopiée
 * ici : c'est ce qui fait de FR-019 une donnée vérifiable par un test de
 * cohérence plutôt qu'une valeur à retrouver dans deux endroits.
 */
export function emptySnapshot(input: EmptySnapshotInput): PlanetSnapshot {
  const layout = layoutOf(input.catalogs, input.layoutId)

  const holdings = Object.fromEntries(
    input.catalogs.resourceIds.map((resourceId) => [
      resourceId,
      {
        amount: grains(layout.startingStockGrains[resourceId] ?? 0),
        lost: grains(0),
        // `null` et non « l'instant de fondation » : la fondation ne sait pas
        // si le stock de départ atteint le plafond, faute de connaître les
        // plafonds. Le premier segment de projection le tranche, et le date de
        // la fondation s'il le faut.
        saturatedSince: null,
      },
    ]),
  ) as Record<ResourceId, Holding>

  return {
    planetId: input.planetId,
    ownerId: input.ownerId,
    occupantId: input.occupantId,
    archetypeId: input.archetypeId,
    layoutId: input.layoutId,
    consolidatedAt: input.consolidatedAt,
    holdings,
    buildings: [],
    clearedCells: [],
    work: null,
  }
}

/** Deux cases sont la même case. */
export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y
}

/**
 * Applique une suite d'effets à un instantané (data-model § 1.5).
 *
 * **Un module de domaine ne mute rien** : il retourne des effets, et c'est le
 * noyau qui les applique. La séparation n'est pas décorative — elle rend chaque
 * décision de jeu inspectable avant d'être subie, ce qui est exactement ce dont
 * un aperçu a besoin (R8), et ce qui permet à la couche serveur de tout écrire
 * dans une seule transaction.
 *
 * L'ordre est significatif : les effets s'appliquent dans l'ordre où le module
 * les a produits.
 */
export function applyEffects(
  snapshot: PlanetSnapshot,
  effects: readonly Effect[],
  at: Instant,
): PlanetSnapshot {
  let next: PlanetSnapshot = { ...snapshot, consolidatedAt: at }

  for (const effect of effects) {
    next = applyOne(next, effect)
  }
  return next
}

/**
 * Applique un delta à une quantité.
 *
 * Un débit qui passerait sous zéro **lève**, il n'écrête pas. L'écrêtement
 * paraît prudent et ne l'est pas : il transformerait une dépense impossible en
 * dépense partielle, c'est-à-dire en construction à moitié gratuite, et il le
 * ferait sans un mot. Un débit excessif ne peut pas venir d'un joueur — le
 * module a déjà refusé la commande — donc c'est une faute de programmation, et
 * elle doit se voir comme telle : une erreur bruyante, corrélée par
 * `requestId`, plutôt qu'un solde faux qu'on découvre à la comptabilité.
 */
function creditHolding(holding: Holding, delta: number, resourceId: ResourceId): Holding {
  const next = holding.amount + delta
  if (next < 0) {
    throw new RangeError(
      `Débit impossible sur ${resourceId} : ${holding.amount} détenus, ${-delta} demandés. ` +
        'Le module aurait dû refuser la commande avant d’émettre cet effet.',
    )
  }
  // Tout mouvement **périme** la date d'entrée en saturation : un débit fait
  // nécessairement redescendre sous le plafond — la quantité n'y était au mieux
  // qu'égale —, et un crédit ne saurait dater une saturation qu'il ignore, la
  // capacité n'étant pas une donnée de l'instantané. Le prochain segment de
  // projection la rétablit, et il est le seul à pouvoir le faire.
  return { amount: grains(next), lost: holding.lost, saturatedSince: null }
}

function applyOne(snapshot: PlanetSnapshot, effect: Effect): PlanetSnapshot {
  switch (effect.kind) {
    case 'debit-resources':
    case 'credit-resources': {
      const sign = effect.kind === 'debit-resources' ? -1 : 1
      const holdings = { ...snapshot.holdings }
      for (const { resourceId, grains: delta } of effect.amounts) {
        const current = holdings[resourceId]
        if (current === undefined) continue
        holdings[resourceId] = creditHolding(current, sign * delta, resourceId)
      }
      return { ...snapshot, holdings }
    }

    case 'place-building':
      return {
        ...snapshot,
        buildings: [
          ...snapshot.buildings,
          {
            id: effect.buildingId,
            typeId: effect.typeId as BuildingTypeId,
            variantId: effect.variantId,
            orientation: effect.orientation,
            anchor: effect.anchor,
            level: 1,
          },
        ],
      }

    case 'set-building-level':
      return {
        ...snapshot,
        buildings: snapshot.buildings.map((building) =>
          building.id === effect.buildingId ? { ...building, level: effect.level } : building,
        ),
      }

    case 'remove-building':
      return {
        ...snapshot,
        buildings: snapshot.buildings.filter((building) => building.id !== effect.buildingId),
      }

    case 'clear-cell':
      // I-8 : une case déblayée ne redevient jamais obstruée. L'idempotence de
      // cet effet en est le premier gardien.
      return snapshot.clearedCells.some((cell) => sameCell(cell, effect.cell))
        ? snapshot
        : { ...snapshot, clearedCells: [...snapshot.clearedCells, effect.cell] }

    case 'schedule-work':
      return {
        ...snapshot,
        work: {
          id: effect.workId,
          nature: effect.nature,
          target: effect.target,
          startedAt: instant(effect.startedAt),
          dueAt: instant(effect.dueAt),
        },
      }
  }
}
