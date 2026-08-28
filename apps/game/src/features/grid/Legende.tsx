import { Glyphe, type Silhouette, type Trait } from '../../design/Glyphe.js'
import { COPIE } from '../regie/copie.js'
import type { EtatDeCase } from './appearance.js'

/**
 * La légende des silhouettes — **la clé, sans laquelle la grille est illisible**.
 *
 * Le dossier de design est catégorique : « la légende est indispensable depuis
 * qu'on a supprimé les hachures : tout tient à la silhouette, donc il faut donner
 * la clé ». SC-003 repose entièrement dessus — une personne extérieure au projet
 * doit nommer les douze états en niveaux de gris, **avec la seule légende sous les
 * yeux**.
 *
 * **Douze entrées, et le compte n'est pas écrit en dur.** Le test compare la
 * longueur de cette table à la taille de l'union `EtatDeCase` : un treizième état
 * ne peut donc pas arriver sans sa clé, parce que le type le dirait et que la
 * porte échouerait. Un nombre littéral aurait laissé passer.
 *
 * **La silhouette est rendue par `Glyphe`, jamais capturée.** Une image
 * divergerait du dessin au premier ajustement, et la légende enseignerait alors
 * une clé fausse — le défaut le plus coûteux possible sur un écran dont toute la
 * lisibilité repose sur elle.
 *
 * **Quatre états ne portent aucune silhouette** — libre, productif, stérile,
 * bâtiment posé. Ce n'est pas un oubli : le vocabulaire de R5 ne compte que sept
 * formes, et un niveau de bâtiment n'en est pas une (FR-012 amendé). Leur clé est
 * ailleurs, et la légende doit la **montrer** plutôt que la taire : un repère
 * dessiné à la place, qui dit ce qui les identifie.
 */

export interface EntreeDeLegende {
  readonly etat: EtatDeCase
  readonly libelle: string
  /** `null` pour les quatre états dont la clé n'est pas une silhouette centrale. */
  readonly silhouette: Silhouette | null
  readonly trait?: Trait
  /** La marque d'angle, quand c'est elle qui distingue l'état. */
  readonly marque?: { readonly silhouette: Silhouette; readonly trait: Trait }
  /**
   * Ce qui identifie l'état quand aucune forme ne le fait : le cadre d'emprise, ou
   * son absence. Rendu comme un repère, pour que la clé soit **visible**.
   */
  readonly repere?: 'vide' | 'emprise'
}

/**
 * Les douze entrées, dans l'ordre de l'union.
 *
 * Les libellés emploient le **vocabulaire du jeu** (FR-040) : « veine »,
 * « geyser », « récif » sont les mots du document de conception, et la Régie ajoute
 * un registre lexical sans en remplacer aucun. Ceux de la maquette — « Relief : ça
 * monte », « Case libre (pour l'instant) » — étaient approximatifs et ne couvraient
 * que cinq états sur douze.
 */
export const LEGENDE: readonly EntreeDeLegende[] = [
  { etat: 'libre', libelle: 'Case libre', silhouette: null, repere: 'vide' },
  {
    etat: 'gisement-camelote',
    libelle: 'Veine de Camelote',
    silhouette: 'camelote',
    trait: 'plein',
  },
  { etat: 'gisement-jus', libelle: 'Geyser de Jus', silhouette: 'jus', trait: 'plein' },
  { etat: 'gisement-bave', libelle: 'Récif de Bave d’étoiles', silhouette: 'bave', trait: 'plein' },
  {
    etat: 'gisement-productif',
    libelle: 'Gisement exploité par le bâtiment posé dessus',
    silhouette: null,
    repere: 'emprise',
    marque: { silhouette: 'camelote', trait: 'plein' },
  },
  {
    etat: 'gisement-sterile',
    libelle: 'Gisement recouvert par un bâtiment qui ne l’exploite pas',
    silhouette: null,
    repere: 'emprise',
    marque: { silhouette: 'camelote', trait: 'evide' },
  },
  {
    etat: 'obstacle-terrain-nu',
    libelle: 'Obstacle — le déblayer libère du terrain nu',
    silhouette: 'obstacle',
    trait: 'plein',
  },
  {
    etat: 'obstacle-gisement',
    libelle: 'Obstacle — le déblayer libère un gisement',
    silhouette: 'obstacle',
    trait: 'plein',
    marque: { silhouette: 'camelote', trait: 'plein' },
  },
  {
    etat: 'batiment',
    libelle: 'Bâtiment posé, avec son niveau',
    silhouette: null,
    repere: 'emprise',
  },
  { etat: 'chantier', libelle: 'Chantier en cours', silhouette: 'chantier' },
  { etat: 'visee-valide', libelle: 'Case visée, pose acceptée', silhouette: 'visee' },
  { etat: 'visee-refusee', libelle: 'Case visée, pose refusée', silhouette: 'refus' },
]

/** Le repère des états sans silhouette : le cadre d'emprise, ou son absence. */
function Repere({ nature }: { readonly nature: 'vide' | 'emprise' }) {
  return (
    <span data-repere={nature} className={`repere repere--${nature}`} aria-hidden="true">
      {nature === 'emprise' ? '2' : ''}
    </span>
  )
}

export function Legende() {
  return (
    <div data-bloc="legende" className="legende plaque cadre-main">
      <p data-role-texte="intitule" className="intitule">
        {COPIE.legendeIntitule}
      </p>

      {/*
        Une liste de définitions : chaque silhouette **définit** un libellé. Et
        aucun lien, aucun bouton — la légende n'a aucun effet à produire, et
        FR-025 interdit la commande sans effet.
      */}
      <dl className="legende-entrees">
        {LEGENDE.map((entree) => (
          <div key={entree.etat} data-legende={entree.etat} className="legende-entree">
            <dt className="legende-repere">
              {entree.silhouette === null ? (
                <Repere nature={entree.repere ?? 'vide'} />
              ) : (
                <span className="silhouette" aria-hidden="true">
                  <Glyphe
                    nom={entree.silhouette}
                    taille={1.6}
                    {...(entree.trait === undefined ? {} : { trait: entree.trait })}
                  />
                </span>
              )}

              {entree.marque !== undefined && (
                <span
                  className="marque"
                  data-marque={entree.marque.silhouette}
                  data-trait={entree.marque.trait}
                  aria-hidden="true"
                >
                  <Glyphe nom={entree.marque.silhouette} taille={0.8} trait={entree.marque.trait} />
                </span>
              )}
            </dt>
            <dd className="legende-libelle">{entree.libelle}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
