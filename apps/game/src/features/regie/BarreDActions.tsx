import { COPIE } from './copie.js'

/**
 * Les commandes de pose, **visibles** (FR-020, FR-025, FR-031).
 *
 * 001 avait le clavier — `R` pour pivoter, `Entrée` pour poser — et aucun bouton ;
 * il n'avait aucune annulation du tout. Un joueur au pointeur ne pouvait donc ni
 * pivoter ni annuler, et un joueur au clavier devait choisir un autre type de
 * bâtiment pour se défaire d'une pose armée par erreur — c'est-à-dire apprendre un
 * détour au lieu d'une commande.
 *
 * **Les trois commandes, aux deux entrées.** Les mêmes rappels servent le clavier
 * et le pointeur : ce n'est pas une économie de code, c'est ce qui rend SC-006 vrai
 * *par construction* plutôt que par une seconde implémentation à maintenir — la
 * moitié qu'on oublie d'éprouver étant toujours celle du clavier.
 *
 * **Désactivé plutôt que masqué.** Sans pose armée, pivoter et annuler n'ont rien à
 * faire. Un bouton qui disparaît fait sauter la mise en page et déplace les autres
 * sous le doigt du joueur au moment précis où il visait ; désactivé, il garde sa
 * place. Et `disabled` plutôt qu'`aria-disabled` : la commande n'a réellement aucun
 * effet à produire, et un bouton que la tabulation atteint pour ne rien faire est
 * une commande sans effet — ce que FR-025 refuse.
 *
 * **Le bouton « Réclamer (sans espoir) » de la maquette large est supprimé.** La
 * fiction de la Régie vit dans les textes et le décor, jamais dans une commande qui
 * ne fait rien.
 */

export interface BarreDActionsProps {
  /** Vrai quand un type de bâtiment est choisi : pivoter et annuler ont alors un objet. */
  readonly poseArmee: boolean
  /**
   * Vrai tant qu'une commande de pose est en vol.
   *
   * Le libellé change **et** `aria-busy` est posé : un bouton qui reste identique
   * pendant qu'une commande voyage laisse le joueur cliquer deux fois, et la planète
   * n'accepte qu'un chantier.
   */
  readonly enVol?: boolean
  readonly onPoser: () => void
  readonly onPivoter: () => void
  readonly onAnnuler: () => void
  /** Le relevé rejoint la barre en US4 ; absent, il n'est pas rendu. */
  readonly onReleve?: () => void
}

export function BarreDActions({
  poseArmee,
  enVol = false,
  onPoser,
  onPivoter,
  onAnnuler,
  onReleve,
}: BarreDActionsProps) {
  return (
    <div data-bloc="commandes-pose" className="barre-actions">
      {/*
        `JE POSE ÇA` reste actif même sans pose armée : c'est la commande
        principale de l'écran, et la désactiver ferait chercher au joueur *pourquoi*
        plutôt que *quoi poser*. Le refus, s'il y en a un, est énoncé — c'est
        précisément ce qu'US3 ajoute.
      */}
      <button
        type="button"
        className="commande commande--poser"
        onClick={onPoser}
        disabled={enVol}
        aria-busy={enVol}
      >
        {enVol ? COPIE.commandes.poserEnVol : COPIE.commandes.poser}
      </button>

      <button type="button" className="commande" onClick={onPivoter} disabled={!poseArmee}>
        {COPIE.commandes.pivoter}
      </button>

      <button type="button" className="commande" onClick={onAnnuler} disabled={!poseArmee}>
        {COPIE.commandes.annuler}
      </button>

      {onReleve !== undefined && (
        <button type="button" className="commande commande--releve" onClick={onReleve}>
          {COPIE.commandes.releve}
        </button>
      )}
    </div>
  )
}
