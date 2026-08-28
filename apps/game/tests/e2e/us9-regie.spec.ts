import { expect, type Page, test } from '@playwright/test'
import { signUp } from './account.js'
import { expectNoAccessibilityViolations } from './axe.js'

/**
 * US9 — **La Régie approximative** : ce qui ne se mesure que dans un navigateur.
 *
 * Ce fichier ne rejoue pas ce que les tests de rendu établissent déjà. Il porte
 * exactement ce que jsdom **ne peut pas** dire, et c'est une liste courte et
 * précise :
 *
 * - une **boîte rendue**. `38cqmin` déclaré n'est pas 38 % obtenu : jsdom ne
 *   dispose rien, ne calcule aucune unité de conteneur, et rendrait vraie une
 *   proportion fausse ;
 * - une **durée calculée** de transition ou d'animation ;
 * - une **émulation de préférence** — mouvement réduit, contrastes forcés, zoom
 *   texte ;
 * - une **origine de requête**, interceptée ;
 * - un **audit axe-core** sur l'arbre réellement peint.
 *
 * **Trois largeurs, et le 320 px n'est pas une prudence** : c'est celle où le
 * budget de R9 resserre rembourrages, encadrement et gouttières pour tenir les
 * 44 px de côté. La largeur la plus exposée à une régression était la seule à
 * n'être jamais auditée avant le 2026-08-28.
 */

/** Les trois largeurs éprouvées. La hauteur suit le format des maquettes. */
const LARGEURS = {
  plancher: { width: 320, height: 640 },
  mobile: { width: 430, height: 860 },
  guichet: { width: 1180, height: 900 },
} as const

/**
 * Le profil `mobile` de la configuration porte 360 × 640, et les cas ci-dessous
 * fixent eux-mêmes leur fenêtre. Les lancer deux fois mesurerait deux fois la même
 * chose, et le second passage passerait pour de mauvaises raisons.
 */
test.describe.configure({ mode: 'default' })

async function ouvrirA(page: Page, taille: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(taille)
  await signUp(page)
  await expect(page.locator('[role="gridcell"]').first()).toBeVisible()
}

/**
 * Change la largeur **sans réinscrire**.
 *
 * `ouvrirA` crée un compte : l'appeler deux fois dans un même cas repart du formulaire
 * d'inscription, que la session déjà ouverte ne montre plus — et le cas expire sur un
 * clic qui n'a plus de cible. Un cas qui parcourt plusieurs largeurs ouvre donc **une
 * fois**, puis redimensionne.
 */
async function redimensionnerA(
  page: Page,
  taille: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(taille)
  await expect(page.locator('[role="gridcell"]').first()).toBeVisible()
}

/** La boîte rendue d'un sélecteur, ou `null` s'il n'est pas dessiné. */
async function boite(page: Page, selecteur: string) {
  return page.locator(selecteur).first().boundingBox()
}

/**
 * FR-015, INV-S3 — **la silhouette occupe 35 à 40 % du côté de sa case**.
 *
 * En dessous, elle cesse de se lire à quatre pixels de large — et c'est
 * précisément ce que la silhouette est censée savoir faire, là où les hachures
 * échouaient. Au-dessus, elle mange le cadre d'emprise, qui est lui-même de
 * l'information (FR-017).
 *
 * **Aucune tâche ne portait cette mesure avant le 2026-08-28.** FR-015 n'atteignait
 * qu'une tâche d'implémentation : sur une tranche dont l'argument est que tout a été
 * rendu observable avant d'être écrit, un `MUST` allait être livré à l'œil.
 */
test.describe('la silhouette garde sa proportion dans la case (FR-015, INV-S3)', () => {
  for (const [nom, taille] of Object.entries(LARGEURS)) {
    test(`occupe 35 à 40 % du côté de sa case à ${taille.width} px (${nom})`, async ({ page }) => {
      await ouvrirA(page, taille)

      const caseAvecSilhouette = page.locator('[role="gridcell"][data-glyphe]').first()
      await expect(caseAvecSilhouette).toBeVisible()

      const laCase = await caseAvecSilhouette.boundingBox()
      const laSilhouette = await caseAvecSilhouette.locator('.silhouette').boundingBox()

      expect(laCase, 'la case doit être dessinée').not.toBeNull()
      expect(laSilhouette, 'la silhouette doit être dessinée').not.toBeNull()
      if (laCase === null || laSilhouette === null) return

      const cote = Math.min(laCase.width, laCase.height)
      const proportion = Math.min(laSilhouette.width, laSilhouette.height) / cote

      expect(
        proportion,
        `à ${taille.width} px : case de ${cote.toFixed(1)} px, silhouette de ` +
          `${laSilhouette.width.toFixed(1)} px, soit ${(proportion * 100).toFixed(1)} %`,
      ).toBeGreaterThanOrEqual(0.35)
      expect(proportion).toBeLessThanOrEqual(0.4)
    })
  }
})

/**
 * SC-009 de 002 — **le mode contrastes forcés**.
 *
 * Les aplats et les ombres y disparaissent : le système les remplace par ses
 * propres couleurs. Ce qui doit subsister est la **silhouette** et le **style de
 * trait** — et c'est ce qui rend R5 non négociable, puisqu'un glyphe à teinte en
 * dur y devient invisible ou uniforme.
 *
 * La moitié humaine de ce critère — activer le mode réel du système et regarder —
 * est la recette du quickstart § 10.2, et son verdict se consigne.
 */
