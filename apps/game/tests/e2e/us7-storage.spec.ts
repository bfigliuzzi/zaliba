import { expect, type Page, test } from '@playwright/test'
import { countingKeyboard, homeCursor, signUp, tabToGrid } from './account.js'
import { expectNoAccessibilityViolations } from './axe.js'

/**
 * US7 — Étendre sa capacité de stockage.
 *
 * Le parcours ouvre la tranche, il ne la referme pas : `capacity.test.ts` éprouve la
 * formule, `saturation.test.ts` la tient sur trois semaines au grain près, et
 * `storage-preview.test.ts` vérifie que l'annonce vaut le constat. Trois choses ne
 * sont vérifiables **qu'ici** :
 *
 * - **les trois plafonds relevés, constatés sur l'écran** après achèvement. C'est la
 *   promesse d'US7-1 telle que le joueur la voit, et un test de domaine ne peut pas
 *   voir un rendu ;
 * - **l'effet annoncé avant paiement**, y compris le temps de saturation gagné
 *   (US7-1, US7-2) : l'entrepôt est le seul des cinq types dont la vertu ne soit ni
 *   une production ni une énergie, et un aperçu muet sur les plafonds l'aurait
 *   présenté comme un bâtiment inutile qui consomme de l'énergie ;
 * - **la voie de pose au clavier seul** (FR-058, SC-004), pour ce type comme pour
 *   les autres.
 *
 * **Ce que ce parcours ne fait pas, et pourquoi.** Il ne constate pas une saturation
 * réelle, ni la perte cumulée qu'elle produit. Saturer la Camelote du Berceau demande
 * plus de dix jours à vingt unités par heure, et l'horloge du navigateur ne peut pas
 * les fabriquer : la quantité *stockée* est écrite par le serveur, qui a sa propre
 * horloge. La perte est éprouvée là où elle est vérifiable exactement — par
 * `saturation.test.ts` sur trois semaines et deux mois, et par
 * `resource-panel.test.tsx` pour son affichage. L'écart est consigné dans `tasks.md`.
 */

/** L'entrepôt tient sur une case unique. (5,5) est libre dans la disposition. */
const STORE = { label: /^entrepôt$/i, anchor: { x: 5, y: 5 }, index: '35', seconds: 100 }

/**
 * La capacité du niveau 1, **recopiée** depuis la courbe du catalogue.
 *
 * La recopie est délibérée : le parcours doit échouer si l'équilibrage change sous
 * lui, plutôt que de recalculer son attendu depuis la donnée qu'il éprouve.
 * `2 000 unités × 3 600 = 7 200 000 grains`.
 */
const ADDED_GRAINS = 7_200_000

const buildPreview = (page: Page) => page.getByRole('group', { name: /aperçu de la construction/i })
const currentWork = (page: Page) => page.getByRole('group', { name: /^chantier$/i })
const resourceGroup = (page: Page, name: RegExp) => page.getByRole('group', { name })

/** Le plafond publié pour une ressource, en grains. */
async function capOf(page: Page, resourceId: string): Promise<number> {
  const value = await page
    .locator(`[data-cap][data-resource="${resourceId}"]`)
    .getAttribute('data-cap')
  return Number(value ?? '0')
}

/** Le remplissage publié pour une ressource, en millièmes. */
async function fillOf(page: Page, resourceId: string): Promise<number> {
  const value = await page
    .locator(`[data-fill][data-resource="${resourceId}"]`)
    .getAttribute('data-fill')
  return Number(value ?? '0')
}

const RESOURCES = ['camelote', 'jus', 'bave-etoiles'] as const

test.describe('l’aperçu annonce l’effet sur les plafonds avant paiement (US7-1, US7-2)', () => {
  test('plafonds résultants, capacité ajoutée et saturation repoussée', async ({ page }) => {
    await signUp(page)

    await page.getByRole('radio', { name: STORE.label }).check()

    const preview = buildPreview(page)
    await expect(preview).toContainText(/plafonds après la pose/i)
    // L'ajout **et** le résultat : un joueur qui ne verrait que « +2 000 » devrait
    // connaître son plafond de tête pour savoir ce qu'il achète.
    await expect(preview).toContainText(/\+\s*2[\s ]?000/)
    await expect(preview).toContainText(/saturation repoussée de/i)

    // La valeur exacte, celle qu'on refait à la main (SC-002).
    await expect(preview.locator('[data-cap-added]')).toHaveAttribute(
      'data-cap-added',
      new RegExp(`camelote:${ADDED_GRAINS}`),
    )

    // Rien n'a été payé : l'annonce est antérieure à la confirmation (FR-035).
    await expect(currentWork(page)).toContainText(/aucun chantier/i)
    for (const resourceId of RESOURCES) {
      expect(await capOf(page, resourceId)).toBeLessThan(ADDED_GRAINS * 2)
    }

    await expectNoAccessibilityViolations(page)
  })

  /**
   * **Une mine n'annonce aucun plafond**, et l'absence est le sujet : une ligne
   * « +0 » ferait chercher au joueur un effet qui n'existe pas.
   */
  test('un extracteur n’annonce aucun effet de stockage', async ({ page }) => {
    await signUp(page)
    await page.getByRole('radio', { name: /^mine$/i }).check()

    await expect(buildPreview(page)).not.toContainText(/plafonds après la pose/i)
  })
})

