import type { Catalogs } from '../../kernel/catalogs.js'
import type { ResourceAmount } from '../../kernel/effects.js'
import { depositsUnder, placementCells, validatePlacement } from '../../kernel/grid.js'
import type { EnergyReport, ProjectedState } from '../../kernel/projection.js'
import { applyEnergyRatio, extractorRate } from '../../kernel/rates.js'
import type { RatePerHour } from '../../kernel/resources.js'
import { addDuration, type Duration, type Instant } from '../../kernel/time.js'
import {
  type BuildCommand,
  type BuildRefusal,
  buildCost,
  buildDuration,
  INITIAL_LEVEL,
  placementRefusal,
  secondsUntilAffordable,
  shortfallOf,
} from './build.js'

/**
 * L'aperçu : **le même calcul que l'arbitrage**, rendu inoffensif (R8).
 *
 * Il n'y a **aucun endpoint d'aperçu**, et c'est la décision qui donne son sens
 * au « TypeScript partout » : le client importe ce fichier et calcule le coût,
 * la durée, la validité et la production annoncée sur l'instantané qu'il détient
 * déjà. L'aperçu n'est donc pas *cohérent avec* l'arbitrage du serveur — il est
 * le même code. Trois conséquences directes :
 *
 * - FR-050 et FR-051 sont satisfaits sans aller-retour réseau : l'aperçu suit le
 *   curseur à la fréquence d'affichage, ce qu'un endpoint ne permettrait pas ;
 * - il n'y a aucune surface de contrat à versionner pour l'aperçu, donc aucune
 *   possibilité qu'aperçu et arbitrage divergent d'une version ;
 * - la transparence de US8 devient structurelle : la page de règles et l'aperçu
 *   lisent le même catalogue et les mêmes courbes.
 *
 * **La différence avec `decide` est une question de rôle, pas de calcul.**
 * L'aperçu *informe*, y compris d'un manque de ressources — le joueur doit le
 * voir avant de confirmer (FR-035, SC-007) —, alors que `decide` *arbitre* et
 * refuse. C'est pourquoi le manque est un **champ** ici et un **motif** là-bas.
 * Un aperçu qui refuserait faute de fonds n'afficherait plus le coût, c'est-à-dire
 * précisément l'information dont le joueur a besoin pour décider d'attendre.
 */

/** Ce qu'une pose changerait, une fois achevée. */
export interface BuildPreviewEffect {
  readonly kind: 'build'
  /** Les cases que l'empreinte orientée occuperait. */
  readonly cells: readonly { readonly x: number; readonly y: number }[]
  readonly coveredDeposits: number
  /** Avant rapport d'énergie (FR-024). */
  readonly nominalRate: RatePerHour
  /** Après rapport. */
  readonly effectiveRate: RatePerHour
  /**
   * Le rapport d'énergie de la planète **après** la pose.
   *
   * En 001, seule la base du Berceau produit et rien ne consomme : le rapport
   * annoncé est donc celui de la planète, inchangé. US3 lui donne son contenu —
   * production des centrales, consommation de tous les autres types — et c'est
   * cette tranche qui éprouvera l'annonce « cette action fera basculer en
   * déficit » (US3-3). Exposer le champ dès maintenant plutôt que de l'ajouter
   * plus tard évite de faire changer la forme de l'aperçu, donc de faire changer
   * l'écran qui l'affiche.
   */
  readonly energyAfter: EnergyReport
}

export interface Preview {
  readonly cost: readonly ResourceAmount[]
  readonly duration: Duration
  readonly dueAt: Instant
  /** `null` quand le compte y est. Sinon, le manque par ressource (SC-007). */
  readonly shortfall: readonly ResourceAmount[] | null
  /** `null` quand le compte y est, ou quand le rythme n'y suffira jamais. */
  readonly secondsUntilAffordable: number | null
  readonly effect: BuildPreviewEffect
}

export type PreviewResult =
  | { readonly outcome: 'accepted'; readonly preview: Preview }
  | { readonly outcome: 'refused'; readonly refusal: BuildRefusal }

/**
 * L'aperçu d'une pose.
 *
 * Refuse pour les mêmes motifs que `decide`, **sauf** le manque de ressources :
 * il n'y a rien à prévisualiser d'un placement invalide ou d'un chantier
 * impossible, alors qu'il y a tout à dire d'un chantier qu'on ne peut pas encore
 * payer.
 */
export function previewBuild(
  state: ProjectedState,
  command: BuildCommand,
  catalogs: Catalogs,
): PreviewResult {
  const type = catalogs.buildings[command.typeId]
  if (type === undefined) {
    throw new RangeError(`Type de bâtiment inconnu : ${command.typeId}.`)
  }

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

  const cells = placementCells(command.variantId, command.orientation, command.anchor, catalogs)
  const placement = validatePlacement(state.grid, cells)
  if (placement.kind !== 'ok') {
    return { outcome: 'refused', refusal: placementRefusal(placement) }
  }

  const cost = buildCost(command.typeId, INITIAL_LEVEL, catalogs)
  const shortfall = shortfallOf(state, cost)
  const duration = buildDuration(command.typeId, INITIAL_LEVEL, catalogs)

  // Le compte de gisements est celui que la grille **projetée** donne, donc le
  // même que celui du constat après achèvement. Un second parcours ferait
  // découvrir au joueur une production différente de celle annoncée (FR-051).
  const coveredDeposits = depositsUnder(state.grid, cells, type.extracts)
  const nominal = extractorRate(command.typeId, INITIAL_LEVEL, coveredDeposits, catalogs)

  return {
    outcome: 'accepted',
    preview: {
      cost,
      duration,
      dueAt: addDuration(state.at, duration),
      shortfall: shortfall.length > 0 ? shortfall : null,
      secondsUntilAffordable:
        shortfall.length > 0 ? secondsUntilAffordable(state, shortfall, cost) : null,
      effect: {
        kind: 'build',
        cells,
        coveredDeposits,
        nominalRate: nominal as RatePerHour,
        effectiveRate: applyEnergyRatio(nominal, state.energy.ratio) as RatePerHour,
        energyAfter: state.energy,
      },
    },
  }
}
