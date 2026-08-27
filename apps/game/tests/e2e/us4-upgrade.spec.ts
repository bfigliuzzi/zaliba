import { expect, type Page, test } from '@playwright/test'
import { countingKeyboard, homeCursor, signUp, tabToGrid } from './account.js'
import { expectNoAccessibilityViolations } from './axe.js'

/**
 * US4 — Améliorer un bâtiment.
 *
 * Le parcours ouvre la tranche, il ne la referme pas : les tests de domaine
 * raffinent le calcul, l'invariant I-7 couvre toutes les formes d'empreinte. Trois
 * choses ne sont vérifiables **qu'ici** :
 *
 * - **l'identité des cases après achèvement**, constatée sur la grille rendue et
 *   non sur un instantané en mémoire. C'est la promesse d'US4-1 telle que le
 *   joueur la voit, et un test de domaine ne peut pas voir un rendu ;
 * - **le gain annoncé avant paiement** (FR-041, US4-2). C'est une propriété de
 *   l'assemblage — l'aperçu est dans le document, atteignable au clavier, et
 *   antérieur au bouton — et non du calcul ;
 * - **la voie d'amélioration accessible au clavier seul** (FR-058, SC-004) : le
 *   curseur de grille désigne le bâtiment, une tabulation atteint la
 *   confirmation. Aucun dispositif de pointage n'intervient.
 *
 * **Le prix en temps est assumé.** Une pose puis une amélioration font cinq
 * minutes de jeu réel, et les durées sont des données d'équilibrage : les
 * raccourcir pour la commodité d'un test reviendrait à éprouver un jeu qui
 * n'existe pas.
 */

/** Le placement de référence : le seul carré de quatre qui couvre la veine. */
const MINE = { label: /^mine$/i, anchor: { x: 0, y: 4 }, seconds: 120, cells: 4 }

/**
 * Les valeurs de niveau 1 et 2, **recopiées** depuis les courbes du catalogue.
 *
 * La recopie est délibérée : le parcours doit échouer si l'équilibrage change sous
 * lui, plutôt que de recalculer son attendu depuis la donnée qu'il éprouve. Les
 * formules sont celles que la page de règles publiera — `⌊15 × 11/10⌋` pour la
 * production, `⌊120 × 7/5⌋` pour la durée, `⌊base × 3/2⌋` pour le coût.
 */
const NOMINAL = { atLevel1: 15, atLevel2: 16 }
const UPGRADE_SECONDS = 168
const UPGRADE_COST = { camelote: 150, baveEtoiles: 30 }

const upgradePreview = (page: Page) =>
  page.getByRole('group', { name: /aperçu de l’amélioration/i })
const currentWork = (page: Page) => page.getByRole('group', { name: /^chantier$/i })
const energyPanel = (page: Page) => page.getByRole('group', { name: /^énergie$/i })

/** Les cases occupées, dans l'ordre de lecture de la grille. */
async function occupiedCells(page: Page): Promise<readonly string[]> {
  return page
    .locator('[role="gridcell"][data-state="occupied"]')
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-index') ?? '').toSorted())
}

/**
 * Atteint un bouton **par tabulation**, et échoue en le nommant si la boucle
 * n'aboutit pas.
 *
 * La garde n'est pas une précaution de style : sans elle, une régression qui
 * rendrait la confirmation inatteignable au clavier ferait tourner la boucle sans
 * fin au lieu de nommer le défaut. C'est la même discipline que `tabToGrid`.
 */
async function tabToButton(
  page: Page,
  keyboard: ReturnType<typeof countingKeyboard>,
  label: RegExp,
): Promise<void> {
  for (let guard = 0; guard < 30; guard += 1) {
    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? '',
      text: document.activeElement?.textContent ?? '',
    }))
    if (focused.tag === 'BUTTON' && label.test(focused.text)) return
    await keyboard.press('Tab')
  }
  throw new Error(`Le bouton ${label} n’a pas été atteint au clavier en trente tabulations.`)
}

/** Pose la mine sur la veine, et attend son achèvement mesuré par la grille. */
async function buildMine(page: Page): Promise<void> {
  const keyboard = countingKeyboard(page)

  await page.getByRole('radio', { name: MINE.label }).check()
  await tabToGrid(page, keyboard)
  await homeCursor(keyboard)
  await keyboard.press('ArrowRight', MINE.anchor.x)
  await keyboard.press('ArrowDown', MINE.anchor.y)
  await keyboard.press('Enter')

  await expect(currentWork(page)).toContainText(/construction/i)
  // L'achèvement est appliqué par la projection locale, à l'échéance (R3, R8).
  await expect(page.locator('[role="gridcell"][data-state="occupied"]')).toHaveCount(MINE.cells, {
    timeout: (MINE.seconds + 60) * 1_000,
  })
}

