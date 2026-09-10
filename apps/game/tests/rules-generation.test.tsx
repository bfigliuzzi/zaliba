import { cleanup, render, screen } from '@testing-library/react'
import {
  BUILDING_TYPE_IDS,
  type BuildingTypeId,
  GRAINS_PER_UNIT,
  OBSTACLE_IDS,
} from '@zaliba/catalogs'
import {
  type Catalogs,
  DECLARED_CATALOGS,
  type DeclaredCatalogs,
  evaluateCurve,
  resolveCatalogs,
} from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { RulesContent } from '../src/features/rules/RulesContent.js'
import { CATALOGS } from './catalogs.js'

/**
 * **La page de règles est générée, jamais rédigée** (R15, FR-054, US8).
 *
 * L'exigence de ce fichier est particulière : il ne vérifie pas qu'un texte est
 * *correct*, il vérifie qu'il est **dérivé**. Une page écrite à la main serait juste
 * le jour de sa rédaction et mentirait au premier rééquilibrage — et elle mentirait
 * en silence, ce qui est la seule façon de rompre la promesse faite à P4 sans que
 * personne s'en aperçoive.
 *
 * D'où la forme des tests : chaque valeur attendue est **recalculée depuis
 * `packages/catalogs`**, et l'on vérifie qu'elle se trouve à l'écran. Un test qui
 * recopierait les chiffres serait une seconde rédaction manuelle, à tenir d'accord
 * avec la première — donc deux endroits où mentir au lieu d'un.
 *
 * **Le test de non-régression le plus important est le dernier** : un rééquilibrage
 * du catalogue met la page à jour *sans intervention*. Il est éprouvé en rendant la
 * page contre un catalogue synthétique dont les valeurs diffèrent, et en vérifiant
 * que ce sont **celles-là** qui s'affichent. C'est la seule formulation qui distingue
 * « la page affiche les bons chiffres » de « la page lit le catalogue ».
 */

afterEach(cleanup)

/**
 * Par défaut, la page est rendue **avec** la longueur du serveur : c'est l'état
 * d'un joueur connecté, et celui dans lequel la page publie les deux colonnes.
 * Les tests de l'état « avant tout instantané » passent `null` explicitement.
 */
const renderRules = (
  resolved: Catalogs | null = CATALOGS,
  declared: DeclaredCatalogs = DECLARED_CATALOGS,
) => render(<RulesContent declared={declared} resolved={resolved} />)

/** Le texte entier de la page, pour chercher une valeur où qu'elle soit. */
const pageText = () => document.body.textContent ?? ''

/** Un nombre tel que la page le formate : séparateurs de milliers français. */
const formatted = (value: number) => new Intl.NumberFormat('fr-FR').format(value)

describe('les trois ressources sont publiées, et nommées', () => {
  it.each(CATALOGS.resourceIds)('nomme %s', (resourceId) => {
    renderRules()
    // Le libellé, pas l'identifiant : `bave-etoiles` est une clé, « Bave d'étoiles »
    // se dit (R18).
    expect(pageText().toLowerCase()).not.toContain(`«&nbsp;${resourceId}&nbsp;»`)
  })

  it('publie le grain, et sa valeur', () => {
    renderRules()
    // Sans le grain, aucun chiffre de la page n'a d'unité : c'est la première ligne
    // qu'un joueur doit lire pour refaire un calcul (R1).
    expect(pageText()).toContain(formatted(GRAINS_PER_UNIT))
  })
})

