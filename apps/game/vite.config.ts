import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * La configuration de développement et de compilation du client.
 *
 * Les tests n'en dépendent pas : `vitest.config.ts` à la racine déclare le
 * projet `game` avec son propre environnement. Deux configurations plutôt
 * qu'une héritée, parce qu'un test qui hériterait du serveur de développement
 * hériterait aussi de son mandataire et de ses variables.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    // Les sources restent lisibles en production : la transparence promise à
    // P4 ne s'arrête pas aux formules.
    sourcemap: true,
  },
})
