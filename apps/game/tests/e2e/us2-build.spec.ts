import { expect, test } from '@playwright/test'
import { countingKeyboard, freshAccount, homeCursor, signIn, signUp, tabToGrid } from './account.js'
import { expectNoAccessibilityViolations } from './axe.js'

/**
 * US2 — Poser un bâtiment sur la grille.
 *
 * Le parcours ouvre la tranche, il ne la referme pas : il décrit le
 * comportement attendu de bout en bout, les tests de domaine le raffinent.
 *
 * Quatre choses ne sont vérifiables **qu'ici** :
 *
 * - **le compte de frappes de SC-001.** Le critère porte sur un nombre
 *   d'interactions, et ce nombre est une propriété de l'assemblage — l'ordre de
 *   tabulation, le nombre de sélecteurs, l'existence ou non d'un sous-menu. Aucun
 *   test unitaire ne peut le mesurer ;
 * - **l'absence de dispositif de pointage** (SC-004). Un test de composant
 *   appelle des gestionnaires ; seul un navigateur peut prouver qu'un parcours
 *   entier tient au clavier seul ;
 * - **l'arbitrage entre deux vues du jeu ouvertes.** Deux contextes de
 *   navigateur, donc deux sessions réelles, que rien côté client ne coordonne ;
 * - **`axe-core` sur la page réelle**, empreinte armée et fantôme affiché : le
 *   contraste et l'ordre de focalisation n'existent pas dans un jsdom.
 */

/** Le compte de frappes que SC-001 publie. */
const SC001_MAX_KEYSTROKES = 15

/**
 * Le coin haut-gauche de l'empreinte visée : la veine de Camelote de R7.
 *
 * Le bloc `x ∈ 0..1, y ∈ 4..5` est intégralement libre et contient la veine, ce
 * qui en fait le seul placement de carré de quatre qui recouvre un gisement de
 * Camelote.
 */
const VEIN = { x: 0, y: 4 } as const

/** Le nom accessible d'une case, tel que la grille le compose. */
function cellName(x: number, y: number): RegExp {
  return new RegExp(`Colonne ${x + 1}, rangée ${y + 1}`, 'i')
}

/**
 * Le parcours de pose, au clavier seul, en comptant les frappes.
 *
 * Il rend le compteur : c'est lui qui porte SC-001, et le rendre force chaque
 * appelant à savoir ce que son cas a coûté.
 */
async function placeMineOnVein(page: import('@playwright/test').Page) {
  const keyboard = countingKeyboard(page)

  // Jusqu'au sélecteur de type. La navigation le précède dans le document :
  // deux liens, puis le panneau de construction.
  for (let guard = 0; guard < 10; guard += 1) {
    const checked = await page.evaluate(() =>
      document.activeElement?.getAttribute('type') === 'radio'
        ? document.activeElement.getAttribute('value')
        : null,
    )
    if (checked === 'mine') break
    await keyboard.press('Tab')
  }

  // Sélection du type. Elle **présélectionne la première variante** du type :
  // sans cela, le joueur paierait une frappe pour un choix que le catalogue a
  // déjà fait à sa place quand le type n'a qu'une empreinte.
  await keyboard.press('Space')
  await expect(page.getByRole('radio', { name: /^mine$/i })).toBeChecked()
  await expect(page.getByRole('radio', { name: /carré de quatre/i })).toBeChecked()

  await tabToGrid(page, keyboard)

  // Le curseur part de la première case ; quatre pas vers le bas l'amènent sur
  // la veine.
  await keyboard.press('ArrowDown', VEIN.y)
  await expect(page.getByRole('status')).toContainText(cellName(VEIN.x, VEIN.y))

  // La rotation d'un carré de quatre ne change rien — et c'est éprouvé plus bas.
  await keyboard.press('r')
  await keyboard.press('Enter')

  return keyboard
}

