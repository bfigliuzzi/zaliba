import type { ResourceId } from '@zaliba/catalogs'
import type { HoldingView, Instant } from '@zaliba/domain'
import {
  formatDuration,
  formatElapsed,
  formatHeld,
  formatUnits,
  formatWhole,
} from '../../lib/format.js'
import { RESOURCE_LABELS } from '../../lib/labels.js'
import { Comptoir, SILHOUETTE_DE_RESSOURCE } from '../regie/Comptoir.js'
import { Rature } from '../regie/Rature.js'
import { useRature } from '../regie/useRature.js'

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

/**
 * Le débit horaire, **signé**.
 *
 * Le signe est de l'information, pas de la décoration : « 540/h » ne dit pas si la
 * ressource monte ou descend, et un débit nul se lit « 0/h » plutôt que « +0/h »,
 * qui promettrait une production inexistante.
 */
function formatRate(rate: number): string {
  if (rate === 0) return '0/h'
  return `${rate > 0 ? '+' : '−'}${formatWhole(Math.abs(rate))}/h`
}

/**
 * Une valeur suivie, raturée quand elle change.
 *
 * Un composant à part parce qu'un crochet ne s'appelle pas dans une boucle : chaque
 * valeur suivie a besoin de **sa** référence, et les rassembler dans le corps du
 * panneau ferait dépendre l'ordre des crochets du nombre de ressources.
 *
 * La comparaison porte sur la **chaîne formatée** et non sur le nombre : c'est ce que
 * le joueur voit changer, et c'est ce que la rature doit corriger. Un débit qui passe
 * de 20,4 à 20,6 sans changer d'affichage n'a rien corrigé.
 */
function RatureDeValeur({
  etiquette,
  valeur,
}: {
  readonly etiquette: string
  readonly valeur: string
}) {
  const { courante, ancienne } = useRature(valeur)
  return (
    <Rature
      etiquette={etiquette}
      courante={courante}
      ancienne={ancienne}
      /*
        Le `<dt>` de la liste porte déjà « Débit » et « Plafond » : le répéter dans le
        visuel ferait énoncer « Plafond plafond 5 000 ». La phrase explicite, elle,
        garde l'étiquette — c'est elle que SC-007 mesure.
      */
      montrerEtiquette={false}
    />
  )
}

export function ResourcePanel({ holdings, at }: ResourcePanelProps) {
  return (
    /*
      **Le comptoir est un bloc**, et son rang dans le document est fixé par
      FR-006. 001 rendait un fragment : les trois cartes se succédaient sans que
      rien ne les rassemble, donc sans que l'ordre des blocs soit vérifiable.
    */
    <div data-bloc="comptoir" className="comptoir">
      {Object.entries(holdings).map(([resourceId, holding]) => {
        const label = RESOURCE_LABELS[resourceId as ResourceId] ?? resourceId
        // La saturation **acquise** se lit sur `saturatedSince`, jamais sur
        // l'absence de `saturationAt` : celle-ci vaut aussi `null` pour une
        // ressource à taux nul, qui ne sature pas — elle stagne. Confondre les
        // deux ferait annoncer « la production se perd » là où il n'y a aucune
        // production.
        const since = holding.saturatedSince
        const perMille = fillPerMille(holding)
        const lostScale = lostInCaps(holding)

        return (
          /*
            **Le rendu passe par `Comptoir`, la dérivation ne change pas.**

            Les cinq grandeurs de 001 — dont trois n'apparaissent nulle part dans
            la maquette — restent publiées avec leurs crochets : trois parcours de
            bout en bout les lisent, et aucune exigence de 002 ne demande de les
            retirer. Elles sont rendues **dans** l'étiquette de papier, parce qu'un
            plafond et une perte sont des chiffres eux aussi (FR-003).

            Le `<h2>` de 001 disparaît : le nom de la ressource est déjà le nom
            accessible du bloc, et un titre de niveau 2 par ressource peuplait le
            plan du document de trois entrées qui n'ouvrent aucune section.
          */
          <Comptoir
            key={resourceId}
            ressourceId={resourceId as ResourceId}
            nom={label}
            silhouette={SILHOUETTE_DE_RESSOURCE[resourceId as ResourceId]}
            enfants={
              <dl>
                <dt>Détenu</dt>
                {/*
                **Un seul nœud pour un seul fait.** La quantité est la valeur que
                l'étiquette met en avant, et c'est ce `<dd>` qui la porte : la
                rendre une seconde fois en gros caractères ferait énoncer « 400,00 »
                deux fois à un lecteur d'écran. La prominence est affaire de CSS,
                pas de duplication.
              */}
                <dd data-chiffre="quantite" className="chiffre valeur">
                  {formatHeld(holding.amount)}
                </dd>

                {/*
                **Le débit horaire, que 001 n'affichait pas** — FR-010 l'exige, et
                FR-002 le range dans la famille tabulaire au pas `chiffre-xs`. Le
                dossier le laissait en corps 9,5 non tabulaire, sous tous les
                planchers, alors que c'est un chiffre.
              */}
                <dt>Débit</dt>
                {/*
                  **Raturé** (FR-026, FR-029a) : le débit change par saut, à l'achèvement
                  d'un chantier ou à l'entrée en déficit d'énergie. C'est précisément le
                  genre de changement qu'un joueur manque s'il regardait ailleurs — et
                  c'est ce que la rature lui rend.
                */}
                <dd data-chiffre="debit" data-resource={resourceId} className="chiffre debit">
                  <RatureDeValeur etiquette="débit" valeur={formatRate(holding.rate)} />
                </dd>

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
                  {/* Raturé aussi : un entrepôt posé le relève d'un coup (FR-029a). */}
                  <RatureDeValeur etiquette="plafond" valeur={formatUnits(holding.cap)} />
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

                {/*
                **Les deux moitiés d'US1/AC5.** Combien s'est perdu est plus bas ;
                depuis quand est ici. La seconde n'est pas dérivable de la
                première — `perdu ÷ taux` serait faux dès que le taux a changé
                depuis —, c'est donc l'instant que le domaine projette, et l'écran
                n'en fait qu'une durée.

                La durée en secondes est dans l'attribut, sa forme lisible dans le
                texte : le parcours a besoin du chiffre, le joueur de la phrase.
              */}
                <dt>Saturation</dt>
                {since === null ? (
                  <dd>
                    {holding.rate === 0
                      ? 'jamais — production nulle'
                      : `dans ${formatDuration((holding.saturationAt ?? at) - at)}`}
                  </dd>
                ) : (
                  <dd data-saturated-for={at - since} data-resource={resourceId}>
                    {`saturée depuis ${formatElapsed(at - since)} : la production se perd`}
                  </dd>
                )}

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
            }
          />
        )
      })}
    </div>
  )
}
