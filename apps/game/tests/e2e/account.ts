import { expect, type Page } from '@playwright/test'

/**
 * Le parcours d'entrée, écrit une fois.
 *
 * Chaque tranche a besoin d'un joueur installé sur sa planète avant de pouvoir
 * éprouver quoi que ce soit. Recopier l'inscription dans chaque fichier ferait
 * vivre autant de versions du premier écran qu'il y a de parcours — et le jour
 * où l'étiquette d'un champ change, on corrigerait le premier, on oublierait le
 * quatrième, et l'échec parlerait de la planète alors qu'il vient du formulaire.
 */

export interface Credentials {
  readonly email: string
  readonly password: string
}

/**
 * Un compte neuf par appel : le parcours doit valoir pour un inconnu.
 *
 * L'horodatage et le tirage se font **ici**, dans le harnais de test, et jamais
 * dans le jeu — aucune fonction de domaine n'appelle l'horloge.
 */
export function freshAccount(): Credentials {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return { email: `joueuse-${stamp}@zaliba.test`, password: `Mot-de-passe-${stamp}` }
}

/** S'inscrit, et attend que la planète soit là. */
export async function signUp(page: Page, credentials = freshAccount()): Promise<Credentials> {
  await page.goto('/planet')
  await page.getByRole('button', { name: /créer un compte/i }).click()
  await page.getByLabel(/courriel/i).fill(credentials.email)
  await page.getByLabel(/mot de passe/i).fill(credentials.password)
  await page.getByRole('button', { name: /^s’inscrire$/i }).click()

  await expect(page.getByRole('heading', { name: /ma planète/i })).toBeVisible()
  return credentials
}

/**
 * Ouvre une **seconde vue** du jeu sur le même compte.
 *
 * C'est le cas limite « deux onglets ouverts » de la spécification, et il n'est
 * éprouvable qu'ici : deux contextes de navigateur distincts, donc deux
 * sessions réelles, donc deux requêtes que rien côté client ne coordonne.
 */
export async function signIn(page: Page, credentials: Credentials): Promise<void> {
  await page.goto('/planet')
  await page.getByLabel(/courriel/i).fill(credentials.email)
  await page.getByLabel(/mot de passe/i).fill(credentials.password)
  await page.getByRole('button', { name: /^se connecter$/i }).click()

  await expect(page.getByRole('heading', { name: /ma planète/i })).toBeVisible()
}

/**
 * Un compteur de frappes, pour que SC-001 soit **mesuré** et non affirmé.
 *
 * Le critère porte sur un nombre de frappes de clavier, pas sur une durée : ce
 * qui détruirait la promesse « c'est immédiat » est une interface à sous-menus
 * imbriqués, et cela se compte. Un chronomètre, lui, mesurerait surtout la
 * vitesse de lecture du sujet.
 */
export function countingKeyboard(page: Page) {
  let pressed = 0
  return {
    async press(key: string, times = 1): Promise<void> {
      for (let i = 0; i < times; i += 1) {
        await page.keyboard.press(key)
        pressed += 1
      }
    },
    get count(): number {
      return pressed
    },
  }
}

/**
 * Amène le focus sur la grille, en tabulant.
 *
 * La garde n'est pas une précaution de style : sans elle, une régression qui
 * rendrait la grille inatteignable au clavier ferait tourner la boucle sans fin
 * au lieu d'échouer en nommant le défaut.
 */
export async function tabToGrid(
  page: Page,
  keyboard: ReturnType<typeof countingKeyboard>,
): Promise<void> {
  for (let guard = 0; guard < 20; guard += 1) {
    const role = await page.evaluate(() => document.activeElement?.getAttribute('role'))
    if (role === 'gridcell') return
    await keyboard.press('Tab')
  }
  throw new Error('La grille n’a pas été atteinte au clavier en vingt tabulations.')
}

/**
 * Ramène le curseur de grille dans son coin haut-gauche.
 *
 * Le curseur **persiste** entre deux poses : il n'y a aucune raison de le
 * remettre à zéro dans le jeu — un joueur qui pose deux bâtiments voisins
 * apprécie de repartir d'où il était. Un test qui enchaîne deux poses doit donc
 * dire d'où il part, sous peine de viser une case qu'il croit connaître.
 */
export async function homeCursor(
  keyboard: ReturnType<typeof countingKeyboard>,
  bounds = { width: 6, height: 6 },
): Promise<void> {
  await keyboard.press('ArrowLeft', bounds.width)
  await keyboard.press('ArrowUp', bounds.height)
}
