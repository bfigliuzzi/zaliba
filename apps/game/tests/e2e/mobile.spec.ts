import { expect, type Page, test } from '@playwright/test'
import { signUp } from './account.js'

/**
 * **SC-009 : la planète tient sur 360 × 640 px, sans défilement ni zoom.**
 *
 * Le critère est un chiffre, pas une intention, et c'est pourquoi il se mesure ici
 * plutôt qu'il ne se juge à l'œil. Trois grandeurs, et aucune n'est négociable :
 *
 * - les **36 cases visibles ensemble**. Une grille qu'il faut faire défiler pour voir
 *   en entier détruit le sujet du jeu : ranger des polyominos suppose de voir l'espace
 *   où on les range. Sur téléphone, c'est la contrainte qui décide de la mise en page ;
 * - les **champs de saisie à 16 px au moins**. En dessous, iOS Safari zoome de lui-même
 *   à la mise au point d'un champ — donc le zoom que SC-009 interdit arrive *par*
 *   l'interface, sans que personne l'ait demandé. *Recentré le 2026-08-28* : la
 *   clause typographique de SC-009 exigeait 16 px pour **tout** le corps de texte,
 *   et ce test le mesurait sur `p, dd, dt, li, label, button, a` — sept sélecteurs
 *   pour un motif qui n'en couvre qu'un. Le plancher du reste du texte passe au
 *   **rôle** (16 / 14 / 12 / 9,5 px), mesuré par `us9-regie.spec.ts` (T090), et
 *   aucune taille de police n'est plus exprimée en pixels. L'amendement est daté et
 *   motivé dans `specs/001-la-planete-mere/spec.md § SC-009` et dans
 *   `specs/002-la-regie-approximative/research.md § R14` ;
 * - les **cibles interactives à 44 × 44 px au moins**. C'est la taille du doigt, pas
 *   celle du curseur, et une cible plus petite se manque — ce qui, dans un jeu où
 *   confirmer engage une dépense, se paie.
 *
 * **Ce test ne tourne que sur le profil `mobile`**, qui porte la fenêtre de 360 × 640
 * de la configuration. Le lancer sur `bureau` mesurerait une fenêtre que SC-009 ne
 * décrit pas, et il passerait pour de mauvaises raisons.
 */

/** La fenêtre que SC-009 nomme. Le test s'abstient hors d'elle. */
const VIEWPORT = { width: 360, height: 640 }

/** Les tailles minimales, en pixels CSS. */
const MIN_FONT_SIZE = 16
const MIN_TARGET = 44

/** Le nombre de cases du Berceau (R7). */
const CELLS = 36

function isMobileViewport(page: Page): boolean {
  const size = page.viewportSize()
  return size?.width === VIEWPORT.width && size?.height === VIEWPORT.height
}

