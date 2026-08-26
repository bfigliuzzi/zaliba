import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import type { PlanetGateway } from '../features/auth/gateway.js'
import type { Session } from '../lib/session.js'

/**
 * La coquille de l'application : navigation, contenu principal, et rien de plus.
 *
 * Les points de repère — `nav`, `main` — ne sont pas décoratifs. Une
 * application d'une seule page change de contenu sans changer de document : un
 * lecteur d'écran n'a alors rien à annoncer, et l'utilisateur perd sa place à
 * chaque navigation. Les repères sont ce qui lui rend la structure (FR-061,
 * WCAG 2.1 AA).
 */

export interface RouterContext {
  /**
   * Le client de requêtes voyage par le contexte du routeur plutôt que par un
   * fournisseur monté au-dessus : c'est ce qui permet à un test de rendre
   * `RouterProvider` seul, avec son propre client, sans rejouer l'arbre de
   * `main.tsx`.
   */
  readonly queryClient: QueryClient
  /**
   * La session voyage par le contexte, comme le client de requêtes : c'est ce
   * qui permet à une route de se placer derrière la porte sans importer un
   * singleton, et à un test de rendre la même route avec la sienne.
   */
  readonly session: Session
  /**
   * L'accès au serveur, déclaré comme un port. C'est ce qui permet à un test de
   * rendre l'écran de planète avec une passerelle en dur, sans monter d'API.
   */
  readonly gateway: PlanetGateway
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFound,
})

function AppShell() {
  const { queryClient } = rootRoute.useRouteContext()

  return (
    <QueryClientProvider client={queryClient}>
      <nav aria-label="Navigation principale">
        <Link to="/planet">Ma planète</Link>
        <Link to="/rules">Règles du jeu</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </QueryClientProvider>
  )
}

/**
 * L'écran blanc est le pire des refus : il ne dit pas ce qui s'est passé et ne
 * propose rien. Un signet périmé ou un lien partagé doit annoncer l'absence, et
 * rendre le chemin du retour cliquable.
 */
function NotFound() {
  return (
    <>
      <h1>Page introuvable</h1>
      <p>Cette adresse ne mène nulle part. Elle a peut-être changé.</p>
      <Link to="/planet">Retourner à ma planète</Link>
    </>
  )
}
