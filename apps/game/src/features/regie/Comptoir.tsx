import type { ResourceId } from '@zaliba/catalogs'
import type { ReactNode } from 'react'
import { Glyphe, type Silhouette } from '../../design/Glyphe.js'
import { COPIE } from './copie.js'

/**
 * Un compteur de ressource : l'aplat, la silhouette, et **l'étiquette de papier**.
 *
 * ---
 *
 * **La règle non négociable du dossier de design est ici** (FR-003) : aucun
 * chiffre ne se pose sur un aplat de couleur de ressource. L'étiquette de papier
 * collée existe pour que les chiffres soient à **12,8:1 à toute taille**, là où un
 * aplat dépend de sa teinte — 3,61:1 sur la Camelote, et le Jus n'atteint jamais
 * le seuil du texte normal.
 *
 * Et c'est ce détail qui donne au passage la meilleure matière du système : le
 * papier collé de travers sur l'aplat est le geste que la Régie répète partout.
 *
 * **L'aplat porte la teinte *et* la silhouette.** Une teinte seule ne distingue
 * rien pour qui ne la voit pas (FR-012) ; la silhouette est le canal non
 * chromatique, et elle est masquée parce que le nom de la ressource est déjà le nom
 * accessible du bloc — la lire ferait une répétition.
 *
 * **Tout ce que le comptoir affiche passe par l'étiquette**, y compris les
 * grandeurs que ce composant ne connaît pas : `enfants` est rendu **dedans**. Les
 * laisser en dehors aurait respecté la lettre de FR-003 — la quantité est bien sur
 * du papier — en manquant son objet, puisque le plafond, le remplissage et la
 * perte sont des chiffres aussi.
 */

export interface ComptoirProps {
  readonly ressourceId: ResourceId
  /** Le nom lisible, qui est aussi le nom accessible du bloc. */
  readonly nom: string
  readonly silhouette: Silhouette
  /**
   * Les grandeurs de la ressource, rendues **dans** l'étiquette de papier.
   *
   * Le composant n'en connaît aucune, et c'est délibéré : il ne dupliquerait pas
   * la quantité sans la dupliquer aussi pour un lecteur d'écran, qui l'énoncerait
   * deux fois. La coquille porte le décor et la contrainte de FR-003 ; les faits
   * viennent d'ailleurs, chacun une seule fois.
   */
  readonly enfants?: ReactNode
}

export function Comptoir({ ressourceId, nom, silhouette, enfants }: ComptoirProps) {
  const idNom = `comptoir-${ressourceId}-nom`

  return (
    /*
      `aria-labelledby` plutôt qu'`aria-label` : le nom de la ressource est
      **visible**, et le dupliquer dans un attribut le ferait énoncer deux fois —
      une fois comme nom du groupe, une fois comme contenu. Le nom accessible
      calculé reste le même, donc les tests de 001 qui cherchent le groupe par son
      nom continuent de le trouver.
    */
    // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées, et c'est celui de 001. Une `<section>` étiquetée deviendrait un point de repère `region` — trois repères « Camelote », « Jus » et « Bave d'étoiles » encombreraient la navigation par repères ; et `<fieldset>` annonce un groupe de champs de saisie, il n'y en a aucun.
    <div
      role="group"
      aria-labelledby={idNom}
      data-ressource={ressourceId}
      className="carte-ressource"
    >
      <div data-aplat={ressourceId} className="aplat" aria-hidden="true">
        <Glyphe nom={silhouette} taille={2} />
      </div>

      <div data-etiquette="papier" className="etiquette">
        <p id={idNom} data-role-texte="intitule" className="nom-ressource">
          {nom}
        </p>
        {/*
          L'aparté de la Régie — « de quoi ? », « ne pas goûter ». Du décor, et
          FR-038 garantit qu'on peut jouer sans en lire une ligne : c'est ce qui
          l'autorise à rester en corps 9,5 quand le nom de la ressource, lui,
          remonte à 12.
        */}
        <p data-role-texte="decor" className="aparte">
          {COPIE.aparte[ressourceId]}
        </p>

        {enfants}
      </div>
    </div>
  )
}

/**
 * La silhouette de chaque ressource.
 *
 * Elle est ici et non dans `labels.ts` : c'est une correspondance vers le
 * vocabulaire **visuel** de R5, pas vers le vocabulaire du jeu, et les mêler
 * ferait de la table des libellés un fourre-tout.
 */
export const SILHOUETTE_DE_RESSOURCE: Readonly<Record<ResourceId, Silhouette>> = {
  camelote: 'camelote',
  jus: 'jus',
  'bave-etoiles': 'bave',
}
