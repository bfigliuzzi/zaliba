import type { FootprintId, ResourceId } from '@zaliba/catalogs'

/**
 * Le vocabulaire fermé d'effets (R16).
 *
 * Un module ne mute rien : il **retourne des effets** que le noyau applique.
 * Le vocabulaire est détenu par le noyau, et en ajouter un est une modification
 * délibérée du noyau — pas un effet de bord d'une mécanique nouvelle. Énumérer
 * la frontière avant d'écrire la première mécanique est ce qui l'empêche de
 * devenir un dépotoir.
 *
 * **Ce qui est absent compte autant que ce qui est présent.** Il n'y a pas
 * d'effet `cancel-work`, et c'est ainsi que FR-037 est tenu : un chantier n'est
 * pas annulable parce qu'aucun effet ne sait l'annuler. Une garde qui refuserait
 * l'annulation vivrait dans un chemin d'écriture, et un second chemin la
 * contournerait un jour. Il n'y a pas non plus de `notify-player` : rien n'est
 * observable par un tiers en 001, donc rien n'a à être notifié.
 */

export type BuildingId = string
export type WorkId = string
export type WorkNature = 'build' | 'upgrade' | 'demolish' | 'clear'

export interface Cell {
  readonly x: number
  readonly y: number
}

export interface ResourceAmount {
  readonly resourceId: ResourceId
  readonly grains: number
}

/** Coût d'un chantier, **au lancement**. */
export interface DebitResources {
  readonly kind: 'debit-resources'
  readonly amounts: readonly ResourceAmount[]
}

/** Remboursement d'une démolition, **à l'échéance**. */
export interface CreditResources {
  readonly kind: 'credit-resources'
  readonly amounts: readonly ResourceAmount[]
}

/** Pose au niveau 1, **à l'échéance**. */
export interface PlaceBuilding {
  readonly kind: 'place-building'
  readonly buildingId: BuildingId
  readonly typeId: string
  readonly variantId: FootprintId
  readonly orientation: number
  readonly anchor: Cell
}

/** Amélioration, **à l'échéance**. */
export interface SetBuildingLevel {
  readonly kind: 'set-building-level'
  readonly buildingId: BuildingId
  readonly level: number
}

/** Démolition, **à l'échéance**. */
export interface RemoveBuilding {
  readonly kind: 'remove-building'
  readonly buildingId: BuildingId
}

/**
 * Déblaiement, **à l'échéance**.
 *
 * Il n'existe aucun effet inverse : une case déblayée ne redevient jamais
 * obstruée (I-8, FR-045), et c'est garanti par l'absence de chemin d'écriture,
 * pas par une vérification.
 */
export interface ClearCell {
  readonly kind: 'clear-cell'
  readonly cell: Cell
}

/**
 * Ce sur quoi porte un chantier, selon sa nature.
 *
 * La cible appartient au **vocabulaire du noyau** et non à la persistance : sans
 * elle, `schedule-work` dirait qu'un chantier commence sans dire de quoi, et le
 * noyau serait incapable de l'appliquer à un instantané. Un effet qui ne se
 * suffit pas à lui-même oblige son destinataire à retrouver l'information
 * ailleurs — c'est-à-dire à recréer une décision que le module avait déjà prise.
 *
 * La contrainte de cohérence entre `nature` et cible est portée en base par
 * `works_target_matches_nature` : une ligne dont la nature contredit sa cible
 * est un état que le domaine ne sait pas lire, donc un état qui ne doit pas
 * exister.
 */
export type WorkTarget =
  | {
      readonly kind: 'build'
      readonly typeId: string
      readonly variantId: FootprintId
      readonly orientation: number
      readonly anchor: Cell
    }
  | { readonly kind: 'building'; readonly buildingId: BuildingId }
  | { readonly kind: 'cell'; readonly cell: Cell }

/** Planification de l'événement daté, **au lancement**. */
export interface ScheduleWork {
  readonly kind: 'schedule-work'
  readonly workId: WorkId
  readonly nature: WorkNature
  readonly target: WorkTarget
  readonly startedAt: number
  readonly dueAt: number
}

export type Effect =
  | DebitResources
  | CreditResources
  | PlaceBuilding
  | SetBuildingLevel
  | RemoveBuilding
  | ClearCell
  | ScheduleWork

export type EffectKind = Effect['kind']

/**
 * Le vocabulaire, énuméré.
 *
 * `satisfies` garantit que cette liste ne peut nommer que des effets réels ;
 * le test de cohérence garantit qu'elle les nomme **tous**. Les deux ensemble
 * font que le vocabulaire ne peut ni s'élargir ni se rétrécir en silence.
 */
export const EFFECT_KINDS = [
  'debit-resources',
  'credit-resources',
  'place-building',
  'set-building-level',
  'remove-building',
  'clear-cell',
  'schedule-work',
] as const satisfies readonly EffectKind[]

/**
 * Rend un effet en une ligne lisible, pour le journal et le diagnostic.
 *
 * Ce `switch` n'a **pas de branche `default`**, et c'est délibéré : ajouter un
 * effet sans le traiter ici fait échouer la compilation. C'est la mécanique
 * qu'exige data-model § 1.1 — « ajouter une ressource fait échouer la
 * compilation partout où un traitement exhaustif l'a oubliée » — appliquée aux
 * effets.
 */
export function describeEffect(effect: Effect): string {
  switch (effect.kind) {
    case 'debit-resources':
      return `${effect.kind}: ${formatAmounts(effect.amounts)}`
    case 'credit-resources':
      return `${effect.kind}: ${formatAmounts(effect.amounts)}`
    case 'place-building':
      return `${effect.kind}: ${effect.typeId} (${effect.variantId}, orientation ${effect.orientation}) en ${formatCell(effect.anchor)}`
    case 'set-building-level':
      return `${effect.kind}: ${effect.buildingId} au niveau ${effect.level}`
    case 'remove-building':
      return `${effect.kind}: ${effect.buildingId}`
    case 'clear-cell':
      return `${effect.kind}: ${formatCell(effect.cell)}`
    case 'schedule-work':
      return `${effect.kind}: ${effect.nature} ${effect.workId}, échéance ${effect.dueAt}`
  }
}

function formatAmounts(amounts: readonly ResourceAmount[]): string {
  return amounts.map((a) => `${a.grains} ${a.resourceId}`).join(', ')
}

function formatCell(cell: Cell): string {
  return `(${cell.x},${cell.y})`
}