test.describe('poser un entrepôt au clavier seul, sans dispositif de pointage (FR-058, SC-004)', () => {
  test('les trois plafonds augmentent du montant annoncé (US7-1)', async ({ page }) => {
    test.setTimeout(300_000)
    await signUp(page)

    const before = Object.fromEntries(
      await Promise.all(RESOURCES.map(async (id) => [id, await capOf(page, id)] as const)),
    )

    const keyboard = countingKeyboard(page)
    await page.getByRole('radio', { name: STORE.label }).check()
    await tabToGrid(page, keyboard)
    await homeCursor(keyboard)
    await keyboard.press('ArrowRight', STORE.anchor.x)
    await keyboard.press('ArrowDown', STORE.anchor.y)
    await keyboard.press('Enter')

    await expect(currentWork(page)).toContainText(/construction/i)
    await expect(currentWork(page)).toContainText(/entrepôt/i)

    // L'achèvement est appliqué par la projection **locale**, à l'échéance (R3, R8).
    await expect(page.locator(`[role="gridcell"][data-index="${STORE.index}"]`)).toHaveAttribute(
      'data-state',
      'occupied',
      { timeout: (STORE.seconds + 90) * 1_000 },
    )

    // **Les trois plafonds, relevés du montant annoncé** — au grain près.
    for (const resourceId of RESOURCES) {
      expect(await capOf(page, resourceId), resourceId).toBe(
        (before[resourceId] ?? 0) + ADDED_GRAINS,
      )
    }
  })

  /**
   * **Le remplissage baisse sans que rien ne soit retiré du stock**, et c'est ce que
   * l'entrepôt achète : la même quantité, plus loin du bord. Le constater sur le
   * pourcentage plutôt que sur le plafond est ce qui distingue « j'ai plus de place »
   * de « je suis moins près de perdre ».
   */
  test('le remplissage baisse à stock constant', async ({ page }) => {
    test.setTimeout(300_000)
    await signUp(page)

    const fillBefore = await fillOf(page, 'bave-etoiles')
    expect(fillBefore).toBeGreaterThan(0)

    const keyboard = countingKeyboard(page)
    await page.getByRole('radio', { name: STORE.label }).check()
    await tabToGrid(page, keyboard)
    await homeCursor(keyboard)
    await keyboard.press('ArrowRight', STORE.anchor.x)
    await keyboard.press('ArrowDown', STORE.anchor.y)
    await keyboard.press('Enter')

    await expect(page.locator(`[role="gridcell"][data-index="${STORE.index}"]`)).toHaveAttribute(
      'data-state',
      'occupied',
      { timeout: (STORE.seconds + 90) * 1_000 },
    )

    // La Bave d'étoiles est choisie parce que l'entrepôt n'en coûte que vingt-cinq
    // unités : la baisse de remplissage vient donc du plafond, pas de la dépense.
    expect(await fillOf(page, 'bave-etoiles')).toBeLessThan(fillBefore)
  })
})

test.describe('la perte cumulée est consultable (FR-026, US7-3)', () => {
  /**
   * La perte est **à zéro** sur une planète neuve, et le panneau le dit sans phrase
   * d'échelle : « l'équivalent de 0 plafond » occuperait l'endroit où doit
   * s'afficher, un jour, la raison de poser un entrepôt.
   *
   * Le cas *avec* perte n'est pas éprouvé ici : saturer la Camelote du Berceau demande
   * plus de dix jours de jeu réel, et la quantité stockée est écrite par le serveur.
   * `saturation.test.ts` et `resource-panel.test.tsx` le couvrent.
   */
  test('affiche une perte nulle, sans phrase d’échelle', async ({ page }) => {
    await signUp(page)

    for (const resourceId of RESOURCES) {
      await expect(page.locator(`[data-lost][data-resource="${resourceId}"]`)).toHaveAttribute(
        'data-lost',
        '0',
      )
    }
    await expect(resourceGroup(page, /camelote/i)).not.toContainText(/fois votre plafond/i)
  })

  test('publie les cinq grandeurs par ressource', async ({ page }) => {
    await signUp(page)

    const camelote = resourceGroup(page, /camelote/i)
    for (const label of [/détenu/i, /plafond/i, /remplissage/i, /saturation/i, /perdu/i]) {
      await expect(camelote).toContainText(label)
    }
  })
})

test.describe('accessibilité, sans écart (FR-061)', () => {
  test('l’écran passe axe-core avec un entrepôt sélectionné', async ({ page }) => {
    await signUp(page)
    await page.getByRole('radio', { name: STORE.label }).check()

    await expect(buildPreview(page)).toContainText(/plafonds après la pose/i)
    await expectNoAccessibilityViolations(page)
  })
})
