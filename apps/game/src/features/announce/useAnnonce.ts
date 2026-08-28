import type { ResourceId } from '@zaliba/catalogs'
import type { HoldingView, Instant, WorkView } from '@zaliba/domain'
import { useCallback, useRef, useState } from 'react'

/**
 * L'annonce **unique** de l'écran (FR-022, R11, INV-N1 à INV-N4).
 *
 * **L'écran en comptait deux, et c'est un défaut que la tranche corrige.**
 * `GridLiveRegion` portait `role="status"`, et `BuildPanel` en portait un second.
 * Deux régions polies sur une même page se disputent l'ordre de restitution : le
 * joueur entend l'une des deux, sans savoir laquelle.
 *
 * **Elle est écrite par des événements, jamais par un compteur** (INV-N2). Les
 * quantités changent à la seconde ; les annoncer noierait tout le reste, et rendrait
 * la page inutilisable précisément pour ceux qu'elle doit servir. Aucune des sept
 * origines ne correspond à la progression d'un compteur — et le test le vérifie
 * plutôt que de le supposer.
 *
 * **Les régions assertives ne sont pas concernées** : `RefusalNotice` garde son
 * `role="alert"`, qui est d'une autre urgence. C'est l'exception que FR-022 nomme.
 */

export const ORIGINES_ANNONCE = [
  'entree-grille',
  'curseur',
  'pose-acceptee',
  'pose-refusee',
  'chantier-acheve',
  'stockage-sature',
  'releve',
] as const

export type OrigineAnnonce = (typeof ORIGINES_ANNONCE)[number]

export interface Annonce {
  readonly texte: string
  readonly origine: OrigineAnnonce
  /**
   * Le **jeton d'unicité** (INV-N3a).
   *
   * Il n'est pas dans le texte : il compte les écritures, et le composant s'en sert
   * pour rendre deux énoncés successifs distincts **sans ajouter un mot**. Une
   * région `aria-live` ne réénonce pas un contenu identique, et l'état courant peut
   * ne pas bouger d'une demande à l'autre — une ressource saturée, un débit nul,
   * aucun chantier. Le joueur qui redemande n'entendrait alors **rien**, sans
   * distinguer le silence d'une panne.
   */
  readonly jeton: number
}

/**
 * L'état extrapolé, réduit à **ce dont les deux transitions ont besoin**.
 *
 * Recevoir l'état entier aurait fait de ce crochet un observateur de tout, alors
 * qu'il n'observe que deux choses. Et le réduire ici rend visible ce qu'il lit :
 * `work`, et l'instant d'entrée en saturation de chaque ressource.
 */
export interface EtatObserve {
  readonly work: WorkView | null
  readonly holdings: Readonly<Record<ResourceId, Pick<HoldingView, 'saturatedSince'>>>
}

export interface Transition {
  readonly origine: Extract<OrigineAnnonce, 'chantier-acheve' | 'stockage-sature'>
  /** La ressource concernée, pour une saturation. */
  readonly resourceId?: ResourceId
  /** Le chantier qui vient de s'achever, pour le nommer. */
  readonly acheve?: WorkView
}

/**
 * Les **transitions** de l'état extrapolé (R11, INV-N4).
 *
 * « Chantier achevé » et « stockage saturé » ne sont annoncés par rien en 001 : ce
 * sont des transitions, non des états. Elles se détectent par **comparaison avec
 * l'état précédent**, jamais par une échéance d'horloge lue directement — c'est
 * INV-N4, et le motif est que l'horloge du client n'est jamais une source de
 * vérité : comparer deux projections successives ne demande pas de savoir *quand*,
 * seulement *que* quelque chose a changé.
 *
 * Fonction pure, donc éprouvable sans DOM ni minuterie.
 */
export function transitionsEntre(
  precedent: EtatObserve | null,
  courant: EtatObserve,
): readonly Transition[] {
  if (precedent === null) return []

  const trouvees: Transition[] = []

  // `work` passe de non nul à nul : le chantier s'est achevé.
  if (precedent.work !== null && courant.work === null) {
    trouvees.push({ origine: 'chantier-acheve', acheve: precedent.work })
  }

  // `saturatedSince` passe de nul à un instant : la ressource vient de saturer.
  for (const [id, holding] of Object.entries(courant.holdings) as [
    ResourceId,
    { readonly saturatedSince: Instant | null },
  ][]) {
    const avant = precedent.holdings[id]?.saturatedSince ?? null
    if (avant === null && holding.saturatedSince !== null) {
      trouvees.push({ origine: 'stockage-sature', resourceId: id })
    }
  }

  return trouvees
}

export interface Annonceur {
  /** L'annonce courante, ou `null` avant tout événement. */
  readonly annonce: Annonce | null
  /** Écrit l'annonce. Le jeton s'incrémente **à chaque appel**, texte identique compris. */
  annoncer(origine: OrigineAnnonce, texte: string): void
  /**
   * Observe l'état extrapolé et écrit l'annonce si une transition a eu lieu.
   *
   * Rend les transitions détectées, pour que l'appelant les mette en mots : ce
   * crochet ne connaît ni le vocabulaire du jeu ni les libellés, et lui faire
   * fabriquer une phrase en ferait un second endroit où le jeu se nomme.
   */
  observer(courant: EtatObserve): readonly Transition[]
}

export function useAnnonce(): Annonceur {
  const [annonce, setAnnonce] = useState<Annonce | null>(null)
  const compteur = useRef(0)
  const precedent = useRef<EtatObserve | null>(null)

  const annoncer = useCallback((origine: OrigineAnnonce, texte: string) => {
    compteur.current += 1
    setAnnonce({ texte, origine, jeton: compteur.current })
  }, [])

  const observer = useCallback((courant: EtatObserve): readonly Transition[] => {
    const trouvees = transitionsEntre(precedent.current, courant)
    /*
      La référence est mise à jour **dans tous les cas**, y compris quand rien n'a
      changé : ne l'avancer qu'en cas de transition ferait comparer l'état courant à
      un état de plus en plus ancien, et une saturation résorbée puis revenue ne
      serait plus détectée.
    */
    precedent.current = courant
    return trouvees
  }, [])

  return { annonce, annoncer, observer }
}
