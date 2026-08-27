import { createRoute, Link } from '@tanstack/react-router'
import { DEFAULT_CATALOGS } from '@zaliba/domain'
import { RulesContent } from '../features/rules/RulesContent.js'
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
 */
export const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rules',
  component: RulesScreen,
})

function RulesScreen() {
  return (
    <>
      <h1>Règles du jeu</h1>

      <RulesContent catalogs={DEFAULT_CATALOGS} />

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
