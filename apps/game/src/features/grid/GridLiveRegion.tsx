import type { Catalogs } from '@zaliba/domain'
import { announcePlacement, type PlacementAnnouncement } from './announce.js'

/**
 * La région d'annonce du curseur (FR-059).
 *
 * `role="status"` — donc `aria-live="polite"` — et non `alert` : le déplacement
 * du curseur n'est pas une urgence, et l'annoncer en assertif interromprait le
 * lecteur d'écran à chaque flèche, ce qui rendrait la grille inutilisable
 * précisément pour ceux qu'elle doit servir. Les refus, eux, sont assertifs, et
 * ils ont leur propre région.
 *
 * **La région est montée en permanence, et vide au départ.** Un conteneur créé au
 * moment de l'annonce n'est pas lu de façon fiable : les lecteurs d'écran
 * n'observent que les régions live déjà présentes dans le document. C'est
 * l'inverse du choix fait pour les alertes, et pour la raison inverse.
 *
 * Le composant est **mince par construction** : la phrase est calculée par une
 * fonction pure, éprouvée sans DOM. Il ne reste ici que le placement du texte,
 * qui n'a rien à éprouver.
 */

export interface GridLiveRegionProps {
  /** `null` tant que le curseur n'a rien à dire — au premier rendu. */
  readonly announcement: PlacementAnnouncement | null
  readonly catalogs: Catalogs
}

export function GridLiveRegion({ announcement, catalogs }: GridLiveRegionProps) {
  return (
    /*
      `div role="status"` et non `<output>` : ce dernier porte bien le rôle, mais
      il est destiné au résultat d'un calcul déclenché par une saisie de
      formulaire. La position d'un curseur n'en est pas un, et l'employer ici
      tromperait sur la nature du contenu.
    */
    <div role="status" aria-live="polite" aria-atomic="true">
      {announcement === null ? '' : announcePlacement(announcement, catalogs)}
    </div>
  )
}
