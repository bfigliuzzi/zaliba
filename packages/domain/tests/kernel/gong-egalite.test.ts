import { GONG_CANONICAL } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { evaluateCurve } from '../../src/kernel/curves.js'
import { CATALOGS } from '../catalogs.js'
import AVANT from '../fixtures/avant-le-gong.json' with { type: 'json' }

/**
 * **La table de vérité : rien n'a bougé** (FR-010, SC-001).
 *
 * C'est la seule preuve que le changement d'unité n'a déplacé aucun chiffre du
 * jeu, et c'est le socle de confiance de toute la tranche — si l'équilibrage a
 * bougé, le reste ne vaut rien.
 *
 * La fixture a été engendrée **avant** la bascule du catalogue, par un script
 * jetable, puis committée. La régénérer après coup prouverait seulement que le
 * catalogue est égal à lui-même : c'est la façon dont ce test cesse de tenir
 * quoi que ce soit, et c'est pourquoi le fichier de fixture le dit lui-même.
 *
 * **Un écart se corrige dans `kernel/gong.ts`, jamais dans `packages/catalogs`.**
 * Ajuster une valeur du catalogue pour faire passer un test d'égalité, ce serait
 * rééquilibrer le jeu en prétendant changer une unité.
 *
 * ## Le compte, et pourquoi il est vérifié
 *
 * **240** : 140 durées de construction (quatre types sur trente niveaux, plus
 * l'entrepôt sur vingt), 5 durées de démolition, 5 de déblaiement, 90 taux
 * (trois extracteurs sur trente niveaux).
 *
 * Le test **échoue s'il a comparé moins de 240 valeurs**, et pas seulement zéro.
 * Les documents de conception annonçaient d'abord 230, qui est le total sans la
 * démolition ni le déblaiement : une fixture amputée de ces dix valeurs passerait
 * en vert sans les avoir vues, et la seule preuve que rien n'a bougé ne
 * couvrirait pas ce qu'elle prétend couvrir.
 */

/** Ce que le test a réellement comparé. Compté, jamais supposé. */
let compared = 0

function same(actual: number, expected: number, what: string): void {
  compared += 1
  expect(actual, what).toBe(expected)
}

describe('au gong canonique, les 240 valeurs sont strictement égales à celles d’avant 003', () => {
  it('compare les 240, et le dit', () => {
    compared = 0

    // Les durées de construction, niveau par niveau, jusqu'au plafond du type.
    for (const [typeId, expected] of Object.entries(AVANT.buildDurationSeconds)) {
      const curve = CATALOGS.buildings[typeId as keyof typeof CATALOGS.buildings].buildDuration
      expected.forEach((seconds, index) => {
        same(
          evaluateCurve(curve, index + 1),
          seconds,
          `${typeId} — construction niveau ${index + 1}`,
        )
      })
    }

    // Les durées de démolition et de déblaiement : dix valeurs qu'un compte à
    // 230 laisserait hors de la preuve.
    for (const [typeId, expected] of Object.entries(AVANT.demolitionSeconds)) {
      const type = CATALOGS.buildings[typeId as keyof typeof CATALOGS.buildings]
      same(type.demolitionSeconds, expected, `${typeId} — démolition`)
    }
    for (const [obstacleId, expected] of Object.entries(AVANT.clearingDurationSeconds)) {
      const obstacle = CATALOGS.obstacles[obstacleId as keyof typeof CATALOGS.obstacles]
      same(obstacle.durationSeconds, expected, `${obstacleId} — déblaiement`)
    }

    // Les taux de production. Le catalogue les déclarait en unités par heure et
    // les déclare en grains par gong ; résolus au gong canonique, ils retombent
    // sur le même entier, parce qu'une unité par heure vaut exactement un grain
    // par seconde (GRAINS_PER_UNIT = 3600, R1).
    for (const [typeId, expected] of Object.entries(AVANT.productionPerHour)) {
      const curve = CATALOGS.buildings[typeId as keyof typeof CATALOGS.buildings].production
      expect(curve, typeId).not.toBeNull()
      if (curve === null) continue
      expected.forEach((rate, index) => {
        same(evaluateCurve(curve, index + 1), rate, `${typeId} — taux niveau ${index + 1}`)
      })
    }

    expect(
      compared,
      `Le test a comparé ${compared} valeurs au lieu de 240. ` +
        `Une fixture amputée passerait en vert sans avoir vu ce qu'elle prétend couvrir.`,
    ).toBe(240)
  })

  /**
   * Le catalogue employé par les autres tests du domaine est bien celui du gong
   * canonique. Sans cette assertion, le test précédent pourrait comparer une
   * table de vérité à elle-même par une longueur choisie ailleurs.
   */
  it('compare bien le catalogue résolu au gong canonique', () => {
    expect(CATALOGS.gong).toEqual(GONG_CANONICAL)
  })

  /** La fixture elle-même compte 240 entrées — le compte est vérifié des deux côtés. */
  it('lit une fixture de 240 entrées', () => {
    const count =
      Object.values(AVANT.buildDurationSeconds).reduce(
        (total, levels) => total + levels.length,
        0,
      ) +
      Object.keys(AVANT.demolitionSeconds).length +
      Object.keys(AVANT.clearingDurationSeconds).length +
      Object.values(AVANT.productionPerHour).reduce((total, levels) => total + levels.length, 0)

    expect(count).toBe(240)
  })
})
