import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './root.js'

/**
 * Les règles de calcul, exposées au joueur.
 *
 * Cette route n'est pas un accessoire de documentation : elle tient la promesse
 * faite à P4 — « a besoin de tout savoir » — et l'engagement du projet à n'avoir
 * **aucune formule cachée**. Une mécanique qu'on ne pourrait pas montrer ici
 * serait une mécanique mal conçue.
 *
 * Son contenu est **généré depuis le catalogue** (R15, US8) : une page écrite à
 * la main mentirait au premier rééquilibrage, et mentirait en silence.
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
      <p>Les formules seront générées depuis le catalogue.</p>
    </>
  )
}
