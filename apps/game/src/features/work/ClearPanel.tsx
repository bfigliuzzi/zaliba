import type { CellView, ClearPreviewResult, ClearReveal } from '@zaliba/domain'
import { formatDuration, formatUnits } from '../../lib/format.js'
import {
  DEPOSIT_LABELS,
  describePosition,
  OBSTACLE_LABELS,
  RESOURCE_LABELS,
} from '../../lib/labels.js'

/**
 * Le panneau de déblaiement : l'obstacle, **le résultat**, le prix, la
 * confirmation.
 *
 * **Le résultat est ce qui distingue cette mécanique des trois autres**, et c'est
 * pourquoi il est le premier champ de l'aperçu. Une pose donne un bâtiment, une
 * amélioration un niveau, une démolition un remboursement — trois choses que le
 * joueur connaît d'avance. Un déblaiement laisse du terrain nu ou un gisement
 * nommé, et c'est cela seul qui décide si l'opération valait deux cents Camelote.
 * Le taire ferait du déblaiement un pari (FR-042, FR-043).
 *
 * **La cible vient du curseur de grille**, comme celle de l'amélioration. Le
 * joueur désigne une case obstruée en y posant le curseur — les mêmes flèches, la
 * même annonce (FR-058, SC-004). Le panneau ne connaît donc pas la grille : il
 * reçoit une vue de case, ou `null`. Une liste déroulante d'obstacles aurait été
 * plus simple à écrire et fausse à deux titres : elle ajouterait un modèle de
 * navigation à apprendre, et elle nommerait les cases par leur position sans que
 * le joueur puisse les voir.
 *
 * **FR-035 : la confirmation est postérieure à l'affichage.** Le bouton vient
 * après l'aperçu dans le document, et pas seulement à côté de lui.
 */

export interface ClearPanelProps {
  /** La case sous le curseur de grille, ou `null` avant tout déplacement. */
  readonly cell: CellView | null
  /** L'aperçu local, ou `null` tant qu'aucune case n'est désignée. */
  readonly preview: ClearPreviewResult | null
  /** Vrai pendant que la commande est en vol : le bouton ne se clique qu'une fois. */
  readonly pending: boolean
  readonly onConfirm: () => void
}

/**
 * Le résultat, en clair — le seul champ que le joueur ne peut pas deviner.
 *
 * Le vocabulaire est celui du jeu : « geyser de Jus », et non « gisement de Jus »
 * (document de conception § 1). Un mot générique laisserait croire à une catégorie
 * interchangeable, alors que la ressource décide quel extracteur poser ensuite.
 */
function describeReveal(reveals: ClearReveal): string {
  if (reveals === 'bare-ground') return 'terrain nu'
  return DEPOSIT_LABELS[reveals.depositOf] ?? `gisement de ${reveals.depositOf}`
}

/**
 * Le résultat en forme **relisable exactement**, pour l'attribut.
 *
 * Le texte est formaté pour être lu ; le relire à l'envers pour retrouver une
 * ressource serait fragile autant qu'inutile. Le parcours de bout en bout compare
 * ce que l'aperçu annonçait à ce que la grille porte après achèvement : il lui
 * faut la valeur, pas la phrase.
 */
function revealToken(reveals: ClearReveal): string {
  return reveals === 'bare-ground' ? 'bare-ground' : `deposit:${reveals.depositOf}`
}

export function ClearPanel({ cell, preview, pending, onConfirm }: ClearPanelProps) {
  const armed = preview !== null && preview.outcome === 'accepted'

  return (
    <div>
      <h2>Déblayer</h2>

      <ClearPreview cell={cell} preview={preview} />

      {/*
        Le bouton n'existe qu'une fois un obstacle désigné. Un bouton permanent
        serait un arrêt de tabulation qui n'apprend rien, et il compterait pourtant
        dans le parcours que SC-001 mesure.

        **Le libellé nomme l'action, en vol comme au repos.** Un « Lancement en
        cours… » générique donnerait à ce bouton et à ceux de la construction et de
        l'amélioration le même nom accessible au moment précis où le joueur a
        besoin de savoir lequel des trois il a engagé. C'est la leçon d'US2.
      */}
      {armed && (
        <button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending}>
          {pending ? 'Lancement du déblaiement…' : 'Lancer le déblaiement'}
        </button>
      )}
    </div>
  )
}

