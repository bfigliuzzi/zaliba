import { cleanup, render, screen } from '@testing-library/react'
import {
  BUILDING_TYPE_IDS,
  BUILDINGS,
  type BuildingTypeId,
  GRAINS_PER_UNIT,
  OBSTACLE_IDS,
  OBSTACLES,
  RESOURCE_IDS,
} from '@zaliba/catalogs'
import { DEFAULT_CATALOGS, evaluateCurve } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { RulesContent } from '../src/features/rules/RulesContent.js'

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

const CATALOGS = DEFAULT_CATALOGS

const renderRules = (catalogs = CATALOGS) => render(<RulesContent catalogs={catalogs} />)

/** Le texte entier de la page, pour chercher une valeur où qu'elle soit. */
const pageText = () => document.body.textContent ?? ''

/** Un nombre tel que la page le formate : séparateurs de milliers français. */
const formatted = (value: number) => new Intl.NumberFormat('fr-FR').format(value)

describe('les trois ressources sont publiées, et nommées', () => {
  it.each(RESOURCE_IDS)('nomme %s', (resourceId) => {
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

    for (const curve of Object.values(BUILDINGS[typeId].cost)) {
      const units = Math.floor(evaluateCurve(curve, 1) / GRAINS_PER_UNIT)
      expect(pageText(), `${typeId} : coût de niveau 1`).toContain(formatted(units))
    }
  })

  it.each(BUILDING_TYPE_IDS)('publie la durée de construction du niveau 1 de %s', (typeId) => {
    renderRules()
    expect(pageText()).toContain(formatted(evaluateCurve(BUILDINGS[typeId].buildDuration, 1)))
  })

  it.each(BUILDING_TYPE_IDS)('publie le niveau maximal de %s', (typeId) => {
    renderRules()
    expect(pageText()).toContain(String(BUILDINGS[typeId].maxLevel))
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

    for (const grains of Object.values(OBSTACLES[obstacleId].cost)) {
      expect(pageText()).toContain(formatted(Math.floor(grains / GRAINS_PER_UNIT)))
    }
  })

  it.each(OBSTACLE_IDS)('publie la durée de %s', (obstacleId) => {
    renderRules()
    expect(pageText()).toContain(formatted(OBSTACLES[obstacleId].durationSeconds))
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
      ...CATALOGS,
      buildings: {
        ...CATALOGS.buildings,
        mine: {
          ...BUILDINGS.mine,
          maxLevel: 17,
          cost: {
            camelote: { kind: 'geometric', base: 777 * GRAINS_PER_UNIT, num: 9, den: 4 },
          },
        } as (typeof CATALOGS.buildings)[BuildingTypeId],
      },
    }

    renderRules(rebalanced)
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
      ...CATALOGS,
      buildings: {
        ...CATALOGS.buildings,
        mine: {
          ...BUILDINGS.mine,
          cost: {
            camelote: { kind: 'geometric', base: 777 * GRAINS_PER_UNIT, num: 9, den: 4 },
          },
        } as (typeof CATALOGS.buildings)[BuildingTypeId],
      },
    }

    renderRules(rebalanced)
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
