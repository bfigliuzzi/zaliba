import type { ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from './catalogs.js'
import { layoutOf } from './catalogs.js'
import type { Effect } from './effects.js'
import { type CellView, cellsOf, coveredDeposits, gridView } from './grid.js'
import { type EnergyRatio, NO_DEFICIT, productionRates, storageCaps } from './rates.js'
import { advanceSegment, type Grains, grains, type RatePerHour, saturationAt } from './resources.js'
import {
  applyEffects,
  type PlacedBuilding,
  type PlanetSnapshot,
  type ScheduledWork,
} from './snapshot.js'
import { type Duration, duration, type Instant, instant } from './time.js'

/**
 * `project(snapshot, catalogs, at)` — fonction **pure**.
 *
 * L'instant est un argument, jamais un appel d'horloge. C'est ce qui rend un jeu
 * dont le sujet *est* le temps réellement testable : un test devient « avec cet
 * instantané, ce catalogue et trois semaines écoulées, j'attends exactement ces
 * ressources ». Pas d'attente, pas d'horloge simulée, pas de test instable — et
 * six mois de jeu vérifiables en une milliseconde.
 *
 * **La segmentation** (R3). Si un chantier est échu avant `at`, le calcul se
 * fait en deux temps : `[consolidatedAt, dueAt)` aux anciens taux, puis
 * `[dueAt, at)` aux nouveaux, les effets d'achèvement étant appliqués **à
 * l'instant de l'échéance** et non à celui où on les constate (FR-032). Comme un
 * seul chantier peut être actif (FR-033), il n'y a jamais plus de deux segments.
 *
 * Cette même unicité est ce qui rend un aperçu exactement prédictible : entre le
 * lancement d'un chantier et son échéance, **aucune autre transition ne peut
 * survenir**, donc l'état à l'échéance est calculable dès le lancement.
 *
 * La projection **n'écrit rien**. Un `GET` est une lecture, y compris quand un
 * chantier est échu depuis trois semaines (FR-031) : la ligne de chantier n'est
 * marquée résolue qu'à la prochaine mutation, qui consolide.
 */

/**
 * Ce qu'un chantier échu produit comme effets, **injecté** dans la projection.
 *
 * Le noyau ne peut pas appeler `effectsOnCompletion` lui-même : « `kernel`
 * n'importe jamais un module. Aucune exception » (doc de stack § 5.2). Le jour
 * où le noyau connaîtrait le nom d'une mécanique, l'extensibilité serait morte —
 * et cela ne se remarquerait que trois modules plus tard.
 *
 * L'argument est **obligatoire** et non facultatif. Une valeur par défaut
 * « aucun effet » serait le pire des deux mondes : la segmentation continuerait
 * de fonctionner en apparence, et les chantiers s'achèveraient sans rien
 * produire. Le câblage vit dans la racine de composition — `src/game.ts` — qui
 * n'est ni noyau ni module, et c'est son unique raison d'être.
 */
export type CompletionResolver = (
  work: ScheduledWork,
  snapshotAtDue: PlanetSnapshot,
  catalogs: Catalogs,
) => readonly Effect[]

export interface HoldingView {
  readonly amount: Grains
  /** Cumulée depuis toujours (FR-026). */
  readonly lost: Grains
  readonly cap: Grains
  /** Effectif, énergie appliquée. */
  readonly rate: RatePerHour
  /** Avant énergie (FR-024). */
  readonly nominalRate: RatePerHour
  /** `null` si le taux est nul ou la ressource déjà saturée (FR-027). */
  readonly saturationAt: Instant | null
}

export interface EnergyReport {
  readonly produced: number
  readonly consumed: number
  readonly ratio: EnergyRatio
}

export interface BuildingView extends PlacedBuilding {
  readonly cells: readonly { readonly x: number; readonly y: number }[]
  readonly coveredDeposits: number
  readonly nominalRate: RatePerHour
  readonly effectiveRate: RatePerHour
}

export interface WorkView extends ScheduledWork {
  readonly remaining: Duration
}

export interface ProjectedState {
  readonly at: Instant
  readonly holdings: Readonly<Record<ResourceId, HoldingView>>
  readonly energy: EnergyReport
  readonly grid: readonly CellView[]
  readonly buildings: readonly BuildingView[]
  readonly work: WorkView | null
  readonly catalogVersion: string
}

/**
 * L'instantané tel qu'une mutation l'écrirait à `at`.
 *
 * C'est la moitié écrivante de la projection : mêmes segments, mêmes règles,
 * mais elle rend l'**instantané** au lieu de la vue. Les deux partagent le même
 * calcul, ce qui est la seule façon de garantir que ce qu'on affiche et ce qu'on
 * écrit ne divergent jamais — une seconde implémentation « pour l'écriture »
 * finirait par arrondir autrement.
 */
export function consolidate(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  at: Instant,
  resolveCompletion: CompletionResolver,
): PlanetSnapshot {
  if (at < snapshot.consolidatedAt) {
    throw new RangeError(
      `Consolidation antérieure à la précédente : ${at} < ${snapshot.consolidatedAt}.`,
    )
  }
  return advance(snapshot, catalogs, at, resolveCompletion).snapshot
}

export function project(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  at: Instant,
  resolveCompletion: CompletionResolver,
): ProjectedState {
  if (at < snapshot.consolidatedAt) {
    throw new RangeError(
      `Projection antérieure à la consolidation : ${at} < ${snapshot.consolidatedAt}. ` +
        'La projection ne remonte pas le temps ; c’est une erreur de programmation.',
    )
  }

  const { state, snapshot: settled } = advance(snapshot, catalogs, at, resolveCompletion)
  return render(settled, catalogs, at, state)
}

interface Accumulated {
  readonly amounts: Readonly<Record<ResourceId, { amount: number; lost: number }>>
}

/**
 * Fait avancer l'instantané jusqu'à `at`, en un ou deux segments.
 *
 * Retourne l'instantané **consolidé en mémoire** — celui qu'une mutation
 * écrirait — et les quantités accumulées. Les deux sont nécessaires : les
 * quantités portent la perte cumulée, que l'instantané doit reprendre.
 */
function advance(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  at: Instant,
  resolveCompletion: CompletionResolver,
): { readonly snapshot: PlanetSnapshot; readonly state: Accumulated } {
  const due = snapshot.work
  const resolvesInWindow = due !== null && due.dueAt <= at && due.dueAt >= snapshot.consolidatedAt

  if (!resolvesInWindow) {
    const state = accumulate(
      snapshot,
      catalogs,
      snapshot.consolidatedAt,
      at,
      initial(snapshot, catalogs),
    )
    return { snapshot: withAmounts(snapshot, state, at), state }
  }

  // Segment 1 — jusqu'à l'échéance, aux **anciens** taux.
  const first = accumulate(
    snapshot,
    catalogs,
    snapshot.consolidatedAt,
    due.dueAt,
    initial(snapshot, catalogs),
  )

  // Les effets d'achèvement sont redérivés depuis l'instantané **tel qu'il est à
  // l'échéance** — pas tel qu'il était au lancement, ni tel qu'il sera.
  const atDue = withAmounts(snapshot, first, due.dueAt)
  const completed = applyEffects(atDue, resolveCompletion(due, atDue, catalogs), due.dueAt)
  const resolved: PlanetSnapshot = { ...completed, work: null }

  // Segment 2 — de l'échéance à `at`, aux **nouveaux** taux.
  const second = accumulate(resolved, catalogs, due.dueAt, at, first)

  return { snapshot: withAmounts(resolved, second, at), state: second }
}

function initial(snapshot: PlanetSnapshot, catalogs: Catalogs): Accumulated {
  return {
    amounts: Object.fromEntries(
      catalogs.resourceIds.map((resourceId) => {
        const holding = snapshot.holdings[resourceId]
        return [resourceId, { amount: holding?.amount ?? 0, lost: holding?.lost ?? 0 }]
      }),
    ) as unknown as Accumulated['amounts'],
  }
}

/** Fait courir un segment `[from, to)` aux taux de l'instantané donné (R4). */
function accumulate(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  from: Instant,
  to: Instant,
  carried: Accumulated,
): Accumulated {
  const seconds = to - from
  const rates = productionRates(snapshot, catalogs, energyOf(snapshot, catalogs).ratio)
  const caps = storageCaps(snapshot, catalogs)

  return {
    amounts: Object.fromEntries(
      catalogs.resourceIds.map((resourceId) => {
        const held = carried.amounts[resourceId] ?? { amount: 0, lost: 0 }
        const advanced = advanceSegment({
          amount: grains(held.amount),
          lost: grains(held.lost),
          rate: rates[resourceId]?.effective ?? (0 as RatePerHour),
          seconds,
          cap: grains(caps[resourceId] ?? 0),
        })
        return [resourceId, advanced]
      }),
    ) as unknown as Accumulated['amounts'],
  }
}

function withAmounts(snapshot: PlanetSnapshot, state: Accumulated, at: Instant): PlanetSnapshot {
  return {
    ...snapshot,
    consolidatedAt: at,
    holdings: Object.fromEntries(
      Object.entries(state.amounts).map(([resourceId, held]) => [
        resourceId,
        { amount: grains(held.amount), lost: grains(held.lost) },
      ]),
    ) as unknown as PlanetSnapshot['holdings'],
  }
}

/**
 * Le rapport d'énergie de la planète (R5).
 *
 * `produced` somme l'énergie de base du Berceau et les centrales ; `consumed`
 * somme tous les bâtiments **sauf** la centrale, entrepôt compris (R21). Les
 * courbes d'énergie du catalogue arrivent avec US3 : d'ici là, seul le Berceau
 * produit, et rien ne consomme.
 */
function energyOf(snapshot: PlanetSnapshot, catalogs: Catalogs): EnergyReport {
  const layout = layoutOf(catalogs, snapshot.layoutId)
  const produced = layout.baseEnergy
  const consumed = 0

  return {
    produced,
    consumed,
    ratio: consumed <= produced ? NO_DEFICIT : { numerator: produced, denominator: consumed },
  }
}

function render(
  snapshot: PlanetSnapshot,
  catalogs: Catalogs,
  at: Instant,
  state: Accumulated,
): ProjectedState {
  const energy = energyOf(snapshot, catalogs)
  const rates = productionRates(snapshot, catalogs, energy.ratio)
  const caps = storageCaps(snapshot, catalogs)
  const grid = gridView(snapshot, catalogs)

  const holdings = Object.fromEntries(
    catalogs.resourceIds.map((resourceId) => {
      const held = state.amounts[resourceId] ?? { amount: 0, lost: 0 }
      const cap = grains(caps[resourceId] ?? 0)
      const rate = rates[resourceId]?.effective ?? (0 as RatePerHour)
      const amount = grains(held.amount)

      return [
        resourceId,
        {
          amount,
          lost: grains(held.lost),
          cap,
          rate,
          nominalRate: rates[resourceId]?.nominal ?? (0 as RatePerHour),
          saturationAt: saturationAt(at, amount, cap, rate),
        },
      ]
    }),
  ) as unknown as Record<ResourceId, HoldingView>

  const buildings: readonly BuildingView[] = snapshot.buildings.map((building) => ({
    ...building,
    cells: cellsOf(building, catalogs),
    coveredDeposits: coveredDeposits(building, grid, catalogs),
    // Les taux par bâtiment arrivent avec US2, en même temps que les courbes
    // de production des extracteurs.
    nominalRate: 0 as RatePerHour,
    effectiveRate: 0 as RatePerHour,
  }))

  const work: WorkView | null =
    snapshot.work === null
      ? null
      : { ...snapshot.work, remaining: duration(Math.max(1, snapshot.work.dueAt - at)) }

  return {
    at: instant(at),
    holdings,
    energy,
    grid,
    buildings,
    work,
    catalogVersion: catalogs.version,
  }
}
