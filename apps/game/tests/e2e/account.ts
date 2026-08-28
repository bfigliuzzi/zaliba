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

/**
 * Le délai d'attente de l'entrée en jeu.
 *
 * **Vingt secondes, et non les cinq par défaut.** L'inscription n'est pas une requête,
 * c'est une chaîne : créer le compte auprès de GoTrue, obtenir la session, lire la
 * planète — qui répond 404 pour un joueur neuf (R11) —, la provisionner, puis rendre
 * l'écran. Cinq maillons, dont trois traversent une pile conteneurisée.
 *
 * Le délai par défaut suffisait tant que la pile était fraîche. Il a commencé à échouer
 * par intermittence après plusieurs séries de parcours, et le diagnostic est net :
 * GoTrue rend `couldn't start a new transaction` sous concurrence — son pool interne,
 * non celui de PostgreSQL, qui reste à dix-sept connexions sur cent. Un délai qui tient
 * seulement sur une pile neuve n'éprouve pas le jeu, il éprouve la machine.
 *
 * **Vingt et non trente**, et l'écart n'est pas arbitraire : le délai d'un *test* vaut
 * trente secondes par défaut. Les faire égaux rendrait cette attente inatteignable —
 * le test expirerait avant que l'assertion n'ait le droit d'échouer, et le message
 * dirait « test timeout » là où la cause est une inscription lente. Une attente doit
 * pouvoir échouer en nommant ce qu'elle attendait.
 *
 * **Ce n'est pas une tolérance sur le comportement**, et la nuance compte : l'attente
 * ne masque aucun défaut du jeu, elle laisse à l'infrastructure locale le temps de
 * répondre. Un vrai défaut échouerait tout autant à vingt secondes qu'à cinq.
 */
const ENTRY_TIMEOUT = 20_000

/**
 * La seule défaillance d'infrastructure que `signUp` réessaie.
 *
 * GoTrue local abandonne parfois l'ouverture d'une connexion vers PostgreSQL —
 * `couldn't start a new transaction: context deadline exceeded` dans ses journaux, un
 * **504** sur le réseau, et cette phrase à l'écran. La cause est la latence
 * d'entrée-sortie de la machine virtuelle Docker sur macOS, qui frôle le délai que
 * GoTrue s'accorde ; à volume égal — six cent soixante-sept comptes tiennent dans un
 * mégaoctet —, l'échec est intermittent et non progressif.
 *
 * **Le motif est étroit à dessein.** Un identifiant refusé, un mot de passe trop court,
 * un compte déjà pris : tous produisent d'autres messages, et aucun n'est réessayé. Ce
 * qu'on absorbe est une panne de la pile locale, jamais un refus du jeu.
 */
const INFRASTRUCTURE_TIMEOUT = /timed out, please retry|Database error/i

/**
 * Remplit le formulaire d'inscription et l'envoie.
 *
 * Séparé de `signUp` pour que la réémission n'ait pas à rejouer la navigation : le
 * formulaire est déjà à l'écran, et son état d'erreur y reste jusqu'au prochain envoi.
 */
async function submitSignUp(page: Page, credentials: Credentials): Promise<void> {
  await page.getByLabel(/courriel/i).fill(credentials.email)
  await page.getByLabel(/mot de passe/i).fill(credentials.password)
  await page.getByRole('button', { name: /^s’inscrire$/i }).click()
}

/**
 * S'inscrit, et attend que la planète soit là.
 *
 * **Une seule réémission**, et seulement sur la défaillance nommée ci-dessus. Boucler
 * plus longtemps ferait d'un test un outil de surveillance : si la pile locale ne
 * répond pas deux fois de suite, ce n'est plus une intermittence, et le parcours doit
 * le dire plutôt que l'absorber.
 */