test.describe('poser un extracteur, au clavier seul', () => {
  test('le parcours tient dans le compte de frappes publié (SC-001, SC-004)', async ({ page }) => {
    await signUp(page)
    const keyboard = await placeMineOnVein(page)

    await expect(page.getByRole('group', { name: /chantier/i })).toContainText(/construction/i)
    expect(
      keyboard.count,
      `${keyboard.count} frappes pour poser un extracteur sur son gisement`,
    ).toBeLessThanOrEqual(SC001_MAX_KEYSTROKES)
  })

  /**
   * FR-035 et FR-050 : le coût, la durée et l'effet sont affichés **avant** la
   * confirmation. Le test les relève sur la page, l'empreinte armée et le
   * curseur en place, sans avoir rien validé.
   *
   * Le repère est nommé **en entier** — « Aperçu de la construction » — et non par
   * un `/aperçu/` lâche. L'écran en porte deux depuis US4, et un localisateur
   * approximatif les confondait : c'est la même leçon que celle qui a imposé des
   * noms accessibles distincts, appliquée cette fois au test. Un localisateur qui
   * accepte deux repères n'éprouve ni l'un ni l'autre.
   */
  test('l’aperçu annonce coût, durée, gisements et production avant paiement', async ({ page }) => {
    await signUp(page)
    const keyboard = countingKeyboard(page)

    await page.getByRole('radio', { name: /^mine$/i }).check()
    await tabToGrid(page, keyboard)
    await keyboard.press('ArrowDown', VEIN.y)

    const preview = page.getByRole('group', { name: /aperçu de la construction/i })
    await expect(preview).toContainText(/coût/i)
    await expect(preview).toContainText(/durée/i)
    await expect(preview).toContainText(/gisements recouverts/i)
    await expect(preview).toContainText(/production/i)
    // Un gisement recouvert, annoncé en chiffre. Le `\s*` est nécessaire : une
    // liste de définitions concatène ses termes et ses valeurs sans séparateur
    // dans le texte accessible.
    await expect(preview).toContainText(/gisements recouverts\s*1/i)

    // Rien n'a été lancé : la confirmation est postérieure à l'affichage.
    await expect(page.getByRole('group', { name: /chantier/i })).toContainText(/aucun chantier/i)
  })

  test('la confirmation explicite est un bouton, atteignable au clavier (FR-035)', async ({
    page,
  }) => {
    await signUp(page)
    await page.getByRole('radio', { name: /^mine$/i }).check()

    const confirm = page.getByRole('button', { name: /lancer la construction/i })
    await expect(confirm).toBeEnabled()
    await confirm.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('group', { name: /chantier/i })).toContainText(/construction/i)
  })
})

test.describe('les annonces suivent le curseur (FR-059)', () => {
  test('chaque déplacement restitue position, contenu, empreinte, orientation et gisements', async ({
    page,
  }) => {
    await signUp(page)
    const keyboard = countingKeyboard(page)

    await page.getByRole('radio', { name: /^mine$/i }).check()
    await tabToGrid(page, keyboard)

    const status = page.getByRole('status')
    await expect(status).toContainText(cellName(0, 0))
    await expect(status).toContainText(/carré de quatre/i)
    await expect(status).toContainText(/orientation/i)
    await expect(status).toContainText(/gisement/i)

    await keyboard.press('ArrowDown', VEIN.y)
    await expect(status).toContainText(cellName(VEIN.x, VEIN.y))
    await expect(status).toContainText(/valide/i)
  })

  /**
   * R6 : le carré de quatre n'a qu'une orientation distincte. Une rotation ne
   * change donc **rien**, et un lecteur d'écran n'a rien à annoncer. Le
   * dédoublonnage des orientations n'est pas une optimisation : c'est ce qui
   * évite d'énoncer trois fois le même état.
   */
  test('une rotation de carré de quatre n’annonce rien comme changé', async ({ page }) => {
    await signUp(page)
    const keyboard = countingKeyboard(page)

    await page.getByRole('radio', { name: /^mine$/i }).check()
    await tabToGrid(page, keyboard)
    await keyboard.press('ArrowDown', VEIN.y)

    const before = await page.getByRole('status').textContent()
    await keyboard.press('r')
    await keyboard.press('r')
    expect(await page.getByRole('status').textContent()).toBe(before)
  })

  test('une rotation de L de quatre change l’orientation annoncée', async ({ page }) => {
    await signUp(page)
    const keyboard = countingKeyboard(page)

    await page.getByRole('radio', { name: /^mine$/i }).check()
    await page.getByRole('radio', { name: /^l de quatre$/i }).check()
    await tabToGrid(page, keyboard)

    const before = await page.getByRole('status').textContent()
    await keyboard.press('r')
    expect(await page.getByRole('status').textContent()).not.toBe(before)
  })
})

