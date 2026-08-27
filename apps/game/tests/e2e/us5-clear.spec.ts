import { expect, type Page, test } from '@playwright/test'
import { countingKeyboard, homeCursor, signUp, tabToGrid } from './account.js'
import { expectNoAccessibilityViolations } from './axe.js'

/**
 * US5 — Déblayer une case obstruée.
 *
 * Le parcours ouvre la tranche, il ne la referme pas : les tests de domaine
 * raffinent le calcul, l'invariant I-8 garde l'irréversibilité. Trois choses ne
 * sont vérifiables **qu'ici** :
 *
 * - **la concordance entre ce qui était annoncé et ce qui apparaît**, constatée
 *   sur la grille rendue. C'est le test indépendant d'US5, et c'est la seule
 *   promesse de la tranche qu'un test de domaine ne peut pas voir : le domaine sait
 *   que `reveals` vaut « gisement de Jus », il ne sait pas que l'écran l'a dit ;
 * - **l'annonce antérieure au paiement** (FR-042, FR-043, US5-2) : l'aperçu est
 *   dans le document, atteignable au clavier, et antérieur au bouton ;
 * - **la voie de déblaiement au clavier seul** (FR-058, SC-004), sans aucun
 *   dispositif de pointage.
 *
 * **Deux échéances, deux façons de l'atteindre, et c'est délibéré.**
 *
 * L'éboulis de (3,0) dure trois cents secondes : son achèvement est attendu en
 * **temps réel**, comme celui de la pose d'US2 et de l'amélioration d'US4. C'est
 * le prix assumé d'un parcours qui éprouve le jeu et non une simulation.
 *
 * La poche scellée de (3,2) en dure deux mille sept cents — quarante-cinq
 * minutes. L'attendre serait renoncer à éprouver le seul obstacle qui *révèle un
 * gisement*, c'est-à-dire renoncer au sujet de la tranche. Son échéance est donc
 * atteinte par l'**horloge du navigateur**, que Playwright contrôle. Ce n'est pas
 * une entorse au modèle de temps, c'en est l'application : l'horloge du client est
 * un paramètre injectable, et l'achèvement d'un chantier échu est appliqué par la
 * projection **locale**, à `dueAt`, sans un seul appel réseau (FR-031, FR-032,
 * R3, R8). Ce que le test avance est la lecture d'une horloge, jamais un état de
 * jeu — le serveur, lui, n'a rien à savoir de cette avance et ne l'apprendra qu'à
 * la prochaine mutation.
 */

/** L'éboulis : le moins cher des cinq, et il rend du terrain nu. */
const EBOULIS = {
  cell: { x: 3, y: 0 },
  index: 3,
  label: /éboulis/i,
  seconds: 300,
  camelote: 40,
}

/** La poche scellée : coûteuse, et elle rend un geyser de Jus. */
const POCHE = {
  cell: { x: 3, y: 2 },
  index: 15,
  label: /poche scellée/i,
  seconds: 2_700,
  camelote: 200,
  baveEtoiles: 40,
}

const clearPreview = (page: Page) => page.getByRole('group', { name: /aperçu du déblaiement/i })
const currentWork = (page: Page) => page.getByRole('group', { name: /^chantier$/i })
const cellAt = (page: Page, index: number) =>
  page.locator(`[role="gridcell"][data-index="${index}"]`)

/**
 * Amène le curseur de grille sur une case, **au clavier seul**.
 *
 * Le curseur persiste entre deux actions : `homeCursor` dit d'où l'on repart,
 * sous peine de viser une case qu'on croit connaître.
 */
async function cursorOn(
  page: Page,
  cell: { readonly x: number; readonly y: number },
): Promise<ReturnType<typeof countingKeyboard>> {
  const keyboard = countingKeyboard(page)
  await tabToGrid(page, keyboard)
  await homeCursor(keyboard)
  await keyboard.press('ArrowRight', cell.x)
  await keyboard.press('ArrowDown', cell.y)
  return keyboard
}

/**
 * Atteint un bouton **par tabulation**, et échoue en le nommant si la boucle
 * n'aboutit pas.
 *
 * Sans la garde, une régression qui rendrait la confirmation inatteignable au
 * clavier ferait tourner la boucle sans fin au lieu de nommer le défaut.
 */
async function tabToButton(
  page: Page,
  keyboard: ReturnType<typeof countingKeyboard>,
  label: RegExp,
): Promise<void> {
  for (let guard = 0; guard < 40; guard += 1) {
    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? '',
      text: document.activeElement?.textContent ?? '',
    }))
    if (focused.tag === 'BUTTON' && label.test(focused.text)) return
    await keyboard.press('Tab')
  }
  throw new Error(`Le bouton ${label} n’a pas été atteint au clavier en quarante tabulations.`)
}