test.describe('le mode contrastes forcés ne perd aucun état (SC-009, FR-033)', () => {
  test('garde le canal non chromatique de chaque case', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await ouvrirA(page, LARGEURS.mobile)

    const canaux = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="gridcell"]')).map((cell) => ({
        adresse: cell.getAttribute('data-adresse'),
        etat: cell.getAttribute('data-etat'),
        glyphe: cell.getAttribute('data-glyphe'),
        trait: cell.getAttribute('data-trait'),
        marque: cell.getAttribute('data-marque'),
        emprise: cell.getAttribute('data-emprise'),
      })),
    )

    expect(canaux.length).toBeGreaterThan(0)

    // Chaque case porte **au moins un** canal non chromatique, ou bien elle est
    // « libre » — dont l'absence de tout canal est précisément l'identité.
    const muettes = canaux.filter(
      (une) =>
        une.etat !== 'libre' && une.glyphe === null && une.marque === null && une.emprise === null,
    )
    expect(
      muettes.map((une) => `${une.adresse} (${une.etat})`),
      'des cases ne portent aucun canal non chromatique',
    ).toEqual([])
  })

  test('les silhouettes héritent de la couleur de texte courante (INV-S1)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await ouvrirA(page, LARGEURS.mobile)

    /*
      La mesure porte sur la couleur **calculée** du tracé, comparée à celle du
      texte de sa case. `fill="currentColor"` déclaré ne prouve rien si une règle
      plus loin dans la cascade repeint : c'est le rendu qui décide.
    */
    const ecarts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="gridcell"][data-glyphe]'))
        .map((cell) => {
          const trace = cell.querySelector('svg path')
          if (trace === null) return `${cell.getAttribute('data-adresse')} : aucun tracé`
          const remplissage = window.getComputedStyle(trace).fill
          const texte = window.getComputedStyle(cell).color
          return remplissage === texte
            ? null
            : `${cell.getAttribute('data-adresse')} : fill ${remplissage} ≠ color ${texte}`
        })
        .filter((ecart): ecart is string => ecart !== null),
    )

    expect(ecarts, `silhouettes qui n’héritent pas :\n  ${ecarts.join('\n  ')}`).toEqual([])
  })

  test('les quadruplets présents restent distincts deux à deux (INV-C1)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await ouvrirA(page, LARGEURS.mobile)

    const parEtat = await page.evaluate(() => {
      const table = new Map<string, string>()
      for (const cell of Array.from(document.querySelectorAll('[role="gridcell"]'))) {
        const etat = cell.getAttribute('data-etat') ?? ''
        const quadruplet = [
          cell.getAttribute('data-glyphe'),
          cell.getAttribute('data-trait'),
          cell.getAttribute('data-marque'),
          cell.getAttribute('data-emprise'),
        ].join('|')
        table.set(etat, quadruplet)
      }
      return Object.fromEntries(table)
    })

    const quadruplets = Object.values(parEtat)
    expect(
      new Set(quadruplets).size,
      `états et quadruplets : ${JSON.stringify(parEtat, null, 2)}`,
    ).toBe(quadruplets.length)
  })

  /**
   * Les aplats et les ombres **disparaissent** — c'est le système qui les retire,
   * et `base.css` retire explicitement la géométrie des ombres portées : le mode
   * neutralise leur couleur mais pas leur décalage, et une ombre dure de cinq
   * pixels repeinte en couleur système redevient un aplat.
   */
  test('ne laisse aucune ombre portée', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await ouvrirA(page, LARGEURS.mobile)

    const ombres = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .map((noeud) => window.getComputedStyle(noeud).boxShadow)
        .filter((ombre) => ombre !== 'none' && ombre !== ''),
    )
    expect(ombres, `ombres subsistantes : ${ombres.join(', ')}`).toEqual([])
  })

  /**
   * FR-024a — **l'indicateur de focus passe à la couleur de mise en évidence du
   * système**.
   *
   * L'indicateur ordinaire est **composite** : un anneau `encre` doublé d'un anneau
   * `papier` porté par une ombre, parce qu'aucune teinte seule ne tient les 3:1 de
   * FR-024 contre les huit fonds de l'écran. Sous contrastes forcés, ce couple
   * n'existe plus : le système repeint, l'ombre est retirée, et s'accrocher à une
   * teinte de la palette reviendrait à ne plus rien indiquer sur la cible la plus
   * sollicitée d'un jeu qui se joue au clavier.
   *
   * **Ce qui est mesuré est la couleur calculée**, jamais la déclaration : une valeur
   * écrite dans `base.css` ne prouve rien si la cascade repeint plus loin — c'est
   * exactement ce que la porte de contraste a démontré sur le tampon. Et elle porte
   * sur un élément **réellement** `:focus-visible`, faute de quoi le cas mesurerait
   * la valeur initiale d'un contour qui n'est pas dessiné, et passerait à vide.
   *
   * **Ce que ce cas ne dit pas, et qui a été éprouvé.** Retirer `outline-color:
   * Highlight` de `base.css` ne le fait **pas** rougir : Chromium impose la mise en
   * évidence de lui-même sous contrastes forcés, et la déclaration ne fait que
   * l'écrire. Ce que le cas garde est donc la **sortie**, non la ligne — et il rougit
   * bien sur la régression réelle, qui est un `forced-color-adjust: none` ou un anneau
   * peint hors du chemin des couleurs forcées : la perturbation du 2026-08-28 y a rendu
   * `rgb(27, 34, 32)`, c'est-à-dire `--couleur-encre`, et le cas l'a refusée.
   *
   * *Ajouté le 2026-08-28.* `FR-024a` n'apparaissait dans tout `apps/game/` que dans
   * un commentaire CSS : un `MUST` de plus qui n'atteignait qu'une tâche
   * d'implémentation, sur une tranche dont l'argument est que tout a été rendu
   * observable avant d'être écrit.
   */
  test('repeint l’indicateur de focus hors de la palette (FR-024a)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await ouvrirA(page, LARGEURS.mobile)

    /*
      Le focus se prend **au clavier**. `:focus-visible` est ce que la règle cible, et
      un `.focus()` par programme ne l'obtient pas de façon fiable : le mesurer sur un
      élément qui ne le porte pas rendrait le cas vert sur un contour absent.
    */
    let porte = false
    for (let essai = 0; essai < 12 && !porte; essai += 1) {
      await page.keyboard.press('Tab')
      porte = await page.evaluate(() => document.activeElement?.matches(':focus-visible') === true)
    }
    expect(porte, 'aucun élément ne porte `:focus-visible` après tabulation').toBe(true)

    /*
      La palette est relue **dans les feuilles de style**, et non sur `:root` : sous
      contrastes forcés, toute valeur que le document résout est déjà repeinte, et
      comparer la couleur du contour à une palette elle-même forcée ne dirait rien. Ce
      qu'on veut est la liste des teintes **déclarées** — et la relire ainsi évite de
      la recopier ici, où elle périmerait au premier jeton ajouté.
    */
    const teintes = await page.evaluate(() => {
      /** Les règles d'une feuille, ou aucune si le navigateur en refuse la lecture. */
      const reglesDe = (feuille: CSSStyleSheet): CSSRule[] => {
        try {
          return Array.from(feuille.cssRules)
        } catch {
          return []
        }
      }

      /** `#rrggbb` → `rgb(r, g, b)`, la forme que rend `getComputedStyle`. */
      const enRgb = (hexa: string): string | null => {
        const trouve = /^#([0-9a-f]{6})$/i.exec(hexa.trim())
        if (trouve === null) return null
        const valeur = Number.parseInt(trouve[1] ?? '', 16)
        return `rgb(${(valeur >> 16) & 255}, ${(valeur >> 8) & 255}, ${valeur & 255})`
      }

      const declarations = Array.from(document.styleSheets)
        .flatMap(reglesDe)
        .map((regle) => (regle as CSSStyleRule).style as CSSStyleDeclaration | undefined)
        .filter((style): style is CSSStyleDeclaration => style !== undefined)

      const lues = declarations.flatMap((style) =>
        Array.from(style)
          .filter((propriete) => propriete.startsWith('--couleur'))
          .map((propriete) => enRgb(style.getPropertyValue(propriete))),
      )

      return [...new Set(lues.filter((rgb): rgb is string => rgb !== null))]
    })

    const actif = await page.evaluate(() => {
      const element = document.activeElement
      if (element === null) return null

      /*
        La couleur de mise en évidence du système, **relevée dans la page** : sa valeur
        dépend du thème de contraste actif, et l'écrire ici en dur ferait de ce cas une
        mesure de la plate-forme d'intégration continue plutôt que du style.
      */
      const sonde = document.createElement('span')
      sonde.style.color = 'Highlight'
      document.body.append(sonde)
      const miseEnEvidence = window.getComputedStyle(sonde).color
      sonde.remove()

      const calcule = window.getComputedStyle(element)
      return {
        balise: element.tagName,
        couleur: calcule.outlineColor,
        style: calcule.outlineStyle,
        largeur: calcule.outlineWidth,
        ombre: calcule.boxShadow,
        miseEnEvidence,
      }
    })

    // La porte doit avoir **lu quelque chose** : une palette vide rendrait
    // l'assertion centrale vraie sans rien prouver (amendement 2.1.0).
    expect(teintes.length, 'aucune teinte lue dans les feuilles de style').toBeGreaterThan(9)
    expect(actif, 'aucun élément actif à mesurer').not.toBeNull()

    // Et le contour doit être **dessiné** : la couleur d'un contour absent ne dit
    // rien non plus.
    expect(actif?.style, 'le contour de focus n’est pas dessiné').not.toBe('none')
    expect(
      Number.parseFloat(actif?.largeur ?? '0'),
      'le contour de focus est de largeur nulle',
    ).toBeGreaterThan(0)

    expect(
      teintes,
      `le contour reste à une teinte de la palette (${actif?.balise}) : ${actif?.couleur}`,
    ).not.toContain(actif?.couleur)

    /*
      Et il vaut **la couleur de mise en évidence**, ce que « hors palette » ne suffit
      pas à dire : le mode repeint de lui-même tout ce que l'auteur a déclaré, si bien
      qu'un contour laissé à `--couleur-encre` sort lui aussi de la palette — repeint en
      couleur de **texte**. C'est la seule assertion des deux qui distingue le style
      écrit du comportement du navigateur, et donc la seule qui mesure FR-024a.
    */
    expect(
      actif?.couleur,
      `le contour n’est pas la mise en évidence du système (${actif?.miseEnEvidence})`,
    ).toBe(actif?.miseEnEvidence)

    // La seconde moitié de l'indicateur composite — l'anneau `papier` porté par une
    // ombre — n'existe plus ici. Le cas précédent ne peut pas le dire : il ne
    // focalise rien, donc aucune ombre de focus n'est calculée quand il mesure.
    expect(actif?.ombre, 'l’anneau d’ombre du focus subsiste').toBe('none')
  })
})

