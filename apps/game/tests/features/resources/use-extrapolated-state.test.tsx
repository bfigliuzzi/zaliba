import { act, cleanup, renderHook } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExtrapolatedState } from '../../../src/features/resources/useExtrapolatedState.js'
import { createClock } from '../../../src/lib/clock.js'
import { CATALOGS } from '../../catalogs.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * La boucle d'extrapolation.
 *
 * Elle rejoue `project()` **localement**, sans un seul appel réseau (R8). Ce que
 * ces cas éprouvent est le rythme et la source du temps, la justesse du calcul
 * étant déjà tenue par `extrapolation.test.ts`.
 *
 * **Le rythme est la seconde, pas l'image.** Une boucle à soixante images par
 * seconde recalculerait soixante fois une valeur qui, à vingt unités par heure,
 * change une fois toutes les trois minutes. Elle viderait une batterie de
 * téléphone pour animer un chiffre immobile.
 */

const payload = PlanetSnapshotV1.parse(rawFresh)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

/** Une horloge monotone que les cas font avancer à la main. */
function pilotedClock(start = 1_000) {
  let millis = start
  const clock = createClock({ monotonic: () => millis })
  clock.sync(payload.serverInstant as never)
  return {
    clock,
    advance(seconds: number) {
      millis += seconds * 1_000
    },
  }
}

describe('l’état extrapolé suit l’horloge serveur', () => {
  it('part de l’instantané reçu', () => {
    const { clock } = pilotedClock()
    const { result } = renderHook(() => useExtrapolatedState(payload, CATALOGS, clock))

    expect(result.current.holdings['camelote'].amount).toBe(1_440_000)
  })

  it('avance d’une heure de production après une heure', () => {
    const { clock, advance } = pilotedClock()
    const { result } = renderHook(() => useExtrapolatedState(payload, CATALOGS, clock))

    act(() => {
      advance(3_600)
      vi.advanceTimersByTime(1_000)
    })

    expect(result.current.holdings['camelote'].amount).toBe(1_440_000 + 72_000)
  })

  /**
   * L'horloge **monotone** est la seule référence d'écoulement. Un saut de
   * l'horloge du système — changement d'heure, resynchronisation — ne doit pas
   * faire bondir les compteurs.
   */
  it('ignore l’horloge du système', () => {
    const { clock, advance } = pilotedClock()
    const { result } = renderHook(() => useExtrapolatedState(payload, CATALOGS, clock))

    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    act(() => {
      advance(60)
      vi.advanceTimersByTime(1_000)
    })

    expect(result.current.holdings['camelote'].amount).toBe(1_440_000 + 20 * 60)
  })
})

describe('le rythme est la seconde', () => {
  it('ne recalcule pas plus d’une fois par seconde', () => {
    const { clock, advance } = pilotedClock()
    const { result } = renderHook(() => useExtrapolatedState(payload, CATALOGS, clock))
    const initial = result.current.holdings['camelote'].amount

    act(() => {
      advance(30)
      vi.advanceTimersByTime(500)
    })

    expect(result.current.holdings['camelote'].amount).toBe(initial)
  })

  it('cesse de recalculer une fois démonté', () => {
    const { clock, advance } = pilotedClock()
    const { unmount } = renderHook(() => useExtrapolatedState(payload, CATALOGS, clock))

    unmount()
    act(() => {
      advance(3_600)
      vi.advanceTimersByTime(5_000)
    })

    // Aucune minuterie ne doit survivre : sinon chaque navigation laisserait une
    // boucle derrière elle, et l'onglet finirait par en tenir des dizaines.
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('aucun appel réseau', () => {
  it('n’émet rien pendant toute l’animation', () => {
    const fetchSpy = vi.fn()
    const original = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    try {
      const { clock, advance } = pilotedClock()
      renderHook(() => useExtrapolatedState(payload, CATALOGS, clock))

      act(() => {
        for (let tick = 0; tick < 120; tick += 1) {
          advance(1)
          vi.advanceTimersByTime(1_000)
        }
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = original
    }
  })
})
