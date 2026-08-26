import { expect, test } from '@playwright/test'
import { signUp } from './account.js'
import { expectNoAccessibilityViolations } from './axe.js'

/**
 * US1 — Fonder sa colonie et la voir produire.
 *
 * Le parcours ouvre la tranche, il ne la referme pas : il décrit le
 * comportement attendu de bout en bout, les tests de domaine le raffinent.
 *
 * Trois choses ne sont vérifiables **qu'ici** :
 *
 * - la disposition de R7 telle que le joueur la voit — dix obstacles,
 *   vingt-six cases libres, trois gisements aux coordonnées publiées. Les tests
 *   de catalogue éprouvent la donnée ; celui-ci éprouve qu'elle arrive
 *   jusqu'à l'écran, à travers la base, l'API, le contrat et le rendu ;
 * - la progression **en mode hors ligne du navigateur**. C'est la promesse de
 *   R8 mise à l'épreuve pour de vrai : un test unitaire peut espionner `fetch`,
 *   seul un navigateur peut couper le réseau ;
 * - `axe-core` sur la page réelle, avec ses styles calculés. Le contraste et
 *   l'ordre de focalisation n'existent pas dans un jsdom.
 */

/** Les dix cases obstruées de R7. */
const OBSTRUCTED = [
  [3, 0],
  [5, 1],
  [0, 2],
  [1, 2],
  [3, 2],
  [4, 2],
  [5, 2],
  [1, 3],
  [2, 3],
  [2, 4],
] as const

/** Les trois gisements affleurants. */
const DEPOSITS = [
  [0, 4, 'camelote'],
  [1, 1, 'jus'],
  [4, 4, 'bave-etoiles'],
] as const

test.describe('un joueur neuf reçoit son Berceau', () => {
  test('la colonie se fonde sans que le joueur la demande (FR-001)', async ({ page }) => {
    await signUp(page)
    // Aucune page d'erreur, aucun bouton « fonder » : le 404 du premier `GET`
    // est un déclencheur, pas un échec.
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('la grille compte trente-six cases', async ({ page }) => {
    await signUp(page)
    await expect(page.getByRole('gridcell')).toHaveCount(36)
  })

  test('dix cases sont obstruées, vingt-six sont libres (FR-004)', async ({ page }) => {
    await signUp(page)

    const cells = page.getByRole('gridcell')
    await expect(cells.filter({ has: page.locator('[data-state="obstructed"]') })).toHaveCount(0)
    await expect(page.locator('[role="gridcell"][data-state="obstructed"]')).toHaveCount(10)
    await expect(page.locator('[role="gridcell"][data-state="free"]')).toHaveCount(26)
    await expect(cells).toHaveCount(36)
  })

  test('les obstacles sont aux coordonnées de R7', async ({ page }) => {
    await signUp(page)

    for (const [x, y] of OBSTRUCTED) {
      const cell = page.getByRole('gridcell', {
        name: new RegExp(`Colonne ${x + 1}, rangée ${y + 1}\\s*: obstruée`, 'i'),
      })
      await expect(cell, `case (${x},${y}) obstruée`).toHaveCount(1)
    }
  })

  test('les trois gisements sont à leur place (FR-004)', async ({ page }) => {
    await signUp(page)

    for (const [x, y] of DEPOSITS) {
      const cell = page.getByRole('gridcell', {
        name: new RegExp(`Colonne ${x + 1}, rangée ${y + 1}.*gisement`, 'i'),
      })
      await expect(cell, `gisement en (${x},${y})`).toHaveCount(1)
    }
    await expect(page.locator('[role="gridcell"][data-deposit]')).toHaveCount(3)
  })

  test('deux comptes reçoivent la même planète (SC-008)', async ({ browser }) => {
    const readGrid = async () => {
      const context = await browser.newContext()
      const page = await context.newPage()
      await signUp(page)
      const states = await page
        .locator('[role="gridcell"]')
        .evaluateAll((cells) =>
          cells.map(
            (cell) =>
              `${cell.getAttribute('data-state')}:${cell.getAttribute('data-deposit') ?? ''}`,
          ),
        )
      await context.close()
      return states
    }

    expect(await readGrid()).toEqual(await readGrid())
  })
})

test.describe('les compteurs progressent, réseau coupé (R8)', () => {
  /**
   * La promesse de l'extrapolation locale, mise à l'épreuve pour de vrai. Un
   * test unitaire peut espionner `fetch` ; seul un navigateur peut **couper le
   * réseau** et montrer que le compteur continue quand même.
   */
  test('la Camelote augmente hors ligne', async ({ page, context }) => {
    await signUp(page)

    const camelote = page.getByRole('group', { name: /camelote/i })
    await expect(camelote).toBeVisible()

    await context.setOffline(true)

    const before = await camelote.textContent()
    // La quantité détenue s'affiche au centième d'unité : à vingt unités par
    // heure, la seconde décimale change environ toutes les 1,8 s. Dix secondes
    // laissent la marge nécessaire sans faire d'un parcours une attente.
    //
    // Ce chiffre est la raison d'être de l'affichage décimal : en unités
    // entières il aurait fallu trois minutes, et ce cas — le seul qui éprouve
    // vraiment l'extrapolation hors ligne — aurait expiré à chaque exécution.
    await page.waitForTimeout(10_000)
    const after = await camelote.textContent()

    expect(after).not.toBe(before)
    await context.setOffline(false)
  })

  test('aucune erreur n’apparaît pendant la coupure', async ({ page, context }) => {
    await signUp(page)
    await context.setOffline(true)
    await page.waitForTimeout(5_000)

    await expect(page.getByRole('alert')).toHaveCount(0)
    await context.setOffline(false)
  })
})

test.describe('tout se fait au clavier (FR-058, SC-004)', () => {
  test('la grille s’atteint et se parcourt sans souris', async ({ page }) => {
    await signUp(page)

    // Une seule tabulation doit suffire à entrer dans la grille — le curseur
    // mobile est ce qui l'évite d'en demander trente-six.
    await page.keyboard.press('Tab')
    let guard = 0
    while (guard < 20) {
      const role = await page.evaluate(() => document.activeElement?.getAttribute('role'))
      if (role === 'gridcell') break
      await page.keyboard.press('Tab')
      guard += 1
    }

    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
    expect(focused).toMatch(/colonne/i)

    await page.keyboard.press('ArrowRight')
    const moved = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
    expect(moved).not.toBe(focused)
  })
})

test.describe('accessibilité, sans écart (FR-061)', () => {
  test('l’écran de connexion passe axe-core', async ({ page }) => {
    await page.goto('/planet')
    await expect(page.getByLabel(/courriel/i)).toBeVisible()
    await expectNoAccessibilityViolations(page)
  })

  test('l’écran de planète passe axe-core', async ({ page }) => {
    await signUp(page)
    await expectNoAccessibilityViolations(page)
  })

  test('la page de règles passe axe-core', async ({ page }) => {
    await page.goto('/rules')
    await expect(page.getByRole('heading', { name: /règles/i })).toBeVisible()
    await expectNoAccessibilityViolations(page)
  })
})
