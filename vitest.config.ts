import { defineConfig } from 'vitest/config'

/**
 * Vitest 4 a supprimé `vitest.workspace.ts` — il est ignoré en silence. Les
 * projets se déclarent ici. Chacun porte son environnement et son périmètre :
 * un test de domaine qui aurait besoin d'un DOM serait un test mal placé.
 *
 * `api-integration` est séparé parce qu'il exige un démon Docker
 * (Testcontainers) : c'est une condition d'exécution, pas une préférence, et
 * elle ne doit pas bloquer `pnpm -w test`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'catalogs',
          root: './packages/catalogs',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'domain',
          root: './packages/domain',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'contracts',
          root: './packages/contracts',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'db',
          root: './packages/db',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api',
          root: './apps/api',
          environment: 'node',
          include: ['tests/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api-integration',
          root: './apps/api',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // Un conteneur PostgreSQL démarre par fichier : la parallélisation
          // par défaut noierait la machine avant de tester quoi que ce soit.
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      /**
       * Le client est **deux** projets, séparés par leur environnement.
       *
       * Monter un DOM coûte cher — plusieurs secondes par fichier, et bien
       * davantage sur une machine chargée. Un test de session, d'horloge ou
       * d'extrapolation n'en a aucun besoin : ce sont des fonctions pures, et
       * leur faire payer un jsdom est la même faute que de faire dépendre une
       * règle de jeu d'un navigateur.
       *
       * La frontière est l'extension : `.tsx` désigne un composant, donc un
       * document ; `.ts` désigne de la logique. Elle n'a pas besoin d'être
       * maintenue à la main, ce qui est sa qualité principale.
       */
      {
        test: {
          name: 'game',
          root: './apps/game',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/e2e/**'],
        },
      },
      {
        test: {
          name: 'game-dom',
          root: './apps/game',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
          exclude: ['tests/e2e/**'],
        },
      },
    ],

    coverage: {
      provider: 'v8',
      // Le seuil se mesure sur `packages/domain` **uniquement** : un chiffre
      // mêlant interface et domaine ne veut rien dire (quickstart § 6).
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['**/index.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'lcov'],
      // Seuil versionné, et **il ne peut que monter** (doc de stack § 7.7).
      // Le baisser exige de dire pourquoi dans le diff, ce qui est le but.
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
})
