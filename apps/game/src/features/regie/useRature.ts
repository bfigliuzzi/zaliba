import { useEffect, useRef } from 'react'

/**
 * La rature : **un état de client, jamais une donnée** (FR-026, FR-026a, FR-029, R13).
 *
 * FR-029 interdit toute donnée nouvelle persistée ou transmise pour porter
 * l'ancienne valeur. Le client est donc la seule source possible, et « ce que le
 * client affichait précédemment » est exactement ce qu'une référence retient.
 *
 * **Mise à jour dans un effet, jamais pendant le rendu.** Écrire une référence
 * pendant le rendu la ferait avancer aussi lors des rendus que React jette — en
 * mode strict, il en fait deux —, et l'ancienne valeur deviendrait la valeur
 * courante avant même d'avoir été montrée.
 *
 * ---
 *
 * **Aucune minuterie ne retire une rature** (FR-026a).
 *
 * Les deux seules sorties sont le **changement suivant de la même valeur** et le
 * **démontage de l'écran**. Le dossier de design suggérait « se retire après un
 * délai » ; c'est une lecture que la spécification a écartée, pour deux raisons qui
 * tiennent chacune seule :
 *
 * - une correction qui s'efface d'elle-même **se manque**. Le joueur qui regardait
 *   ailleurs pendant les quelques secondes d'affichage n'apprend jamais ce qui a
 *   bougé — et c'est précisément le joueur que la rature sert ;
 * - une disparition programmée est **un mouvement de plus** là où FR-005 n'en admet
 *   qu'un, la frappe de tampon.
 *
 * Il n'y a donc ni `setTimeout`, ni `setInterval`, ni durée dans ce fichier, et le
 * test l'éprouve en avançant l'horloge bien au-delà de toute durée plausible.
 */

export interface Rature<T> {
  readonly courante: T
  /** `null` tant que la valeur n'a pas changé sous les yeux du joueur. */
  readonly ancienne: T | null
}

/**
 * Retient la **dernière valeur différente** de celle affichée.
 *
 * La comparaison est stricte : ce crochet sert des nombres — un niveau, un débit,
 * un plafond —, qui changent **par saut**. FR-029a borne le suivi à ceux-là : une
 * quantité détenue progresse à la seconde, et une rature par seconde clignoterait au
 * lieu de corriger.
 */
export function useRature<T>(valeur: T): Rature<T> {
  /*
    Deux références et non une : `affichee` est ce que le rendu courant montre,
    `ancienne` est ce qu'il barre. Les confondre ferait disparaître la rature au
    rendu suivant — celui que la progression des compteurs provoque une seconde plus
    tard —, c'est-à-dire donnerait une minuterie déguisée en cadence de rendu.
  */
  const affichee = useRef<T>(valeur)
  const ancienne = useRef<T | null>(null)

  if (affichee.current !== valeur) {
    ancienne.current = affichee.current
    affichee.current = valeur
  }

  /*
    L'effet ne sert qu'à **ancrer** la valeur affichée après un rendu réellement
    commis. En mode strict, React rend deux fois : sans cet ancrage, la comparaison
    ci-dessus verrait la valeur changer une fois de trop au premier montage.
  */
  useEffect(() => {
    affichee.current = valeur
  }, [valeur])

  return { courante: valeur, ancienne: ancienne.current }
}