test.describe('les refus énoncent leur motif exact et les cases fautives (FR-013)', () => {
  /** Le motif est porté par un attribut : le texte est un libellé, pas la vérité. */
  async function refusalCodeAt(
    page: import('@playwright/test').Page,
    target: { x: number; y: number },
  ): Promise<string | null> {
    const keyboard = countingKeyboard(page)
    await page.getByRole('radio', { name: /^mine$/i }).check()
    await tabToGrid(page, keyboard)
    await homeCursor(keyboard)
    await keyboard.press('ArrowRight', target.x)
    await keyboard.press('ArrowDown', target.y)
    await keyboard.press('Enter')

    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    return alert.getAttribute('data-refusal')
  }

  test('une empreinte qui sort de la grille est refusée pour cela', async ({ page }) => {
    await signUp(page)
    // Le carré de quatre ancré en (5,5) déborde de deux cases en x et en y.
    expect(await refusalCodeAt(page, { x: 5, y: 5 })).toBe('placement-out-of-grid')
    await expect(page.getByRole('alert')).toContainText(/colonne 7|hors de la grille/i)
  })

  test('une case obstruée est refusée pour cela, et nommée', async ({ page }) => {
    await signUp(page)
    // (0,2) et (1,2) portent des obstacles de R7 ; (1,3) aussi.
    expect(await refusalCodeAt(page, { x: 0, y: 2 })).toBe('placement-on-obstructed-cell')
    await expect(page.getByRole('alert')).toContainText(cellName(0, 2))
  })

  /**
   * Le refus « case occupée » exige un bâtiment posé, donc un chantier **achevé**.
   *
   * Rien ne permet de l'abréger : les durées sont des données d'équilibrage, et
   * les raccourcir pour la commodité d'un test reviendrait à éprouver un jeu qui
   * n'existe pas. Ce cas paie donc une attente réelle — et il achète en même
   * temps la preuve la plus difficile de la tranche : l'achèvement s'applique à
   * l'échéance, **localement, sans un seul appel réseau** (FR-032, R3, R8).
   */
  test('une case occupée est refusée pour cela, une fois le chantier achevé', async ({ page }) => {
    test.setTimeout(180_000)
    await signUp(page)
    const keyboard = countingKeyboard(page)

    // La centrale est le chantier le plus court du catalogue.
    await page.getByRole('radio', { name: /^centrale$/i }).check()
    await tabToGrid(page, keyboard)
    await homeCursor(keyboard)
    await keyboard.press('ArrowRight', 3)
    await keyboard.press('ArrowDown', 3)
    await keyboard.press('Enter')

    const work = page.getByRole('group', { name: /chantier/i })
    await expect(work).toContainText(/construction/i)

    // L'achèvement est appliqué par la projection locale, à l'échéance.
    await expect(page.locator('[role="gridcell"][data-state="occupied"]')).toHaveCount(2, {
      timeout: 150_000,
    })

    await page.getByRole('radio', { name: /^entrepôt$/i }).check()
    await tabToGrid(page, keyboard)
    // Le curseur est resté où la première pose l'avait laissé : il faut dire
    // d'où l'on repart, sinon on vise une case qu'on croit connaître.
    await homeCursor(keyboard)
    await keyboard.press('ArrowRight', 3)
    await keyboard.press('ArrowDown', 3)
    await keyboard.press('Enter')

    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    expect(await alert.getAttribute('data-refusal')).toBe('placement-on-occupied-cell')
  })
})

test.describe('deux vues du jeu ne lancent pas deux chantiers (FR-034, SC-006)', () => {
  /**
   * Le cas limite « deux onglets ouverts » de la spécification.
   *
   * La course elle-même est arbitrée par la base, et c'est le test d'intégration
   * qui l'éprouve sur deux transactions simultanées. Ce qui est éprouvé **ici**
   * est ce que le second joueur voit : un refus qui nomme son motif et
   * l'échéance du chantier en cours, plutôt qu'un écran muet.
   */
  test('la seconde demande est refusée, avec le motif et l’échéance', async ({ browser }) => {
    const credentials = freshAccount()

    const first = await browser.newContext()
    const second = await browser.newContext()
    const pageA = await first.newPage()
    const pageB = await second.newPage()

    await signUp(pageA, credentials)
    await signIn(pageB, credentials)

    await pageA.getByRole('radio', { name: /^mine$/i }).check()
    await pageA.getByRole('button', { name: /lancer la construction/i }).click()
    await expect(pageA.getByRole('group', { name: /chantier/i })).toContainText(/construction/i)

    await pageB.getByRole('radio', { name: /^centrale$/i }).check()
    await pageB.getByRole('button', { name: /lancer la construction/i }).click()

    const alert = pageB.getByRole('alert')
    await expect(alert).toBeVisible()
    expect(await alert.getAttribute('data-refusal')).toBe('work-in-progress')
    // L'échéance, et non un simple « occupé » : SC-006 exige de dire quand.
    await expect(alert).toContainText(/\d/)

    await first.close()
    await second.close()
  })
})

test.describe('accessibilité, sans écart (FR-061)', () => {
  test('l’écran de planète passe axe-core, empreinte armée', async ({ page }) => {
    await signUp(page)
    const keyboard = countingKeyboard(page)

    await page.getByRole('radio', { name: /^mine$/i }).check()
    await tabToGrid(page, keyboard)
    await keyboard.press('ArrowDown', VEIN.y)

    await expect(page.getByRole('group', { name: /aperçu de la construction/i })).toBeVisible()
    await expectNoAccessibilityViolations(page)
  })

  test('l’écran passe axe-core avec un refus affiché', async ({ page }) => {
    await signUp(page)
    const keyboard = countingKeyboard(page)

    await page.getByRole('radio', { name: /^mine$/i }).check()
    await tabToGrid(page, keyboard)
    await keyboard.press('ArrowDown', 2)
    await keyboard.press('Enter')

    await expect(page.getByRole('alert')).toBeVisible()
    await expectNoAccessibilityViolations(page)
  })
})