/**
 * L'aperçu, qui est **le même calcul que l'arbitrage du serveur** (R8).
 *
 * Son nom accessible est « Aperçu du déblaiement », distinct d'« Aperçu de la
 * construction », d'« Aperçu de l'amélioration » et de « Chantier ». La leçon vient
 * du parcours d'US2 : deux repères dont les noms se confondent sont indiscernables
 * pour un outil qui les cherche comme pour une personne qui les entend annoncés
 * l'un après l'autre. Des noms *différents* ne suffisent pas — il les faut
 * *distincts*.
 */
function ClearPreview({
  cell,
  preview,
}: {
  readonly cell: CellView | null
  readonly preview: ClearPreviewResult | null
}) {
  if (cell === null || preview === null) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées. Une `<section>` étiquetée deviendrait un point de repère `region`, et `<fieldset>` annonce un groupe de champs de saisie : il n'y en a aucun ici.
      <div role="group" aria-label="Aperçu du déblaiement">
        <p>Placez le curseur sur une case obstruée pour voir ce qu’un déblaiement révélerait.</p>
      </div>
    )
  }

  if (preview.outcome === 'refused') {
    return (
      // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
      <div role="group" aria-label="Aperçu du déblaiement">
        <p>{describeRefusal(preview.refusal, cell)}</p>
      </div>
    )
  }

  const { cost, duration, shortfall, secondsUntilAffordable, effect } = preview.preview

  return (
    // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
    <div role="group" aria-label="Aperçu du déblaiement">
      <dl>
        <dt>Case</dt>
        <dd>{describePosition(effect.cell)}</dd>

        <dt>Obstacle</dt>
        <dd>{OBSTACLE_LABELS[effect.obstacleId] ?? effect.obstacleId}</dd>

        {/*
          Le résultat **avant** le coût, et l'ordre n'est pas indifférent : c'est
          la seule grandeur que le joueur ne peut pas deviner, donc celle qui
          décide s'il lit la suite. Un aperçu qui ouvrirait sur le prix ferait
          renoncer avant d'avoir su ce qu'on achète.

          Le mot exact du jeu — « geyser de Jus » —, et la valeur relisable dans
          l'attribut : c'est elle que le parcours de bout en bout compare à ce que
          la grille porte après achèvement.
        */}
        <dt>Ce qui apparaîtra</dt>
        <dd data-reveals={revealToken(effect.reveals)}>{describeReveal(effect.reveals)}</dd>

        <dt>Coût</dt>
        <dd>
          {cost
            .map((amount) => `${formatUnits(amount.grains)} ${RESOURCE_LABELS[amount.resourceId]}`)
            .join(', ')}
        </dd>

        <dt>Durée</dt>
        <dd>{formatDuration(duration)}</dd>

        {/*
          **Aucun effet énergétique n'est annoncé, et il n'y en a aucun** : un
          déblaiement ne pose ni ne retire de bâtiment, donc ni la production ni la
          consommation ne bougent. Publier un champ toujours égal au rapport
          courant ferait chercher au joueur un effet qui n'existe pas.
        */}

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
 * Le motif est **nommé**, et non résumé en « rien à prévisualiser » : sur une case
 * libre, le joueur doit entendre qu'il n'y a pas d'obstacle, sans quoi il en
 * chercherait un invisible. `placement-out-of-grid` n'a pas de phrase propre — le
 * curseur ne sort pas de la grille, donc ce motif ne peut pas venir de lui.
 */
function describeRefusal(
  refusal: Extract<ClearPreviewResult, { outcome: 'refused' }>['refusal'],
  cell: CellView,
): string {
  switch (refusal.code) {
    case 'cell-not-obstructed':
      return cell.state === 'occupied'
        ? `${describePosition(cell)} est occupée par un bâtiment : il n’y a pas d’obstacle à déblayer.`
        : `${describePosition(cell)} n’est pas obstruée : il n’y a rien à déblayer.`
    case 'work-in-progress':
      return 'Un chantier est déjà en cours sur cette planète : rien à prévisualiser.'
    default:
      return 'Ce déblaiement est refusé : rien à prévisualiser.'
  }
}
