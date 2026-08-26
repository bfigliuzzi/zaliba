import { createRoute } from '@tanstack/react-router'
import type { BuildingTypeId, FootprintId } from '@zaliba/catalogs'
import type { PlanetSnapshotV1 } from '@zaliba/contracts'
import type { BuildCommand, CellView, PreviewResult } from '@zaliba/domain'
import {
  DEFAULT_CATALOGS,
  layoutOf,
  placementCells,
  previewBuild,
  validatePlacement,
} from '@zaliba/domain'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PlanetGateway } from '../features/auth/gateway.js'
import { PlanetLoader } from '../features/auth/PlanetLoader.js'
import { SessionGate } from '../features/auth/SessionGate.js'
import type { GhostState } from '../features/grid/FootprintGhost.js'
import { GridLiveRegion } from '../features/grid/GridLiveRegion.js'
import { GridView } from '../features/grid/GridView.js'
import { useGridCursor } from '../features/grid/useGridCursor.js'
import { ResourcePanel } from '../features/resources/ResourcePanel.js'
import { useExtrapolatedState } from '../features/resources/useExtrapolatedState.js'
import { BuildPanel, type BuildSelection } from '../features/work/BuildPanel.js'
import { CurrentWork } from '../features/work/CurrentWork.js'
import { RefusalNotice } from '../features/work/RefusalNotice.js'
import { createClock } from '../lib/clock.js'
import { PlanetRefusal } from '../lib/planetGateway.js'
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
 *
 * **L'ordre du document est l'ordre du parcours** (SC-001). Le panneau de
 * construction précède la grille : sélectionner un type, choisir une empreinte,
 * puis déplacer le curseur. Aucun sous-menu, aucune boîte modale — c'est ce que
 * le compte de frappes mesure.
 *
 * **Le curseur et la sélection vivent ici**, et non dans la grille. Quatre
 * choses en dépendent — le fantôme, l'aperçu, l'annonce et le lancement — et
 * aucune n'appartient à la grille. Une grille qui détiendrait son curseur
 * obligerait chacune des quatre à en tenir une copie, c'est-à-dire à afficher un
 * fantôme à un endroit et à poser à un autre.
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
        {(snapshot, refresh) => (
          <PlanetScreen snapshot={snapshot} gateway={gateway} onSnapshot={refresh} />
        )}
      </PlanetLoader>
    </SessionGate>
  )
}

export interface PlanetScreenProps {
  readonly snapshot: PlanetSnapshotV1
  readonly gateway: PlanetGateway
  /** Reçoit l'instantané que le serveur rend après une commande acceptée. */
  readonly onSnapshot?: (snapshot: PlanetSnapshotV1) => void
}