test.describe('l’aperçu annonce le résultat exact avant tout paiement (FR-042, FR-043, US5-2)', () => {
  test('la poche scellée annonce un geyser de Jus, son coût et sa durée', async ({ page }) => {
    await signUp(page)
    await cursorOn(page, POCHE.cell)

    const preview = clearPreview(page)
    await expect(preview).toContainText(POCHE.label)

    // Le résultat, **nommé** : c'est ce qui décide si l'opération vaut son prix.
    // « Un gisement » ne dirait pas lequel, et le joueur ne saurait pas s'il
    // achète un puits ou une mine.
    await expect(preview).toContainText(/geyser de Jus/i)

    await expect(preview).toContainText(new RegExp(`${POCHE.camelote}`))
    await expect(preview).toContainText(new RegExp(`${POCHE.baveEtoiles}`))
    await expect(preview).toContainText(new RegExp(`${Math.ceil(POCHE.seconds / 60)}\\s*min`))

    // Rien n'a été payé : l'annonce est antérieure à la confirmation (FR-035).
    await expect(currentWork(page)).toContainText(/aucun chantier/i)

    // L'écran porte maintenant un aperçu rempli : c'est l'état qui compte pour
    // l'accessibilité, et non la planète au repos.
    await expectNoAccessibilityViolations(page)
  })

  test('l’éboulis annonce du terrain nu, et non un gisement', async ({ page }) => {
    await signUp(page)
    await cursorOn(page, EBOULIS.cell)

    const preview = clearPreview(page)
    await expect(preview).toContainText(EBOULIS.label)
    await expect(preview).toContainText(/terrain nu/i)
    await expect(preview).not.toContainText(/geyser|veine|récif/i)
  })

  test('une case libre n’offre aucun déblaiement', async ({ page }) => {
    await signUp(page)
    // (5,5) est libre dans la disposition du Berceau.
    await cursorOn(page, { x: 5, y: 5 })

    // Le panneau existe — il apprend au joueur que le déblaiement existe — et il
    // dit pourquoi il n'y a rien à déblayer ici.
    await expect(clearPreview(page)).toContainText(/n’est pas obstruée|pas obstruée/i)
  })
})

test.describe('déblayer au clavier seul, sans dispositif de pointage (FR-058, SC-004)', () => {
  test('l’éboulis achevé laisse une case libre, en terrain nu', async ({ page }) => {
    test.setTimeout(600_000)
    await signUp(page)

    await expect(cellAt(page, EBOULIS.index)).toHaveAttribute('data-state', 'obstructed')

    const keyboard = await cursorOn(page, EBOULIS.cell)
    await tabToButton(page, keyboard, /lancer le déblaiement/i)
    await keyboard.press('Enter')

    await expect(currentWork(page)).toContainText(/déblaiement/i)
    // Un chantier lancé n'est ni annulable ni remplaçable (FR-037), et l'écran
    // dit **quelle** case : le joueur doit pouvoir vérifier qu'il a lancé ce
    // qu'il croyait.
    await expect(currentWork(page)).toContainText(/colonne 4, rangée 1/i)

    // L'achèvement est appliqué par la projection **locale**, à l'échéance.
    await expect(cellAt(page, EBOULIS.index)).toHaveAttribute('data-state', 'free', {
      timeout: (EBOULIS.seconds + 90) * 1_000,
    })

    // Terrain nu : l'éboulis ne révèle aucun gisement, et la case ne doit donc
    // pas en porter un.
    await expect(cellAt(page, EBOULIS.index)).not.toHaveAttribute('data-deposit', /.*/)
  })
})

test.describe('ce qui apparaît est exactement ce qui était annoncé (US5-1, US5-3)', () => {
  test('la poche scellée déblayée porte un geyser de Jus', async ({ page }) => {
    test.setTimeout(300_000)

    // L'horloge du navigateur, contrôlée : la projection locale applique
    // l'achèvement à `dueAt`, et c'est l'horloge — non le réseau — qui dit où
    // l'on en est. Installée **avant** la navigation, sans quoi la page
    // conserverait l'horloge réelle.
    await page.clock.install()
    await signUp(page)

    await expect(cellAt(page, POCHE.index)).toHaveAttribute('data-state', 'obstructed')

    const keyboard = await cursorOn(page, POCHE.cell)
    await tabToButton(page, keyboard, /lancer le déblaiement/i)
    await keyboard.press('Enter')

    await expect(currentWork(page)).toContainText(/déblaiement/i)
    await expect(currentWork(page)).toContainText(/colonne 4, rangée 3/i)

    // Passé l'échéance, et pas seulement jusqu'à elle.
    await page.clock.fastForward((POCHE.seconds + 120) * 1_000)

    await expect(cellAt(page, POCHE.index)).toHaveAttribute('data-state', 'free')
    // Le geyser annoncé, constaté. C'est le test indépendant de la tranche.
    await expect(cellAt(page, POCHE.index)).toHaveAttribute('data-deposit', 'jus')
    await expect(cellAt(page, POCHE.index)).toHaveAttribute('aria-label', /geyser de Jus/i)
  })
})

test.describe('accessibilité, sans écart (FR-061)', () => {
  test('l’écran de planète passe axe-core, panneau de déblaiement affiché', async ({ page }) => {
    await signUp(page)

    // Sans curseur posé sur un obstacle, le panneau existe et dit quoi faire : un
    // panneau qui n'apparaîtrait qu'une fois la cible désignée laisserait le
    // joueur ignorer que le déblaiement existe.
    await expect(clearPreview(page)).toBeVisible()
    await expectNoAccessibilityViolations(page)
  })
})
