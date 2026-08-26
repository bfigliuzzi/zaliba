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

  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command: 'pnpm --filter @zaliba/game dev --port 5173 --strictPort',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
})
