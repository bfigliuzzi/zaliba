import { avecJeton } from '../announce/releve.js'
import type { Annonce } from '../announce/useAnnonce.js'

/**
 * **La** région d'annonce de l'écran (FR-022, INV-N1).
 *
 * `role="status"` — donc `aria-live="polite"` — et non `alert` : le déplacement du
 * curseur n'est pas une urgence, et l'annoncer en assertif interromprait le lecteur
 * d'écran à chaque flèche, ce qui rendrait la grille inutilisable précisément pour
 * ceux qu'elle doit servir. Les refus de commande, eux, sont assertifs et ont leur
 * propre région — c'est l'exception que FR-022 nomme.
 *
 * **Montée en permanence, et vide au départ.** Un conteneur créé au moment de
 * l'annonce n'est pas lu de façon fiable : les lecteurs d'écran n'observent que les
 * régions live déjà présentes dans le document. C'est l'inverse du choix fait pour
 * les alertes, et pour la raison inverse.
 *
 * ---
 *
 * **Ce que 002 change : elle n'est plus alimentée par le curseur, mais par les
 * événements.**
 *
 * 001 lui passait l'annonce de placement, calculée à chaque rendu. L'écran se
 * rafraîchit à la seconde pour animer ses compteurs : la région portait donc un
 * texte dès le premier rendu, sans qu'aucun événement n'ait eu lieu, et un joueur qui
 * ouvre l'écran s'entendait annoncer une case qu'il n'avait pas visitée.
 *
 * Elle reçoit désormais l'**annonce** — un texte *et* son origine —, et les sept
 * origines sont toutes des événements (INV-N2). La progression des compteurs n'en
 * est pas une.
 *
 * **Le jeton d'unicité n'est appliqué qu'au relevé** (INV-N3a, FR-023a), et c'est une
 * correction : la première rédaction l'appliquait à **toutes** les origines.
 *
 * FR-023a porte sur *le relevé* — « le relevé MUST être énoncé à chaque demande, y
 * compris lorsque son texte est identique au précédent ». Rien n'exige que les six
 * autres origines réénoncent un contenu inchangé, et **tout exige le contraire** : un
 * carré de quatre qui pivote ne change ni son orientation perçue ni son verdict de
 * placement, et le parcours de 001 vérifie qu'il « n'annonce rien comme changé ». Le
 * jeton faisait de cette rotation une réénonciation silencieuse — même texte, un
 * caractère invisible de plus —, c'est-à-dire un lecteur d'écran qui répète quand rien
 * n'a bougé. C'est exactement le défaut que `reduceCursor` évite en rendant son état
 * à la référence près.
 *
 * Le jeton est appliqué **ici** et non dans `releve.ts` : c'est le dernier moment
 * avant le rendu, et le seul endroit où un caractère invisible n'a aucune chance de se
 * retrouver dans une comparaison de texte ailleurs dans le code.
 */

export interface GridLiveRegionProps {
  /** `null` tant qu'aucun événement n'a eu lieu — donc au premier rendu. */
  readonly annonce: Annonce | null
}

export function GridLiveRegion({ annonce }: GridLiveRegionProps) {
  return (
    /*
      `div role="status"` et non `<output>` : ce dernier porte bien le rôle, mais il
      est destiné au résultat d'un calcul déclenché par une saisie de formulaire. La
      position d'un curseur n'en est pas un, et l'employer ici tromperait sur la
      nature du contenu.
    */
    <div role="status" aria-live="polite" aria-atomic="true" data-origine={annonce?.origine}>
      {annonce === null
        ? ''
        : annonce.origine === 'releve'
          ? avecJeton(annonce.texte, annonce.jeton)
          : annonce.texte}
    </div>
  )
}
