import type { BuildingView, UpgradePreviewResult } from '@zaliba/domain'
import { formatDuration, formatUnits, formatWhole } from '../../lib/format.js'
import { BUILDING_LABELS, describePosition, RESOURCE_LABELS } from '../../lib/labels.js'

/**
 * Le panneau d'amélioration : la cible, le gain, la confirmation.
 *
 * **La cible vient du curseur de grille**, et c'est la décision qui porte toute
 * l'accessibilité de la tranche. Le joueur désigne un bâtiment en posant le
 * curseur sur l'une de ses cases — le même curseur, les mêmes flèches, la même
 * annonce que pour la pose (FR-058, SC-004). Une liste déroulante de bâtiments
 * aurait été plus simple à écrire et fausse à deux titres : elle ajouterait un
 * second modèle de navigation à apprendre, et elle nommerait les bâtiments par
 * leur position sans que le joueur puisse la voir.
 *
 * Le panneau ne connaît donc pas la grille : il reçoit un bâtiment ou `null`.
 *
 * **FR-041 demande cinq grandeurs, et les cinq sont là** : coût, durée, production
 * actuelle, production résultante, et leur différence. La cinquième n'est pas une
 * commodité — un joueur qui ne verrait que la résultante devrait soustraire de
 * tête pour savoir ce qu'il achète, et c'est précisément le calcul que le jeu doit
 * faire à sa place.
 *
 * **FR-035 : la confirmation est postérieure à l'affichage.** Le bouton vient
 * après l'aperçu dans le document, et pas seulement à côté de lui.
 */

export interface UpgradePanelProps {
  /** Le bâtiment sous le curseur de grille, ou `null` si la case est libre. */
  readonly building: BuildingView | null
  /** L'aperçu local, ou `null` tant qu'aucun bâtiment n'est désigné. */
  readonly preview: UpgradePreviewResult | null
  /** Vrai pendant que la commande est en vol : le bouton ne se clique qu'une fois. */
  readonly pending: boolean
  readonly onConfirm: () => void
}

/** Le nom d'un bâtiment posé : son type, son niveau **et** où il est. */
function describeBuilding(building: BuildingView): string {
  const label = BUILDING_LABELS[building.typeId] ?? building.typeId
  return `${label} niveau ${building.level}, ${describePosition(building.anchor).toLowerCase()}`
}

export function UpgradePanel({ building, preview, pending, onConfirm }: UpgradePanelProps) {
  return (
    <div>
      <h2>Améliorer</h2>

      <UpgradePreview building={building} preview={preview} />

      {/*
        Le bouton n'existe qu'une fois la cible désignée. Un bouton permanent
        serait un arrêt de tabulation qui n'apprend rien, et il compterait pourtant
        dans le parcours que SC-001 mesure.

        **Le libellé nomme l'action, en vol comme au repos.** Un « Lancement en
        cours… » générique donnerait à ce bouton et à celui de la construction le
        **même** nom accessible au moment précis où le joueur a besoin de savoir
        lequel des deux il a engagé. C'est la leçon d'US2 : deux repères doivent
        porter des noms distincts, et pas seulement différents.
      */}
      {building !== null && (
        <button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending}>
          {pending ? 'Lancement de l’amélioration…' : 'Lancer l’amélioration'}
        </button>
      )}
    </div>
  )
}

/**
 * L'aperçu, qui est **le même calcul que l'arbitrage du serveur** (R8).
 *
 * Son nom accessible est « Aperçu de l'amélioration », distinct d'« Aperçu de la
 * construction » et de « Chantier ». La leçon vient du parcours d'US2 : deux
 * repères dont les noms se confondent sont indiscernables pour un outil qui les
 * cherche comme pour une personne qui les entend annoncés l'un après l'autre. Des
 * noms *différents* ne suffisent pas — il les faut *distincts*.
 */
