import { expect, type Page, test } from '@playwright/test'
import { countingKeyboard, signUp } from './account.js'
import { expectNoAccessibilityViolations } from './axe.js'

/**
 * US8 — Consulter les règles de calcul.
 *
 * **Le seul parcours du lot dont l'énoncé est une égalité entre deux écrans.** Les
 * autres tranches vérifient qu'une action produit un effet ; celle-ci vérifie que ce
 * que le jeu *affiche* se **recalcule** depuis ce que le jeu *publie*. SC-002 le dit
 * ainsi : « prendre un échantillon de chiffres affichés en jeu et les recalculer à la
 * main depuis la seule page de règles. Écart attendu : aucun ».
 *
 * Le test le fait littéralement. Il relève les chiffres de l'écran de planète, lit les
 * **paramètres** de la page de règles, refait les multiplications, et compare. Un test
 * qui se contenterait de chercher les mêmes nombres des deux côtés serait satisfait par
 * deux tables recopiées à la main — c'est-à-dire par exactement ce que R15 interdit.
 *
 * **La page de règles est atteinte au clavier seul** (FR-058, SC-004) : c'est une page
 * qu'on consulte *pendant* une décision, et l'atteindre à la souris seule en ferait un
 * détour que le joueur cesserait de prendre.
 */

const rulesRegion = (page: Page, name: RegExp) => page.getByRole('region', { name })

/**
 * Rejoindre les règles **par le lien du routeur**, sans recharger le document.
 *
 * Un `page.goto('/rules')` recharge, donc réinstancie le module du client qui se
 * souvient de la longueur de gong reçue avec l'instantané de planète : la page
 * retomberait sur son état « rien reçu », où elle publie les gongs seuls et
 * n'affiche aucune seconde. Ce n'est pas une astuce de test — c'est le
 * comportement réel et voulu (FR-013) —, mais ce n'est pas le parcours que
 * SC-002 décrit : « refaire un chiffre **affiché en jeu** » suppose un joueur
 * qui est en jeu, donc qui a reçu la longueur.
 *
 * Les tests qui n'ont pas besoin des secondes gardent `page.goto` : c'est le
 * visiteur qui lit les règles sans compte, et il est éprouvé pour lui-même.
 */
async function goToRules(page: Page): Promise<void> {
  await page.getByRole('link', { name: /règles du jeu/i }).click()
  await expect(page.getByRole('heading', { name: /règles du jeu/i })).toBeVisible()
}
const buildPreview = (page: Page) => page.getByRole('group', { name: /aperçu de la construction/i })

/**
 * Atteint un lien **par tabulation**, et échoue en le nommant si la boucle n'aboutit
 * pas.
 *
 * Sans la garde, une régression qui rendrait la navigation inatteignable au clavier
 * ferait tourner la boucle sans fin au lieu de nommer le défaut.
 */
async function tabToLink(
  page: Page,
  keyboard: ReturnType<typeof countingKeyboard>,
  label: RegExp,
): Promise<void> {
  for (let guard = 0; guard < 40; guard += 1) {
    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? '',
      text: document.activeElement?.textContent ?? '',
    }))
    if (focused.tag === 'A' && label.test(focused.text)) return
    await keyboard.press('Tab')
  }
  throw new Error(`Le lien ${label} n’a pas été atteint au clavier en quarante tabulations.`)
}

/** Un nombre lu dans un texte français, séparateurs de milliers compris. */
function parseFrench(text: string): number {
  return Number(text.replace(/[\s  ]/g, '').replace(',', '.'))
}

/**
 * Les paramètres d'une courbe géométrique, lus de la page de règles.
 *
 * La phrase publiée est `géométrique : ⌊BASE × (NUM ÷ DEN)^(niveau − 1)⌋`. La lire
 * plutôt que la recopier est tout le sujet : c'est ce qui prouve que le joueur a de
 * quoi refaire le calcul, et non seulement que le calcul est juste.
 */
function readGeometric(text: string): { base: number; num: number; den: number } {
  const match = /⌊([\d\s  ]+) × \((\d+) ÷ (\d+)\)/.exec(text)
  if (match === null) throw new Error(`Aucune courbe géométrique lisible dans : ${text}`)
  return {
    base: parseFrench(match[1] ?? '0'),
    num: Number(match[2]),
    den: Number(match[3]),
  }
}

