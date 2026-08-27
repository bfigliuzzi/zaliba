import type { BuildingTypeId, FootprintId } from '@zaliba/catalogs'
import type { Catalogs, GridOccupancy, PlacementAvailability, PreviewResult } from '@zaliba/domain'
import { useId } from 'react'
import { formatDuration, formatUnits, formatWhole } from '../../lib/format.js'
import { BUILDING_LABELS, FOOTPRINT_LABELS, RESOURCE_LABELS } from '../../lib/labels.js'

/**
 * Le panneau de construction : choisir, voir, confirmer.
 *
 * **L'ordre du document est l'ordre du parcours** (SC-001, SC-004). Type, puis
 * variante, puis aperçu, puis confirmation — et la grille juste après. Une
 * tabulation mène de l'un à l'autre sans qu'aucun sous-menu ne s'interpose, ce
 * qui est exactement ce que SC-001 mesure : non pas une durée, mais un nombre
 * d'interactions. C'est un menu déroulant, une boîte modale ou un accordéon qui
 * détruiraient la promesse « c'est immédiat », et cela se compte.
 *
 * **Des radios natives, dans un `fieldset` légendé.** Le rôle, le groupement et
 * la navigation aux flèches sont fournis par le navigateur ; les réécrire en
 * ARIA serait ajouter une implémentation là où il y en a déjà une, mieux testée
 * que la nôtre. Sélectionner un type **présélectionne sa première variante** :
 * sans cela, le joueur paierait une frappe pour un choix que le catalogue a déjà
 * fait à sa place quand le type n'a qu'une empreinte.
 *
 * **Le libellé du bouton nomme l'action, en vol comme au repos.** « Lancement en
 * cours… » était générique, et l'arrivée du panneau d'amélioration l'a rendu faux :
 * les deux boutons auraient porté le **même** nom accessible au moment précis où le
 * joueur a besoin de savoir lequel des deux il a engagé. C'est la leçon d'US2, les
 * états transitoires compris.
 *
 * **FR-035 : la confirmation est postérieure à l'affichage.** Le coût, la durée,
 * les gisements recouverts, la production annoncée et l'effet énergétique
 * (US3-3) sont là, dans le document, avant que le bouton ne soit atteignable — et ils suivent le curseur à la
 * fréquence d'affichage, sans un seul appel réseau (R8). Le bouton n'est pas une
 * cérémonie : il est le seul endroit où le joueur engage sa dépense.
 */

export interface BuildSelection {
  readonly typeId: BuildingTypeId | null
  readonly variantId: FootprintId | null
}

export interface BuildPanelProps {
  readonly catalogs: Catalogs
  readonly selection: BuildSelection
  /** L'aperçu local, ou `null` tant qu'aucun type n'est choisi. */
  readonly preview: PreviewResult | null
  /** Ce que la grille contient — de quoi dire qu'elle est pleine, et par où sortir. */
  readonly occupancy: GridOccupancy
  /**
   * L'existence d'un placement pour le type choisi, ou `null` tant qu'aucun ne
   * l'est.
   *
   * Distincte de `preview`, qui répond « ici, oui ou non » à une position donnée.
   * Celle-ci répond « quelque part, oui ou non » — et c'est la question que pose
   * un joueur qui a essayé trois cases et n'a pas compris pourquoi.
   */
  readonly availability: PlacementAvailability | null
  /** Vrai pendant que la commande est en vol : le bouton ne se clique qu'une fois. */
  readonly pending: boolean
  readonly onSelectType: (typeId: BuildingTypeId) => void
  readonly onSelectVariant: (variantId: FootprintId) => void
  readonly onConfirm: () => void
}

export function BuildPanel({
  catalogs,
  selection,
  preview,
  occupancy,
  availability,
  pending,
  onSelectType,
  onSelectVariant,
  onConfirm,
}: BuildPanelProps) {
  const typeName = useId()
  const variantName = useId()

  const typeIds = Object.keys(catalogs.buildings) as readonly BuildingTypeId[]
  const variants = selection.typeId === null ? [] : catalogs.buildings[selection.typeId].variants

  return (
    <div>
      <h2>Construire</h2>

      <FullGridNotice occupancy={occupancy} />

      <fieldset>
        <legend>Type de bâtiment</legend>
        {typeIds.map((typeId) => (
          <label key={typeId}>
            <input
              type="radio"
              name={typeName}
              value={typeId}
              checked={selection.typeId === typeId}
              onChange={() => onSelectType(typeId)}
            />
            {BUILDING_LABELS[typeId]}
          </label>
        ))}
      </fieldset>

      {/*
        Le sélecteur de variante n'existe **que** si un type est choisi : un
        groupe vide serait un arrêt de tabulation qui n'apprend rien, et il
        compterait pourtant dans le parcours mesuré par SC-001.
      */}
      {selection.typeId !== null && (
        <fieldset>
          <legend>Empreinte</legend>
          {variants.map((variantId) => (
            <label key={variantId}>
              <input
                type="radio"
                name={variantName}
                value={variantId}
                checked={selection.variantId === variantId}
                onChange={() => onSelectVariant(variantId)}
              />
              {FOOTPRINT_LABELS[variantId]}
            </label>
          ))}
        </fieldset>
      )}

      <BuildPreview preview={preview} availability={availability} />

      {selection.typeId !== null && (
        <button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending}>
          {pending ? 'Lancement de la construction…' : 'Lancer la construction'}
        </button>
      )}
    </div>
  )
}

