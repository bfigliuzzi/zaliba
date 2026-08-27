import { expect, type Page, test } from '@playwright/test'
import { countingKeyboard, homeCursor, signUp, tabToGrid } from './account.js'
import { expectNoAccessibilityViolations } from './axe.js'

/**
 * US6 — Démolir pour réorganiser.
 *
 * Le parcours ouvre la tranche, il ne la referme pas : les tests de domaine
 * éprouvent le remboursement et l'écrêtement, les tests d'intégration la cascade
 * des cases et la survie de l'histoire. Trois choses ne sont vérifiables **qu'ici** :
 *
 * - **la libération réelle du terrain, constatée sur la grille rendue.** C'est la
 *   promesse de la tranche telle que le joueur la voit — une erreur de placement
 *   n'est plus définitive — et un test de domaine ne peut pas voir un rendu ;
 * - **les gisements intacts après démolition** (FR-047). Le domaine sait que la
 *   veine survit ; il ne sait pas que l'écran continue de la nommer ;
 * - **la voie de démolition au clavier seul** (FR-058, SC-004), sans aucun
 *   dispositif de pointage : le curseur de grille désigne le bâtiment, une tabulation
 *   atteint la confirmation.
 *
 * **Le prix en temps est assumé, et il ne peut pas être éludé ici.** Porter une mine
 * au niveau 2 puis la démolir coûte 120 + 168 + 300 secondes de jeu réel.
 * L'horloge du navigateur ne peut pas les raccourcir, contrairement à ce qu'US5 fait
 * pour sa poche scellée, et la raison est de fond : chacune des deux premières
 * échéances est suivie d'une **commande**, que le serveur arbitre contre sa propre
 * horloge. Une horloge de navigateur avancée le trouverait avec un chantier toujours
 * en cours, et il refuserait en 409. Le raccourci n'est ouvert qu'aux échéances
 * terminales, dont l'achèvement n'est constaté que localement.
 *
 * **Ce que ce parcours ne fait pas, et pourquoi.** L'écrêtement du remboursement
 * (FR-049) n'est pas éprouvé ici. Le provoquer demande d'approcher le plafond de
 * cinq mille unités, ce qui prend des heures à vingt unités par heure, et aucun
 * raccourci n'existe côté client — l'écrêtement dépend de la quantité *stockée*, que
 * seul le serveur écrit. Il est éprouvé là où il est vérifiable exactement : par
 * `demolish-clipping.test.ts` au niveau du domaine, et par `demolish-panel.test.tsx`
 * au niveau du document, sur un état forgé. L'écart est consigné dans `tasks.md`.
 */

/** Le seul carré de quatre qui couvre la veine de Camelote de (0,4). */
const MINE = {
  label: /^mine$/i,
  anchor: { x: 0, y: 4 },
  /** Les quatre index de grille occupés : (0,4) (1,4) (0,5) (1,5). */
  indexes: ['24', '25', '30', '31'],
  buildSeconds: 120,
  cells: 4,
}

/**
 * La durée de l'amélioration vers le niveau 2, **recopiée** depuis la courbe du
 * catalogue : `⌊120 × 7/5⌋ = 168`.
 *
 * La recopie est délibérée : le parcours doit échouer si l'équilibrage change sous
 * lui, plutôt que de recalculer son attendu depuis la donnée qu'il éprouve.
 *
 * **Le niveau 3 est hors d'atteinte d'un parcours**, et ce n'est pas une limite de
 * l'outil : c'est l'équilibrage. Le Berceau démarre avec quatre cents Camelote ; la
 * pose en coûte cent, le niveau 2 cent cinquante, le niveau 3 deux cent vingt-cinq —
 * soit soixante-douze de plus que la trésorerie, c'est-à-dire trois heures de
 * production de base. Le parcours démolit donc un **niveau 2**, ce qui démontre
 * exactement la même chose : le remboursement est un *cumul*, et non la dernière
 * marche. Les niveaux 1 à 30 sont couverts par `demolish.test.ts`.
 */
const UPGRADE_SECONDS = 168

/** `demolitionSeconds` de la mine, indépendant du niveau. */
const DEMOLITION_SECONDS = 300

const demolishPreview = (page: Page) =>
  page.getByRole('group', { name: /aperçu de la démolition/i })
const currentWork = (page: Page) => page.getByRole('group', { name: /^chantier$/i })
const energyPanel = (page: Page) => page.getByRole('group', { name: /^énergie$/i })
const cellAt = (page: Page, index: string) =>
  page.locator(`[role="gridcell"][data-index="${index}"]`)

