import type { GongLength } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../src/game.js'
import { DECLARED_CATALOGS } from '../../src/kernel/catalogs.js'
import { evaluateCurve } from '../../src/kernel/curves.js'
import { resolveCatalogs } from '../../src/kernel/gong.js'
import { emptySnapshot, type PlanetSnapshot } from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'

/**
 * **Une accélération qui ne porterait que sur les chantiers laisserait le joueur
 * affamé** (SC-002).
 *
 * C'est le constat qui a fait naître le Gong, et il mérite d'être redit ici
 * parce qu'il n'est visible dans aucun autre test : diviser les durées de
 * chantier par soixante sans toucher à la production donnerait un chantier de
 * mine en deux secondes et une attente de **cinq heures** pour en payer le
 * niveau suivant. Le testeur pourrait observer des états, pas jouer.
 *
 * Le Gong résout cela par l'unité elle-même : les durées sont en gongs et les
 * taux en grains **par gong**, donc les deux se résolvent avec la même longueur
 * et ne peuvent plus diverger. Ce fichier le tient par le calcul.
 */

const T0 = instant(1_787_750_000)
const CANONICAL: GongLength = { num: 10, den: 1 }
const SIXTH: GongLength = { num: 1, den: 6 }

function freshAt(gong: GongLength): PlanetSnapshot {
  const catalogs = resolveCatalogs(DECLARED_CATALOGS, gong)
  return emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt: T0,
    catalogs,
  })
}

/**
 * Le temps qu'il faut, sur une planète fraîche, pour réunir un montant de
 * Camelote au taux de base de la disposition.
 *
 * C'est la mesure d'accumulation la plus simple qui soit, et c'est exactement
 * celle qui manquait : elle ne dépend d'aucun chantier, donc elle isole le
 * versant « ressources » du rapport d'accélération.
 */
function secondsToAccumulate(gong: GongLength, grainsWanted: number): number {
  const catalogs = resolveCatalogs(DECLARED_CATALOGS, gong)
  const state = projectPlanet(freshAt(gong), catalogs, T0)
  const rate = state.holdings.camelote.rate
  expect(rate, `taux nul à ${gong.num}/${gong.den}`).toBeGreaterThan(0)
  return Math.ceil(grainsWanted / rate)
}

describe('durées de chantier et accumulation suivent le même rapport (SC-002)', () => {
  /**
   * La quantité visée est un **multiple des deux taux**, et ce n'est pas de la
   * commodité : le temps d'accumulation est un nombre entier de secondes, donc
   * une quantité quelconque ferait porter au rapport l'arrondi de la dernière
   * seconde plutôt que la propriété qu'on éprouve. 120 000 grains tombent juste
   * des deux côtés — 6 000 s au canonique, 100 s au sixième.
   */
  it('accélère l’accumulation dans le rapport des longueurs', () => {
    const wanted = 120_000
    const slow = secondsToAccumulate(CANONICAL, wanted)
    const fast = secondsToAccumulate(SIXTH, wanted)

    expect(slow / fast).toBe(60)
  })

  /**
   * Le point qui a motivé le Gong, énoncé comme un test : les deux versants du
   * jeu bougent **ensemble**. Le rapport des durées de chantier et le rapport
   * des temps d'accumulation sont le même nombre.
   */
  it('fait bouger chantiers et ressources du même facteur', () => {
    const slowCatalogs = resolveCatalogs(DECLARED_CATALOGS, CANONICAL)
    const fastCatalogs = resolveCatalogs(DECLARED_CATALOGS, SIXTH)

    const buildRatio =
      evaluateCurve(slowCatalogs.buildings.mine.buildDuration, 1) /
      evaluateCurve(fastCatalogs.buildings.mine.buildDuration, 1)

    const accumulationRatio =
      secondsToAccumulate(CANONICAL, 120_000) / secondsToAccumulate(SIXTH, 120_000)

    expect(buildRatio).toBe(accumulationRatio)
  })
})

/**
 * **Ce qui n'a pas de dimension de temps ne bouge pas d'un serveur à l'autre**
 * (FR-004).
 *
 * Un joueur qui change de serveur retrouve les mêmes coûts, les mêmes plafonds
 * et le même rapport d'énergie. Seul le rythme change — et c'est ce qui fait de
 * la longueur du gong une propriété du serveur plutôt qu'un rééquilibrage.
 */
describe('coûts, capacités et énergie sont les mêmes sur les deux serveurs', () => {
  it('donne le même état de jeu, hors dimension de temps', () => {
    const slow = projectPlanet(
      freshAt(CANONICAL),
      resolveCatalogs(DECLARED_CATALOGS, CANONICAL),
      T0,
    )
    const fast = projectPlanet(freshAt(SIXTH), resolveCatalogs(DECLARED_CATALOGS, SIXTH), T0)

    for (const resourceId of ['camelote', 'jus', 'bave-etoiles'] as const) {
      expect(fast.holdings[resourceId].amount, `${resourceId} — stock de départ`).toBe(
        slow.holdings[resourceId].amount,
      )
      expect(fast.holdings[resourceId].cap, `${resourceId} — plafond`).toBe(
        slow.holdings[resourceId].cap,
      )
    }

    expect(fast.energy.produced).toBe(slow.energy.produced)
    expect(fast.energy.consumed).toBe(slow.energy.consumed)
    expect(fast.energy.ratio).toEqual(slow.energy.ratio)
  })
})