/**
 * L'aperçu, qui est **le même calcul que l'arbitrage du serveur** (R8).
 *
 * Son nom accessible est « Aperçu de la construction » et non « Aperçu du
 * chantier », et ce n'est pas une nuance de style : le parcours de bout en bout
 * a buté sur l'ambiguïté. « Aperçu du chantier » et « Chantier » sont deux
 * groupes dont les noms se confondent — pour un outil qui les cherche comme pour
 * une personne qui les entend annoncés l'un après l'autre. Deux repères
 * distincts doivent porter des noms distincts, et pas seulement des noms
 * différents.
 *
 * Ce n'est donc pas une estimation : c'est la valeur que le serveur appliquera,
 * calculée par le même code sur l'instantané que le client détient déjà. C'est ce
 * qui satisfait FR-050 et FR-051 sans aller-retour réseau — et ce qui permet à
 * l'aperçu de suivre le curseur à la fréquence d'affichage, ce qu'un endpoint ne
 * permettrait pas.
 */
function BuildPreview({
  preview,
  availability,
}: {
  readonly preview: PreviewResult | null
  readonly availability: PlacementAvailability | null
}) {
  /*
    **L'impossibilité passe avant tout le reste**, et c'est le cas limite de la
    spécification : « aucune empreinte d'un type donné ne tient nulle part sur la
    grille : le type reste consultable, son aperçu énonce l'impossibilité et son
    motif ».

    Elle passe avant parce qu'elle explique les refus au lieu de les répéter. Un
    joueur qui promène son curseur reçoit case après case « obstruée », « occupée »,
    « hors de la grille » — trois motifs justes qui ne disent jamais qu'il n'y a
    rien à trouver. Le dire une fois vaut mieux que le laisser déduire trente-six
    fois.
  */
  if (availability !== null && availability.kind !== 'available') {
    return (
      // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées, comme partout ailleurs dans ce panneau.
      <div role="group" aria-label="Aperçu de la construction">
        <p>Aucune empreinte de ce bâtiment ne tient nulle part sur la grille.</p>
        <p>
          {availability.kind === 'not-enough-free-cells'
            ? `Plus assez de cases libres : il en reste ${formatWhole(availability.freeCells)}, et il en faut au moins ${formatWhole(availability.smallestFootprint)}. Démolir ou déblayer en rendra.`
            : `Il reste ${formatWhole(availability.freeCells)} cases libres — assez en nombre —, mais pas dans cette forme : les ${formatWhole(availability.smallestFootprint)} cases d’une empreinte doivent être libres et contiguës. Une autre empreinte, ou une démolition bien choisie, peut suffire.`}
        </p>
      </div>
    )
  }

  if (preview === null) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées. Une `<section>` étiquetée deviendrait un point de repère `region`, et `<fieldset>` annonce un groupe de champs de saisie : il n'y en a aucun ici.
      <div role="group" aria-label="Aperçu de la construction">
        <p>Choisissez un type de bâtiment pour voir son coût et sa durée.</p>
      </div>
    )
  }

  if (preview.outcome === 'refused') {
    // Le motif exact appartient à la région d'alerte et à l'annonce du curseur :
    // le répéter ici en ferait un troisième endroit à tenir d'accord. L'aperçu
    // dit seulement qu'il n'y a rien à prévisualiser.
    return (
      // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
      <div role="group" aria-label="Aperçu de la construction">
        <p>Ce placement est refusé : rien à prévisualiser.</p>
      </div>
    )
  }

  const { cost, duration, effect, shortfall, secondsUntilAffordable } = preview.preview

  return (
    // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
    <div role="group" aria-label="Aperçu de la construction">
      <dl>
        <dt>Coût</dt>
        <dd>
          {cost
            .map((amount) => `${formatUnits(amount.grains)} ${RESOURCE_LABELS[amount.resourceId]}`)
            .join(', ')}
        </dd>

        <dt>Durée</dt>
        <dd>{formatDuration(duration)}</dd>

        <dt>Gisements recouverts</dt>
        <dd>{formatWhole(effect.coveredDeposits)}</dd>

        {/*
          La production **annoncée**, et le mot compte : c'est celle que le
          bâtiment donnera à l'échéance, calculée par la règle publiée. Le
          scénario 4 d'US2 exige qu'un placement sans gisement annonce zéro
          *avant* la pose, et non après.
        */}
        <dt>Production annoncée</dt>
        {/*
          Le taux **résultant**, sous le rapport que la pose laissera derrière
          elle — et non sous le rapport courant. Annoncer sous l'ancien
          promettrait un chiffre que la pose rendrait faux à l'instant même où
          elle l'atteint : un extracteur posé sans centrale se dégrade lui-même.
        */}
        <dd>{formatWhole(effect.effectiveRateAfter)} par heure</dd>

        {/*
          US3-3 : l'effet énergétique est annoncé **avant paiement**, et il est
          exactement calculable — entre le lancement d'un chantier et son
          échéance, aucune autre transition ne peut survenir (FR-033, R3, R4).
          La fraction est dans l'attribut, ce qu'elle veut dire est dans le texte.
        */}
        <dt>Énergie après la pose</dt>
        <dd data-energy-after={`${effect.energyAfter.produced}/${effect.energyAfter.consumed}`}>
          {formatWhole(effect.energyAfter.produced)} produite pour{' '}
          {formatWhole(effect.energyAfter.consumed)} consommée
          {effect.energyAfter.deficit
            ? ` — déficit : la production des extracteurs sera réduite au rapport ${formatWhole(effect.energyAfter.ratio.numerator)} ÷ ${formatWhole(effect.energyAfter.ratio.denominator)}`
            : ' — aucun rendement réduit'}
        </dd>

        {/*
          **L'effet sur les plafonds** (US7-1), et il n'est publié que quand il
          existe : quatre des cinq types ne stockent rien, et une ligne « +0 » sur
          l'aperçu d'une mine ferait chercher un effet inexistant.

          L'entrepôt est le seul des cinq dont la vertu ne soit ni une production ni
          une énergie. Un aperçu qui n'aurait su parler que de production l'aurait
          présenté comme un bâtiment inutile qui consomme de l'énergie — ce qui est
          vrai et trompeur à la fois.
        */}
        {effect.capacityAdded.length > 0 && (
          <>
            <dt>Plafonds après la pose</dt>
            <dd
              data-cap-added={effect.capacityAdded
                .map((a) => `${a.resourceId}:${a.grains}`)
                .join(',')}
            >
              {effect.capAfter
                .map(
                  (amount) => `${formatUnits(amount.grains)} ${RESOURCE_LABELS[amount.resourceId]}`,
                )
                .join(', ')}
              {` (+${formatUnits(effect.capacityAdded[0]?.grains ?? 0)} chacun)`}
            </dd>

            {/*
              Le temps gagné, et c'est la grandeur qui décide : « votre Camelote
              saturera dans quatre jours au lieu de deux » est une raison de payer,
              « votre plafond passera de 5 000 à 7 000 » demande au joueur de faire
              lui-même la division.

              Une ressource dont le taux est nul est **absente** de la liste : elle
              ne saturera jamais, donc il n'y a aucun temps à gagner — et le dire par
              un chiffre serait dire quelque chose de faux.
            */}
            {effect.saturationDelayed.length > 0 && (
              <>
                <dt>Saturation repoussée de</dt>
                <dd>
                  {effect.saturationDelayed
                    .map(
                      (delay) =>
                        `${formatDuration(delay.seconds)} pour la ${RESOURCE_LABELS[delay.resourceId]}`,
                    )
                    .join(', ')}
                </dd>
              </>
            )}
          </>
        )}

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
                `null` n'est pas un cas d'erreur : il dit que le rythme courant
                n'y suffira jamais parce que la ressource sature avant, donc
                qu'il faut d'abord un entrepôt. L'écrire « jamais » sans le
                pourquoi laisserait le joueur attendre.
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
 * **La grille pleine, dite** — le second cas limite de la spécification.
 *
 * « La grille est entièrement occupée : seules la démolition et le déblaiement
 * peuvent libérer de la place, **et le jeu le dit**. »
 *
 * Les deux comptes sont donnés séparément parce qu'ils décident : des cases sous
 * obstacle se déblaient, des cases sous bâtiment se démolissent, et les deux ne se
 * paient pas le même prix. Un « la grille est pleine » sans chiffres laisserait le
 * joueur chercher par où sortir.
 *
 * `role="status"` et non `alert` : c'est un état de la planète, pas un incident.
 * Une alerte interromprait le lecteur d'écran pour une situation que le joueur a
 * lui-même construite, coup par coup.
 */
function FullGridNotice({ occupancy }: { readonly occupancy: GridOccupancy }) {
  if (!occupancy.full) return null

  return (
    <p role="status">
      La grille est entièrement occupée : {formatWhole(occupancy.occupied)} cases sous bâtiment,{' '}
      {formatWhole(occupancy.obstructed)} sous obstacle, aucune libre. Seules la démolition et le
      déblaiement peuvent libérer de la place.
    </p>
  )
}
