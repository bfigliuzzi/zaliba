import type { Catalogs } from '../../kernel/catalogs.js'
import type { BuildingId, ResourceAmount } from '../../kernel/effects.js'
import {
  applyEnergyRatio,
  type EnergyReport,
  energyAfterBuilding,
  energyAfterUpgrade,
} from '../../kernel/energy.js'
import { depositsUnder, placementCells, validatePlacement } from '../../kernel/grid.js'
import type { ProjectedState } from '../../kernel/projection.js'
import { extractorRate } from '../../kernel/rates.js'
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
import { workInProgress } from './refusals.js'
import {
  type UpgradeCommand,
  type UpgradeRefusal,
  upgradeCost,
  upgradeDuration,
  upgradeRefusalOf,
  upgradeTargetOf,
} from './upgrade.js'

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
   * Le rapport d'énergie de la planète **après** la pose (US3-3).
   *
   * C'est ce champ qui tient la promesse « le joueur voit l'effet énergétique de
   * toute construction avant de la lancer ». Il est calculable exactement, et
   * pour une raison structurelle : entre le lancement d'un chantier et son
   * échéance, **aucune autre transition ne peut survenir** (FR-033, R3, R4), donc
   * l'état énergétique à l'échéance est connu dès le lancement.
   *
   * Le bâtiment envisagé y figure avec un identifiant `null` : il n'en a pas
   * encore, et lui en inventer un ferait croire que le client peut en proposer.
   */
  readonly energyAfter: EnergyReport
  /**
   * Le taux effectif **une fois la pose achevée**, sous le rapport résultant.
   *
   * Distinct de `effectiveRate`, qui applique le rapport *courant*. La
   * différence n'est pas une subtilité : un extracteur posé sans centrale se
   * dégrade lui-même, et annoncer sa production sous l'ancien rapport promettrait
   * un chiffre que la pose rendrait faux à l'instant même où elle l'atteint.
   */
  readonly effectiveRateAfter: RatePerHour
}

/**
 * Ce que **toute** action de chantier annonce : ce qu'elle coûte, et quand.
 *
 * Les quatre mécaniques — pose, amélioration, déblaiement, démolition — se
 * distinguent par leur *effet*, jamais par leurs termes. Les redéclarer par
 * mécanique laisserait dériver la forme du manque d'une action à l'autre, et
 * l'écran devrait alors savoir laquelle il regarde pour savoir comment lire un
 * coût.
 */
export interface PreviewTerms {
  readonly cost: readonly ResourceAmount[]
  readonly duration: Duration
  readonly dueAt: Instant
  /** `null` quand le compte y est. Sinon, le manque par ressource (SC-007). */
  readonly shortfall: readonly ResourceAmount[] | null
  /** `null` quand le compte y est, ou quand le rythme n'y suffira jamais. */
  readonly secondsUntilAffordable: number | null
}

export interface Preview extends PreviewTerms {
  readonly effect: BuildPreviewEffect
}

export type PreviewResult =
  | { readonly outcome: 'accepted'; readonly preview: Preview }
  | { readonly outcome: 'refused'; readonly refusal: BuildRefusal }

/**
 * Ce qu'une amélioration changerait, une fois achevée (FR-041).
 *
 * Cinq grandeurs, parce que FR-041 en demande cinq : le coût et la durée sont dans
 * les termes, la production actuelle, la production résultante et leur différence
 * sont ici. Un aperçu qui n'annoncerait que la résultante obligerait le joueur à
 * soustraire de tête pour savoir ce qu'il achète.
 */
