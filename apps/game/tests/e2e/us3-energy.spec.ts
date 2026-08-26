import { expect, type Page, test } from '@playwright/test'
import { countingKeyboard, homeCursor, signUp, tabToGrid } from './account.js'
import { expectNoAccessibilityViolations } from './axe.js'

/**
 * US3 — Alimenter la colonie en énergie.
 *
 * Le parcours ouvre la tranche, il ne la referme pas : il décrit le
 * comportement attendu de bout en bout, les tests de domaine le raffinent.
 *
 * Trois choses ne sont vérifiables **qu'ici** :
 *
 * - **le déficit réel**, c'est-à-dire obtenu en construisant. Un test de domaine
 *   fabrique un rapport ; seul un parcours prouve qu'un joueur qui pose deux
 *   bâtiments voit effectivement sa production baisser, et de la valeur exacte
 *   que la règle publiée annonce ;
 * - **l'annonce avant paiement** (US3-3). Elle est une propriété de
 *   l'assemblage — l'aperçu est dans le document, atteignable, et antérieur au
 *   bouton — et non du calcul, que `preview.ts` tient déjà ;
 * - **la capacité non dégradée** (FR-023b, R21). Elle se constate sur deux
 *   panneaux à la fois : l'entrepôt figure dans la consommation d'énergie *et*
 *   les plafonds ne baissent pas. Aucun test de composant ne voit les deux.
 *
 * **Le prix en temps est assumé.** Le déficit exige trois chantiers achevés, et
 * les durées sont des données d'équilibrage : les raccourcir pour la commodité
 * d'un test reviendrait à éprouver un jeu qui n'existe pas.
 */

/** L'énergie de base du Berceau (R7). Rien d'autre n'en produit ici. */
const BASE_ENERGY = 20

/**
 * Les trois chantiers, dans l'ordre où le parcours les lance.
 *
 * `consumption` est la valeur de niveau 1 de la courbe du catalogue, et la
 * recopier ici est délibéré : le test doit échouer si le catalogue change sous
 * lui, plutôt que de recalculer l'attendu depuis la donnée qu'il éprouve.
 *
 * La somme vaut **24 pour 20 produits** : c'est le plus petit déficit que trois
 * types du catalogue peuvent composer sur cette disposition.
 */
const PLAN = [
  /** Carré de quatre sur la veine de Camelote, le seul placement qui la couvre. */
  { typeId: 'mine', label: /^mine$/i, anchor: { x: 0, y: 4 }, consumption: 8, seconds: 120 },
  /** Carré de neuf : le bloc `x ∈ 3..5, y ∈ 3..5` est le seul entièrement libre. */
  { typeId: 'racloir', label: /^racloir$/i, anchor: { x: 3, y: 3 }, consumption: 14, seconds: 200 },
  /** Une case libre quelconque, hors des deux empreintes précédentes. */
  {
    typeId: 'entrepot',
    label: /^entrepôt$/i,
    anchor: { x: 2, y: 5 },
    consumption: 2,
    seconds: 100,
  },
] as const

/** La production nominale de niveau 1 de la mine, sur un gisement (R5). */
const MINE_NOMINAL = 15

/** `⌊ nominal × E₊ ÷ E₋ ⌋` — une seule troncature, sur le taux (R5). */
function effectiveRate(nominal: number, produced: number, consumed: number): number {
  if (consumed <= produced) return nominal
  return Math.floor((nominal * produced) / consumed)
}

const energyPanel = (page: Page) => page.getByRole('group', { name: /^énergie$/i })

/** Pose un bâtiment et attend son achèvement, mesuré par la grille. */
async function build(
  page: Page,
  step: (typeof PLAN)[number],
  occupiedAfter: number,
): Promise<void> {
  const keyboard = countingKeyboard(page)

  await page.getByRole('radio', { name: step.label }).check()
  await tabToGrid(page, keyboard)
  // Le curseur **persiste** entre deux poses : il faut dire d'où l'on repart,
  // sous peine de viser une case qu'on croit connaître.
  await homeCursor(keyboard)
  await keyboard.press('ArrowRight', step.anchor.x)
  await keyboard.press('ArrowDown', step.anchor.y)
  await keyboard.press('Enter')

  await expect(page.getByRole('group', { name: /^chantier$/i })).toContainText(/construction/i)

  // L'achèvement est appliqué par la projection locale, à l'échéance (R3, R8).
  await expect(page.locator('[role="gridcell"][data-state="occupied"]')).toHaveCount(
    occupiedAfter,
    { timeout: (step.seconds + 60) * 1_000 },
  )
}

/** Le plafond d'une ressource, en grains — le chiffre, pas son formatage. */
async function capGrains(page: Page, label: RegExp): Promise<number> {
  const value = await page
    .getByRole('group', { name: label })
    .locator('[data-cap]')
    .getAttribute('data-cap')
  expect(value, 'le plafond doit être lisible en grains').not.toBeNull()
  return Number(value)
}

