import type { BuildingTypeId, FootprintId } from '@zaliba/catalogs'
import type { Catalogs, PreviewResult } from '@zaliba/domain'
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
 * **FR-035 : la confirmation est postérieure à l'affichage.** Le coût, la durée,
 * les gisements recouverts et la production annoncée sont là, dans le document, avant que le bouton ne soit atteignable — et ils suivent le curseur à la
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

      <BuildPreview preview={preview} />

      {selection.typeId !== null && (
        <button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending}>
          {pending ? 'Lancement en cours…' : 'Lancer la construction'}
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
function BuildPreview({ preview }: { readonly preview: PreviewResult | null }) {
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
        <dd>{formatWhole(effect.effectiveRate)} par heure</dd>

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