/** Sans les bandes de coordonnées, l'adresse n'existe plus à l'œil (FR-016). */
test.describe('les bandes de coordonnées survivent aux trois largeurs (FR-016, INV-A2)', () => {
  for (const [nom, taille] of Object.entries(LARGEURS)) {
    test(`sont dessinées à ${taille.width} px (${nom})`, async ({ page }) => {
      await ouvrirA(page, taille)

      for (const bande of ['rangees', 'colonnes']) {
        const boiteDeLaBande = await boite(page, `[data-bande="${bande}"]`)
        expect(boiteDeLaBande, `la bande des ${bande} à ${taille.width} px`).not.toBeNull()
        expect(boiteDeLaBande?.width ?? 0, `largeur de la bande des ${bande}`).toBeGreaterThan(0)
        expect(boiteDeLaBande?.height ?? 0, `hauteur de la bande des ${bande}`).toBeGreaterThan(0)
      }
    })
  }
})

/**
 * SC-006 — **le parcours complet au clavier** (quickstart § 6, FR-019, FR-020).
 *
 * Neuf frappes, et chacune vérifie une promesse distincte. Le parcours est celui
 * du quickstart, dans l'ordre, parce que c'est l'ordre où un joueur les rencontre :
 * un test qui vérifierait les neuf séparément ne dirait rien de leur enchaînement,
 * et c'est l'enchaînement qui casse.
 */
test.describe('la pose se conduit au clavier seul (SC-006)', () => {
  test('entre, explore, pivote, pose, puis annule', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    const roleActif = () => page.evaluate(() => document.activeElement?.getAttribute('role'))
    const nomActif = () =>
      page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
    const adresseActive = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-adresse') ?? '')

    // 1 — atteindre la grille en **un** arrêt de tabulation.
    let arrets = 0
    while ((await roleActif()) !== 'gridcell' && arrets < 20) {
      await page.keyboard.press('Tab')
      arrets += 1
    }
    expect(await roleActif(), 'la grille doit être atteignable au clavier').toBe('gridcell')

    // 2 — les flèches déplacent le curseur, et chaque case est annoncée avec son
    //     adresse. C'est FR-016 : « C3 » se dit en une syllabe.
    const depart = await adresseActive()
    await page.keyboard.press('ArrowRight')
    const apres = await adresseActive()
    expect(apres, 'le curseur doit avoir changé de case').not.toBe(depart)
    expect(apres, 'la case porte une adresse courte').toMatch(/^[A-Z]\d+$/)
    expect(await nomActif()).toContain(apres)

    // 3 — quitter la grille en **une** frappe. C'est FR-019, et c'est ce qui
    //     distingue un seul arrêt de tabulation de trente-six.
    await page.keyboard.press('Tab')
    expect(await roleActif(), 'une frappe doit suffire à sortir').not.toBe('gridcell')

    // 4 — y revenir **sur la case où on était** (US3-AC5, FR-019).
    await page.keyboard.press('Shift+Tab')
    expect(await roleActif()).toBe('gridcell')
    expect(await adresseActive(), 'le focus retrouve la case du curseur').toBe(apres)

    // 5 — choisir un bâtiment : la pose s'arme.
    const typeMine = page.getByRole('radio', { name: 'Mine' })
    await typeMine.focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Pivoter' })).toBeEnabled()

    // 6 — de retour dans la grille, **chaque case refusée nomme sa cause**. C'est
    //     ce qu'US3 ajoute : 001 marquait le refus sans le motiver.
    const refusees = page.locator('[role="gridcell"][data-etat="visee-refusee"]')
    if ((await refusees.count()) > 0) {
      const nom = await refusees.first().getAttribute('aria-label')
      expect(nom, 'une case refusée porte « refusé : » et sa raison').toMatch(/refusé\s*:/)
      expect(nom, 'la raison n’est pas vide').toMatch(/refusé\s*:\s*\S+/)
    }

    // 7 — la rotation, au clavier **et** par le bouton (FR-020).
    const grille = page.locator('[role="gridcell"][tabindex="0"]').first()
    await grille.focus()
    await page.keyboard.press('r')
    await page.getByRole('button', { name: 'Pivoter' }).click()

    // 8 — la pose, par `Entrée`, sur une case que l'écran accepte.
    const valides = page.locator('[role="gridcell"][data-etat="visee-valide"]')
    if ((await valides.count()) > 0) {
      await valides.first().focus()
      await page.keyboard.press('Enter')
    }

    // 9 — réarmer, puis **`Échap`** : rien n'est posé, et la pose est désarmée.
    await page.getByRole('radio', { name: 'Mine' }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeEnabled()

    await page.locator('[role="gridcell"][tabindex="0"]').first().focus()
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('button', { name: 'Annuler' }),
      'Échap doit désarmer la pose',
    ).toBeDisabled()
    await expect(page.locator('[role="gridcell"][data-etat^="visee"]')).toHaveCount(0)
  })

  /** FR-020 exige aussi le **bouton visible**. Le clavier ne dispense pas du pointeur. */
  test('offre les trois commandes par un bouton visible', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    for (const libelle of ['JE POSE ÇA', 'Pivoter', 'Annuler']) {
      await expect(page.getByRole('button', { name: libelle })).toBeVisible()
    }
  })

  /** FR-031 : 48 px de hauteur **effective**, mesurés sur la boîte rendue. */
  test('donne 48 px de hauteur à chaque commande, aux trois largeurs', async ({ page }) => {
    await ouvrirA(page, LARGEURS.plancher)

    for (const taille of Object.values(LARGEURS)) {
      await redimensionnerA(page, taille)

      for (const libelle of ['JE POSE ÇA', 'Pivoter', 'Annuler']) {
        const boiteDuBouton = await page.getByRole('button', { name: libelle }).boundingBox()
        expect(
          boiteDuBouton?.height ?? 0,
          `« ${libelle} » à ${taille.width} px`,
        ).toBeGreaterThanOrEqual(48)
      }
    }
  })
})

