import { defineConfig, devices } from '@playwright/test'

/**
 * Les parcours de bout en bout. Ils ouvrent chaque tranche, ils ne la referment
 * pas : c'est le parcours qui décrit le comportement attendu, les tests de
 * domaine le raffinent.
 *
 * Deux profils, et un seul jeu de tests : SC-004 exige que tout parcours soit
 * franchissable **sans dispositif de pointage**, et SC-009 que la grille tienne
 * sur un écran de téléphone. Ni l'un ni l'autre n'est une variante — ce sont
 * deux exigences que les mêmes fichiers doivent satisfaire.
 */
export default defineConfig({
  testDir: './apps/game/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Aucun parcours ne doit dépendre d'une souris. Les tests qui ont besoin
    // d'un pointeur l'activent explicitement, pour que l'exception se voie.
    hasTouch: false,
  },

  /**
   * **Quatre-vingt-dix secondes par cas**, et non les trente par défaut.
   *
   * Tout parcours commence par `signUp`, et l'inscription n'est pas une requête : c'est
   * une chaîne de cinq maillons — créer le compte, obtenir la session, lire la planète
   * qui répond 404 pour un joueur neuf, la provisionner, rendre l'écran — dont trois
   * traversent une pile conteneurisée.
   *
   * Le défaut de trente secondes suffisait tant que la pile était fraîche. Il a
   * commencé à échouer par intermittence après plusieurs séries de parcours, et le
   * message était trompeur : « test timeout » là où la cause était une inscription
   * lente. Les cas qui attendent une échéance de jeu déclarent leur propre délai, plus
   * large encore.
   *
   * **Ce n'est pas une tolérance sur le comportement** : un vrai défaut échoue tout
   * autant à quatre-vingt-dix secondes qu'à trente.
   */
  timeout: 90_000,

  projects: [
    {
      name: 'bureau',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // SC-009 : 360 × 640 px, la grille visible sans défilement ni zoom.
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 640 },
        isMobile: false,
        hasTouch: true,
      },
    },
  ],

  /**
   * **Deux** serveurs, et l'ordre n'a pas d'importance : Playwright attend que
   * chacun réponde avant de lancer le premier cas.
   *
   * L'API est là parce qu'un parcours de bout en bout qui interrogerait un
   * simulacre ne prouverait rien de ce qu'on lui demande de prouver. Elle a
   * besoin de la pile Supabase locale — base et authentification — dont la mise
   * en route est décrite dans `specs/001-la-planete-mere/quickstart.md` § 1.
   *
   * `reuseExistingServer` hors intégration continue : on relance les parcours
   * dix fois pendant une mise au point, et redémarrer la pile à chaque fois
   * ferait renoncer à les lancer.
   */
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : [
        {
          command: 'pnpm --filter @zaliba/api start',
          url: 'http://127.0.0.1:3000/v1/me/planet',
          // L'API répond 401 sans jeton, et c'est le bon signe de vie : exiger
          // un 2xx obligerait à ouvrir une route de santé non authentifiée.
          ignoreHTTPSErrors: true,
          reuseExistingServer: !process.env['CI'],
          timeout: 60_000,
        },
        {
          command: 'pnpm --filter @zaliba/game dev --port 5173 --strictPort',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: !process.env['CI'],
          timeout: 120_000,
        },
      ],
})
