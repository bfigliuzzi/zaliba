import type { BuildingView, EnergyReport } from '@zaliba/domain'
import { formatWhole } from '../../lib/format.js'
import { BUILDING_LABELS, describePosition } from '../../lib/labels.js'

/**
 * Le panneau d'énergie : produite, consommée, et ce que le rapport en fait.
 *
 * FR-024 impose d'afficher **séparément** la production nominale, la production
 * effective et le rapport qui mène de l'une à l'autre. Un panneau qui n'afficherait
 * que l'effective serait plus simple et ferait perdre l'information qui décide :
 * produire peu et être bridé appellent des actions opposées — poser un extracteur,
 * ou poser une centrale.
 *
 * Deux distinctions de plus, et chacune répond à une question précise :
 *
 * - **base du Berceau et centrales** au numérateur. Le joueur doit savoir
 *   laquelle des deux il peut faire grandir : la base ne bouge jamais ;
 * - **le détail par bâtiment** au dénominateur. Un total seul laisserait deviner
 *   quel bâtiment démolir, c'est-à-dire ferait de la lecture du jeu une affaire
 *   d'essais successifs. L'entrepôt y figure, alors qu'il ne produit rien : c'est
 *   ce qui explique au joueur pourquoi ses extracteurs ont ralenti (US3-4, R21).
 *
 * **Deux attributs, deux faits distincts.** `data-energy` porte `E₊/E₋`, les deux
 * membres tels quels ; `data-energy-ratio` porte le rapport, qui vaut `1/1` hors
 * déficit et `E₊/E₋` en déficit. Les confondre était tentant et faux : sur une
 * planète neuve, `E₋` vaut zéro — les deux membres se lisent, le quotient n'existe
 * pas. Publier les deux plutôt qu'un seul est ce qui permet à SC-002 de tenir :
 * le joueur refait le calcul depuis les membres, et lit sa conséquence dans le
 * rapport. Un pourcentage arrondi ne se referait ni l'un ni l'autre.
 *
 * **Pas de région annoncée en continu**, comme pour les ressources : l'énergie ne
 * bouge qu'à l'achèvement d'un chantier, mais elle voisine des compteurs qui
 * bougent à chaque image. Les valeurs sont lisibles à la demande, ce qu'on fait
 * d'un tableau de bord.
 */

export interface EnergyPanelProps {
  readonly energy: EnergyReport
  /** Les bâtiments projetés, pour leurs deux taux de production (FR-024). */
  readonly buildings: readonly BuildingView[]
}

/** Le nom d'un bâtiment posé : son type **et** où il est. */
function describeBuilding(building: {
  readonly typeId: string
  readonly level: number
  readonly anchor: { readonly x: number; readonly y: number }
}): string {
  const label = BUILDING_LABELS[building.typeId as keyof typeof BUILDING_LABELS] ?? building.typeId
  return `${label} niveau ${building.level}, ${describePosition(building.anchor)}`
}

export function EnergyPanel({ energy, buildings }: EnergyPanelProps) {
  /**
   * Les extracteurs seuls. Lister un bâtiment qui n'extrait rien avec « 0 par
   * heure » ferait chercher au joueur la production d'une centrale, alors qu'elle
   * est précisément le type qui n'en a pas.
   */
  const producers = buildings.filter(
    (building) => building.nominalRate > 0 || building.coveredDeposits > 0,
  )

  return (
    // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées. Une `<section>` étiquetée deviendrait un point de repère `region` de plus dans la navigation, et `<fieldset>` annonce un groupe de champs de saisie : il n'y en a aucun ici.
    <div
      role="group"
      aria-label="Énergie"
      data-bloc="energie"
      data-energy={`${energy.produced}/${energy.consumed}`}
      className="plaque cadre-main"
    >
      {/*
        **Un bloc distinct des trois ressources** (FR-010), et non une quatrième
        carte de comptoir : l'énergie est instantanée, ni stockée ni plafonnée. La
        fondre dans le comptoir ferait chercher au joueur un plafond d'énergie qui
        n'existe pas, et un débit horaire pour une grandeur qui n'en a pas.
      */}
      <p data-role-texte="intitule" className="intitule">
        Énergie
      </p>

      <dl>
        <dt>Produite</dt>
        <dd>{formatWhole(energy.produced)}</dd>

        <dt>dont Berceau</dt>
        <dd>{formatWhole(energy.base)}</dd>

        <dt>dont centrales</dt>
        <dd>{formatWhole(energy.fromPlants)}</dd>

        <dt>Consommée</dt>
        <dd>{formatWhole(energy.consumed)}</dd>

        <dt>Rapport</dt>
        {/*
          La fraction est dans un attribut **et** en clair. L'attribut porte la
          valeur exacte — celle qu'on refait à la main —, le texte porte ce qu'elle
          veut dire. Écrire seulement « 83 % » perdrait la première ; écrire
          seulement « 20 ÷ 24 » laisserait le joueur en tirer la conséquence.
        */}
        <dd data-energy-ratio={`${energy.ratio.numerator}/${energy.ratio.denominator}`}>
          {energy.deficit
            ? `${formatWhole(energy.ratio.numerator)} ÷ ${formatWhole(energy.ratio.denominator)} — déficit : la production des extracteurs est réduite d’autant`
            : '1 — aucun rendement réduit'}
        </dd>
      </dl>

      <h3>Consommation par bâtiment</h3>
      {energy.consumers.length === 0 ? (
        <p>Aucune consommation : rien de ce qui est posé ne tire sur le réseau.</p>
      ) : (
        <dl>
          {energy.consumers.map((consumer) => {
            const building = buildings.find((one) => one.id === consumer.buildingId)
            return (
              <div key={consumer.buildingId ?? consumer.typeId} data-consumer={consumer.buildingId}>
                <dt>
                  {building === undefined
                    ? `${BUILDING_LABELS[consumer.typeId] ?? consumer.typeId} niveau ${consumer.level}`
                    : describeBuilding(building)}
                </dt>
                <dd>{formatWhole(consumer.amount)}</dd>
              </div>
            )
          })}
        </dl>
      )}

      <h3>Production par extracteur</h3>
      {producers.length === 0 ? (
        <p>Aucun extracteur posé.</p>
      ) : (
        <dl>
          {producers.map((building) => (
            <div
              key={building.id}
              data-building-rate={`${building.nominalRate}/${building.effectiveRate}`}
            >
              <dt>{describeBuilding(building)}</dt>
              {/*
                Les deux valeurs, **toujours** — y compris quand elles coïncident.
                Les fondre en une seule hors déficit ferait disparaître
                l'information au moment précis où le joueur apprend à la lire.
              */}
              <dd>
                nominale {formatWhole(building.nominalRate)} par heure, effective{' '}
                {formatWhole(building.effectiveRate)} par heure
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
