import { GONG_CANONICAL, type GongLength } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { DECLARED_CATALOGS } from '../../src/kernel/catalogs.js'
import { evaluateCurve } from '../../src/kernel/curves.js'
import { resolveCatalogs } from '../../src/kernel/gong.js'

/**
 * **La résolution porte sur la base de la courbe, jamais sur la valeur évaluée**
 * (G4).
 *
 * C'est la ligne d'arithmétique sur laquelle toute la tranche tient :
 *
 * ```
 * base de durée résolue = max(1, ⌊ baseGongs × num ÷ den ⌋)   puis evaluateCurve
 * base de taux résolue  =        baseGrainsParGong × den ÷ num  puis evaluateCurve
 * ```
 *
 * Résoudre **après** l'évaluation empilerait deux troncatures : `⌊12 × 1,4²⌋ × 10`
 * donne 230 là où le jeu met 235, qui est `⌊120 × 1,4²⌋`. L'égalité stricte de
 * FR-010 tomberait alors sur des dizaines de niveaux, et elle tomberait
 * *silencieusement*, puisqu'une troncature ne lève rien.
 *
 * Résoudre la base préserve la règle de R19 — une seule troncature, en fin de
 * calcul — et rend l'égalité **exacte** au gong canonique, où résoudre n'est
 * qu'une multiplication par dix.
 */

const HALF: GongLength = { num: 1, den: 2 }

describe('resolveCatalogs résout la base, jamais la valeur évaluée', () => {
  it('multiplie la base de durée par la longueur du gong', () => {
    const resolved = resolveCatalogs(DECLARED_CATALOGS, GONG_CANONICAL)

    // 12 gongs × 10 s = 120 s. Et non ⌊12 × 1,4⁰⌋ × 10, qui vaudrait pareil au
    // niveau 1 et divergerait dès le niveau 3.
    expect(resolved.buildings.mine.buildDuration.base).toBe(120)
    expect(resolved.buildings.puits.buildDuration.base).toBe(150)
    expect(resolved.buildings.racloir.buildDuration.base).toBe(200)
    expect(resolved.buildings.centrale.buildDuration.base).toBe(90)
    expect(resolved.buildings.entrepot.buildDuration.base).toBe(100)
  })

  it('divise la base de taux par la longueur du gong', () => {
    const resolved = resolveCatalogs(DECLARED_CATALOGS, GONG_CANONICAL)

    // 150 grains par gong ÷ 10 s = 15 grains par seconde, soit exactement les
    // quinze unités par heure d'avant la tranche (GRAINS_PER_UNIT = 3600, R1).
    expect(resolved.buildings.mine.production?.base).toBe(15)
    expect(resolved.buildings.puits.production?.base).toBe(8)
    expect(resolved.buildings.racloir.production?.base).toBe(4)
  })

  it('résout la durée de démolition et le déblaiement', () => {
    const resolved = resolveCatalogs(DECLARED_CATALOGS, GONG_CANONICAL)

    expect(resolved.buildings.mine.demolitionSeconds).toBe(300)
    expect(resolved.buildings.entrepot.demolitionSeconds).toBe(180)
    expect(resolved.obstacles.eboulis.durationSeconds).toBe(300)
    expect(resolved.obstacles['croute-calcifiee'].durationSeconds).toBe(3_600)
  })

  /**
   * La propriété la plus importante du fichier, et la moins visible : la courbe
   * elle-même ne bouge pas. Son `num`, son `den` et sa nature décrivent la
   * *progression*, qui est sans dimension de temps — la toucher rééquilibrerait
   * le jeu en prétendant changer une unité.
   */
  it('laisse le num, le den et le kind de chaque courbe intacts', () => {
    const resolved = resolveCatalogs(DECLARED_CATALOGS, HALF)

    for (const id of Object.keys(
      DECLARED_CATALOGS.buildings,
    ) as (keyof typeof DECLARED_CATALOGS.buildings)[]) {
      const declared = DECLARED_CATALOGS.buildings[id]
      const become = resolved.buildings[id]

      expect(become.buildDuration.kind, id).toBe(declared.buildDuration.kind)
      expect(become.buildDuration.num, id).toBe(declared.buildDuration.num)
      expect(become.buildDuration.den, id).toBe(declared.buildDuration.den)

      if (declared.production !== null) {
        expect(become.production?.kind, id).toBe(declared.production.kind)
        expect(become.production?.num, id).toBe(declared.production.num)
        expect(become.production?.den, id).toBe(declared.production.den)
      } else {
        expect(become.production, id).toBeNull()
      }
    }
  })

  it('recopie la longueur employée dans le faisceau résolu', () => {
    expect(resolveCatalogs(DECLARED_CATALOGS, HALF).gong).toEqual(HALF)
    expect(resolveCatalogs(DECLARED_CATALOGS, GONG_CANONICAL).gong).toEqual(GONG_CANONICAL)
  })

  it('résout la base à un demi-gong sans passer par la valeur évaluée', () => {
    const resolved = resolveCatalogs(DECLARED_CATALOGS, HALF)

    // 12 gongs × 1 ÷ 2 = 6 s, puis la courbe. Le niveau 3 vaut donc ⌊6 × 1,4²⌋
    // = 11, et non ⌊⌊12 × 1,4²⌋ ÷ 2⌋ = 11 par hasard — l'écart apparaît plus
    // haut, et c'est pourquoi le test descend au niveau 10.
    expect(resolved.buildings.mine.buildDuration.base).toBe(6)
    expect(evaluateCurve(resolved.buildings.mine.buildDuration, 10)).toBe(
      evaluateCurve({ kind: 'geometric', base: 6, num: 7, den: 5 }, 10),
    )
  })
})

