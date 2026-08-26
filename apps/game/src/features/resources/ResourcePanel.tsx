import type { ResourceId } from '@zaliba/catalogs'
import { GRAINS_PER_UNIT, type HoldingView, type Instant } from '@zaliba/domain'

/**
 * Les compteurs de ressources.
 *
 * Quatre grandeurs par ressource, et aucune n'est décorative :
 *
 * - la **quantité** détenue ;
 * - le **plafond**, sans lequel la saturation est une surprise ;
 * - le **temps restant avant saturation** au rythme courant (FR-027), la seule
 *   information qui dise *quand* agir ;
 * - la **quantité perdue cumulée** (FR-026), qui dit combien a déjà coûté le
 *   fait de ne pas avoir agi. C'est elle qui rend un entrepôt désirable pour une
 *   raison chiffrée plutôt que par intuition.
 *
 * **Pas de région annoncée en continu.** Les compteurs bougent à chaque image ;
 * un `aria-live` les réciterait sans fin et rendrait la page inutilisable au
 * lecteur d'écran. Les valeurs sont lisibles à la demande, ce qui est ce qu'on
 * fait d'un tableau de bord.
 */

const RESOURCE_LABELS: Readonly<Record<string, string>> = {
  camelote: 'Camelote',
  jus: 'Jus',
  'bave-etoiles': 'Bave d’étoiles',
}

export interface ResourcePanelProps {
  readonly holdings: Readonly<Record<ResourceId, HoldingView>>
  readonly at: Instant
}

/**
 * La quantité détenue, **au centième d'unité**.
 *
 * Le critère 3 d'US1 exige une progression *continue*. En unités entières, la
 * Camelote change une fois toutes les trois minutes à vingt unités par heure et
 * la Bave d'étoiles toutes les douze : rien ne bouge sous les yeux du joueur.
 * Deux décimales font changer la seconde environ toutes les 1,8 s.
 *
 * **R1 n'est pas touché** : le grain reste l'unité canonique, et le serveur
 * comme le client comptent toujours en entiers. Ce qui augmente ici est la
 * *résolution d'affichage*, pas la précision du modèle.
 *
 * La troncature va vers le bas, comme partout ailleurs. Arrondir au-dessus
 * annoncerait une ressource qu'on n'a pas — et ferait refuser une commande que
 * l'écran venait de présenter comme payable.
 */
const HELD_FORMAT = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatHeld(grains: number): string {
  const hundredths = Math.floor((grains * 100) / GRAINS_PER_UNIT)
  return HELD_FORMAT.format(hundredths / 100)
}

/**
 * Les grandeurs qui ne bougent pas, en unités entières.
 *
 * Le plafond est constant et la perte se compte en milliers : y mettre des
 * décimales n'ajouterait que du bruit autour du seul chiffre qui doit attirer
 * l'œil.
 */
const WHOLE_FORMAT = new Intl.NumberFormat('fr-FR')

function formatUnits(grains: number): string {
  return WHOLE_FORMAT.format(Math.floor(grains / GRAINS_PER_UNIT))
}

/**
 * Une durée en clair.
 *
 * Arrondie à l'unité **au-dessus** : annoncer « dans 0 heure » quand il reste
 * cinquante minutes serait faux dans le sens qui coûte cher.
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3_600) return `${Math.ceil(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.ceil(seconds / 3_600)} h`
  return `${Math.ceil(seconds / 86_400)} j`
}

export function ResourcePanel({ holdings, at }: ResourcePanelProps) {
  return (
    <>
      {Object.entries(holdings).map(([resourceId, holding]) => {
        const label = RESOURCE_LABELS[resourceId] ?? resourceId
        const saturated = holding.saturationAt === null

        return (
          // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste, et aucun élément natif ne convient. Une `<section>` étiquetée devient un **point de repère** `region` — trois repères nommés « Camelote », « Jus » et « Bave d'étoiles » encombreraient la navigation par repères pour ce qui n'est qu'un ensemble de valeurs liées. Et `<fieldset>`, que le lint suggère, annonce un groupe de champs de saisie : il n'y en a aucun ici.
          <div key={resourceId} role="group" aria-label={label}>
            <h2>{label}</h2>
            <dl>
              <dt>Détenu</dt>
              <dd>{formatHeld(holding.amount)}</dd>

              <dt>Plafond</dt>
              {/*
                Le chiffre **en grains** dans l'attribut, sa forme lisible dans
                le texte. Le second est formaté pour être lu — séparateurs de
                milliers compris — et le relire à l'envers pour retrouver un
                nombre serait fragile autant qu'inutile. Le parcours d'US3
                compare deux plafonds pour établir que le déficit d'énergie ne
                les dégrade pas (FR-023b) : il lui faut le chiffre.
              */}
              <dd data-cap={holding.cap} data-resource={resourceId}>
                {formatUnits(holding.cap)}
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
              <dd>{formatUnits(holding.lost)}</dd>
            </dl>
          </div>
        )
      })}
    </>
  )
}