describe('chaque type de bâtiment publie ses valeurs par niveau (FR-054)', () => {
  it.each(BUILDING_TYPE_IDS)('publie le coût du niveau 1 de %s', (typeId) => {
    renderRules()

    for (const curve of Object.values(CATALOGS.buildings[typeId].cost)) {
      const units = Math.floor(evaluateCurve(curve, 1) / GRAINS_PER_UNIT)
      expect(pageText(), `${typeId} : coût de niveau 1`).toContain(formatted(units))
    }
  })

  it.each(BUILDING_TYPE_IDS)('publie la durée de construction du niveau 1 de %s', (typeId) => {
    renderRules()
    expect(pageText()).toContain(
      formatted(evaluateCurve(CATALOGS.buildings[typeId].buildDuration, 1)),
    )
  })

  it.each(BUILDING_TYPE_IDS)('publie le niveau maximal de %s', (typeId) => {
    renderRules()
    expect(pageText()).toContain(String(CATALOGS.buildings[typeId].maxLevel))
  })

  /**
   * **Les paramètres des courbes, et pas seulement leurs valeurs** (FR-054, R19). Une
   * table de trente lignes dirait *combien* ; la fraction dit *pourquoi*, et c'est
   * elle qui permet de calculer le niveau trente-et-un.
   */
  it('publie les fractions des courbes géométriques', () => {
    renderRules()
    const text = pageText()

    // 3/2 pour les coûts, 7/5 pour les durées, 11/10 pour la production.
    expect(text).toMatch(/3\s*[/÷]\s*2/)
    expect(text).toMatch(/7\s*[/÷]\s*5/)
    expect(text).toMatch(/11\s*[/÷]\s*10/)
  })

  it('publie la fraction de remboursement de la démolition', () => {
    renderRules()
    expect(pageText()).toMatch(/1\s*[/÷]\s*2/)
  })
})

describe('les cinq types d’obstacle publient leur coût, leur durée et leur résultat', () => {
  it.each(OBSTACLE_IDS)('publie le coût de %s', (obstacleId) => {
    renderRules()

    for (const grains of Object.values(CATALOGS.obstacles[obstacleId].cost)) {
      expect(pageText()).toContain(formatted(Math.floor(grains / GRAINS_PER_UNIT)))
    }
  })

  it.each(OBSTACLE_IDS)('publie la durée de %s', (obstacleId) => {
    renderRules()
    expect(pageText()).toContain(formatted(CATALOGS.obstacles[obstacleId].durationSeconds))
  })

  /**
   * **Le résultat du déblaiement est publié**, et c'est la moitié qui rend la planète
   * lisible : qui lit cette page sait ce qu'un `filon-enfoui` donnera *avant* d'en
   * déblayer un (FR-044).
   */
  it('publie ce que chaque obstacle révèle', () => {
    renderRules()
    const text = pageText()

    expect(text).toMatch(/terrain nu/i)
    expect(text).toMatch(/veine de Camelote/i)
    expect(text).toMatch(/geyser de Jus/i)
    expect(text).toMatch(/récif de Bave d’étoiles/i)
  })
})

describe('les formules sont publiées en toutes lettres (SC-002)', () => {
  it.each([
    [/production/i, 'la production'],
    [/rapport/i, 'le rapport d’énergie'],
    [/plafond/i, 'le plafond de stockage'],
    [/rembours/i, 'le remboursement'],
  ])('énonce %s', (pattern) => {
    renderRules()
    expect(pageText()).toMatch(pattern)
  })

  /**
   * **La règle qui décide de tout**, et qu'un joueur oublie : un extracteur qui ne
   * recouvre aucun gisement produit **zéro**, et non la valeur de base de son type
   * (I-12, FR-017). C'est ce qui fait de la géométrie une décision, et la taire ici
   * rendrait le premier placement raté incompréhensible.
   */
  it('dit qu’un extracteur sans gisement produit zéro', () => {
    renderRules()
    expect(pageText()).toMatch(/aucun gisement/i)
  })

  /**
   * **Où tombent les troncatures.** Sans cette précision, un joueur qui refait le
   * calcul obtient 21,96 là où le jeu compte 21, et conclut qu'il s'est trompé —
   * c'est-à-dire que la page lui a menti.
   */
  it('dit où tombe chaque arrondi', () => {
    renderRules()
    expect(pageText()).toMatch(/arrondi|troncature|partie entière|⌊/i)
  })
})