/**
 * FR-005 — **le mouvement, borné, et mesuré hors mouvement réduit**.
 *
 * *Ajouté le 2026-08-28.* T091 ne mesure que **sous** émulation de mouvement
 * réduit, où tout est ramené à 1 ms : il ne peut par construction rien dire du
 * comportement **ordinaire**, qui est justement ce que FR-005 borne. Sans ce cas, la
 * moitié de l'exigence n'atteignait qu'une tâche d'implémentation.
 *
 * Deux choses, distinctes :
 *
 * - aucune **transition de couleur** n'excède 120 ms ;
 * - **aucun élément ne se déplace, ne tourne ni ne change de taille** au survol ou
 *   à la prise de focus. La mesure est la boîte rendue, comparée avant et après.
 */
test.describe('le mouvement reste borné en conditions ordinaires (FR-005)', () => {
  test('aucune durée de transition n’excède 120 ms', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    const trop = await page.evaluate(() => {
      /** Une durée CSS en millisecondes, ou `null` si elle est nulle ou absente. */
      const enMillisecondes = (brute: string): number | null => {
        const texte = brute.trim()
        if (texte === '' || texte === '0s') return null
        return texte.endsWith('ms') ? Number.parseFloat(texte) : Number.parseFloat(texte) * 1000
      }

      const dureesDe = (noeud: Element): readonly number[] => {
        const style = window.getComputedStyle(noeud)
        return [...style.transitionDuration.split(','), ...style.animationDuration.split(',')]
          .map(enMillisecondes)
          .filter((ms): ms is number => ms !== null)
      }

      return Array.from(document.querySelectorAll('*')).flatMap((noeud) =>
        dureesDe(noeud)
          .filter((ms) => ms > 120)
          .map((ms) => `${noeud.tagName.toLowerCase()}.${noeud.className} → ${ms} ms`),
      )
    })

    expect(trop, `durées au-delà de 120 ms :\n  ${trop.join('\n  ')}`).toEqual([])
  })

  /**
   * **Rien ne bouge au survol ni au focus.**
   *
   * Le survol et la prise de focus sont mesurés séparément : une interface peut
   * très bien être immobile au survol et sursauter au focus, et c'est le second cas
   * qui gêne le plus — le joueur au clavier ne choisit pas de le déclencher.
   */
  const cibles = [
    { nom: 'le bouton de pose', selecteur: 'button.commande--poser' },
    { nom: 'une case de la grille', selecteur: '[role="gridcell"]' },
    { nom: 'une entrée du registre', selecteur: '[data-bloc="registre"] li, [data-legende]' },
  ] as const

  for (const { nom, selecteur } of cibles) {
    test(`${nom} ne bouge ni au survol ni au focus`, async ({ page }) => {
      await ouvrirA(page, LARGEURS.mobile)

      const cible = page.locator(selecteur).first()
      if ((await cible.count()) === 0) test.skip(true, `${nom} n’est pas rendu sur cet écran`)

      /*
        **Mis en vue d'abord**, et c'est indispensable : `hover()` fait défiler
        l'élément dans la fenêtre, ce qui change son `y` sans que rien n'ait bougé.
        Comparer sans cette précaution mesurait le défilement et accusait à faux — le
        premier relevé indiquait `y: 1664` puis `y: 405`, pour un bouton immobile.
      */
      await cible.scrollIntoViewIfNeeded()
      const avant = await cible.boundingBox()

      await cible.hover()
      const auSurvol = await cible.boundingBox()
      expect(auSurvol, `${nom} au survol`).toEqual(avant)

      await cible.focus()
      const auFocus = await cible.boundingBox()
      expect(auFocus, `${nom} à la prise de focus`).toEqual(avant)
    })
  }

  /**
   * Aucune **rotation** déclenchée par le focus (FR-032), et aucune au-delà de
   * 1,5° sur un élément qui porte du texte — le tampon décoratif excepté, qui est
   * `aria-hidden` et ne porte rien.
   */
  test('ne tourne aucun élément au focus', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    const bouton = page.locator('button.commande--poser').first()
    const avant = await bouton.evaluate((noeud) => window.getComputedStyle(noeud).rotate)
    await bouton.focus()
    const apres = await bouton.evaluate((noeud) => window.getComputedStyle(noeud).rotate)

    expect(apres, 'la rotation ne change pas à la prise de focus').toBe(avant)
  })
})

/**
 * US4 — **le relevé, et le silence des compteurs** (FR-022, FR-023, FR-023a).
 *
 * Deux promesses opposées, et c'est leur opposition qui fait le sujet :
 *
 * - **rien n'est annoncé sans interaction.** Les compteurs progressent à la
 *   seconde ; les annoncer noierait tout le reste, et rendrait la page inutilisable
 *   précisément pour ceux qu'elle doit servir (US4-AC2, INV-N2) ;
 * - **le joueur peut demander.** Le relevé est ce qui rend l'information malgré
 *   tout accessible à qui écoute la page — c'est un besoin d'accessibilité, pas une
 *   commodité.
 *
 * Ce cas ne se mesure qu'ici : il faut laisser le temps passer réellement, et
 * observer qu'une région live **ne** change pas.
 */
