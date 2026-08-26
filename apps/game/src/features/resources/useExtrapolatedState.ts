import type { PlanetSnapshotV1 } from '@zaliba/contracts'
import { type Catalogs, instant, type ProjectedState } from '@zaliba/domain'
import { useEffect, useMemo, useState } from 'react'
import type { Clock } from '../../lib/clock.js'
import { extrapolate } from './extrapolation.js'

/**
 * La boucle d'animation : `project()` rejoué **localement**, sans réseau (R8).
 *
 * **Le rythme est la seconde, pas l'image.** Une boucle à soixante images par
 * seconde recalculerait soixante fois une valeur qui, à vingt unités par heure,
 * change une fois toutes les trois minutes. Elle viderait une batterie de
 * téléphone pour animer un chiffre immobile — et la cible est une application
 * mobile.
 *
 * **L'instant vient de l'horloge serveur**, pas de `Date.now()`. Le décalage a
 * été calculé une fois à la réception de l'instantané ; l'horloge locale ne sert
 * qu'à mesurer un écoulement. Sans cela, un poste dont l'heure dérive
 * afficherait une production en avance ou en retard, et le premier clic serait
 * corrigé par le serveur sans que rien ne l'explique.
 */

/** Une seconde : le pas de temps du jeu (R2). Rien ne change plus vite. */
const TICK_MILLIS = 1_000

export function useExtrapolatedState(
  payload: PlanetSnapshotV1,
  catalogs: Catalogs,
  clock: Clock,
): ProjectedState {
  const [now, setNow] = useState(() => clock.serverNow() ?? payload.serverInstant)

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(clock.serverNow() ?? payload.serverInstant)
    }, TICK_MILLIS)

    // La minuterie est arrêtée au démontage. Sans cela, chaque navigation
    // laisserait une boucle derrière elle, et l'onglet finirait par en tenir
    // des dizaines — toutes recalculant une planète qu'on n'affiche plus.
    return () => clearInterval(timer)
  }, [clock, payload.serverInstant])

  return useMemo(() => extrapolate(payload, catalogs, instant(now)), [payload, catalogs, now])
}