export function PlanetScreen({ snapshot, gateway, onSnapshot }: PlanetScreenProps) {
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
  const bounds = useMemo(
    () => ({ width: layout.width, height: layout.height }),
    [layout.width, layout.height],
  )

  const cursor = useGridCursor(bounds)
  const [selection, setSelection] = useState<BuildSelection>({ typeId: null, variantId: null })
  const [refusal, setRefusal] = useState<PlanetRefusal | null>(null)
  const [pending, setPending] = useState(false)

  /**
   * Choisir un type **présélectionne sa première variante**.
   *
   * Sans cela, le joueur paierait une frappe pour un choix que le catalogue a
   * déjà fait à sa place : quatre des cinq types n'ont qu'une seule empreinte.
   * Le choix reste ouvert — les flèches parcourent les variantes — mais il n'est
   * plus obligatoire.
   */
  const selectType = useCallback((typeId: BuildingTypeId) => {
    const first = DEFAULT_CATALOGS.buildings[typeId].variants[0] ?? null
    setSelection({ typeId, variantId: first })
    setRefusal(null)
  }, [])

  const selectVariant = useCallback((variantId: FootprintId) => {
    setSelection((current) => ({ ...current, variantId }))
    setRefusal(null)
  }, [])

  /** La commande que le curseur et la sélection décrivent, ou `null`. */
  const command = useMemo((): Omit<BuildCommand, 'workId'> | null => {
    if (selection.typeId === null || selection.variantId === null) return null
    return {
      kind: 'build',
      typeId: selection.typeId,
      variantId: selection.variantId,
      orientation: cursor.state.orientation,
      anchor: { x: cursor.state.x, y: cursor.state.y },
    }
  }, [selection.typeId, selection.variantId, cursor.state])

  /**
   * L'aperçu, calculé **localement** par le code du serveur (R8).
   *
   * `workId` est un identifiant que seul le serveur engendre ; l'aperçu n'en a
   * aucun besoin, et lui en inventer un ferait croire que le client peut en
   * proposer. La valeur passée ici ne quitte jamais le navigateur.
   */
  const preview = useMemo((): PreviewResult | null => {
    if (command === null) return null
    return previewBuild(state, { ...command, workId: 'apercu-local' }, DEFAULT_CATALOGS)
  }, [command, state])

  /** Les cases sous l'empreinte, et leur validité. */
  const ghost = useMemo((): GhostState | null => {
    if (command === null) return null
    const cells = placementCells(
      command.variantId,
      command.orientation,
      command.anchor,
      DEFAULT_CATALOGS,
    )
    const check = validatePlacement(state.grid, cells)
    return {
      cells,
      valid: check.kind === 'ok',
      faultyCells: check.kind === 'ok' ? [] : check.cells,
    }
  }, [command, state.grid])

  const cell = state.grid.find(
    (candidate) => candidate.x === cursor.state.x && candidate.y === cursor.state.y,
  )

  const announcement = useMemo(() => {
    if (cell === undefined) return null
    return {
      cell,
      variantId: selection.variantId,
      orientation: cursor.state.orientation,
      check: ghost === null ? null : validatePlacement(state.grid, ghost.cells),
      coveredDeposits:
        preview !== null && preview.outcome === 'accepted'
          ? preview.preview.effect.coveredDeposits
          : 0,
    }
  }, [cell, selection.variantId, cursor.state.orientation, ghost, state.grid, preview])

  /**
   * Le lancement.
   *
   * Un **refus local** est traité sans appel réseau : l'aperçu emploie le même
   * code que le serveur (R8), donc un placement invalide est connu avant l'envoi
   * et le joueur n'attend pas un aller-retour pour l'apprendre. Le serveur
   * arbitre quand même — il est seul juge —, mais il n'a pas à arbitrer ce qui
   * est déjà tranché.
   */
  const confirm = useCallback(async () => {
    if (command === null || pending) return

    if (preview !== null && preview.outcome === 'refused') {
      const { code, ...details } = preview.refusal
      setRefusal(new PlanetRefusal(409, code, 'Ce placement est refusé.', details))
      return
    }

    setPending(true)
    setRefusal(null)
    try {
      const next = await gateway.startWork({
        nature: 'build',
        typeId: command.typeId,
        variantId: command.variantId,
        orientation: command.orientation,
        anchorX: command.anchor.x,
        anchorY: command.anchor.y,
      })
      onSnapshot?.(next)
      setSelection({ typeId: null, variantId: null })
    } catch (error) {
      if (error instanceof PlanetRefusal) setRefusal(error)
      else throw error
    } finally {
      setPending(false)
    }
  }, [command, pending, preview, gateway, onSnapshot])

  const handleConfirm = useCallback(
    (_cell: CellView) => {
      void confirm()
    },
    [confirm],
  )

  return (
    <>
      <h1>Ma planète</h1>

      <BuildPanel
        catalogs={DEFAULT_CATALOGS}
        selection={selection}
        preview={preview}
        pending={pending}
        onSelectType={selectType}
        onSelectVariant={selectVariant}
        onConfirm={() => void confirm()}
      />

      <GridView
        cells={state.grid}
        width={layout.width}
        height={layout.height}
        cursorIndex={cursor.index}
        ghost={ghost}
        onKey={cursor.handleKey}
        onPoint={cursor.point}
        onConfirm={handleConfirm}
      />

      <GridLiveRegion announcement={announcement} catalogs={DEFAULT_CATALOGS} />
      <RefusalNotice refusal={refusal} at={state.at} />

      <ResourcePanel holdings={state.holdings} at={state.at} />
      <CurrentWork work={state.work} />
    </>
  )
}
