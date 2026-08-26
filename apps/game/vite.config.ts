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
  // Le `.env` vit à la racine du dépôt et sert aux deux applications. Sans
  // cela, Vite chercherait le sien dans `apps/game/` et démarrerait avec des
  // `VITE_*` absentes — c'est-à-dire un client qui échoue à la construction de
  // sa session, pour une raison qui ne se lit nulle part.
  envDir: '../..',
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