test.describe('la planète tient sur un téléphone (SC-009)', () => {
  test.beforeEach(({ page }) => {
    test.skip(!isMobileViewport(page), 'SC-009 porte sur la fenêtre de 360 × 640 px.')
  })

  test('les 36 cases sont visibles sans défilement', async ({ page }) => {
    await signUp(page)

    const cells = page.locator('[role="gridcell"]')
    await expect(cells).toHaveCount(CELLS)

    /**
     * **La grille entière dans la fenêtre**, et non chaque case prise à part : une
     * case peut être « visible » au sens de Playwright tout en exigeant un
     * défilement pour être atteinte. Ce qui compte est la boîte englobante.
     */
    const bounds = await page.locator('[role="grid"]').boundingBox()
    expect(bounds, 'la grille n’a pas de boîte').not.toBeNull()
    if (bounds === null) return

    expect(bounds.width, 'la grille dépasse en largeur').toBeLessThanOrEqual(VIEWPORT.width)

    // Chaque case a une aire non nulle : une grille écrasée à zéro pixel tiendrait
    // dans n'importe quelle fenêtre sans rien montrer.
    const sizes = await cells.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
    )
    for (const size of sizes) {
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    }
  })

  /**
   * **Aucun défilement horizontal**, et c'est la mesure qui attrape le vrai défaut :
   * un panneau trop large pousse la page, et le joueur perd la grille en cherchant un
   * bouton.
   */
  test('la page ne défile pas horizontalement', async ({ page }) => {
    await signUp(page)

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))

    // Un pixel de tolérance : les sous-pixels d'un rendu à densité fractionnaire ne
    // sont pas un défaut de mise en page.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  })

  test('tout champ de saisie fait au moins 16 px', async ({ page }) => {
    await signUp(page)

    /**
     * **Trois sélecteurs, et non sept** — voir l'amendement en tête de fichier.
     *
     * Le motif de la clause est le zoom automatique d'iOS Safari, et ce
     * déclencheur porte sur les champs de saisie. Mesurer un `<p>` avec la même
     * règle imposait 16 px à tout l'écran pour une raison qui ne le concernait
     * pas — et rendait le jeu de valeurs de la Régie irrecevable pour un motif
     * que personne n'avait examiné.
     *
     * Mesuré sur le texte **rendu**, et non sur une déclaration CSS : c'est la
     * taille calculée qui décide si iOS Safari zoome, et une règle héritée peut
     * réduire un élément que la feuille de style dit pourtant grand.
     *
     * L'écran de parcelle n'en porte aucun ; l'écran d'authentification en porte
     * trois. La règle vaut donc partout dans l'application, et c'est pourquoi elle
     * reste mesurée ici plutôt que déplacée dans un parcours de 002.
     */
    const tooSmall = await page.evaluate((minimum) => {
      const offenders: string[] = []

      for (const node of Array.from(document.querySelectorAll('input, select, textarea'))) {
        const size = Number.parseFloat(window.getComputedStyle(node).fontSize)
        if (size < minimum) {
          offenders.push(`${node.tagName.toLowerCase()} à ${size}px`)
        }
      }
      return offenders
    }, MIN_FONT_SIZE)

    expect(tooSmall, `champ de saisie sous ${MIN_FONT_SIZE}px :\n${tooSmall.join('\n')}`).toEqual(
      [],
    )
  })

  test('toute cible interactive fait au moins 44 × 44 px', async ({ page }) => {
    await signUp(page)

    /**
     * **Les cases de grille comprises** : ce sont les cibles les plus sollicitées du
     * jeu, et les plus faciles à rendre trop petites — trente-six sur trois cent
     * soixante pixels de large laisse peu de marge, et c'est précisément la tension
     * que SC-009 met au jour.
     *
     * La mesure porte sur la boîte **rendue**, pas sur une propriété déclarée : un
     * `min-height` que le contenu contredit ne protège personne.
     *
     * Et elle porte sur la **zone activable** : pour un bouton radio, c'est son
     * étiquette englobante, pas la commande de treize pixels que le navigateur dessine.
     * Étirer la commande elle-même la déformerait ; c'est l'étiquette qui porte la
     * cible, et c'est elle que WCAG 2.5.5 mesure.
     */
    const tooSmall = await page.evaluate((minimum) => {
      const offenders: string[] = []
      const selector = 'button, a[href], input, [role="gridcell"], select, textarea'

      /**
       * **La zone activable, et non la boîte de la commande.**
       *
       * Un bouton radio ou une case à cocher garde sa taille native — treize pixels —
       * et c'est très bien : l'étirer le déforme selon le navigateur. Ce qu'on vise,
       * c'est son **étiquette**, qui l'englobe ; cliquer une étiquette active sa
       * commande, et le navigateur s'en charge sans une ligne de script.
       *
       * C'est aussi ce que WCAG 2.5.5 mesure : la cible, pas le dessin.
       */
      function activableBox(node: Element): DOMRect {
        const type = node.getAttribute('type')
        if (node.tagName === 'INPUT' && (type === 'radio' || type === 'checkbox')) {
          const label = node.closest('label')
          if (label !== null) return label.getBoundingClientRect()
        }
        return node.getBoundingClientRect()
      }

      for (const node of Array.from(document.querySelectorAll(selector))) {
        const rect = activableBox(node)
        // Un élément de taille nulle n'est pas affiché : le compter en ferait échouer
        // le test pour un nœud que personne ne peut viser.
        if (rect.width === 0 && rect.height === 0) continue

        if (rect.width < minimum || rect.height < minimum) {
          const label =
            node.getAttribute('aria-label') ?? (node.textContent ?? '').trim().slice(0, 30)
          offenders.push(
            `${node.tagName.toLowerCase()} « ${label} » : ${Math.round(rect.width)}×${Math.round(rect.height)}`,
          )
        }
      }
      return offenders
    }, MIN_TARGET)

    expect(tooSmall, `cibles sous ${MIN_TARGET}px :\n${tooSmall.join('\n')}`).toEqual([])
  })

  /**
   * **La page de règles aussi.** C'est la page qu'on lit le plus longtemps, et ses
   * tables sont ce qui déborde le plus facilement d'une fenêtre étroite. Elle est
   * atteignable sans compte, donc éprouvable sans inscription — ce qui la rend
   * vérifiable même quand la pile d'authentification est indisponible.
   */
  test('la page de règles ne déborde pas non plus', async ({ page }) => {
    await page.goto('/rules')
    await expect(page.getByRole('heading', { name: /règles du jeu/i })).toBeVisible()

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  })
})