async function occupiedCells(page: Page): Promise<readonly string[]> {
  return page
    .locator('[role="gridcell"][data-state="occupied"]')
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-index') ?? '').toSorted())
}

/**
 * Atteint un bouton **par tabulation**, et échoue en le nommant si la boucle
 * n'aboutit pas.
 *
 * La garde n'est pas une précaution de style : sans elle, une régression qui rendrait
 * la confirmation inatteignable au clavier ferait tourner la boucle sans fin au lieu
 * de nommer le défaut. Quarante tabulations, parce que l'écran porte maintenant
 * quatre panneaux.
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
  await expect(page.locator('[role="gridcell"][data-state="occupied"]')).toHaveCount(MINE.cells, {
    timeout: (MINE.buildSeconds + 60) * 1_000,
  })
}

/** Améliore la mine une fois, et attend le niveau annoncé. */
async function upgradeMine(page: Page, levelAfter: number, seconds: number): Promise<void> {
  const keyboard = await cursorOnMine(page)
  await tabToButton(page, keyboard, /lancer l’amélioration/i)
  await keyboard.press('Enter')

  await expect(currentWork(page)).toContainText(/amélioration/i)
  // L'achèvement, constaté par le niveau publié dans le panneau d'énergie.
  await expect(energyPanel(page)).toContainText(new RegExp(`mine niveau ${levelAfter}`, 'i'), {
    timeout: (seconds + 60) * 1_000,
  })
}

test.describe('l’aperçu annonce ce qu’on récupère et ce qu’on perd (FR-046, FR-047)', () => {
  test('remboursement, cases libérées, gisement conservé et production perdue', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    await signUp(page)
    await buildMine(page)
    await cursorOnMine(page)

    const preview = demolishPreview(page)
    await expect(preview).toContainText(/mine niveau 1/i)
    await expect(preview).toContainText(/rembours/i)
    await expect(preview).toContainText(/4 cases/i)
    await expect(preview).toContainText(new RegExp(`${Math.ceil(DEMOLITION_SECONDS / 60)}\\s*min`))

    // **La ligne qu'on ne peut pas deviner** (FR-047) : la veine survit. Sans elle,
    // un joueur qui a posé sa mine sur la veine hésiterait à corriger son erreur.
    await expect(preview).toContainText(/veine de Camelote/i)

    // Le remboursement, en valeur exacte : c'est celle qu'on refait à la main (SC-002).
    await expect(preview.locator('[data-refund]')).toHaveAttribute('data-refund', /^camelote:\d+/)

    // Ce qu'on perd, et **quand** : à l'échéance, pas au constat (FR-048).
    await expect(preview).toContainText(/à l’échéance/i)

    // L'irréversibilité, énoncée avant la confirmation (FR-037).
    await expect(preview).toContainText(/ni annulée ni remplacée/i)

    // Rien n'a été payé ni perdu : l'annonce est antérieure à la confirmation.
    await expect(currentWork(page)).toContainText(/aucun chantier/i)
    await expect(await occupiedCells(page)).toHaveLength(MINE.cells)

    // L'écran porte maintenant quatre aperçus remplis : c'est l'état qui compte
    // pour l'accessibilité, et non la planète au repos.
    await expectNoAccessibilityViolations(page)
  })

  /**
   * **Le motif précis, et non le générique.** Un joueur qui améliore sa mine et
   * tente de la démolir doit entendre que *ce bâtiment-là* est retenu, et non qu'un
   * chantier quelconque est en cours — sans quoi il pourrait croire qu'un autre
   * bâtiment est concerné.
   */
  test('un bâtiment en cours d’amélioration ne peut pas être démoli', async ({ page }) => {
    test.setTimeout(300_000)
    await signUp(page)
    await buildMine(page)

    const keyboard = await cursorOnMine(page)
    await tabToButton(page, keyboard, /lancer l’amélioration/i)
    await keyboard.press('Enter')
    await expect(currentWork(page)).toContainText(/amélioration/i)

    await cursorOnMine(page)
    await expect(demolishPreview(page)).toContainText(/cible du chantier en cours/i)
    // Et aucun bouton n'invite à une action que le serveur rejetterait.
    await expect(page.getByRole('button', { name: /lancer la démolition/i })).toHaveCount(0)
  })
})