/** Amène le curseur de grille sur l'ancre de la mine, au clavier seul. */
async function cursorOnMine(page: Page): Promise<ReturnType<typeof countingKeyboard>> {
  const keyboard = countingKeyboard(page)
  await tabToGrid(page, keyboard)
  // Le curseur **persiste** entre deux actions : il faut dire d'où l'on repart.
  await homeCursor(keyboard)
  await keyboard.press('ArrowRight', MINE.anchor.x)
  await keyboard.press('ArrowDown', MINE.anchor.y)
  return keyboard
}

test.describe('l’aperçu annonce le gain exact avant paiement (US4-2)', () => {
  test('coût, durée, production actuelle, résultante et différence', async ({ page }) => {
    test.setTimeout(300_000)
    await signUp(page)
    await buildMine(page)
    await cursorOnMine(page)

    const preview = upgradePreview(page)
    await expect(preview).toContainText(/mine/i)
    await expect(preview).toContainText(new RegExp(`${UPGRADE_COST.camelote}`))
    await expect(preview).toContainText(new RegExp(`${UPGRADE_COST.baveEtoiles}`))
    await expect(preview).toContainText(new RegExp(`${Math.ceil(UPGRADE_SECONDS / 60)}\\s*min`))

    // FR-039 énoncé au joueur, et non seulement tenu par le contrat : il doit
    // savoir *avant* de payer qu'aucune case ne bougera.
    await expect(preview).toContainText(/inchang/i)

    // Les deux productions et leur différence, dans des attributs pour la valeur
    // exacte — celle qu'on refait à la main (SC-002) — et en clair pour le sens.
    await expect(preview.locator('[data-upgrade-rate]')).toHaveAttribute(
      'data-upgrade-rate',
      `${NOMINAL.atLevel1}/${NOMINAL.atLevel2}`,
    )
    await expect(preview.locator('[data-upgrade-delta]')).toHaveAttribute(
      'data-upgrade-delta',
      `${NOMINAL.atLevel2 - NOMINAL.atLevel1}`,
    )

    // Rien n'a été payé : l'annonce est antérieure à la confirmation (FR-035).
    await expect(currentWork(page)).toContainText(/aucun chantier/i)

    // L'écran porte maintenant un aperçu rempli : c'est l'état qui compte pour
    // l'accessibilité, et non la planète vide.
    await expectNoAccessibilityViolations(page)
  })
})

test.describe('améliorer au clavier seul, sans dispositif de pointage (FR-058, SC-004)', () => {
  test('les cases occupées sont identiques après achèvement (US4-1)', async ({ page }) => {
    test.setTimeout(600_000)
    await signUp(page)
    await buildMine(page)

    const before = await occupiedCells(page)
    expect(before).toHaveLength(MINE.cells)

    const keyboard = await cursorOnMine(page)
    await tabToButton(page, keyboard, /lancer l’amélioration/i)
    await keyboard.press('Enter')

    await expect(currentWork(page)).toContainText(/amélioration/i)
    // Un chantier lancé n'est ni annulable ni remplaçable (FR-037), et l'écran
    // le dit : le joueur doit pouvoir vérifier qu'il a lancé ce qu'il croyait.
    await expect(currentWork(page)).toContainText(/mine/i)

    // L'achèvement, constaté par le niveau publié dans le panneau d'énergie.
    await expect(energyPanel(page)).toContainText(/mine niveau 2/i, {
      timeout: (UPGRADE_SECONDS + 60) * 1_000,
    })

    // US4-1, à la case près : le même ensemble, et pas seulement le même compte.
    expect(await occupiedCells(page)).toEqual(before)

    // Le gain constaté vaut le gain annoncé — la mine ne crée aucun déficit à ce
    // niveau, donc l'effective égale la nominale.
    await expect(energyPanel(page).locator('[data-building-rate]').first()).toHaveAttribute(
      'data-building-rate',
      `${NOMINAL.atLevel2}/${NOMINAL.atLevel2}`,
    )
  })
})

test.describe('accessibilité, sans écart (FR-061)', () => {
  test('l’écran de planète passe axe-core, panneau d’amélioration affiché', async ({ page }) => {
    await signUp(page)

    // Sans bâtiment posé, le panneau existe et dit quoi faire : un panneau qui
    // n'apparaîtrait qu'une fois la cible désignée laisserait le joueur ignorer
    // que l'amélioration existe.
    await expect(upgradePreview(page)).toBeVisible()
    await expectNoAccessibilityViolations(page)
  })
})