test.describe('le rapport d’énergie vaut 1 hors déficit (US3-1)', () => {
  test('une planète neuve n’a aucun rendement réduit', async ({ page }) => {
    await signUp(page)

    const panel = energyPanel(page)
    await expect(panel).toBeVisible()
    // La base du Berceau et les centrales sont **distinguées** (FR-024) : le
    // joueur doit savoir laquelle des deux il peut faire grandir.
    await expect(panel).toContainText(/berceau/i)
    await expect(panel).toContainText(/centrales/i)
    await expect(panel).toContainText(new RegExp(`produite\\s*${BASE_ENERGY}`, 'i'))
    await expect(panel).toContainText(/consommée\s*0/i)
    // Deux faits distincts : les membres, et le rapport. Sur une planète neuve
    // `E₋` vaut zéro — les deux membres se lisent, le quotient n'existe pas.
    await expect(panel).toHaveAttribute('data-energy', `${BASE_ENERGY}/0`)
    await expect(panel.locator('[data-energy-ratio]')).toHaveAttribute('data-energy-ratio', '1/1')
    await expect(panel).not.toContainText(/déficit/i)
  })
})

test.describe('l’aperçu annonce le basculement en déficit avant paiement (US3-3)', () => {
  /**
   * La mine seule ne suffit pas à créer un déficit — c'est bien le point : ce
   * qui est éprouvé est l'annonce d'un déficit **à venir**, sur un état qui n'en
   * a pas encore. Le racloir en aperçu porterait la consommation à 22 pour 20
   * produits, et le joueur doit le lire avant d'engager sa dépense.
   */
  test('le rapport résultant et la production résultante sont dans le document', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    await signUp(page)
    await build(page, PLAN[0], 4)

    const keyboard = countingKeyboard(page)
    await page.getByRole('radio', { name: PLAN[1].label }).check()
    await tabToGrid(page, keyboard)
    await homeCursor(keyboard)
    await keyboard.press('ArrowRight', PLAN[1].anchor.x)
    await keyboard.press('ArrowDown', PLAN[1].anchor.y)

    const consumedAfter = PLAN[0].consumption + PLAN[1].consumption
    const preview = page.getByRole('group', { name: /aperçu de la construction/i })
    await expect(preview).toContainText(/énergie/i)
    await expect(preview).toContainText(/déficit/i)
    await expect(preview.locator('[data-energy-after]')).toHaveAttribute(
      'data-energy-after',
      `${BASE_ENERGY}/${consumedAfter}`,
    )

    // Rien n'a été payé : l'annonce est antérieure à la confirmation (FR-050).
    await expect(page.getByRole('group', { name: /^chantier$/i })).toContainText(/aucun chantier/i)
  })
})

test.describe('en déficit, la production est réduite au prorata (US3-2, US3-4)', () => {
  /**
   * Le parcours entier, en un seul cas : trois chantiers achevés, donc sept
   * minutes de jeu réel. Les découper coûterait trois inscriptions et trois fois
   * la même attente, pour éprouver un état que seul le dernier chantier atteint.
   */
  test('le rapport affiché, la production effective et les plafonds intacts', async ({ page }) => {
    test.setTimeout(900_000)
    await signUp(page)

    await build(page, PLAN[0], 4)
    await build(page, PLAN[1], 13)

    const panel = energyPanel(page)
    const deficit = PLAN[0].consumption + PLAN[1].consumption

    await expect(panel).toHaveAttribute('data-energy', `${BASE_ENERGY}/${deficit}`)
    await expect(panel.locator('[data-energy-ratio]')).toHaveAttribute(
      'data-energy-ratio',
      `${BASE_ENERGY}/${deficit}`,
    )
    await expect(panel).toContainText(/déficit/i)

    // FR-024 : les deux valeurs sont affichées **séparément**. Un joueur qui ne
    // verrait que l'effective ne saurait pas s'il produit peu ou s'il est bridé,
    // alors que les deux situations appellent des décisions opposées.
    const mineRow = panel.locator('[data-building-rate]').first()
    await expect(mineRow).toHaveAttribute(
      'data-building-rate',
      `${MINE_NOMINAL}/${effectiveRate(MINE_NOMINAL, BASE_ENERGY, deficit)}`,
    )

    // US3-4 : l'entrepôt pèse sur le rapport sans que sa capacité soit dégradée.
    const capBefore = await capGrains(page, /^camelote$/i)
    await build(page, PLAN[2], 14)

    const saturated = deficit + PLAN[2].consumption
    await expect(panel).toHaveAttribute('data-energy', `${BASE_ENERGY}/${saturated}`)
    await expect(panel).toContainText(/entrepôt/i)

    // Le rapport ne mord **que** sur la production (FR-023b, R21). Le plafond ne
    // baisse pas — et il augmentera avec US7, qui donne sa capacité à l'entrepôt.
    expect(await capGrains(page, /^camelote$/i)).toBeGreaterThanOrEqual(capBefore)

    // La base du Berceau n'est jamais touchée (FR-018) : même bridée, la planète
    // produit, donc aucun état de jeu n'est définitivement bloquant.
    await expect(page.getByRole('group', { name: /^camelote$/i })).toContainText(/détenu/i)
  })
})

test.describe('accessibilité, sans écart (FR-061)', () => {
  test('l’écran de planète passe axe-core, panneau d’énergie affiché', async ({ page }) => {
    await signUp(page)

    await expect(energyPanel(page)).toBeVisible()
    await expectNoAccessibilityViolations(page)
  })
})