export interface UpgradePreviewEffect {
  readonly kind: 'upgrade'
  readonly buildingId: BuildingId
  /**
   * **Toujours vrai**, et c'est le sujet de la tranche (FR-039, I-7).
   *
   * Le champ est un littéral et non un booléen calculé : il n'existe aucun chemin
   * par lequel une amélioration déplacerait une case, donc aucune valeur `false`
   * à produire. Il est là pour être *affiché* — le joueur doit savoir avant de
   * payer que sa géométrie ne bougera pas.
   */
  readonly cellsUnchanged: true
  readonly level: number
  readonly levelAfter: number
  /** Avant rapport d'énergie, au niveau courant (FR-024). */
  readonly nominalBefore: RatePerHour
  /** Avant rapport d'énergie, au niveau visé. */
  readonly nominalAfter: RatePerHour
  /** La production **actuelle**, sous le rapport courant : un fait constaté. */
  readonly rateBefore: RatePerHour
  /**
   * La production **résultante**, sous le rapport que l'amélioration laissera
   * derrière elle.
   *
   * Sous le rapport résultant et non le courant, pour la même raison que la pose
   * (US3-3) : un niveau de plus consomme davantage, et annoncer le gain sous
   * l'ancien rapport promettrait un chiffre que l'amélioration rendrait faux à
   * l'instant même où elle l'atteint.
   */
  readonly rateAfter: RatePerHour
  /**
   * `rateAfter − rateBefore` — le gain tel qu'il sera constaté.
   *
   * Il peut être **négatif**, et ce n'est pas un défaut : une amélioration qui
   * fait basculer la planète en déficit fait baisser la production du bâtiment
   * qu'elle améliore. Le taire, ou l'écrêter à zéro, cacherait précisément
   * l'information qui doit faire poser une centrale d'abord.
   */
  readonly delta: number
  /** Le rapport d'énergie de la planète **après** l'amélioration (US3-3). */
  readonly energyAfter: EnergyReport
}

export interface UpgradePreview extends PreviewTerms {
  readonly effect: UpgradePreviewEffect
}

export type UpgradePreviewResult =
  | { readonly outcome: 'accepted'; readonly preview: UpgradePreview }
  | { readonly outcome: 'refused'; readonly refusal: UpgradeRefusal }

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
    return { outcome: 'refused', refusal: workInProgress(state.work) }
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

  // Le rapport que la pose laissera derrière elle. Il est calculé sur le rapport
  // **courant** de l'état projeté, ce qui est exact parce que rien d'autre ne
  // peut survenir d'ici l'échéance (FR-033, R3).
  const energyAfter = energyAfterBuilding(state.energy, command.typeId, INITIAL_LEVEL, catalogs)

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
        energyAfter,
        effectiveRateAfter: applyEnergyRatio(nominal, energyAfter.ratio) as RatePerHour,
      },
    },
  }
}

/**
 * L'aperçu d'une amélioration.
 *
 * Refuse pour les mêmes motifs que `decideUpgrade`, **sauf** le manque de
 * ressources : il n'y a rien à prévisualiser d'une cible qui n'existe pas ou d'un
 * plafond atteint, alors qu'il y a tout à dire d'une amélioration qu'on ne peut
 * pas encore payer (FR-035, SC-007, US4-3).
 *
 * Les contrôles ne sont pas réécrits ici : ils sont **le même code** que
 * l'arbitrage (R8). Une seconde liste de contrôles finirait par diverger d'un cas,
 * et le cas divergent serait un aperçu qui promet ce que le serveur refuse.
 */
export function previewUpgrade(
  state: ProjectedState,
  command: UpgradeCommand,
  catalogs: Catalogs,
): UpgradePreviewResult {
  const refusal = upgradeRefusalOf(state, command, catalogs)
  if (refusal !== null) return { outcome: 'refused', refusal }

  const building = upgradeTargetOf(state, command.buildingId)
  const levelAfter = building.level + 1
  const cost = upgradeCost(building.typeId, levelAfter, catalogs)
  const shortfall = shortfallOf(state, cost)
  const duration = upgradeDuration(building.typeId, levelAfter, catalogs)

  // Le compte de gisements est celui que la grille **projetée** donne, et il ne
  // change pas : l'empreinte est la même (I-7). C'est ce qui rend le gain d'une
  // amélioration exactement prévisible, là où celui d'une pose dépend d'où on la
  // pose.
  const nominalAfter = extractorRate(
    building.typeId,
    levelAfter,
    building.coveredDeposits,
    catalogs,
  )
  const energyAfter = energyAfterUpgrade(
    state.energy,
    building.id,
    building.typeId,
    levelAfter,
    catalogs,
  )
  const rateAfter = applyEnergyRatio(nominalAfter, energyAfter.ratio)

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
        kind: 'upgrade',
        buildingId: building.id,
        cellsUnchanged: true,
        level: building.level,
        levelAfter,
        nominalBefore: building.nominalRate,
        nominalAfter: nominalAfter as RatePerHour,
        rateBefore: building.effectiveRate,
        rateAfter: rateAfter as RatePerHour,
        delta: rateAfter - building.effectiveRate,
        energyAfter,
      },
    },
  }
}