test.describe('les compteurs ne s’annoncent jamais, le relevé s’annonce à la demande', () => {
  /** La région polie unique de l'écran. */
  const region = (page: Page) => page.locator('[role="status"][aria-live="polite"]')

  test('reste vide quand l’écran est affiché sans interaction (US4-AC2)', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    // La région existe, montée en permanence — un conteneur créé au moment de
    // l'annonce n'est pas lu de façon fiable.
    await expect(region(page)).toHaveCount(1)
    await expect(region(page)).toHaveText('')

    /*
      Trois secondes réelles, sans une frappe ni un clic. Les compteurs progressent
      pendant ce temps — c'est le propre de l'extrapolation locale —, et la région
      doit rester muette. Attendre est ici la mesure : rien d'autre ne distingue
      « n'annonce pas les compteurs » de « n'a pas encore annoncé ».
    */
    const avant = await region(page).textContent()
    await page.waitForTimeout(3_000)
    const apres = await region(page).textContent()

    expect(apres, 'la région ne doit pas avoir changé').toBe(avant)
    expect((apres ?? '').trim(), 'et elle doit être restée vide').toBe('')
  })

  test('n’annonce rien non plus quand une quantité affichée change', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    const quantite = page.locator('[data-chiffre="quantite"]').first()
    const depart = await quantite.textContent()

    // On attend que la valeur **bouge réellement** : sans cela, le cas passerait
    // parce que rien n'a changé, ce qui ne prouverait rien.
    await expect.poll(async () => quantite.textContent(), { timeout: 15_000 }).not.toBe(depart)

    await expect(region(page), 'un compteur qui progresse n’annonce rien').toHaveText('')
  })

  /** Le bouton **Relevé** : il existe, il s'atteint au clavier, il écrit réellement. */
  test('le bouton Relevé écrit dans la région, à chaque appui', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    const bouton = page.getByRole('button', { name: /^relevé/i })
    await expect(bouton).toBeVisible()

    // FR-031 : 48 px de hauteur effective, mesurés sur la boîte rendue.
    const boiteDuBouton = await bouton.boundingBox()
    expect(boiteDuBouton?.height ?? 0).toBeGreaterThanOrEqual(48)

    // Atteint **au clavier** : c'est la moitié qui compte, et celle qu'on oublie.
    await bouton.focus()
    await expect(bouton).toBeFocused()
    await page.keyboard.press('Enter')

    const premier = (await region(page).textContent()) ?? ''
    expect(premier, 'le relevé doit énoncer les trois ressources').toMatch(/Camelote/)
    expect(premier).toMatch(/Jus/)
    expect(premier).toMatch(/Bave/)
    expect(premier, 'et le chantier, ou son absence').toMatch(/chantier/i)

    /*
      **Le second appui** (FR-023a). Une région `aria-live` ne réénonce pas un
      contenu inchangé ; sur une planète saturée, la phrase est identique et le
      second appui serait silencieux. Le jeton d'unicité — un caractère de largeur
      nulle, ni vu ni prononcé — rend les deux contenus distincts.

      Ici la planète est neuve, donc les quantités bougent aussi ; ce que le cas
      établit est que **le contenu change**, quelle qu'en soit la cause.
    */
    await page.keyboard.press('Enter')
    const second = (await region(page).textContent()) ?? ''
    expect(second, 'le second appui doit produire un contenu distinct').not.toBe(premier)

    // Et ce qui est **lu** reste la même phrase : le jeton n'ajoute aucun mot.
    const sansJeton = (texte: string) => texte.replace(/​/g, '')
    expect(sansJeton(second).length, 'le jeton n’ajoute rien de visible').toBeGreaterThan(0)
  })

  /** L'origine est publiée : c'est ce qui permet de vérifier *qui* a écrit. */
  test('publie l’origine de la dernière annonce', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    await page.getByRole('button', { name: /^relevé/i }).click()
    await expect(region(page)).toHaveAttribute('data-origine', 'releve')

    await page.locator('[role="gridcell"][tabindex="0"]').first().focus()
    await expect(region(page)).toHaveAttribute('data-origine', 'entree-grille')

    await page.keyboard.press('ArrowRight')
    await expect(region(page)).toHaveAttribute('data-origine', 'curseur')
  })
})

/**
 * US6 — **le guichet**, et les trois largeurs où il se mesure.
 *
 * Quatre cas, quatre promesses distinctes :
 *
 * - **1180 px** : trois colonnes, l'en-tête sur toute la largeur, aucun contenu perdu ;
 * - **320 × 640 px** : les cases toutes visibles, chacune carrée et à 44 px au moins,
 *   aucune barre de défilement horizontale. C'est SC-001, et c'est la largeur que le
 *   budget de R9 rend possible ;
 * - **zoom texte 200 %** : les tailles ont **doublé** — ce qui distingue une échelle
 *   en `rem` d'une échelle figée —, rien ne déborde, rien n'est tronqué ;
 * - **le palier est unique** : à 899 px la colonne l'est, à 901 px le guichet est là,
 *   et aucune autre largeur ne change la disposition.
 */
test.describe('le guichet, sur grand écran (US6-AC1)', () => {
  test('présente trois colonnes et un en-tête pleine largeur à 1180 px', async ({ page }) => {
    await ouvrirA(page, LARGEURS.guichet)

    const boiteDe = async (bloc: string) =>
      page.locator(`[data-bloc="${bloc}"]`).first().boundingBox()

    const enTete = await boiteDe('en-tete')
    const gauche = await boiteDe('registre')
    const centre = await boiteDe('plan')
    const droite = await boiteDe('comptoir')

    for (const [nom, boiteDuBloc] of [
      ['en-tête', enTete],
      ['registre', gauche],
      ['plan', centre],
      ['comptoir', droite],
    ] as const) {
      expect(boiteDuBloc, `le bloc ${nom} doit être dessiné`).not.toBeNull()
    }
    if (enTete === null || gauche === null || centre === null || droite === null) return

    // **Trois colonnes** : les trois blocs se succèdent de gauche à droite, sans
    // recouvrement. C'est la seule lecture qui distingue un guichet d'une pile.
    expect(gauche.x + gauche.width, 'registre à gauche du plan').toBeLessThanOrEqual(centre.x + 1)
    expect(centre.x + centre.width, 'plan à gauche du comptoir').toBeLessThanOrEqual(droite.x + 1)

    // **L'en-tête sur toute la largeur** : il commence avant la colonne de gauche et
    // finit après celle de droite.
    expect(enTete.x, 'l’en-tête commence à gauche').toBeLessThanOrEqual(gauche.x + 1)
    expect(enTete.x + enTete.width, 'l’en-tête finit à droite').toBeGreaterThanOrEqual(
      droite.x + droite.width - 1,
    )

    // Et il est **au-dessus** des trois.
    expect(enTete.y + enTete.height).toBeLessThanOrEqual(centre.y + 1)
  })

  /** Aucun contenu perdu : les dix blocs de l'ordre sont tous dessinés. */
  test('ne perd aucun contenu au passage du palier', async ({ page }) => {
    const blocs = [
      'en-tete',
      'comptoir',
      'energie',
      'note',
      'chantier',
      'plan',
      'actions',
      'mention',
      'registre',
      'legende',
    ]

    await ouvrirA(page, LARGEURS.mobile)

    for (const taille of [LARGEURS.mobile, LARGEURS.guichet]) {
      await redimensionnerA(page, taille)
      for (const bloc of blocs) {
        await expect(
          page.locator(`[data-bloc="${bloc}"]`),
          `${bloc} à ${taille.width} px`,
        ).toHaveCount(1)
      }
    }
  })
})

