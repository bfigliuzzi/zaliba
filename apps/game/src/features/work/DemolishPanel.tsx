import type { BuildingView, DemolishPreviewResult, ResourceAmount } from '@zaliba/domain'
import { formatDuration, formatUnits, formatWhole } from '../../lib/format.js'
import {
  BUILDING_LABELS,
  DEPOSIT_LABELS,
  describePosition,
  RESOURCE_LABELS,
} from '../../lib/labels.js'

/**
 * Le panneau de démolition : ce qu'on récupère, ce qu'on libère, ce qu'on perd.
 *
 * **La démolition est la seule mécanique dont l'effet principal est une perte**, et
 * c'est ce qui gouverne la forme de ce panneau. Les trois autres achètent quelque
 * chose ; celle-ci vend. Le joueur doit donc voir les deux côtés du marché avant de
 * confirmer — le remboursement et les cases d'un côté, la production et le montant
 * écrêté de l'autre — sachant qu'un chantier lancé n'est ni annulable ni
 * remplaçable (FR-037).
 *
 * **Les gisements préservés sont la ligne qu'on ne peut pas deviner** (FR-047).
 * Recouvrir n'efface pas un gisement (FR-020), mais rien ne dit *a priori* que
 * démolir l'extracteur ne l'effacera pas. Sans cette annonce, un joueur qui a posé
 * sa mine sur la veine hésiterait à corriger son erreur de peur de détruire la
 * veine — c'est-à-dire renoncerait à la mécanique même qui rend l'erreur réparable.
 *
 * **Le montant écrêté est annoncé, jamais constaté** (FR-049). Il est exact, et pour
 * une raison structurelle : entre le lancement et l'échéance, aucune autre
 * transition ne peut survenir (FR-033, R3, R4).
 *
 * **La cible vient du curseur de grille**, comme celle de l'amélioration : le même
 * curseur, les mêmes flèches, la même annonce (FR-058, SC-004). Le panneau ne
 * connaît donc pas la grille.
 */

export interface DemolishPanelProps {
  /** Le bâtiment sous le curseur de grille, ou `null` si la case est libre. */
  readonly building: BuildingView | null
  /** L'aperçu local, ou `null` tant qu'aucun bâtiment n'est désigné. */
  readonly preview: DemolishPreviewResult | null
  /** Vrai pendant que la commande est en vol : le bouton ne se clique qu'une fois. */
  readonly pending: boolean
  readonly onConfirm: () => void
}

/** Le nom d'un bâtiment posé : son type, son niveau **et** où il est. */
function describeBuilding(building: BuildingView): string {
  const label = BUILDING_LABELS[building.typeId] ?? building.typeId
  return `${label} niveau ${building.level}, ${describePosition(building.anchor).toLowerCase()}`
}

function describeAmounts(amounts: readonly ResourceAmount[]): string {
  return amounts
    .map((amount) => `${formatUnits(amount.grains)} ${RESOURCE_LABELS[amount.resourceId]}`)
    .join(', ')
}

/**
 * Les montants en forme **relisable exactement**, pour l'attribut.
 *
 * Le texte est formaté pour être lu — séparateurs de milliers compris — et le relire
 * à l'envers pour retrouver un nombre serait fragile autant qu'inutile. Le parcours
 * de bout en bout compare le remboursement annoncé à celui que la planète reçoit :
 * il lui faut la valeur, pas la phrase.
 */
function amountsToken(amounts: readonly ResourceAmount[]): string {
  return amounts.map((amount) => `${amount.resourceId}:${amount.grains}`).join(',')
}

export function DemolishPanel({ building, preview, pending, onConfirm }: DemolishPanelProps) {
  const armed = building !== null && preview !== null && preview.outcome === 'accepted'

  return (
    <div>
      <h2>Démolir</h2>

      <DemolishPreview building={building} preview={preview} />

      {/*
        Le bouton n'existe qu'une fois la cible désignée **et** la démolition
        possible. Un bouton présent sur un refus inviterait à une action que le
        serveur rejettera, et il compterait pourtant dans le parcours que SC-001
        mesure.

        **Le libellé nomme l'action, en vol comme au repos.** Quatre panneaux portent
        maintenant un bouton : un « Lancement en cours… » générique les rendrait
        indiscernables au moment précis où le joueur a besoin de savoir lequel il a
        engagé.
      */}
      {armed && (
        <button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending}>
          {pending ? 'Lancement de la démolition…' : 'Lancer la démolition'}
        </button>
      )}
    </div>
  )
}

/**
 * L'aperçu, qui est **le même calcul que l'arbitrage du serveur** (R8).
 *
 * Son nom accessible est « Aperçu de la démolition », distinct des trois autres
 * aperçus et de « Chantier ». La leçon vient du parcours d'US2 : deux repères dont
 * les noms se confondent sont indiscernables pour un outil qui les cherche comme
 * pour une personne qui les entend annoncés l'un après l'autre.
 */
