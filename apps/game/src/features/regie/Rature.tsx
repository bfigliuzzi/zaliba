import type { ReactNode } from 'react'

/**
 * La rature — **le balisage exact du dossier de design, et pas un autre** (FR-026 à
 * FR-029, INV-R1 à INV-R3, R13).
 *
 * ---
 *
 * **C'est le point le plus facile à casser du système**, et le seul dont la casse
 * produit une valeur **fausse** plutôt qu'une gêne : mal balisée, une rature fait
 * énoncer « niveau 2 3 » à un lecteur d'écran. C'est pourquoi US5 existe séparément,
 * et pourquoi ce fichier est aussi bref que commenté.
 *
 * **Le piège, nommé.** `aria-label` sur un `<p>` ou un `<span>` sans rôle est
 * **ignoré** par les technologies d'assistance : la spécification ARIA l'interdit sur
 * les rôles `paragraph` et `generic`. Le texte rayé redevient alors du contenu
 * ordinaire, et le lecteur d'écran énonce les deux valeurs collées. Le balisage
 * fautif *a l'air correct* — c'est exactement ce qui le rend dangereux, et c'est le
 * piège dans lequel la première version du dossier est tombée.
 *
 * **Le contrat est donc :** le visuel **entièrement** `aria-hidden`, et une phrase
 * explicite en `.sr-only` à côté. `<del>`/`<ins>` doublés du même masquage seraient
 * admis ; rien d'autre ne l'est.
 *
 * **Le trait est un enfant absolu, jamais un `text-decoration`** : il doit dépasser
 * et pencher (FR-028), ce qu'une décoration de texte ne sait pas faire. Le `<i>` vide
 * est ce porteur — il ne porte aucun texte, et il vit dans un arbre masqué.
 */

export interface RatureProps {
  /**
   * L'étiquette de la valeur — « niveau », « débit », « plafond ».
   *
   * Elle est reprise **deux fois** : une fois dans la phrase explicite, capitalisée,
   * une fois dans le visuel. C'est ce qui rend la phrase intelligible seule : « 3,
   * anciennement 2 » ne dit pas *quoi*.
   */
  readonly etiquette: string
  readonly courante: ReactNode
  /** `null` quand la valeur n'a pas changé : **aucun** des deux nœuds n'est rendu. */
  readonly ancienne: ReactNode | null
  /**
   * Faut-il répéter l'étiquette **dans le visuel** ?
   *
   * Oui par défaut, comme le dossier le prescrit : « niveau ~~2~~ **3** ». Le mot
   * vit alors dans l'arbre masqué, donc il n'est pas lu deux fois.
   *
   * **Non quand le balisage alentour nomme déjà la valeur** — une liste de
   * définitions, par exemple, dont le `<dt>` porte « Plafond ». La répéter y ferait
   * énoncer « Plafond plafond 5 000 » : le `<dt>` est lu comme nom du terme, et
   * l'étiquette du visuel comme contenu. C'est le genre de duplication qu'on
   * n'entend qu'en écoutant, et qu'on ne voit jamais en relisant.
   *
   * La **phrase explicite**, elle, porte toujours l'étiquette : « 3, anciennement
   * 2 » ne dit pas *quoi*, et c'est elle que SC-007 mesure.
   */
  readonly montrerEtiquette?: boolean
}

/** La première lettre en capitale, pour ouvrir la phrase explicite. */
const capitaliser = (texte: string): string => texte.charAt(0).toUpperCase() + texte.slice(1)

export function Rature({ etiquette, courante, ancienne, montrerEtiquette = true }: RatureProps) {
  /*
    **Sans changement, pas de rature du tout** (US5-AC2). Ni le visuel rayé, ni la
    phrase explicite : une phrase d'ancienne valeur sur une valeur stable serait une
    information fausse, et la plus difficile à démentir — le joueur n'a aucun moyen
    de savoir que rien n'a bougé.

    Le texte est alors rendu **normalement**, donc lu normalement. Rien n'est masqué,
    parce qu'il n'y a rien à corriger.
  */
  if (ancienne === null) {
    return (
      <span data-rature="aucune">
        {montrerEtiquette ? `${etiquette} ` : ''}
        <b>{courante}</b>
      </span>
    )
  }

  return (
    <span data-rature="active">
      {/*
        La moitié **audible**. Elle porte l'information complète, dans une phrase
        que l'on peut lire à haute voix — c'est le critère de SC-007, et c'est ce que
        la recette du quickstart § 7 écoute réellement.
      */}
      <span className="sr-only">
        {`${capitaliser(etiquette)} ${String(courante)}, anciennement ${etiquette} ${String(ancienne)}.`}
      </span>

      {/*
        La moitié **visible**, entièrement masquée aux technologies d'assistance
        (INV-R1). « Entièrement » est le mot qui compte : masquer le seul texte rayé
        laisserait l'étiquette et la valeur courante être lues une seconde fois,
        après la phrase explicite.
      */}
      <span aria-hidden="true">
        {montrerEtiquette ? `${etiquette} ` : ''}
        <span className="rature">
          {ancienne}
          <i />
        </span>{' '}
        <b>{courante}</b>
      </span>
    </span>
  )
}
