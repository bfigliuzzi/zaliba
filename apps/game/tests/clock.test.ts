import { instant } from '@zaliba/domain'
import { describe, expect, it } from 'vitest'
import { createClock } from '../src/lib/clock.js'

/**
 * Le décalage d'horloge.
 *
 * `serverInstant`, reçu dans la réponse, est la **seule** référence. L'horloge
 * locale ne sert qu'à mesurer un **écoulement** — jamais un instant absolu.
 *
 * La distinction n'a rien de théorique dans un jeu dont le sujet est le temps.
 * L'horloge d'un poste de travail dérive, se resynchronise par sauts, change au
 * passage à l'heure d'été, et un joueur peut la déplacer d'une année. Un client
 * qui daterait ses compteurs avec `Date.now()` afficherait alors une production
 * négative, ou plusieurs mois d'avance — et le serveur, lui, aurait raison.
 *
 * D'où la mesure par une horloge **monotone**, qui ne sait dire qu'une chose :
 * combien de temps a passé depuis un point quelconque. C'est exactement ce dont
 * on a besoin, et rien de ce qu'on ne veut pas.
 */

/** Une horloge monotone pilotée par les cas, en millisecondes. */
function fakeMonotonic(start = 12_345.678) {
  let value = start
  return {
    read: () => value,
    advance(millis: number) {
      value += millis
    },
  }
}

describe('sans référence serveur, le client ne prétend pas connaître l’heure', () => {
  it('ne rend aucun instant avant la première synchronisation', () => {
    const clock = createClock({ monotonic: fakeMonotonic().read })
    expect(clock.serverNow()).toBeNull()
  })

  /**
   * Rendre `null` plutôt que de retomber sur l'horloge locale. Un repli
   * silencieux donnerait une valeur plausible et fausse, et le défaut ne se
   * verrait qu'à la première incohérence — c'est-à-dire trop tard.
   */
  it('ne se rabat pas sur l’horloge locale', () => {
    const clock = createClock({ monotonic: fakeMonotonic().read })
    expect(clock.serverNow()).not.toBe(Math.floor(Date.now() / 1000))
  })
})

describe('après synchronisation, l’instant serveur avance de l’écoulement local', () => {
  it('rend exactement l’instant reçu au moment de la synchronisation', () => {
    const monotonic = fakeMonotonic()
    const clock = createClock({ monotonic: monotonic.read })

    clock.sync(instant(1_787_750_000))
    expect(clock.serverNow()).toBe(1_787_750_000)
  })

  it('ajoute l’écoulement mesuré localement', () => {
    const monotonic = fakeMonotonic()
    const clock = createClock({ monotonic: monotonic.read })

    clock.sync(instant(1_787_750_000))
    monotonic.advance(5_000)

    expect(clock.serverNow()).toBe(1_787_750_005)
  })

  /**
   * R2 : `Instant` est un entier de secondes UTC, et la troncature va vers le
   * bas. Arrondir au plus proche ferait parfois avancer le client **devant** le
   * serveur, ce qui produit une durée restante négative à l'affichage.
   */
  it('tronque vers le bas, jamais vers le plus proche', () => {
    const monotonic = fakeMonotonic()
    const clock = createClock({ monotonic: monotonic.read })

    clock.sync(instant(1_787_750_000))
    monotonic.advance(1_999)

    expect(clock.serverNow()).toBe(1_787_750_001)
  })

  it('ne recule jamais quand l’écoulement est nul', () => {
    const monotonic = fakeMonotonic()
    const clock = createClock({ monotonic: monotonic.read })

    clock.sync(instant(1_787_750_000))
    expect(clock.serverNow()).toBe(1_787_750_000)
    expect(clock.serverNow()).toBe(1_787_750_000)
  })
})

describe('chaque réponse du serveur redresse la référence', () => {
  it('remplace la référence à la synchronisation suivante', () => {
    const monotonic = fakeMonotonic()
    const clock = createClock({ monotonic: monotonic.read })

    clock.sync(instant(1_787_750_000))
    monotonic.advance(10_000)
    // Le serveur dit 1_787_750_042 : il a raison, même si le client
    // extrapolait 1_787_750_010.
    clock.sync(instant(1_787_750_042))

    expect(clock.serverNow()).toBe(1_787_750_042)
  })

  it('repart de la nouvelle référence pour l’écoulement suivant', () => {
    const monotonic = fakeMonotonic()
    const clock = createClock({ monotonic: monotonic.read })

    clock.sync(instant(1_787_750_000))
    monotonic.advance(10_000)
    clock.sync(instant(1_787_750_042))
    monotonic.advance(3_000)

    expect(clock.serverNow()).toBe(1_787_750_045)
  })

  /**
   * L'écart entre ce que le client extrapolait et ce que le serveur annonce est
   * la dérive. L'exposer permet à l'interface de décider — un saut d'une
   * seconde s'absorbe en douceur, un saut d'une heure demande de recharger.
   */
  it('expose la correction appliquée', () => {
    const monotonic = fakeMonotonic()
    const clock = createClock({ monotonic: monotonic.read })

    clock.sync(instant(1_787_750_000))
    monotonic.advance(10_000)

    expect(clock.sync(instant(1_787_750_042))).toBe(32)
  })

  it('ne rapporte aucune correction à la première synchronisation', () => {
    const clock = createClock({ monotonic: fakeMonotonic().read })
    expect(clock.sync(instant(1_787_750_000))).toBeNull()
  })
})

describe('l’horloge du poste n’est jamais une source de vérité', () => {
  /**
   * Le point d'origine de l'horloge monotone est arbitraire — `performance.now()`
   * compte depuis le chargement de la page. Si le résultat en dépendait, il
   * serait faux au rechargement suivant.
   */
  it('ne dépend pas de l’origine de l’horloge monotone', () => {
    const results = [0, 1_000_000, 987_654_321].map((start) => {
      const monotonic = fakeMonotonic(start)
      const clock = createClock({ monotonic: monotonic.read })
      clock.sync(instant(1_787_750_000))
      monotonic.advance(7_000)
      return clock.serverNow()
    })

    expect(new Set(results)).toEqual(new Set([1_787_750_007]))
  })

  /**
   * Le cas qui justifie tout le module : le joueur — ou son système — déplace
   * l'horloge du poste. Une horloge monotone n'en sait rien, et le compteur
   * continue d'avancer normalement.
   */
  it('reste juste quand l’horloge du système saute', () => {
    const monotonic = fakeMonotonic()
    const clock = createClock({ monotonic: monotonic.read })

    clock.sync(instant(1_787_750_000))
    // Le poste bascule d'un an dans le futur : la monotone, elle, n'a pas bougé.
    monotonic.advance(4_000)

    expect(clock.serverNow()).toBe(1_787_750_004)
  })
})
