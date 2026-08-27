import { QueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createPlanetGateway } from './lib/planetGateway.js'
import './styles.css'
import { createGameSession } from './lib/supabase.js'
import { createAppRouter } from './router.js'

/**
 * Le point de montage du client.
 *
 * Il ne fait que quatre choses — la feuille de style, un client de requêtes, un
 * routeur, une racine — et c'est délibéré : tout ce qui vit ici échappe aux tests,
 * puisqu'il n'y a pas de document à monter dans un cas unitaire. Ce qui doit être
 * éprouvé vit dans `router.tsx` et les routes, qu'un test rend avec son propre
 * historique.
 *
 * **La feuille de style est importée ici et nulle part ailleurs.** Elle ne porte aucune
 * information — les états sont nommés dans les attributs d'accessibilité et doublés par
 * un caractère visible (FR-060) —, elle porte une *géométrie* : celle que SC-009 exige.
 * Les tests de rendu ne la chargent donc pas, et n'en ont pas besoin ; c'est le parcours
 * `mobile.spec.ts` qui la mesure, sur la fenêtre de 360 × 640 px.
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

const session = createGameSession()

const apiUrl = import.meta.env['VITE_API_URL']
if (typeof apiUrl !== 'string') {
  throw new Error('VITE_API_URL est requis — voir .env.example.')
}

const router = createAppRouter({
  queryClient,
  session,
  gateway: createPlanetGateway({ baseUrl: apiUrl, session }),
})

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Le point de montage #root est absent du document.')
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