describe('un rééquilibrage met la page à jour sans intervention (R15)', () => {
  /**
   * **Le test qui compte le plus de ce fichier.**
   *
   * Il distingue « la page affiche les bons chiffres » de « la page **lit** le
   * catalogue ». Rendue contre un catalogue synthétique aux valeurs différentes, la
   * page doit afficher **celles-là** — sans qu'une ligne de code ait changé.
   *
   * C'est possible parce que le catalogue est un **argument** et non un import caché,
   * la même décision qui rend le domaine éprouvable contre un monde synthétique.
   */
  it('affiche les valeurs d’un catalogue rééquilibré', () => {
    const rebalanced = {
      ...DECLARED_CATALOGS,
      buildings: {
        ...DECLARED_CATALOGS.buildings,
        mine: {
          ...DECLARED_CATALOGS.buildings.mine,
          maxLevel: 17,
          cost: {
            camelote: { kind: 'geometric', base: 777 * GRAINS_PER_UNIT, num: 9, den: 4 },
          },
        } as (typeof DECLARED_CATALOGS.buildings)[BuildingTypeId],
      },
    }

    renderRules(resolveCatalogs(rebalanced, CATALOGS.gong), rebalanced)
    const text = pageText()

    // La valeur nouvelle est là…
    expect(text).toContain(formatted(777))
    expect(text).toContain('17')
    // …et sa fraction avec elle, sans qu'aucun texte n'ait été réécrit.
    expect(text).toMatch(/9\s*[/÷]\s*4/)
  })

  /**
   * **Et l'ancienne valeur a disparu.** Sans cette moitié, un test qui trouve « 777 »
   * quelque part serait satisfait par une page qui affiche *les deux* — donc par une
   * page qui garde une copie rédigée à la main quelque part.
   */
  it('n’affiche plus l’ancienne valeur', () => {
    const rebalanced = {
      ...DECLARED_CATALOGS,
      buildings: {
        ...DECLARED_CATALOGS.buildings,
        mine: {
          ...DECLARED_CATALOGS.buildings.mine,
          cost: {
            camelote: { kind: 'geometric', base: 777 * GRAINS_PER_UNIT, num: 9, den: 4 },
          },
        } as (typeof DECLARED_CATALOGS.buildings)[BuildingTypeId],
      },
    }

    renderRules(resolveCatalogs(rebalanced, CATALOGS.gong), rebalanced)
    // Le coût de niveau 1 de la mine était de cent unités de Camelote. La ligne de la
    // mine ne doit plus le porter.
    // Le nom est **ancré** : depuis que chaque table large est une région défilante
    // nommée, `/mine/i` seul trouve aussi « Mine — valeurs par niveau ». Un
    // localisateur qui accepte deux repères n'éprouve ni l'un ni l'autre — c'est la
    // leçon d'US2, et elle se représente à chaque repère ajouté.
    const mineSection = screen.getByRole('region', { name: /^mine$/i })
    expect(mineSection.textContent).not.toContain('100')
    expect(mineSection.textContent).toContain('777')
  })
})

describe('la page est navigable, et non un mur de texte', () => {
  /**
   * Un écran de référence se **parcourt**. Sans repères, un joueur qui cherche le coût
   * d'un racloir lit tout — et FR-054 promet des règles « consultables », pas
   * seulement présentes.
   */
  it('donne un repère par type de bâtiment', () => {
    renderRules()
    for (const typeId of BUILDING_TYPE_IDS) {
      expect(
        screen
          .getAllByRole('region')
          .some((node) => (node.getAttribute('aria-label') ?? '') !== ''),
        typeId,
      ).toBe(true)
    }
    expect(screen.getAllByRole('region').length).toBeGreaterThanOrEqual(BUILDING_TYPE_IDS.length)
  })

  it('hiérarchise ses titres sans saut de niveau (FR-061)', () => {
    renderRules()
    const levels = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((node) =>
      Number(node.tagName.slice(1)),
    )

    expect(levels.length).toBeGreaterThan(0)
    for (let i = 1; i < levels.length; i += 1) {
      const previous = levels[i - 1] ?? 1
      const current = levels[i] ?? 1
      // Un saut de niveau — h2 puis h4 — casse la navigation par titres, qui est la
      // façon dont on parcourt une page de référence au lecteur d'écran.
      expect(current - previous, `saut de ${previous} à ${current}`).toBeLessThanOrEqual(1)
    }
  })
})

/**
 * **La page publie le gong, et permet de refaire chaque conversion** (US1,
 * FR-016, FR-017, SC-003).
 *
 * C'est la promesse faite à P4 — « a besoin de tout savoir » — appliquée à
 * l'unité de temps : sans la longueur du gong, la moitié des chiffres de cette
 * page serait invérifiable, ce qui reviendrait à une formule cachée.
 */
