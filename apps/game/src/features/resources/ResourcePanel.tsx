import type { ResourceId } from '@zaliba/catalogs'
import type { HoldingView, Instant } from '@zaliba/domain'
import { formatDuration, formatHeld, formatUnits, formatWhole } from '../../lib/format.js'
import { RESOURCE_LABELS } from '../../lib/labels.js'

/**
 * Les compteurs de ressources.
 *
 * **Cinq grandeurs par ressource, et aucune n'est décorative :**
 *
 * - la **quantité** détenue ;
 * - le **plafond**, sans lequel la saturation est une surprise ;
 * - le **remplissage**, arrivé avec US7. La quantité et le plafond étaient là depuis
 *   US1, et pourtant le joueur devait faire la division lui-même pour répondre à la
 *   seule question qui compte : *suis-je près de perdre ?* Un pourcentage y répond
 *   d'un coup d'œil, et il le fait pour les trois ressources à la fois — ce qu'aucune
 *   paire de nombres à échelles différentes ne permet de comparer ;
 * - le **temps restant avant saturation** au rythme courant (FR-027), la seule
 *   information qui dise *quand* agir ;
 * - la **quantité perdue cumulée** (FR-026), qui dit combien a déjà coûté le fait de
 *   ne pas avoir agi — et **ce qu'elle représente**. Le nombre nu ne disait pas ce
 *   qu'il valait : cinq mille unités perdues sont-elles beaucoup ? La réponse est
 *   dans la comparaison avec le plafond, et c'est elle qui rend un entrepôt désirable
 *   pour une raison chiffrée plutôt que par intuition (US7-3).
 *
 * **Pas de région annoncée en continu.** Les compteurs bougent à chaque seconde ; un
 * `aria-live` les réciterait sans fin et rendrait la page inutilisable au lecteur
 * d'écran. Les valeurs sont lisibles à la demande, ce qui est ce qu'on fait d'un
 * tableau de bord.
 *
 * **Les libellés et les formats viennent des tables partagées**, et non d'une copie
 * locale. Ce fichier en portait une jusqu'à US7 : deux tables de libellés
 * divergeraient, et le lecteur d'écran finirait par énoncer un nom que l'écran
 * n'affiche pas — c'est-à-dire par décrire un autre jeu.
 */

export interface ResourcePanelProps {
  readonly holdings: Readonly<Record<ResourceId, HoldingView>>
  readonly at: Instant
}

/**
 * Le remplissage en **millièmes**, tronqué vers le bas.
 *
 * Les millièmes plutôt que les centièmes : le pourcentage affiché ne bouge qu'une
 * fois par heure à vingt unités sur cinq mille, et un test comme un parcours a
 * besoin d'une résolution qui distingue deux états proches. La troncature va vers le
 * bas, comme partout : annoncer « 100 % » à 99,7 % dirait au joueur qu'il perd déjà
 * alors qu'il lui reste du temps.
 */
function fillPerMille(holding: HoldingView): number {
  if (holding.cap === 0) return 1_000
  return Math.floor((holding.amount * 1_000) / holding.cap)
}

/**
 * Ce que la perte représente, en plafonds.
 *
 * `null` tant que rien n'a débordé : une phrase « l'équivalent de 0 plafond »
 * occuperait l'endroit où doit s'afficher, un jour, la raison de poser un entrepôt.
 */
function lostInCaps(holding: HoldingView): string | null {
  if (holding.lost === 0 || holding.cap === 0) return null

  const caps = holding.lost / holding.cap
  // Une décimale : « 1,1 plafond » se lit, « 1,096 » se déchiffre.
  const rounded = Math.floor(caps * 10) / 10
  if (rounded < 0.1) return 'moins d’un dixième de votre plafond'
  return `l’équivalent de ${rounded.toLocaleString('fr-FR')} fois votre plafond`
}

export function ResourcePanel({ holdings, at }: ResourcePanelProps) {
  return (
    <>
      {Object.entries(holdings).map(([resourceId, holding]) => {
        const label = RESOURCE_LABELS[resourceId as ResourceId] ?? resourceId
        const saturated = holding.saturationAt === null
        const perMille = fillPerMille(holding)
        const lostScale = lostInCaps(holding)

        return (
          // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste, et aucun élément natif ne convient. Une `<section>` étiquetée devient un **point de repère** `region` — trois repères nommés « Camelote », « Jus » et « Bave d'étoiles » encombreraient la navigation par repères pour ce qui n'est qu'un ensemble de valeurs liées. Et `<fieldset>`, que le lint suggère, annonce un groupe de champs de saisie : il n'y en a aucun ici.
          <div key={resourceId} role="group" aria-label={label}>
            <h2>{label}</h2>
            <dl>
              <dt>Détenu</dt>
              <dd>{formatHeld(holding.amount)}</dd>

              <dt>Plafond</dt>
              {/*
                Le chiffre **en grains** dans l'attribut, sa forme lisible dans le
                texte. Le second est formaté pour être lu — séparateurs de milliers
                compris — et le relire à l'envers pour retrouver un nombre serait
                fragile autant qu'inutile. Le parcours d'US3 compare deux plafonds
                pour établir que le déficit d'énergie ne les dégrade pas (FR-023b),
                celui d'US7 pour établir qu'un entrepôt les relève : il leur faut le
                chiffre.
              */}
              <dd data-cap={holding.cap} data-resource={resourceId}>
                {formatUnits(holding.cap)}
              </dd>

              {/*
                Le remplissage, en pourcentage lisible et en millièmes comparables.
                C'est la grandeur qui répond d'un coup d'œil à « suis-je près de
                perdre ? », et la seule que les trois ressources partagent malgré
                leurs plafonds différents.
              */}
              <dt>Remplissage</dt>
              <dd data-fill={perMille} data-resource={resourceId}>
                {`${formatWhole(Math.floor(perMille / 10))} %`}
              </dd>

              <dt>Saturation</dt>
              <dd>
                {saturated
                  ? holding.rate === 0
                    ? 'jamais — production nulle'
                    : 'saturée : la production se perd'
                  : `dans ${formatDuration((holding.saturationAt ?? at) - at)}`}
              </dd>

              <dt>Perdu</dt>
              {/*
                La perte, **située**. Le nombre nu ne disait pas ce qu'il valait ;
                le comparer au plafond donne l'échelle sans demander au joueur de
                diviser, et c'est cette phrase qui fait d'un entrepôt un achat
                raisonné (FR-026, US7-3).
              */}
              <dd data-lost={holding.lost} data-resource={resourceId}>
                {formatUnits(holding.lost)}
                {lostScale === null ? '' : ` — ${lostScale}`}
              </dd>
            </dl>
          </div>
        )
      })}
    </>
  )
}