/** `⌊base × (num ÷ den)^(niveau − 1)⌋` — la formule publiée, refaite à la main. */
function geometricAt(curve: { base: number; num: number; den: number }, level: number): number {
  const exponent = BigInt(level - 1)
  return Number(
    (BigInt(curve.base) * BigInt(curve.num) ** exponent) / BigInt(curve.den) ** exponent,
  )
}

test.describe('les règles sont atteignables au clavier seul (FR-058, SC-004)', () => {
  test('une tabulation et une entrée mènent de la planète aux règles', async ({ page }) => {
    await signUp(page)

    const keyboard = countingKeyboard(page)
    await tabToLink(page, keyboard, /règles du jeu/i)
    await keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: /règles du jeu/i })).toBeVisible()
    // Une page de référence se consulte *pendant* une décision : le chemin du retour
    // doit être là, sinon le joueur cesse d'y aller.
    await expect(page.getByRole('link', { name: /retourner à ma planète/i })).toBeVisible()
  })

  test('les règles sont lisibles sans compte', async ({ page }) => {
    await page.goto('/rules')
    await expect(page.getByRole('heading', { name: /règles du jeu/i })).toBeVisible()
    // Exiger un compte pour lire les règles serait les cacher à moitié : c'est la
    // promesse faite à P4.
    // Le nom est **ancré**, comme partout ailleurs dans ce fichier : chaque table large
    // est une région défilante nommée depuis la mise en page, donc `/mine/i` seul
    // trouverait aussi « Mine — valeurs par niveau ».
    await expect(rulesRegion(page, /^mine$/i)).toBeVisible()
  })
})