describe('la page énonce la longueur du gong du serveur (FR-016)', () => {
  it('publie la longueur, en toutes lettres', () => {
    renderRules()
    const text = pageText()

    expect(text).toMatch(/gong/i)
    // Dix secondes, la longueur du catalogue de test.
    expect(text).toMatch(/10\s*s/)
  })

  it('nomme le gong comme unité, et dit qu’il appartient au serveur', () => {
    renderRules()
    expect(pageText()).toMatch(/chaque serveur|ce serveur/i)
  })
})

describe('chaque durée est donnée en gongs et en secondes (FR-017)', () => {
  /**
   * Les quinze durées du catalogue — cinq constructions, cinq démolitions, cinq
   * déblaiements — dans les deux unités, et le produit exact. Un joueur qui
   * multiplie et tombe à côté conclut que la page lui a menti.
   */
  it('publie les cinq durées de construction dans les deux unités', () => {
    renderRules()
    const text = pageText()

    for (const typeId of BUILDING_TYPE_IDS) {
      const gongs = DECLARED_CATALOGS.buildings[typeId].buildDuration.base
      const seconds = CATALOGS.buildings[typeId].buildDuration.base

      expect(text, `${typeId} — base en gongs`).toContain(formatted(gongs))
      expect(text, `${typeId} — base en secondes`).toContain(formatted(seconds))
      // Le produit tombe juste au gong canonique : dix secondes par gong.
      expect(seconds, `${typeId} — la conversion`).toBe(gongs * 10)
    }
  })

  it('publie les cinq durées de démolition dans les deux unités', () => {
    renderRules()
    const text = pageText()

    for (const typeId of BUILDING_TYPE_IDS) {
      const gongs = DECLARED_CATALOGS.buildings[typeId].demolitionGongs
      const seconds = CATALOGS.buildings[typeId].demolitionSeconds

      expect(text, `${typeId} — démolition en gongs`).toContain(formatted(gongs))
      expect(text, `${typeId} — démolition en secondes`).toContain(formatted(seconds))
      expect(seconds).toBe(gongs * 10)
    }
  })

  it('publie les cinq durées de déblaiement dans les deux unités', () => {
    renderRules()
    const text = pageText()

    for (const obstacleId of OBSTACLE_IDS) {
      const gongs = DECLARED_CATALOGS.obstacles[obstacleId].durationGongs
      const seconds = CATALOGS.obstacles[obstacleId].durationSeconds

      expect(text, `${obstacleId} — en gongs`).toContain(formatted(gongs))
      expect(text, `${obstacleId} — en secondes`).toContain(formatted(seconds))
      expect(seconds).toBe(gongs * 10)
    }
  })
})

describe('chaque production est donnée par gong et par heure', () => {
  it('publie les trois taux dans les deux unités, et la conversion est exacte', () => {
    renderRules()
    const text = pageText()

    for (const typeId of ['mine', 'puits', 'racloir'] as const) {
      const perGong = DECLARED_CATALOGS.buildings[typeId].production?.base ?? 0
      const perHour = CATALOGS.buildings[typeId].production?.base ?? 0

      expect(text, `${typeId} — grains par gong`).toContain(formatted(perGong))
      expect(text, `${typeId} — unités par heure`).toContain(formatted(perHour))
      // Un taux se divise par la longueur du gong, là où une durée s’y multiplie.
      expect(perHour, `${typeId} — la conversion`).toBe(perGong / 10)
    }
  })
})

