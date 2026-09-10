import { createRoute, Link } from '@tanstack/react-router'
import { RulesContent } from '../features/rules/RulesContent.js'
import { DECLARED_CATALOGS, lastResolvedCatalogs } from '../lib/catalogs.js'
import { rootRoute } from './root.js'

/**
 * Les règles de calcul, exposées au joueur.
 *
 * Cette route n'est pas un accessoire de documentation : elle tient la promesse
 * faite à P4 — « a besoin de tout savoir » — et l'engagement du projet à n'avoir
 * **aucune formule cachée**. Une mécanique qu'on ne pourrait pas montrer ici serait
 * une mécanique mal conçue.
 *
 * Son contenu est **généré depuis le catalogue** (R15, US8) : une page écrite à la
 * main mentirait au premier rééquilibrage, et mentirait en silence.
 *
 * **Elle est lisible sans compte**, et c'est délibéré : exiger une session pour lire
 * les règles serait les cacher à moitié. La route ne passe donc pas par la porte de
 * session, contrairement à l'écran de planète.
 *
 * **Elle n'affiche aucune valeur propre à une planète** — ni quantité détenue, ni
 * chantier, ni production courante. C'est une page de *règles*, pas un tableau de
 * bord, et son sujet est ce qui vaut pour tous. C'est aussi ce qui la dispense de
 * l'avertissement de divergence de catalogue : elle publie le catalogue **qu'elle
 * embarque**, en le nommant, et n'a donc rien à confronter à celui du serveur.
 *
 * **Deux états depuis 003, et le second est le cas normal du visiteur.** Lisible
 * sans compte, la page n'appelle aucune route : hors session, elle ne connaît
 * pas la longueur du gong du serveur. Elle publie alors les durées en **gongs**
 * — le contenu déclaré du catalogue, pas un chiffre dérivé — et dit que la
 * longueur du serveur ne lui est pas connue, sans afficher aucune seconde
 * (FR-013). Dès qu'un instantané de planète a été reçu, elle publie les deux
 * colonnes.
 *
 * Le `GET /v1/config` qui la renseignerait toujours a été écarté : la longueur
 * voyage avec l'état qu'elle explique, et un point d'accès séparé pourrait être
 * appelé une fois puis démenti par un redémarrage (G7).
 */
export const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rules',
  component: RulesScreen,
})

function RulesScreen() {
  /*
    Lu au rendu et non mémorisé : la page est consultée entre deux allers-retours
    vers la planète, et une valeur figée au premier rendu afficherait des gongs
    seuls à un joueur qui vient précisément d'en recevoir la longueur.
  */
  const resolved = lastResolvedCatalogs()

  return (
    <>
      <h1>Règles du jeu</h1>

      <RulesContent declared={DECLARED_CATALOGS} resolved={resolved} />

      {/*
        Le chemin du retour, en clair. Une page de référence se consulte *pendant*
        une décision : y arriver sans pouvoir en repartir d'un geste ferait de la
        transparence un détour, et le joueur cesserait de la consulter.
      */}
      <p>
        <Link to="/planet">Retourner à ma planète</Link>
      </p>
    </>
  )
}