function UpgradePreview({
  building,
  preview,
}: {
  readonly building: BuildingView | null
  readonly preview: UpgradePreviewResult | null
}) {
  if (building === null || preview === null) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées. Une `<section>` étiquetée deviendrait un point de repère `region`, et `<fieldset>` annonce un groupe de champs de saisie : il n'y en a aucun ici.
      <div role="group" aria-label="Aperçu de l’amélioration">
        <p>Placez le curseur sur un bâtiment posé pour voir son amélioration.</p>
      </div>
    )
  }

  if (preview.outcome === 'refused') {
    return (
      // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
      <div role="group" aria-label="Aperçu de l’amélioration">
        <p>{describeRefusal(preview.refusal, building)}</p>
      </div>
    )
  }

  const { cost, duration, shortfall, secondsUntilAffordable, effect } = preview.preview

  return (
    // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
    <div role="group" aria-label="Aperçu de l’amélioration">
      <dl>
        <dt>Cible</dt>
        <dd>{describeBuilding(building)}</dd>

        <dt>Niveau visé</dt>
        <dd>{formatWhole(effect.levelAfter)}</dd>

        <dt>Coût</dt>
        <dd>
          {cost
            .map((amount) => `${formatUnits(amount.grains)} ${RESOURCE_LABELS[amount.resourceId]}`)
            .join(', ')}
        </dd>

        <dt>Durée</dt>
        <dd>{formatDuration(duration)}</dd>

        {/*
          FR-039 énoncé au joueur, et non seulement tenu par le contrat. Il doit
          savoir **avant** de payer que sa géométrie ne bougera pas — c'est ce qui
          fait de l'amélioration la voie de progression disponible quand la grille
          est saturée, et cela ne se devine pas.
        */}
        <dt>Cases occupées</dt>
        <dd>{`inchangées — ${formatWhole(building.cells.length)} cases`}</dd>

        {/*
          Les deux productions et leur différence. Les valeurs exactes sont dans
          les attributs — celles qu'on refait à la main (SC-002) —, leur sens est
          dans le texte. Publier seulement le texte formaté obligerait à relire à
          l'envers un nombre à séparateurs de milliers.
        */}
        <dt>Production actuelle</dt>
        <dd data-upgrade-rate={`${effect.rateBefore}/${effect.rateAfter}`}>
          {formatWhole(effect.rateBefore)} par heure
        </dd>

        <dt>Production résultante</dt>
        <dd>{formatWhole(effect.rateAfter)} par heure</dd>

        <dt>Gain</dt>
        {/*
          Le gain peut être **négatif**, et ce n'est pas un défaut : une
          amélioration qui fait basculer la planète en déficit fait baisser la
          production du bâtiment qu'elle améliore. L'écrêter à zéro cacherait
          précisément l'information qui doit faire poser une centrale d'abord.
        */}
        <dd data-upgrade-delta={`${effect.delta}`}>
          {effect.delta < 0
            ? `${formatWhole(effect.delta)} par heure — le déficit d’énergie coûte plus que le niveau ne rapporte`
            : `+${formatWhole(effect.delta)} par heure`}
        </dd>

        {/*
          US3-3 étendu à l'amélioration : un niveau de plus consomme davantage, et
          l'effet énergétique est annoncé **avant paiement**. Il est exactement
          calculable — entre le lancement d'un chantier et son échéance, aucune
          autre transition ne peut survenir (FR-033, R3, R4).
        */}
        <dt>Énergie après l’amélioration</dt>
        <dd data-energy-after={`${effect.energyAfter.produced}/${effect.energyAfter.consumed}`}>
          {formatWhole(effect.energyAfter.produced)} produite pour{' '}
          {formatWhole(effect.energyAfter.consumed)} consommée
          {effect.energyAfter.deficit
            ? ` — déficit : la production des extracteurs sera réduite au rapport ${formatWhole(effect.energyAfter.ratio.numerator)} ÷ ${formatWhole(effect.energyAfter.ratio.denominator)}`
            : ' — aucun rendement réduit'}
        </dd>

        {shortfall !== null && (
          <>
            <dt>Il manque</dt>
            <dd>
              {shortfall
                .map(
                  (amount) => `${formatUnits(amount.grains)} ${RESOURCE_LABELS[amount.resourceId]}`,
                )
                .join(', ')}
            </dd>

            <dt>Payable dans</dt>
            <dd>
              {/*
                `null` n'est pas un cas d'erreur : il dit que le rythme courant n'y
                suffira jamais parce que la ressource sature avant, donc qu'il faut
                d'abord un entrepôt. L'écrire « jamais » sans le pourquoi
                laisserait le joueur attendre.
              */}
              {secondsUntilAffordable === null
                ? 'jamais au rythme courant — un entrepôt est nécessaire'
                : formatDuration(secondsUntilAffordable)}
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}

/**
 * Le motif d'un refus d'aperçu, en clair.
 *
 * `building-not-found` n'a pas de phrase ici, et c'est délibéré : l'aperçu est
 * calculé localement sur un bâtiment que le curseur vient de désigner, donc ce
 * motif ne peut pas venir de lui. S'il venait du serveur — le bâtiment démoli
 * depuis un second onglet —, c'est `RefusalNotice` qui l'énonce, avec les autres
 * refus arrivés par le réseau.
 */
function describeRefusal(
  refusal: Extract<UpgradePreviewResult, { outcome: 'refused' }>['refusal'],
  building: BuildingView,
): string {
  switch (refusal.code) {
    case 'max-level-reached':
      return `${describeBuilding(building)} est au niveau maximal du catalogue (${refusal.maxLevel}).`
    case 'work-in-progress':
      return 'Un chantier est déjà en cours sur cette planète : rien à prévisualiser.'
    default:
      return 'Cette amélioration est refusée : rien à prévisualiser.'
  }
}