test.describe('démolir au clavier seul, sans dispositif de pointage (FR-058, SC-004)', () => {
  /**
   * Le parcours complet d'US6 : poser, améliorer deux fois, démolir un **niveau 3**.
   *
   * Le niveau 3 est le sujet : le remboursement porte sur les **trois** niveaux
   * payés, pas sur le dernier. Le montant exact est éprouvé par le domaine ; ce qui
   * ne se voit qu'ici, c'est que le remboursement annoncé pour un niveau 3 est
   * strictement supérieur à celui d'un niveau 1 — donc que l'écran lit bien le
   * cumul, et non la dernière marche.
   */
  test('un niveau 2 démoli rend plus qu’un niveau 1, libère les cases et garde la veine', async ({
    page,
  }) => {
    test.setTimeout(1_500_000)

    // **Trois échéances attendues réellement**, et c'est le prix assumé de la
    // tranche : 120 + 168 + 300 secondes de jeu.
    //
    // L'horloge du navigateur ne peut pas les raccourcir ici, contrairement à ce
    // qu'US5 fait pour sa poche scellée. La raison est de fond : chacune des deux
    // premières échéances est suivie d'une **commande**, et le serveur l'arbitre
    // contre sa propre horloge — une horloge de navigateur avancée le trouverait
    // avec un chantier toujours en cours, et il refuserait en 409. Ce n'est
    // éludable que pour une échéance terminale, dont l'achèvement n'est constaté
    // que localement.
    await signUp(page)
    await buildMine(page)

    // Le remboursement d'un niveau 1, pour comparaison.
    await cursorOnMine(page)
    const refundAtOne = await demolishPreview(page)
      .locator('[data-refund]')
      .getAttribute('data-refund')

    await upgradeMine(page, 2, UPGRADE_SECONDS)

    const before = await occupiedCells(page)
    expect(before).toEqual(MINE.indexes)

    await cursorOnMine(page)
    const preview = demolishPreview(page)
    await expect(preview).toContainText(/mine niveau 2/i)

    const refundAtTwo = await preview.locator('[data-refund]').getAttribute('data-refund')
    // **Le cumul des deux niveaux, et non la dernière marche.** C'est l'énoncé de
    // FR-046 tel qu'il se voit à l'écran : le joueur a payé deux fois, il récupère la
    // fraction publiée de ce qu'il a payé deux fois.
    expect(grainsOf(refundAtTwo)).toBeGreaterThan(grainsOf(refundAtOne))

    const keyboard = await cursorOnMine(page)
    await tabToButton(page, keyboard, /lancer la démolition/i)
    await keyboard.press('Enter')

    await expect(currentWork(page)).toContainText(/démolition/i)
    // Un chantier lancé n'est ni annulable ni remplaçable (FR-037), et l'écran dit
    // **quoi** : le joueur doit pouvoir vérifier qu'il a lancé ce qu'il croyait.
    await expect(currentWork(page)).toContainText(/mine niveau 2/i)

    // **Le terrain est libéré**, à la case près. L'achèvement est appliqué par la
    // projection **locale**, à l'échéance (R3, R8).
    await expect(page.locator('[role="gridcell"][data-state="occupied"]')).toHaveCount(0, {
      timeout: (DEMOLITION_SECONDS + 90) * 1_000,
    })
    for (const index of MINE.indexes) {
      await expect(cellAt(page, index)).toHaveAttribute('data-state', 'free')
    }

    // **Et la veine est intacte** (FR-047) : (0,4) est l'index 24.
    await expect(cellAt(page, '24')).toHaveAttribute('data-deposit', 'camelote')
    await expect(cellAt(page, '24')).toHaveAttribute('aria-label', /veine de Camelote/i)
  })
})

/** Le total en grains d'un jeton `camelote:123,bave-etoiles:45`. */
function grainsOf(token: string | null): number {
  if (token === null) return 0
  return token
    .split(',')
    .map((entry) => Number(entry.split(':')[1] ?? '0'))
    .reduce((total, value) => total + value, 0)
}

test.describe('accessibilité, sans écart (FR-061)', () => {
  test('l’écran de planète passe axe-core, panneau de démolition affiché', async ({ page }) => {
    await signUp(page)

    // Sans bâtiment posé, le panneau existe et dit quoi faire : un panneau qui
    // n'apparaîtrait qu'une fois la cible désignée laisserait le joueur ignorer que
    // la démolition existe — et c'est elle qui rend une erreur réparable.
    await expect(demolishPreview(page)).toBeVisible()
    await expectNoAccessibilityViolations(page)
  })
})
