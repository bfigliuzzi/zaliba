import { QueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createGameSession } from './lib/supabase.js'
import { createAppRouter } from './router.js'

/**
 * Le point de montage du client.
 *
 * Il ne fait que trois choses — un client de requêtes, un routeur, une racine —
 * et c'est délibéré : tout ce qui vit ici échappe aux tests, puisqu'il n'y a
 * pas de document à monter dans un cas unitaire. Ce qui doit être éprouvé vit
 * dans `router.tsx` et les routes, qu'un test rend avec son propre historique.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Le serveur est **le seul** arbitre : une donnée de jeu se redemande,
      // elle ne se devine pas. La fraîcheur nulle évite d'afficher un état
      // périmé au retour d'onglet, moment où le temps a précisément passé.
      staleTime: 0,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

const router = createAppRouter({ queryClient, session: createGameSession() })

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Le point de montage #root est absent du document.')
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