/**
 * **Le rapport d'accélération, et sa limite** (SC-002, dans sa rédaction
 * amendée).
 *
 * SC-002 promettait d'abord « à la seconde près » un rapport que l'arithmétique
 * entière de G4 ne peut pas tenir. La spécification a été corrigée ; ce test est
 * ce qui empêchera de réécrire la promesse dans l'autre sens.
 *
 * Deux propriétés distinctes, donc deux assertions :
 *
 * 1. les taux et les bases de durée **qui se résolvent sans reste** suivent le
 *    rapport exactement — la mine, douze gongs, tombe sur deux secondes à un
 *    sixième : ×60 pile ;
 * 2. une base qui **ne** se résout pas sans reste tronque une fois, et la courbe
 *    reporte l'écart. La centrale, neuf gongs, tombe sur `max(1, ⌊9 ÷ 6⌋) = 1`
 *    au lieu de 1,5 : ×90. Au niveau 30, la courbe `7/5` porte l'écart à
 *    plusieurs milliers de secondes. Ce qui est borné, et donc vérifiable, c'est
 *    `troncature × courbe(niveau)` — pas « une seconde », qui serait faux.
 *
 * Le test s'exécute **hors du gong canonique** : au canonique, aucune troncature
 * n'a lieu et la seconde assertion serait vide de contenu.
 */
describe('le rapport est exact quand la base tombe juste, borné sinon', () => {
  const slow = resolveCatalogs(DECLARED_CATALOGS, CANONICAL)
  const fast = resolveCatalogs(DECLARED_CATALOGS, SIXTH)
  /** Dix secondes contre un sixième de seconde. */
  const Ratio = 60

  it('suit le rapport exactement pour une base qui se résout sans reste', () => {
    // 12 gongs → 120 s au canonique, 2 s au sixième. 12 ÷ 6 = 2, sans reste.
    expect(slow.buildings.mine.buildDuration.base).toBe(120)
    expect(fast.buildings.mine.buildDuration.base).toBe(2)
    expect(slow.buildings.mine.buildDuration.base / fast.buildings.mine.buildDuration.base).toBe(
      Ratio,
    )

    // Et les taux, toujours : leur résolution est une division exacte, refusée
    // au démarrage si elle ne l'est pas (FR-006).
    expect(slow.buildings.mine.production?.base).toBe(15)
    expect(fast.buildings.mine.production?.base).toBe(900)
  })

  it('borne l’écart quand la base tronque, au lieu de promettre la seconde', () => {
    // 9 gongs ÷ 6 = 1,5 → tronqué à 1. Le rapport réel est 90, non 60.
    expect(slow.buildings.centrale.buildDuration.base).toBe(90)
    expect(fast.buildings.centrale.buildDuration.base).toBe(1)

    // La troncature, en secondes de gong rapide : 1,5 − 1 = 0,5.
    const exact = (9 * SIXTH.num) / SIXTH.den
    const truncation = exact - fast.buildings.centrale.buildDuration.base
    expect(truncation).toBeGreaterThan(0)

    // À chaque niveau, l'écart entre la durée idéale — celle qu'on obtiendrait
    // en divisant la durée canonique par le rapport — et la durée réelle reste
    // borné par `troncature × courbe(niveau)`, à une unité de troncature finale
    // près. C'est calculable, et c'est ce qui remplace « à la seconde près ».
    for (let level = 1; level <= slow.buildings.centrale.maxLevel; level += 1) {
      const ideal = evaluateCurve(slow.buildings.centrale.buildDuration, level) / Ratio
      const actual = evaluateCurve(fast.buildings.centrale.buildDuration, level)
      const curve = (7 / 5) ** (level - 1)

      expect(ideal - actual, `centrale niveau ${level}`).toBeGreaterThan(-1)
      expect(ideal - actual, `centrale niveau ${level}`).toBeLessThanOrEqual(truncation * curve + 1)
    }
  })

  /**
   * L'écart est **monotone dans le bon sens** : la troncature raccourcit, elle
   * n'allonge jamais. Un serveur rapide ne peut donc pas devenir plus lent que
   * le rapport ne le laisse attendre, ce qui serait la seule forme d'écart
   * réellement gênante pour un joueur.
   */
  it('ne rallonge jamais au-delà du rapport', () => {
    for (let level = 1; level <= slow.buildings.centrale.maxLevel; level += 1) {
      const ideal = evaluateCurve(slow.buildings.centrale.buildDuration, level) / Ratio
      const actual = evaluateCurve(fast.buildings.centrale.buildDuration, level)
      expect(actual, `centrale niveau ${level}`).toBeLessThanOrEqual(Math.ceil(ideal))
    }
  })
})