test.describe('tout chiffre affiché se recalcule depuis la seule page de règles (SC-002)', () => {
  /**
   * **L'énoncé central de la tranche.** Le coût et la durée annoncés par l'aperçu de
   * construction sont recalculés depuis les *paramètres* que la page de règles publie
   * — jamais depuis une table recopiée.
   */
  test('le coût et la durée d’une mine se refont depuis les paramètres publiés', async ({
    page,
  }) => {
    await signUp(page)

    // 1. Relever ce que l'écran de planète annonce.
    await page.getByRole('radio', { name: /^mine$/i }).check()
    const announced = (await buildPreview(page).textContent()) ?? ''

    const costMatch = /([\d\s  ]+) Camelote/.exec(announced)
    const durationMatch = /(\d+)\s*min/.exec(announced)
    expect(costMatch, 'le coût en Camelote n’est pas annoncé').not.toBeNull()
    expect(durationMatch, 'la durée n’est pas annoncée').not.toBeNull()

    const announcedCost = parseFrench(costMatch?.[1] ?? '0')
    const announcedMinutes = Number(durationMatch?.[1] ?? '0')

    // 2. Lire les paramètres de la page de règles, et **eux seuls**.
    await goToRules(page)
    const mine = rulesRegion(page, /^mine$/i)
    await expect(mine).toBeVisible()

    const costLine =
      (await mine
        .getByText(/géométrique/)
        .first()
        .textContent()) ?? ''
    const costCurve = readGeometric(costLine)

    /*
      **Le libellé est ancré sur « en secondes »**, et il doit l'être depuis 003 :
      la page publie chaque durée deux fois, en gongs et en secondes. Un
      `hasText: /durée de construction/i` seul trouve les deux lignes et prend la
      première, c'est-à-dire celle en gongs — le test comparait alors douze gongs
      à deux minutes, et concluait à un écart d'équilibrage.

      C'est la leçon d'US2 qui se représente : un localisateur qui accepte deux
      repères n'éprouve ni l'un ni l'autre.
    */
    const durationLine =
      (await mine
        .locator('dt', { hasText: /durée de construction, en secondes/i })
        .locator('+ dd')
        .textContent()) ?? ''
    const durationCurve = readGeometric(durationLine)

    // 3. Refaire le calcul, et comparer. Écart attendu : aucun.
    expect(geometricAt(costCurve, 1)).toBe(announcedCost)
    expect(Math.ceil(geometricAt(durationCurve, 1) / 60)).toBe(announcedMinutes)
  })

  /**
   * **La production annoncée se refait aussi**, et c'est le calcul le plus riche des
   * cinq : il fait intervenir les quatre facteurs de FR-053 — la valeur de base, le
   * facteur de niveau, les gisements recouverts et le rapport d'énergie.
   *
   * Le placement retenu recouvre **un** gisement et la planète n'est pas en déficit :
   * le produit se réduit donc à la valeur de base, ce qui est précisément ce que la
   * page doit permettre de vérifier.
   */
  test('la production annoncée se refait depuis la formule publiée', async ({ page }) => {
    await signUp(page)

    // Le seul carré de quatre qui couvre la veine de Camelote de (0,4).
    await page.getByRole('radio', { name: /^mine$/i }).check()
    await page.locator('[role="gridcell"][data-index="24"]').click()

    const announced = (await buildPreview(page).textContent()) ?? ''
    const rateMatch = /(\d+) par heure/.exec(announced)
    const depositsMatch = /Gisements recouverts\s*(\d+)/.exec(announced.replace(/\s+/g, ' '))
    expect(rateMatch, 'la production n’est pas annoncée').not.toBeNull()

    const announcedRate = Number(rateMatch?.[1] ?? '0')
    const deposits = Number(depositsMatch?.[1] ?? '1')

    await goToRules(page)
    const mine = rulesRegion(page, /^mine$/i)

    // Ancré sur « unités par heure » : la page publie aussi les grains par gong.
    const productionLine =
      (await mine
        .locator('dt', { hasText: /production par gisement, en unités par heure/i })
        .locator('+ dd')
        .textContent()) ?? ''
    const curve = readGeometric(productionLine)

    // `⌊production(niveau)⌋ × gisements` — la formule que la page énonce.
    expect(geometricAt(curve, 1) * deposits).toBe(announcedRate)
  })

  /**
   * **Le plafond de stockage et la production de base**, relevés sur la planète et
   * retrouvés dans la table de la page de règles. Ce sont les deux chiffres dont tout
   * le reste dépend : sans eux, le temps avant saturation n'est pas refaisable.
   */
  test('le plafond et la production de base concordent avec la table publiée', async ({ page }) => {
    await signUp(page)

    const capGrains = Number(
      (await page.locator('[data-cap][data-resource="camelote"]').getAttribute('data-cap')) ?? '0',
    )
    expect(capGrains).toBeGreaterThan(0)

    await goToRules(page)

    // La table de la production de base porte les deux colonnes : par heure, et
    // plafond de base. Un joueur y lit de quoi calculer `⌈(plafond − quantité) ÷ taux⌉`.
    const row = page
      .getByRole('row')
      .filter({ hasText: /^Camelote/ })
      .first()
    const cells = await row.getByRole('cell').allTextContents()
    expect(cells.length).toBeGreaterThanOrEqual(2)

    const perHour = parseFrench(cells[0] ?? '0')
    const baseCap = parseFrench(cells[1] ?? '0')

    // Le grain est publié : c'est lui qui relie les unités de la page aux grains de
    // l'attribut (R1).
    await expect(page.getByText(/3[\s  ]600 grains/)).toBeVisible()
    expect(baseCap * 3_600).toBe(capGrains)
    expect(perHour).toBeGreaterThan(0)
  })

  /**
   * **Le déblaiement aussi**, et c'est celui qui compte le plus pour la lisibilité de
   * la planète : la page publie ce que chaque type d'obstacle révèle, donc le joueur
   * sait ce qu'un déblaiement donnera *avant* d'en lancer un (FR-044).
   */
  test('le coût et le résultat d’un déblaiement concordent avec la table publiée', async ({
    page,
  }) => {
    await signUp(page)

    // (3,2) : la poche scellée, qui révèle un geyser de Jus.
    await page.locator('[role="gridcell"][data-index="15"]').click()
    const announced =
      (await page.getByRole('group', { name: /aperçu du déblaiement/i }).textContent()) ?? ''

    const costMatch = /([\d\s  ]+) Camelote/.exec(announced)
    const announcedCost = parseFrench(costMatch?.[1] ?? '0')
    expect(announcedCost).toBeGreaterThan(0)
    expect(announced).toMatch(/geyser de Jus/i)

    await goToRules(page)
    const row = page
      .getByRole('row')
      .filter({ hasText: /poche scellée/i })
      .first()
    const cells = await row.getByRole('cell').allTextContents()

    expect(cells[0], 'le coût publié').toContain(String(announcedCost))
    expect(cells[2], 'le résultat publié').toMatch(/geyser de Jus/i)
  })
})

