import { createRoute } from '@tanstack/react-router'
import { SessionGate } from '../features/auth/SessionGate.js'
import { rootRoute } from './root.js'

/**
 * La planète — l'écran où le joueur passe son temps.
 *
 * Placée **derrière la porte de session** : sans session, rien de protégé n'est
 * monté, donc aucune requête ne part. Empêcher le montage plutôt qu'annuler
 * après coup — un contenu monté puis débranché a déjà lancé ses requêtes, qui
 * reviennent en 401 et font voir des erreurs à un joueur simplement déconnecté.
 *
 * Squelette : la grille, les compteurs extrapolés et le chantier en cours
 * arrivent avec US1 et US2.
 */
export const planetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/planet',
  component: PlanetRoute,
})

function PlanetRoute() {
  const { session } = rootRoute.useRouteContext()

  return (
    <SessionGate session={session}>
      <PlanetScreen />
    </SessionGate>
  )
}

function PlanetScreen() {
  return (
    <>
      <h1>Ma planète</h1>
      <p>Votre colonie n’est pas encore fondée.</p>
    </>
  )
}