/**
 * **Une durée résolue vaut au moins une seconde** (FR-008).
 *
 * Un chantier instantané n'est pas un chantier : il ne s'affiche pas, ne se
 * regarde pas finir, et rend `work-in-progress` inatteignable. À gong très
 * court, la troncature produirait des zéros — la centrale, neuf gongs, tombe
 * sur `⌊9 ÷ 6⌋ = 1` à un sixième de seconde, et tomberait sur zéro plus bas.
 */
describe('aucune durée résolue ne tombe à zéro (FR-008)', () => {
  const Tiny: GongLength = { num: 1, den: 100 }

  it('plancher la base de chaque durée à une seconde', () => {
    const resolved = resolveCatalogs(DECLARED_CATALOGS, Tiny)

    for (const id of Object.keys(resolved.buildings) as (keyof typeof resolved.buildings)[]) {
      expect(resolved.buildings[id].buildDuration.base, id).toBeGreaterThanOrEqual(1)
      expect(resolved.buildings[id].demolitionSeconds, id).toBeGreaterThanOrEqual(1)
    }
    for (const id of Object.keys(resolved.obstacles) as (keyof typeof resolved.obstacles)[]) {
      expect(resolved.obstacles[id].durationSeconds, id).toBeGreaterThanOrEqual(1)
    }
  })

  /**
   * Le plancher porte sur la base, mais la propriété qui compte porte sur
   * **toute valeur de courbe** : c'est celle-là que le joueur subit. Elle en
   * découle — les courbes de durée sont croissantes —, et la vérifier plutôt
   * que la déduire coûte trente niveaux et garde la déduction.
   */
  it('donne au moins une seconde à tout niveau de toute courbe de durée', () => {
    const resolved = resolveCatalogs(DECLARED_CATALOGS, Tiny)

    for (const id of Object.keys(resolved.buildings) as (keyof typeof resolved.buildings)[]) {
      const type = resolved.buildings[id]
      for (let level = 1; level <= type.maxLevel; level += 1) {
        expect(
          evaluateCurve(type.buildDuration, level),
          `${id} niveau ${level}`,
        ).toBeGreaterThanOrEqual(1)
      }
    }
  })
})