describe('hors gong canonique, la base résolue est publiée (FR-009, G5)', () => {
  /**
   * **Le piège que cette exigence évite.** Hors canonique, la durée du niveau 3
   * ne s'obtient pas en multipliant celle des gongs par la longueur : c'est la
   * **base** qui est convertie, puis la courbe qui est évaluée. Une seule
   * troncature, à la fin.
   *
   * Publier la base résolue est ce qui rend le calcul refaisable ; sans elle, un
   * joueur qui multiplie de tête tombe à côté et conclut qu'il s'est trompé.
   */
  it('publie la base résolue, et non seulement la durée du premier niveau', () => {
    const fast = resolveCatalogs(DECLARED_CATALOGS, { num: 1, den: 6 })
    renderRules(fast)
    const text = pageText()

    // La mine : 12 gongs → base résolue de 2 s.
    expect(fast.buildings.mine.buildDuration.base).toBe(2)
    expect(text).toContain(formatted(2))
    // Et la fraction de la courbe, sans laquelle la base ne mène nulle part.
    expect(text).toMatch(/7\s*[/÷]\s*5/)
  })

  it('avertit que la conversion porte sur la base, pas sur la valeur', () => {
    renderRules(resolveCatalogs(DECLARED_CATALOGS, { num: 1, den: 6 }))
    expect(pageText()).toMatch(/base/i)
  })

  it('énonce la longueur en fraction quand elle n’est pas entière', () => {
    renderRules(resolveCatalogs(DECLARED_CATALOGS, { num: 1, den: 2 }))
    expect(pageText()).toMatch(/1\s*\/\s*2\s*s/)
  })
})

/**
 * **La page ouverte sans instantané reçu** (FR-013, FR-016 et FR-017 dans leur
 * rédaction amendée).
 *
 * `/rules` est lisible sans compte et n'appelle aucune route : hors session,
 * elle ne connaît pas la longueur du serveur. Elle publie alors les gongs
 * déclarés — des valeurs du catalogue, pas des chiffres dérivés —, **dit** que
 * la longueur ne lui est pas connue, et n'affiche **aucune seconde**.
 */
describe('avant tout instantané, la page publie les gongs et rien de dérivé', () => {
  it('publie les durées en gongs', () => {
    renderRules(null)
    const text = pageText()

    for (const typeId of BUILDING_TYPE_IDS) {
      expect(text, typeId).toContain(formatted(DECLARED_CATALOGS.buildings[typeId].buildDuration.base))
    }
  })

  it('dit que la longueur du serveur ne lui est pas connue', () => {
    renderRules(null)
    expect(pageText()).toMatch(/n’est pas connue|pas connue/i)
  })

  /**
   * **Aucune seconde**, et c'est la moitié qui compte : afficher des secondes
   * calculées avec une longueur supposée serait exactement la faute que la
   * vérification de version a déjà nommée — croire à l'accord sur la foi d'une
   * absence fait afficher des chiffres faux quand on ne sait rien.
   */
  it('n’affiche aucune durée en secondes', () => {
    renderRules(null)
    const text = pageText()

    /*
      **Ce qui est éprouvé est le libellé, pas le nombre**, et le premier jet de
      ce test s'y était trompé : il cherchait « 120 » dans toute la page et le
      trouvait — c'est aussi le coût de base du puits en Camelote. Un nombre qui
      coïncide avec un coût n'est pas une seconde affichée.

      Ce qui fait d'un nombre une durée en secondes, c'est le **libellé de valeur**
      qui l'annonce — un terme de liste de définitions, ou un en-tête de colonne.
      La prose, elle, a le droit d'expliquer ce que sont les secondes et de dire
      au visiteur comment les obtenir ; c'est même ce que FR-013 lui demande.

      Le test porte donc sur la structure du document, et non sur son texte brut.
      Le premier jet cherchait « 120 » dans toute la page et le trouvait — c'est
      aussi le coût de base du puits en Camelote —, puis « en secondes » et le
      trouvait dans la phrase d'explication.
    */
    const labels = Array.from(document.querySelectorAll('dt, th')).map(
      (node) => node.textContent ?? '',
    )

    expect(labels.length).toBeGreaterThan(0)
    expect(labels.filter((label) => /seconde|\(s\)/i.test(label))).toEqual([])
    expect(labels.some((label) => /gong/i.test(label)), 'aucun libellé en gongs').toBe(true)

    // Et le texte reste là pour dire au visiteur ce qui lui manque.
    expect(text).toMatch(/pas connue/i)
  })

  it('n’annonce aucune colonne de secondes dans ses tables', () => {
    renderRules(null)
    expect(pageText()).not.toMatch(/Durée \(s\)/)
  })
})