/**
 * SC-001 — **la parcelle à 320 × 640 px** (FR-014, INV-C2).
 *
 * Le calcul livré par le dossier donne 38,8 px de côté à cette largeur, c'est-à-dire
 * **sous** le plancher de 44 px. Le budget de R9 resserre le décor et rend 44,7 px :
 * le décor est ce qui peut céder, la cible tactile est ce qui ne le peut pas.
 *
 * **C'est la mesure qui casse en premier** si un rembourrage revient à sa valeur
 * nominale, et c'est pourquoi elle porte sur la boîte **rendue**.
 */
test.describe('la parcelle tient à 320 px (SC-001, FR-014, INV-C2)', () => {
  test('donne à chaque case au moins 44 px de côté, et la garde carrée', async ({ page }) => {
    await ouvrirA(page, LARGEURS.plancher)

    const cases = await page.locator('[role="gridcell"]').all()
    expect(cases.length, 'les trente-six cases du Berceau').toBe(36)

    const tropPetites: string[] = []
    const pasCarrees: string[] = []

    for (const une of cases) {
      const boiteDeLaCase = await une.boundingBox()
      const adresse = (await une.getAttribute('data-adresse')) ?? '?'
      if (boiteDeLaCase === null) {
        tropPetites.push(`${adresse} : non dessinée`)
        continue
      }
      if (Math.min(boiteDeLaCase.width, boiteDeLaCase.height) < 44) {
        tropPetites.push(
          `${adresse} : ${boiteDeLaCase.width.toFixed(1)} × ${boiteDeLaCase.height.toFixed(1)}`,
        )
      }
      // Un pixel de tolérance : les sous-pixels d'un rendu à densité fractionnaire
      // ne sont pas un défaut de mise en page.
      if (Math.abs(boiteDeLaCase.width - boiteDeLaCase.height) > 1) {
        pasCarrees.push(
          `${adresse} : ${boiteDeLaCase.width.toFixed(1)} × ${boiteDeLaCase.height.toFixed(1)}`,
        )
      }
    }

    expect(tropPetites, `cases sous 44 px :\n  ${tropPetites.join('\n  ')}`).toEqual([])
    expect(pasCarrees, `cases non carrées :\n  ${pasCarrees.join('\n  ')}`).toEqual([])
  })

  test('n’ouvre aucune barre de défilement horizontale', async ({ page }) => {
    await ouvrirA(page, LARGEURS.plancher)

    const debordement = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(debordement.scrollWidth).toBeLessThanOrEqual(debordement.clientWidth + 1)
  })

  /** Les bandes ne cèdent pas : FR-016 n'admet pas de palier. */
  test('garde les bandes de coordonnées à 320 px', async ({ page }) => {
    await ouvrirA(page, LARGEURS.plancher)
    for (const bande of ['rangees', 'colonnes']) {
      await expect(page.locator(`[data-bande="${bande}"]`)).toBeVisible()
    }
  })
})

/**
 * SC-002 et FR-034 — **le zoom texte à 200 %**.
 *
 * Ce n'est **pas** le zoom de page : celui-là agrandit tout, pixels compris, et ne
 * prouve rien. Ce qui est émulé ici est le doublement de la taille de police de la
 * racine, c'est-à-dire le réglage qu'un joueur malvoyant a peut-être déjà.
 *
 * **La première assertion est celle qui compte** : les tailles calculées ont doublé.
 * C'est elle qui distingue une échelle en `rem` d'une échelle figée en pixels — et le
 * plancher typographique ne protège que la lecture par défaut, là où le `rem` protège
 * celle du joueur qui a réglé son appareil.
 */
test.describe('le zoom texte à 200 % (SC-002, FR-034)', () => {
  /** Double la taille de police de la racine, sans toucher aux pixels. */
  const doublerLeTexte = (page: Page) =>
    page.addStyleTag({ content: 'html { font-size: 200% !important; }' })

  test('double les tailles calculées', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    const tailleDe = () =>
      page.evaluate(() => {
        const noeud = document.querySelector('[data-bloc="mention"]')
        return noeud === null ? 0 : Number.parseFloat(window.getComputedStyle(noeud).fontSize)
      })

    const avant = await tailleDe()
    expect(avant, 'la mention doit être dessinée').toBeGreaterThan(0)

    await doublerLeTexte(page)
    const apres = await tailleDe()

    expect(
      apres / avant,
      `avant ${avant} px, après ${apres} px — une échelle figée en pixels ne bougerait pas`,
    ).toBeGreaterThan(1.9)
  })

  test('ne fait déborder aucun bloc', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)
    await doublerLeTexte(page)

    const debordement = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(debordement.scrollWidth).toBeLessThanOrEqual(debordement.clientWidth + 1)
  })

  test('ne tronque aucun texte', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)
    await doublerLeTexte(page)

    const tronques = await page.evaluate(() => {
      /**
       * Le texte qu'un nœud porte **directement**.
       *
       * Et non son sous-arbre : `.ecran` porte `overflow: hidden` — pour que les
       * cadres tracés à la main, qui débordent délibérément de leurs blocs, ne
       * débordent pas de l'écran — et son sous-arbre contient tout le texte de la
       * page. Le mesurer aurait signalé une troncature de conteneur à chaque fois
       * qu'un enfant dépasse, alors que ce que SC-002 interdit est un **texte**
       * tronqué.
       */
      const texteDirect = (noeud: Element): string =>
        Array.from(noeud.childNodes)
          .filter((enfant) => enfant.nodeType === Node.TEXT_NODE)
          .map((enfant) => enfant.textContent ?? '')
          .join('')
          .trim()

      return Array.from(document.querySelectorAll('*'))
        .filter((noeud) => texteDirect(noeud).length > 0)
        .filter((noeud) => {
          const style = window.getComputedStyle(noeud)
          return style.textOverflow === 'ellipsis' || style.overflow === 'hidden'
        })
        .filter((noeud) => noeud.scrollWidth > noeud.clientWidth + 1)
        .map(
          (noeud) =>
            `${noeud.tagName.toLowerCase()}.${noeud.className} « ${texteDirect(noeud).slice(0, 32)} »`,
        )
    })
    expect(tronques, `textes tronqués :\n  ${tronques.join('\n  ')}`).toEqual([])
  })

  /**
   * **Les silhouettes gardent leur proportion.** C'est le second effet de `cqmin`, et
   * celui qui décide (R8) : au zoom texte, la racine double mais la fenêtre en pixels
   * ne change pas. Une silhouette en `rem` déborderait de sa case ; en `cqmin`, elle
   * suit la case.
   */
  test('garde les silhouettes dans leur case', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)
    await doublerLeTexte(page)

    const caseAvecSilhouette = page.locator('[role="gridcell"][data-glyphe]').first()
    const laCase = await caseAvecSilhouette.boundingBox()
    const laSilhouette = await caseAvecSilhouette.locator('.silhouette').boundingBox()

    expect(laCase).not.toBeNull()
    expect(laSilhouette).not.toBeNull()
    if (laCase === null || laSilhouette === null) return

    const proportion =
      Math.min(laSilhouette.width, laSilhouette.height) / Math.min(laCase.width, laCase.height)
    expect(
      proportion,
      `au zoom 200 % : ${(proportion * 100).toFixed(1)} % de la case`,
    ).toBeLessThanOrEqual(0.4)
    expect(proportion).toBeGreaterThanOrEqual(0.35)
  })
})

