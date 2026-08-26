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

/** Les unités affichées : `⌊grains ÷ 3600⌋`, la partie entière que le joueur voit. */
function toUnits(grains: number): number {
  return Math.floor(grains / GRAINS_PER_UNIT)
}

const NUMBER_FORMAT = new Intl.NumberFormat('fr-FR')

function formatUnits(grains: number): string {
  return NUMBER_FORMAT.format(toUnits(grains))
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
              <dd>{formatUnits(holding.amount)}</dd>

              <dt>Plafond</dt>
              <dd>{formatUnits(holding.cap)}</dd>

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