export async function signUp(page: Page, credentials = freshAccount()): Promise<Credentials> {
  await page.goto('/planet')
  await page.getByRole('button', { name: /créer un compte/i }).click()
  await submitSignUp(page, credentials)

  /*
    **Le titre de l'écran est l'identité de la planète, depuis 002** (FR-008).

    Il portait « Ma planète », qui ne disait pas *où* le joueur se trouvait — la
    première des quatre choses que l'écran doit dire en une seconde. Tant que la
    planète n'a pas de nom propre, c'est le nom de son **archétype** qui tient ce
    rôle, et tous les comptes neufs sont installés sur le Berceau (R7 de 001 :
    « identique pour tous les joueurs, aucun tirage au sort »).

    *Ce harnais n'était nommé par aucune tâche de 002* : T017a listait les trois
    parcours qui affirment une position de case, et celui-ci affirme un titre. Or il
    est appelé par **tous** les parcours, y compris ceux de 001 : l'oublier les aurait
    tous fait échouer à l'inscription, pour une raison sans rapport avec ce qu'ils
    mesurent.
  */
  const planet = page.getByRole('heading', { level: 1, name: /berceau/i })
  const alert = page.getByRole('alert')

  // La première des deux issues qui se présente : l'écran de planète, ou une alerte.
  // Attendre l'écran seul ferait patienter vingt secondes sur un refus immédiat.
  await expect
    .poll(
      async () =>
        (await planet.count()) > 0 ? 'planete' : (await alert.count()) > 0 ? 'alerte' : 'attente',
      {
        timeout: ENTRY_TIMEOUT,
      },
    )
    .not.toBe('attente')

  if ((await planet.count()) === 0) {
    const message = (await alert.first().textContent()) ?? ''
    if (!INFRASTRUCTURE_TIMEOUT.test(message)) {
      throw new Error(`L’inscription a été refusée pour une raison de jeu : ${message}`)
    }
    // La pile locale a abandonné. Une seule réémission, sur le même compte : GoTrue
    // n'a rien écrit, donc l'identifiant est encore libre.
    await submitSignUp(page, credentials)
  }

  await expect(planet).toBeVisible({ timeout: ENTRY_TIMEOUT })
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

  // Même patience que pour l'inscription, et pour la même raison : la chaîne est la
  // même, moins la création du compte.
  // Même titre que pour l'inscription : l'identité de la planète (FR-008).
  await expect(page.getByRole('heading', { level: 1, name: /berceau/i })).toBeVisible({
    timeout: ENTRY_TIMEOUT,
  })
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
 * Amène le focus sur la grille, **par le chemin le plus court**.
 *
 * La garde n'est pas une précaution de style : sans elle, une régression qui
 * rendrait la grille inatteignable au clavier ferait tourner la boucle sans fin
 * au lieu d'échouer en nommant le défaut.
 *
 * ---
 *
 * **La direction est un paramètre depuis 002**, et le motif est un changement d'ordre
 * du document, non une commodité de test.
 *
 * En 001, le panneau de construction précédait la grille : après avoir choisi un type,
 * tabuler **vers l'avant** menait à la grille en une ou deux frappes. FR-006 met
 * désormais le plan **avant** les actions (R16), et le chemin naturel depuis le
 * sélecteur de type est donc `Maj+Tab` — c'est exactement l'aller-retour que R16
 * décrit : « le joueur tabule à travers la grille avant d'atteindre le choix de
 * bâtiment, puis **revient** à la grille pour placer ».
 *
 * Tabuler vers l'avant depuis le sélecteur obligerait à traverser les quatre
 * mécaniques, le registre et la légende, puis à **boucler** sur le document entier :
 * une dizaine de frappes pour un mouvement qu'une seule suffit à faire. Le compte de
 * SC-001 mesurerait alors le harnais et non l'écran.
 */
export async function tabToGrid(
  page: Page,
  keyboard: ReturnType<typeof countingKeyboard>,
  direction: 'avant' | 'arriere' = 'avant',
): Promise<void> {
  const touche = direction === 'avant' ? 'Tab' : 'Shift+Tab'

  for (let guard = 0; guard < 20; guard += 1) {
    const role = await page.evaluate(() => document.activeElement?.getAttribute('role'))
    if (role === 'gridcell') return
    await keyboard.press(touche)
  }
  throw new Error(`La grille n’a pas été atteinte au clavier en vingt frappes de ${touche}.`)
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