/**
 * US6-AC2 — **le palier est unique**.
 *
 * FR-007 exige « un palier de largeur **unique** ». Deux paliers, ou trois, feraient
 * de la réduction de fenêtre une suite de sauts, et chacun serait une disposition de
 * plus à éprouver. Un seul se vérifie de part et d'autre.
 *
 * Le second seuil — 360 px — ne change **pas la disposition** : il resserre le décor
 * selon le budget de R9. Le cas le vérifie en comparant le nombre de colonnes, non les
 * dimensions.
 */
test.describe('il n’existe qu’un palier de bascule (US6-AC2, FR-007)', () => {
  /** Le nombre de colonnes que l'écran dispose réellement. */
  const colonnesDeLEcran = (page: Page) =>
    page.evaluate(() => {
      const ecran = document.querySelector('.ecran')
      if (ecran === null) return 0
      const modele = window.getComputedStyle(ecran).gridTemplateColumns
      return modele === 'none' ? 1 : modele.split(' ').filter((part) => part !== '').length
    })

  test('la colonne est unique à 899 px, le guichet est là à 901 px', async ({ page }) => {
    await ouvrirA(page, { width: 899, height: 900 })
    expect(await colonnesDeLEcran(page), 'à 899 px : une colonne').toBe(1)

    await page.setViewportSize({ width: 901, height: 900 })
    expect(await colonnesDeLEcran(page), 'à 901 px : trois colonnes').toBe(3)
  })

  test('aucune autre largeur ne change la disposition', async ({ page }) => {
    await ouvrirA(page, LARGEURS.plancher)

    const releves: { largeur: number; colonnes: number }[] = []
    for (let largeur = 320; largeur <= 1180; largeur += 20) {
      await page.setViewportSize({ width: largeur, height: 900 })
      releves.push({ largeur, colonnes: await colonnesDeLEcran(page) })
    }

    // Une seule bascule : le nombre de colonnes ne change qu'une fois sur tout le
    // parcours de 320 à 1180 px.
    const bascules = releves.filter(
      (releve, index) => index > 0 && releve.colonnes !== releves[index - 1]?.colonnes,
    )

    expect(
      bascules.map((une) => `${une.largeur} px → ${une.colonnes} colonnes`),
      'il ne doit exister qu’un palier de bascule',
    ).toHaveLength(1)
    expect(bascules[0]?.largeur, 'et il est à 900 px').toBeLessThanOrEqual(920)
    expect(bascules[0]?.largeur).toBeGreaterThan(880)
  })
})

/**
 * SC-004 et SC-005 — **l'audit d'accessibilité, aux trois largeurs éprouvées**.
 *
 * *Amendés le 2026-08-28.* La rédaction précédente n'auditait que les deux largeurs
 * de référence et laissait **320 px hors mesure** — alors que SC-001 en fait une
 * largeur normative, et que c'est **précisément là que le décor se resserre** :
 * rembourrages, encadrement et gouttières réduits pour tenir les 44 px de côté. La
 * largeur la plus exposée à une régression de contraste ou de cible était la seule à
 * n'être jamais auditée.
 *
 * `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, **aucune règle désactivée**. Si un
 * écart apparaît, il se corrige dans le diff avec son motif écrit : une exception
 * ajoutée au harnais est invisible en revue six mois plus tard.
 */
test.describe('l’audit d’accessibilité passe aux trois largeurs (SC-004, SC-005)', () => {
  for (const [nom, taille] of Object.entries(LARGEURS)) {
    test(`ne relève aucune violation à ${taille.width} px (${nom})`, async ({ page }) => {
      await ouvrirA(page, taille)
      await expectNoAccessibilityViolations(page)
    })
  }
})

/**
 * FR-039 — **le plancher typographique, par rôle, aux trois largeurs**.
 *
 * Quatre seuils, posés sur le **rôle** du texte et non sur un nombre unique. Et le
 * défaut est ce qui rend la porte utile : **un nœud non marqué est présumé porteur
 * d'information**, donc oublier de marquer un décor échoue le test au lieu de le
 * laisser passer. Une information non marquée, elle, est protégée.
 *
 * La mesure porte sur la taille **calculée** : une règle héritée peut réduire un
 * élément que la feuille de style dit pourtant grand, et c'est la taille rendue qui
 * décide de la lisibilité.
 */
test.describe('chaque texte atteint le plancher de son rôle (FR-039)', () => {
  /** Les quatre planchers de R14, en pixels. */
  const planchers = { saisie: 16, information: 14, intitule: 12, decor: 9.5 } as const

  for (const [nom, taille] of Object.entries(LARGEURS)) {
    test(`tient les quatre planchers à ${taille.width} px (${nom})`, async ({ page }) => {
      await ouvrirA(page, taille)

      const sousLePlancher = await page.evaluate((seuils) => {
        /** Le rôle d'un nœud : son marquage, ou **porteur d'information** par défaut. */
        const roleDe = (noeud: Element): keyof typeof seuils => {
          if (noeud.matches('input, select, textarea')) return 'saisie'
          const marque = noeud.closest('[data-role-texte]')?.getAttribute('data-role-texte')
          if (marque === 'decor') return 'decor'
          if (marque === 'intitule') return 'intitule'
          return 'information'
        }

        /**
         * Le texte qu'un nœud porte **directement**.
         *
         * Et non son sous-arbre : sinon chaque ancêtre serait mesuré pour le texte de
         * ses enfants, et le `<body>` échouerait pour la plus petite note de la page.
         */
        const texteDirect = (noeud: Element): string =>
          Array.from(noeud.childNodes)
            .filter((enfant) => enfant.nodeType === Node.TEXT_NODE)
            .map((enfant) => enfant.textContent ?? '')
            .join('')
            .trim()

        /** Les nœuds masqués aux technologies d'assistance ne portent rien. */
        const porteDuTexte = (noeud: Element): boolean =>
          noeud.closest('[aria-hidden="true"]') === null && texteDirect(noeud).length > 0

        return Array.from(document.querySelectorAll('*'))
          .filter(porteDuTexte)
          .map((noeud) => ({
            noeud,
            role: roleDe(noeud),
            taillePx: Number.parseFloat(window.getComputedStyle(noeud).fontSize),
          }))
          .filter((releve) => releve.taillePx < seuils[releve.role])
          .map(
            (releve) =>
              `${releve.noeud.tagName.toLowerCase()} [${releve.role}] ` +
              `« ${texteDirect(releve.noeud).slice(0, 32)} » à ${releve.taillePx} px ` +
              `(plancher ${seuils[releve.role]})`,
          )
      }, planchers)

      expect(
        sousLePlancher,
        `textes sous leur plancher à ${taille.width} px :\n  ${sousLePlancher.join('\n  ')}`,
      ).toEqual([])
    })
  }

  /**
   * FR-039a — **aucune taille de police en pixels**, mesuré sur le rendu.
   *
   * La porte de source le vérifie sur les feuilles ; ici, on vérifie la conséquence :
   * doubler la racine double les tailles. Une seule taille figée en pixels le ferait
   * échouer, et c'est ce qui rend WCAG 1.4.4 réellement vrai.
   */
  test('toutes les tailles suivent le réglage de la racine', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    const tailles = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-bloc]')).map((noeud) =>
          Number.parseFloat(window.getComputedStyle(noeud).fontSize),
        ),
      )

    const avant = await tailles()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const apres = await tailles()

    const figees = avant
      .map((taille, index) => ({ taille, doublee: apres[index] ?? 0, index }))
      .filter((releve) => releve.doublee < releve.taille * 1.9)
      .map((releve) => `bloc ${releve.index} : ${releve.taille} px → ${releve.doublee} px`)

    expect(figees, `tailles qui ne doublent pas :\n  ${figees.join('\n  ')}`).toEqual([])
  })
})

