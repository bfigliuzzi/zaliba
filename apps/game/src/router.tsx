import type { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import type { PlanetGateway } from './features/auth/gateway.js'
import type { Session } from './lib/session.js'
import { indexRoute } from './routes/index.js'
import { planetRoute } from './routes/planet.js'
import { rootRoute } from './routes/root.js'
import { rulesRoute } from './routes/rules.js'

/**
 * L'arbre de routes de 001 : la planète, et les règles.
 *
 * `createAppRouter` prend son historique en argument au lieu de l'inférer de
 * l'environnement. Un routeur qui lirait l'URL du navigateur partagerait un
 * état global entre les cas de test, et l'ordre d'exécution deviendrait
 * significatif — c'est la même raison qui interdit à une fonction de domaine
 * d'appeler l'horloge.
 */

const routeTree = rootRoute.addChildren([indexRoute, planetRoute, rulesRoute])

export interface AppRouterOptions {
  readonly queryClient: QueryClient
  readonly session: Session
  readonly gateway: PlanetGateway
  /** Absent en production : le routeur emploie alors l'historique du navigateur. */
  readonly history?: RouterHistory
}

export function createAppRouter(options: AppRouterOptions) {
  return createRouter({
    routeTree,
    context: {
      queryClient: options.queryClient,
      session: options.session,
      gateway: options.gateway,
    },
    ...(options.history === undefined ? {} : { history: options.history }),
  })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
