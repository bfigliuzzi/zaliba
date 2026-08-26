import { createRoute } from '@tanstack/react-router'
import type { PlanetSnapshotV1 } from '@zaliba/contracts'
import { DEFAULT_CATALOGS, layoutOf } from '@zaliba/domain'
import { useEffect, useMemo } from 'react'
import { PlanetLoader } from '../features/auth/PlanetLoader.js'
import { SessionGate } from '../features/auth/SessionGate.js'
import { GridView } from '../features/grid/GridView.js'
import { ResourcePanel } from '../features/resources/ResourcePanel.js'
import { useExtrapolatedState } from '../features/resources/useExtrapolatedState.js'
import { WorkInProgress } from '../features/work/WorkInProgress.js'
import { createClock } from '../lib/clock.js'
import { rootRoute } from './root.js'

/**
 * L'écran de planète : la grille, les ressources, le chantier.
 *
 * L'assemblage suit l'ordre des dépendances, et chacune ferme une porte :
 *
 * - **la porte de session** empêche le *montage* du contenu protégé, plutôt que
 *   d'annuler ses requêtes après coup ;
 * - **le chargeur** traite le `404 planet-not-provisioned` comme un déclencheur
 *   et non comme une erreur — un joueur tout neuf ne doit pas être accueilli par
 *   un échec (FR-001) ;
 * - **l'extrapolation** rejoue `project()` localement, à la seconde, sans un
 *   seul appel réseau (R8).
 */
export const planetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/planet',
  component: PlanetRoute,
})

function PlanetRoute() {
  const { session, gateway } = rootRoute.useRouteContext()

  return (
    <SessionGate session={session}>
      <PlanetLoader gateway={gateway}>
        {(snapshot) => <PlanetScreen snapshot={snapshot} />}
      </PlanetLoader>
    </SessionGate>
  )
}

export function PlanetScreen({ snapshot }: { readonly snapshot: PlanetSnapshotV1 }) {
  /**
   * Une horloge par instantané reçu. Elle se resynchronise sur `serverInstant`
   * à chaque réponse : c'est la seule référence absolue, l'horloge locale ne
   * mesurant qu'un écoulement.
   */
  const clock = useMemo(() => createClock(), [])
  useEffect(() => {
    clock.sync(snapshot.serverInstant as never)
  }, [clock, snapshot.serverInstant])

  const state = useExtrapolatedState(snapshot, DEFAULT_CATALOGS, clock)

  // Les dimensions viennent de la **disposition**, jamais d'une constante :
  // un archétype plus grand ne doit pas exiger de retoucher cet écran.
  const layout = layoutOf(DEFAULT_CATALOGS, snapshot.planet.layoutId as never)

  return (
    <>
      <h1>Ma planète</h1>
      <GridView cells={state.grid} width={layout.width} height={layout.height} />
      <ResourcePanel holdings={state.holdings} at={state.at} />
      <WorkInProgress work={state.work} />
    </>
  )
}