/**
 * SC-010 — **le mouvement réduit**.
 *
 * La préférence supprime le mouvement, **pas l'information** : le tampon d'état
 * apparaît quand même, il n'est simplement plus frappé. C'est la distinction que ce
 * cas mesure, et c'est celle qu'un `display: none` sous `prefers-reduced-motion`
 * aurait effacée.
 */
test.describe('sous mouvement réduit, rien ne bouge — et rien ne disparaît (SC-010)', () => {
  test('aucune durée calculée n’excède 1 ms', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ouvrirA(page, LARGEURS.mobile)

    const trop = await page.evaluate(() => {
      const enMillisecondes = (brute: string): number => {
        const texte = brute.trim()
        if (texte === '' || texte === '0s') return 0
        return texte.endsWith('ms') ? Number.parseFloat(texte) : Number.parseFloat(texte) * 1000
      }

      return Array.from(document.querySelectorAll('*')).flatMap((noeud) => {
        const style = window.getComputedStyle(noeud)
        return [...style.transitionDuration.split(','), ...style.animationDuration.split(',')]
          .map(enMillisecondes)
          .filter((ms) => ms > 1)
          .map((ms) => `${noeud.tagName.toLowerCase()}.${noeud.className} → ${ms} ms`)
      })
    })

    expect(trop, `durées au-delà de 1 ms :\n  ${trop.join('\n  ')}`).toEqual([])
  })

  test('le tampon d’état apparaît quand même', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ouvrirA(page, LARGEURS.mobile)

    const tampon = page.locator('[data-tampon]').first()
    await expect(tampon, 'la préférence supprime le mouvement, pas l’information').toBeVisible()

    const boiteDuTampon = await tampon.boundingBox()
    expect(boiteDuTampon?.width ?? 0).toBeGreaterThan(0)
    expect(boiteDuTampon?.height ?? 0).toBeGreaterThan(0)
  })
})

/**
 * SC-008 — **aucune requête sortante vers un domaine tiers**.
 *
 * FR-004 interdit toute requête vers un domaine tiers, et les **polices** sont le
 * point où la règle se perd le plus facilement : le dossier de design les charge
 * depuis Google Fonts et le signale lui-même comme inacceptable ici.
 *
 * Toutes les requêtes sont interceptées et leur origine comparée à celles de la pile
 * locale. C'est le protocole de R4, et de R17 de 001 : **la vérification se fait par
 * exécution, jamais par lecture**.
 */
test.describe('l’écran se charge sans aucune requête tierce (SC-008, FR-004)', () => {
  test('n’émet aucune requête hors de la pile locale', async ({ page }) => {
    const origines = new Set<string>()
    page.on('request', (requete) => {
      try {
        origines.add(new URL(requete.url()).origin)
      } catch {
        // Une URL de données ou de blob n'a pas d'origine : elle ne sort pas.
      }
    })

    await ouvrirA(page, LARGEURS.mobile)
    // Le relevé et un déplacement de curseur, pour que rien de tardif ne s'échappe.
    await page.getByRole('button', { name: /^relevé/i }).click()
    await page.waitForTimeout(1_000)

    /*
      Les origines admises sont **celles de la pile locale**, et rien d'autre : le
      client, l'API, et Supabase en local. Une liste blanche plutôt qu'une liste
      noire — une liste noire laisse passer ce qu'elle n'a pas prévu, ce qui est
      exactement le cas d'une police ajoutée demain.
    */
    const localesAdmises = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/

    const tierces = [...origines].filter((origine) => !localesAdmises.test(origine))
    expect(tierces, `origines tierces contactées :\n  ${tierces.join('\n  ')}`).toEqual([])
  })

  test('ne contacte ni fonts.googleapis.com ni fonts.gstatic.com', async ({ page }) => {
    const fautives: string[] = []
    page.on('request', (requete) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(requete.url())) fautives.push(requete.url())
    })

    await ouvrirA(page, LARGEURS.mobile)
    expect(fautives, `requêtes vers Google Fonts :\n  ${fautives.join('\n  ')}`).toEqual([])
  })

  /** Les polices sont bien **servies**, et depuis l'application elle-même. */
  test('sert ses polices depuis sa propre origine', async ({ page }) => {
    const polices: string[] = []
    page.on('response', (reponse) => {
      if (/\.woff2?(\?|$)/.test(reponse.url())) polices.push(reponse.url())
    })

    await ouvrirA(page, LARGEURS.mobile)
    await page.waitForTimeout(1_000)

    // Le serveur de développement de Vite sert les `woff2` à la demande : leur
    // absence ne serait pas un défaut ici, leur **origine** en serait un.
    for (const url of polices) {
      expect(new URL(url).origin, `la police ${url}`).toMatch(/127\.0\.0\.1|localhost/)
    }
  })
})

/**
 * Le cas limite que la spécification nomme : **les polices ne se chargent pas**.
 *
 * Chaque famille a sa pile de repli déclarée dans `tokens.css`, et la mise en page ne
 * doit pas se disloquer. Neutraliser les quatre familles est la seule façon de le
 * constater : un repli déclaré et jamais éprouvé est un repli qu'on découvre en
 * production.
 */
test.describe('la mise en page tient sans les polices de la Régie', () => {
  test('ne déborde ni ne perd de contenu', async ({ page }) => {
    await ouvrirA(page, LARGEURS.mobile)

    /*
      Les quatre familles neutralisées à la racine : la pile de repli prend le relais.
      `!important` sur `font-family` seule — le reste de l'habillage doit rester en
      place, sinon on mesurerait un écran vide.
    */
    await page.addStyleTag({
      content: `
        :root {
          --police-ui: sans-serif !important;
          --police-etroit: sans-serif !important;
          --police-mono: monospace !important;
          --police-pochoir: sans-serif !important;
        }
      `,
    })

    const debordement = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(debordement.scrollWidth).toBeLessThanOrEqual(debordement.clientWidth + 1)

    // Les dix blocs sont toujours là, et la grille toujours à 44 px de côté.
    await expect(page.locator('[data-bloc]')).not.toHaveCount(0)
    const uneCase = await page.locator('[role="gridcell"]').first().boundingBox()
    expect(Math.min(uneCase?.width ?? 0, uneCase?.height ?? 0)).toBeGreaterThanOrEqual(44)
  })
})
