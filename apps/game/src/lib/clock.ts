import { type Instant, instant } from '@zaliba/domain'

/**
 * Le décalage d'horloge : `serverInstant` est la seule référence.
 *
 * L'horloge locale ne sert qu'à mesurer un **écoulement** — jamais un instant
 * absolu. La distinction n'a rien de théorique dans un jeu dont le sujet est le
 * temps : l'horloge d'un poste dérive, se resynchronise par sauts, change au
 * passage à l'heure d'été, et un joueur peut la déplacer d'une année. Un client
 * qui daterait ses compteurs avec `Date.now()` afficherait alors une production
 * négative, ou plusieurs mois d'avance — et le serveur, lui, aurait raison.
 *
 * D'où `performance.now()`, horloge **monotone**, qui ne sait dire qu'une
 * chose : combien de temps a passé depuis un point quelconque. C'est exactement
 * ce dont on a besoin, et rien de ce qu'on ne veut pas — son origine étant
 * arbitraire, elle ne peut pas être prise pour une date.
 *
 * C'est le pendant côté client de la règle du serveur : l'instant de référence
 * y est le `now()` de la transaction PostgreSQL, jamais l'horloge du processus.
 */

export interface ClockOptions {
  /**
   * Une horloge monotone, en millisecondes. Par défaut `performance.now()`.
   * Injectable : un test doit pouvoir faire passer six heures sans attendre.
   */
  readonly monotonic?: () => number
}

export interface Clock {
  /**
   * Enregistre l'instant annoncé par le serveur.
   *
   * Rend la **correction** appliquée, en secondes — l'écart entre ce que le
   * client extrapolait et ce que le serveur annonce —, ou `null` s'il s'agit de
   * la première synchronisation. L'exposer permet à l'interface de décider : un
   * saut d'une seconde s'absorbe en douceur, un saut d'une heure demande de
   * recharger.
   */
  sync(serverInstant: Instant): number | null

  /**
   * L'instant serveur estimé maintenant, ou `null` tant qu'aucune réponse n'est
   * arrivée.
   *
   * `null` plutôt qu'un repli sur l'horloge locale : un repli silencieux
   * donnerait une valeur plausible et fausse, et le défaut ne se verrait qu'à
   * la première incohérence, c'est-à-dire trop tard.
   */
  serverNow(): Instant | null
}

interface Reference {
  readonly serverInstant: number
  /** La lecture de l'horloge monotone au moment de la synchronisation. */
  readonly monotonicMillis: number
}

export function createClock(options: ClockOptions = {}): Clock {
  const monotonic = options.monotonic ?? (() => performance.now())
  let reference: Reference | null = null

  function estimate(at: Reference, nowMillis: number): number {
    // Troncature vers le bas (R2). Arrondir au plus proche ferait parfois
    // avancer le client **devant** le serveur, ce qui affiche une durée
    // restante négative.
    return at.serverInstant + Math.floor((nowMillis - at.monotonicMillis) / 1000)
  }

  return {
    sync(serverInstant: Instant): number | null {
      const nowMillis = monotonic()
      const previous = reference
      reference = { serverInstant, monotonicMillis: nowMillis }

      if (previous === null) return null
      return serverInstant - estimate(previous, nowMillis)
    },

    serverNow(): Instant | null {
      if (reference === null) return null
      return instant(estimate(reference, monotonic()))
    },
  }
}
