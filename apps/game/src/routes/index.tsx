import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './root.js'

/**
 * La racine mène à la planète.
 *
 * Une redirection plutôt qu'une page d'accueil : c'est là que le joueur veut
 * être, et un écran intermédiaire ne serait qu'un clic de plus avant le jeu.
 */
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/planet' })
  },
})