function DemolishPreview({
  building,
  preview,
}: {
  readonly building: BuildingView | null
  readonly preview: DemolishPreviewResult | null
}) {
  if (building === null || preview === null) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées. Une `<section>` étiquetée deviendrait un point de repère `region`, et `<fieldset>` annonce un groupe de champs de saisie : il n'y en a aucun ici.
      <div role="group" aria-label="Aperçu de la démolition">
        <p>Placez le curseur sur un bâtiment posé pour voir ce qu’une démolition rendrait.</p>
      </div>
    )
  }

  if (preview.outcome === 'refused') {
    return (
      // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
      <div role="group" aria-label="Aperçu de la démolition">
        <p>{describeRefusal(preview.refusal, building)}</p>
      </div>
    )
  }

  const { duration, effect } = preview.preview

  return (
    // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
    <div role="group" aria-label="Aperçu de la démolition">
      <dl>
        <dt>Cible</dt>
        <dd>{describeBuilding(building)}</dd>

        {/*
          Le remboursement d'abord : c'est ce que le joueur achète. Il vaut la
          fraction publiée du coût cumulé de **tous** les niveaux payés (FR-046), et
          il est dérivé de la courbe du catalogue — jamais stocké (R9).
        */}
        <dt>Remboursement</dt>
        <dd data-refund={amountsToken(effect.refund)}>
          {effect.refund.length === 0 ? 'aucun' : describeAmounts(effect.refund)}
        </dd>

        {/*
          **FR-049 : le montant écrêté est annoncé avant confirmation.** Rien n'est
          dit quand rien n'est écrêté — une ligne « 0 Camelote écrêtée » ferait
          chercher une perte qui n'existe pas, et habituerait le joueur à ignorer la
          seule ligne qui doit l'alerter.
        */}
        {effect.clippedAmount.length > 0 && (
          <>
            <dt>Écrêté par le plafond</dt>
            <dd data-clipped={amountsToken(effect.clippedAmount)}>
              {describeAmounts(effect.clippedAmount)} — la place manquera à l’échéance ; démolir
              plus tard, ou dépenser d’abord, rendrait davantage
            </dd>
          </>
        )}

        <dt>Cases libérées</dt>
        <dd>{`${formatWhole(effect.cellsFreed.length)} cases`}</dd>

        {/*
          La ligne qu'on ne peut pas deviner (FR-047) : les gisements survivent. Elle
          est présente **même quand la liste est vide**, parce que son absence se
          lirait comme une réponse — « ce bâtiment ne recouvre aucun gisement » est une
          information, et la taire ferait douter.
        */}
        <dt>Gisements conservés</dt>
        <dd>
          {effect.depositsPreserved.length === 0
            ? 'aucun gisement sous ces cases'
            : effect.depositsPreserved
                .map(
                  (deposit) =>
                    `${DEPOSIT_LABELS[deposit.depositOf] ?? deposit.depositOf} en ${describePosition(deposit).toLowerCase()}`,
                )
                .join(', ')}
        </dd>

        {/*
          Ce qu'on perd, et **quand** on le perd : la production cesse à l'instant
          exact de l'échéance, pas à celui de la constatation (FR-048).
        */}
        <dt>Production perdue</dt>
        <dd data-rate-lost={`${effect.rateLost}`}>
          {formatWhole(effect.rateLost)} par heure, à l’échéance
        </dd>

        <dt>Durée</dt>
        <dd>{formatDuration(duration)}</dd>

        {/*
          L'effet énergétique, dans les deux sens — et c'est ce qui le rend utile :
          démolir un extracteur **soulage** le déficit et fait remonter la production
          des autres, tandis que démolir une centrale l'aggrave. Un joueur qui ne
          verrait que la production perdue manquerait la moitié du calcul, celle qui
          peut rendre la démolition rentable.
        */}
        <dt>Énergie après la démolition</dt>
        <dd data-energy-after={`${effect.energyAfter.produced}/${effect.energyAfter.consumed}`}>
          {formatWhole(effect.energyAfter.produced)} produite pour{' '}
          {formatWhole(effect.energyAfter.consumed)} consommée
          {effect.energyAfter.deficit
            ? ` — déficit : la production des extracteurs restera réduite au rapport ${formatWhole(effect.energyAfter.ratio.numerator)} ÷ ${formatWhole(effect.energyAfter.ratio.denominator)}`
            : ' — aucun rendement réduit'}
        </dd>
      </dl>

      {/*
        L'irréversibilité, énoncée. La démolition est la seule mécanique dont l'effet
        est une perte : le joueur doit avoir dit oui à ce qu'il perd, et FR-037 ne lui
        laissera pas revenir en arrière.
      */}
      <p>Une démolition lancée ne peut être ni annulée ni remplacée.</p>
    </div>
  )
}

/**
 * Le motif d'un refus d'aperçu, en clair.
 *
 * `building-not-found` n'a pas de phrase ici, et c'est délibéré : l'aperçu est
 * calculé localement sur un bâtiment que le curseur vient de désigner, donc ce motif
 * ne peut pas venir de lui. S'il venait du serveur — le bâtiment démoli depuis un
 * second onglet —, c'est `RefusalNotice` qui l'énonce.
 */
function describeRefusal(
  refusal: Extract<DemolishPreviewResult, { outcome: 'refused' }>['refusal'],
  building: BuildingView,
): string {
  switch (refusal.code) {
    case 'building-is-work-target':
      return `${describeBuilding(building)} est la cible du chantier en cours : il ne peut pas être démoli avant son achèvement.`
    case 'work-in-progress':
      return 'Un chantier est déjà en cours sur cette planète : rien à prévisualiser.'
    default:
      return 'Cette démolition est refusée : rien à prévisualiser.'
  }
}
