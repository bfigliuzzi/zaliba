import type { ObstacleId } from '@zaliba/catalogs'
import type { Catalogs } from '../../kernel/catalogs.js'
import type { BuildingId, Cell, ResourceAmount } from '../../kernel/effects.js'
import {
  applyEnergyRatio,
  type EnergyReport,
  energyAfterBuilding,
  energyAfterRemoval,
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
import {
  type ClearCommand,
  type ClearRefusal,
  type ClearReveal,
  clearCost,
  clearDuration,
  clearRefusalOf,
  clearReveals,
  clearTargetOf,
} from './clear.js'
import {
  clipRefund,
  type DemolishCommand,
  type DemolishRefusal,
  demolishDuration,
  demolishRefusalOf,
  demolishTargetOf,
  freedCells,
  grossRefund,
  type PreservedDeposit,
  preservedDeposits,
  type Room,
} from './demolish.js'
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
 * Ce qu'une démolition changerait, une fois achevée (FR-046, FR-047, FR-049).
 *
 * **Quatre grandeurs, et aucune n'est décorative.** Le remboursement est ce que le
 * joueur achète ; le montant écrêté est ce qu'il perdrait à démolir maintenant
 * plutôt que plus tard ; les cases libérées sont ce qu'il récupère ; et les
 * gisements préservés sont la seule des quatre qu'il ne peut pas deviner — rien ne
 * dit *a priori* que démolir une mine ne détruit pas la veine qu'elle recouvrait.
 * Sans cette annonce, un joueur hésiterait à corriger son erreur de peur d'aggraver
 * la situation, c'est-à-dire renoncerait à la mécanique même qui la rend réparable.
 */
export interface DemolishPreviewEffect {
  readonly kind: 'demolish'
  readonly buildingId: BuildingId
  readonly level: number
  /** Ce que le joueur recevra réellement, écrêtement appliqué. */
  readonly refund: readonly ResourceAmount[]
  /**
   * Ce qu'un plafond retiendrait (FR-049). **Vide** quand rien n'est écrêté — une
   * entrée « 0 Camelote » ferait chercher une perte qui n'existe pas.
   *
   * Le montant est exact, et pas une estimation : entre le lancement et l'échéance,
   * aucune autre transition ne peut survenir (FR-033, R3, R4), donc la quantité
   * détenue à l'échéance est calculable dès maintenant — production de la durée
   * comprise, puisque le bâtiment démoli produit jusqu'à son dernier instant
   * (FR-048).
   */
  readonly clippedAmount: readonly ResourceAmount[]
  readonly cellsFreed: readonly Cell[]
  /** Les gisements que les cases portent, et qui survivront (FR-020, FR-047). */
  readonly depositsPreserved: readonly PreservedDeposit[]
  /** La production que la planète perdra à l'échéance, et pas avant (FR-048). */
  readonly rateLost: RatePerHour
  /** Le rapport d'énergie **après** la démolition : un bâtiment de moins consomme. */
  readonly energyAfter: EnergyReport
}

export interface DemolishPreview extends PreviewTerms {
  readonly effect: DemolishPreviewEffect
}

export type DemolishPreviewResult =
  | { readonly outcome: 'accepted'; readonly preview: DemolishPreview }
  | { readonly outcome: 'refused'; readonly refusal: DemolishRefusal }

/**
 * La place disponible par ressource **à l'échéance**, depuis l'état projeté.
 *
 * C'est la moitié la plus subtile de FR-049. La place d'aujourd'hui n'est pas celle
 * de l'échéance : la production court pendant la démolition, donc la place se
 * réduit, donc l'écrêtement sera **plus grand** que ce qu'un calcul à l'instant du
 * lancement annoncerait. Annoncer la place d'aujourd'hui promettrait un
 * remboursement que le joueur ne recevrait pas.
 *
 * Le plafond, lui, est celui de l'état projeté. En 001 il ne dépend d'aucun
 * bâtiment — la contribution de l'entrepôt arrive avec US7 —, et c'est
 * `effectsOnCompletion` qui porte déjà la règle générale : le plafond retenu est
 * celui **d'après retrait**, parce que démolir un entrepôt réduit la capacité à
 * l'instant même où il rembourse. Le jour où le plafond dépendra des bâtiments,
 * l'accord entre cet aperçu et cet achèvement cessera de tenir de lui-même : c'est
 * ce que `demolish-clipping.test.ts` garde, en éprouvant l'égalité sur une planète
 * qui porte un entrepôt.
 */
function roomAtDue(state: ProjectedState, seconds: number): Readonly<Record<string, Room>> {
  return Object.fromEntries(
    Object.entries(state.holdings).map(([resourceId, holding]) => {
      const cap = holding.cap
      // Le même plafonnement que le noyau applique par segment (R4) : la quantité
      // ne peut pas dépasser le plafond, même en attendant.
      const amount = Math.min(cap, holding.amount + holding.rate * seconds)
      return [resourceId, { amount, cap }]
    }),
  )
}

/**
 * L'aperçu d'une démolition.
 *
 * Refuse pour les mêmes motifs que `decideDemolish` — il n'y en a que deux, et
 * aucun n'est une question d'argent : la démolition ne coûte rien. Les contrôles ne
 * sont pas réécrits ici, ils sont **le même code** que l'arbitrage (R8).
 */
export function previewDemolish(
  state: ProjectedState,
  command: DemolishCommand,
  catalogs: Catalogs,
): DemolishPreviewResult {
  const refusal = demolishRefusalOf(state, command)
  if (refusal !== null) return { outcome: 'refused', refusal }

  const building = demolishTargetOf(state, command.buildingId)
  const duration = demolishDuration(building.typeId, catalogs)

  const { refund, clipped } = clipRefund(
    grossRefund(building.typeId, building.level, catalogs),
    roomAtDue(state, duration),
  )

  return {
    outcome: 'accepted',
    preview: {
      // **La démolition ne coûte rien**, et les termes communs le disent en toutes
      // lettres plutôt que par omission : une liste vide se lit, un champ absent se
      // devine. Il n'y a donc jamais de manque à combler.
      cost: [],
      duration,
      dueAt: addDuration(state.at, duration),
      shortfall: null,
      secondsUntilAffordable: null,
      effect: {
        kind: 'demolish',
        buildingId: building.id,
        level: building.level,
        refund,
        clippedAmount: clipped,
        cellsFreed: freedCells(building),
        depositsPreserved: preservedDeposits(state, building),
        // La production **effective** et non la nominale : c'est celle que la
        // planète perd réellement, rapport d'énergie appliqué.
        rateLost: building.effectiveRate,
        energyAfter: energyAfterRemoval(
          state.energy,
          building.id,
          building.typeId,
          building.level,
          catalogs,
        ),
      },
    },
  }
}

/**
 * Ce qu'un déblaiement changerait, une fois achevé (FR-042, FR-043).
 *
 * **`reveals` est le champ qui porte toute la tranche.** Les trois autres
 * mécaniques annoncent un effet que le joueur connaît d'avance — un bâtiment, un
 * niveau, un remboursement ; celle-ci annonce ce qu'il ne peut pas deviner. Le
 * taire ferait du déblaiement un pari, et US5 tout entière est là pour qu'il n'en
 * soit pas un.
 */
export interface ClearPreviewEffect {
  readonly kind: 'clear'
  readonly cell: { readonly x: number; readonly y: number }
  /**
   * Le type d'obstacle, **nommé**.
   *
   * C'est lui qui rend la planète lisible : qui a déblayé un `filon-enfoui` sait
   * ce que le prochain lui donnera. L'écran le publie pour que la règle
   * s'apprenne en jouant, au lieu de s'apprendre par surprise.
   */
  readonly obstacleId: ObstacleId
  /** Terrain nu, ou gisement nommé — jamais « peut-être » (FR-044). */
  readonly reveals: ClearReveal
}

export interface ClearPreview extends PreviewTerms {
  readonly effect: ClearPreviewEffect
}

export type ClearPreviewResult =
  | { readonly outcome: 'accepted'; readonly preview: ClearPreview }
  | { readonly outcome: 'refused'; readonly refusal: ClearRefusal }

/**
 * L'aperçu d'un déblaiement.
 *
 * Refuse pour les mêmes motifs que `decideClear`, **sauf** le manque de
 * ressources : il n'y a rien à prévisualiser d'une case qui ne porte pas
 * d'obstacle, alors qu'il y a tout à dire d'un déblaiement qu'on ne peut pas
 * encore payer (FR-035, SC-007). C'est précisément le cas où le joueur a besoin
 * du chiffre : savoir qu'une poche scellée rend un geyser de Jus est ce qui lui
 * fait mettre de côté deux cents Camelote.
 *
 * Les contrôles ne sont pas réécrits ici : ils sont **le même code** que
 * l'arbitrage (R8). Une seconde liste finirait par diverger d'un cas, et le cas
 * divergent serait un aperçu qui promet ce que le serveur refuse.
 *
 * **Aucun effet énergétique n'est annoncé, et il n'y en a aucun** : un
 * déblaiement ne pose ni ne retire de bâtiment, donc ni la production ni la
 * consommation ne bougent. Publier un champ toujours égal au rapport courant
 * ferait chercher au joueur un effet qui n'existe pas.
 */
export function previewClear(
  state: ProjectedState,
  command: ClearCommand,
  catalogs: Catalogs,
): ClearPreviewResult {
  const refusal = clearRefusalOf(state, command)
  if (refusal !== null) return { outcome: 'refused', refusal }

  const target = clearTargetOf(state, command.cell)
  const cost = clearCost(target.obstacleId, catalogs)
  const shortfall = shortfallOf(state, cost)
  const duration = clearDuration(target.obstacleId, catalogs)

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
        kind: 'clear',
        cell: { x: command.cell.x, y: command.cell.y },
        obstacleId: target.obstacleId,
        reveals: clearReveals(target.obstacleId, catalogs),
      },
    },
  }
}

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