/**
 * **La longueur du gong est publiée, et chaque durée l'est deux fois** (US1,
 * FR-016, FR-017).
 *
 * Le parcours vérifie ce qu'un test de rendu ne peut pas : que la longueur
 * annoncée par le **vrai** serveur arrive jusqu'à la page, en passant par
 * l'instantané de planète. C'est le trajet complet de la source unique de
 * vérité, et il n'a de sens qu'ici.
 *
 * **L'ordre des deux visites n'est pas indifférent.** La page ouverte avant
 * toute planète ne connaît pas la longueur du serveur : elle publie les gongs
 * seuls et le dit. Il faut donc voir la planète d'abord pour que les secondes
 * apparaissent — et c'est cette transition-là qui prouve que rien n'est codé en
 * dur côté client.
 *
 * **Et la navigation se fait par le lien, jamais par `page.goto`.** Un `goto`
 * recharge le document, donc réinstancie le module qui se souvient de la
 * longueur reçue : la page de règles retomberait sur son état « rien reçu », et
 * le test échouerait pour une raison qui n'est pas la sienne. Ce n'est pas une
 * astuce de test — c'est le comportement réel, et il est voulu : un onglet neuf
 * ouvert directement sur `/rules` n'a effectivement rien reçu du serveur, et
 * publie donc les gongs seuls en le disant.
 */
test.describe('la page de règles publie le gong du serveur (FR-016, FR-017)', () => {
  test('énonce la longueur et donne les deux colonnes, une fois la planète vue', async ({
    page,
  }) => {
    // `signUp` laisse le navigateur sur l'écran de planète : la longueur du gong
    // a donc été reçue avec l'instantané.
    await signUp(page)

    // Le lien du routeur, et non `page.goto` : voir l'en-tête du bloc.
    await page.getByRole('link', { name: /règles du jeu/i }).click()
    await expect(rulesRegion(page, /^mine$/i)).toBeVisible()

    // La longueur, énoncée.
    await expect(page.getByText(/un gong dure/i)).toBeVisible()

    // Les deux colonnes, dans la table des niveaux de la mine.
    const mine = rulesRegion(page, /mine — valeurs par niveau/i)
    await expect(mine.getByRole('columnheader', { name: /durée \(gongs\)/i })).toBeVisible()
    await expect(mine.getByRole('columnheader', { name: /durée \(s\)/i })).toBeVisible()

    // Et le produit tombe juste : douze gongs de dix secondes font cent vingt.
    const row = mine.getByRole('row').filter({ hasText: /^1/ }).first()
    await expect(row).toContainText('12')
    await expect(row).toContainText('120')
  })

  /**
   * **Sans planète vue, aucune seconde.** C'est l'état du visiteur qui lit les
   * règles avant de créer un compte, et c'est le cas normal de cette page
   * publique.
   */
  test('publie les gongs seuls tant qu’aucun instantané n’a été reçu', async ({ page }) => {
    // `goto` et non le lien, et c'est le sujet : une arrivée directe sur `/rules`
    // n'a rien reçu du serveur. C'est le cas normal du visiteur sans compte.
    await page.goto('/rules')
    await expect(rulesRegion(page, /^mine$/i)).toBeVisible()

    await expect(page.getByText(/pas connue/i)).toBeVisible()

    const mine = rulesRegion(page, /mine — valeurs par niveau/i)
    await expect(mine.getByRole('columnheader', { name: /durée \(gongs\)/i })).toBeVisible()
    await expect(mine.getByRole('columnheader', { name: /durée \(s\)/i })).toHaveCount(0)
  })
})

test.describe('accessibilité, sans écart (FR-061)', () => {
  test('la page de règles passe axe-core', async ({ page }) => {
    await page.goto('/rules')
    await expect(rulesRegion(page, /^mine$/i)).toBeVisible()

    // Une page de référence est celle qu'on lit le plus longtemps : ses tables, ses
    // titres et ses repères doivent être irréprochables.
    await expectNoAccessibilityViolations(page)
  })

  /**
   * **La page augmentée passe elle aussi**, et c'est la moitié qui manquerait
   * sans cela : les colonnes ajoutées par 003 doivent garder leurs en-têtes de
   * portée, et la section du gong sa place dans la hiérarchie des titres. Une
   * table à qui l'on ajoute une colonne est l'occasion classique d'un `th` qui
   * perd son `scope`.
   */
  test('la page augmentée de ses deux colonnes passe axe-core', async ({ page }) => {
    await signUp(page)

    await page.getByRole('link', { name: /règles du jeu/i }).click()
    await expect(page.getByText(/un gong dure/i)).toBeVisible()

    await expectNoAccessibilityViolations(page)
  })
})
