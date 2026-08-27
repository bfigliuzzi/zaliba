import { createRoute } from '@tanstack/react-router'
import type { BuildingTypeId, FootprintId } from '@zaliba/catalogs'
import type { PlanetSnapshotV1 } from '@zaliba/contracts'
import type {
  BuildCommand,
  BuildingView,
  CellView,
  ClearPreviewResult,
  DemolishPreviewResult,
  PreviewResult,
  UpgradePreviewResult,
} from '@zaliba/domain'
import {
  DEFAULT_CATALOGS,
  layoutOf,
  placementCells,
  previewBuild,
  previewClear,
  previewDemolish,
  previewUpgrade,
  validatePlacement,
} from '@zaliba/domain'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PlanetGateway } from '../features/auth/gateway.js'
import { PlanetLoader } from '../features/auth/PlanetLoader.js'
import { SessionGate } from '../features/auth/SessionGate.js'
import { CatalogNotice } from '../features/catalog/CatalogNotice.js'
import type { GhostState } from '../features/grid/FootprintGhost.js'
import { GridLiveRegion } from '../features/grid/GridLiveRegion.js'
import { GridView } from '../features/grid/GridView.js'
import { useGridCursor } from '../features/grid/useGridCursor.js'
import { EnergyPanel } from '../features/resources/EnergyPanel.js'
import { ResourcePanel } from '../features/resources/ResourcePanel.js'
import { useExtrapolatedState } from '../features/resources/useExtrapolatedState.js'
import { BuildPanel, type BuildSelection } from '../features/work/BuildPanel.js'
import { ClearPanel } from '../features/work/ClearPanel.js'
import { CurrentWork } from '../features/work/CurrentWork.js'
import { DemolishPanel } from '../features/work/DemolishPanel.js'
import { RefusalNotice } from '../features/work/RefusalNotice.js'
import { UpgradePanel } from '../features/work/UpgradePanel.js'
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
 * **Le curseur et la sélection vivent ici**, et non dans la grille. Cinq choses en
 * dépendent — le fantôme, l'aperçu de pose, l'annonce, le lancement et, depuis
 * US4, la **désignation du bâtiment à améliorer** — et aucune n'appartient à la
 * grille. Une grille qui détiendrait son curseur obligerait chacune à en tenir une
 * copie, c'est-à-dire à afficher un fantôme à un endroit et à poser à un autre.
 *
 * **Le curseur sert les quatre mécaniques, et c'est ce qui rend US4 à US6
 * accessibles sans rien ajouter** (FR-058, SC-004) : une case libre arme une pose,
 * une case occupée désigne son bâtiment — pour l'améliorer ou le démolir —, une case
 * obstruée arme un déblaiement. Le joueur apprend un seul modèle de navigation, et
 * les panneaux ne se disputent jamais : une case ne peut être à la fois obstruée et
 * occupée.
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
  /**
   * **Quelle** action est en vol, et non seulement qu'il y en a une.
   *
   * Un booléen partagé annoncerait les deux boutons occupés au moment précis où le
   * joueur a besoin de savoir lequel des deux il a engagé — et `aria-busy` sur un
   * bouton qu'on n'a pas pressé est une information fausse.
   */
  const [pending, setPending] = useState<'build' | 'upgrade' | 'clear' | 'demolish' | null>(null)

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

  /**
   * Le bâtiment sous le curseur, ou `null` — la cible d'amélioration.
   *
   * Résolu par les **cases** du bâtiment et non par son ancre : une empreinte de
   * neuf cases se désigne depuis n'importe laquelle, et exiger l'ancre obligerait
   * le joueur à savoir laquelle des neuf elle est.
   */
  const upgradeTarget = useMemo((): BuildingView | null => {
    return (
      state.buildings.find((building) =>
        building.cells.some((one) => one.x === cursor.state.x && one.y === cursor.state.y),
      ) ?? null
    )
  }, [state.buildings, cursor.state.x, cursor.state.y])

  /** L'aperçu d'amélioration, calculé **localement** par le code du serveur (R8). */
  const upgradePreview = useMemo((): UpgradePreviewResult | null => {
    if (upgradeTarget === null) return null
    return previewUpgrade(
      state,
      { kind: 'upgrade', workId: 'apercu-local', buildingId: upgradeTarget.id },
      DEFAULT_CATALOGS,
    )
  }, [upgradeTarget, state])

  /**
   * L'aperçu de déblaiement, calculé **localement** par le code du serveur (R8).
   *
   * Il est armé par la **même** position de curseur que l'amélioration, et les deux
   * ne se disputent jamais : une case porte un obstacle ou un bâtiment, jamais les
   * deux (I-5 et la définition de `CellState`). Le joueur apprend donc un seul
   * modèle de navigation pour trois mécaniques — c'est ce qui rend US5 accessible
   * au clavier sans rien ajouter (FR-058, SC-004).
   */
  const clearPreview = useMemo((): ClearPreviewResult | null => {
    if (cell === undefined) return null
    return previewClear(
      state,
      { kind: 'clear', workId: 'apercu-local', cell: { x: cell.x, y: cell.y } },
      DEFAULT_CATALOGS,
    )
  }, [cell, state])

  /**
   * L'aperçu de démolition, calculé **localement** par le code du serveur (R8).
   *
   * La même cible que l'amélioration — le bâtiment sous le curseur —, et les deux
   * panneaux se lisent ensemble : améliorer ou démolir sont les deux décisions qu'on
   * prend devant un bâtiment posé, et les mettre côte à côte est ce qui rend le choix
   * lisible plutôt que caché derrière un menu.
   */
  const demolishPreview = useMemo((): DemolishPreviewResult | null => {
    if (upgradeTarget === null) return null
    return previewDemolish(
      state,
      { kind: 'demolish', workId: 'apercu-local', buildingId: upgradeTarget.id },
      DEFAULT_CATALOGS,
    )
  }, [upgradeTarget, state])

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
  /**
   * L'envoi, commun aux deux mécaniques.
   *
   * Une seule séquence — armer, envoyer, désarmer — parce qu'une seule commande
   * peut être en vol : la planète n'accepte qu'un chantier (FR-033). Deux
   * séquences séparées finiraient par différer sur la gestion du refus, qui est
   * précisément le chemin qu'on éprouve le moins.
   */
  const launch = useCallback(
    async (
      kind: 'build' | 'upgrade' | 'clear' | 'demolish',
      intent: Parameters<PlanetGateway['startWork']>[0],
    ) => {
      setPending(kind)
      setRefusal(null)
      try {
        onSnapshot?.(await gateway.startWork(intent))
        return true
      } catch (error) {
        if (error instanceof PlanetRefusal) setRefusal(error)
        else throw error
        return false
      } finally {
        setPending(null)
      }
    },
    [gateway, onSnapshot],
  )

  const confirm = useCallback(async () => {
    if (command === null || pending !== null) return

    if (preview !== null && preview.outcome === 'refused') {
      const { code, ...details } = preview.refusal
      setRefusal(new PlanetRefusal(409, code, 'Ce placement est refusé.', details))
      return
    }

    const sent = await launch('build', {
      nature: 'build',
      typeId: command.typeId,
      variantId: command.variantId,
      orientation: command.orientation,
      anchorX: command.anchor.x,
      anchorY: command.anchor.y,
    })
    if (sent) setSelection({ typeId: null, variantId: null })
  }, [command, pending, preview, launch])

  /**
   * Le lancement d'une amélioration.
   *
   * Même discipline que la pose : un **refus local** est traité sans appel réseau,
   * l'aperçu employant le même code que le serveur (R8). La sélection de
   * construction n'est pas remise à zéro — l'amélioration ne la consomme pas, et
   * la vider ferait perdre au joueur un choix qu'il n'a pas défait.
   */
  const confirmUpgrade = useCallback(async () => {
    if (upgradeTarget === null || pending !== null) return

    if (upgradePreview !== null && upgradePreview.outcome === 'refused') {
      const { code, ...details } = upgradePreview.refusal
      setRefusal(new PlanetRefusal(409, code, 'Cette amélioration est refusée.', details))
      return
    }

    await launch('upgrade', { nature: 'upgrade', buildingId: upgradeTarget.id })
  }, [upgradeTarget, pending, upgradePreview, launch])

  /**
   * Le lancement d'un déblaiement.
   *
   * Même discipline que les deux autres : un **refus local** est traité sans appel
   * réseau, l'aperçu employant le même code que le serveur (R8). La sélection de
   * construction n'est pas remise à zéro — un déblaiement ne la consomme pas, et
   * la vider ferait perdre au joueur un choix qu'il n'a pas défait.
   */
  const confirmClear = useCallback(async () => {
    if (cell === undefined || pending !== null) return

    if (clearPreview !== null && clearPreview.outcome === 'refused') {
      const { code, ...details } = clearPreview.refusal
      setRefusal(new PlanetRefusal(409, code, 'Ce déblaiement est refusé.', details))
      return
    }

    await launch('clear', { nature: 'clear', x: cell.x, y: cell.y })
  }, [cell, pending, clearPreview, launch])

  /**
   * Le lancement d'une démolition.
   *
   * Même discipline que les trois autres : un **refus local** est traité sans appel
   * réseau (R8). La sélection de construction n'est pas remise à zéro — une
   * démolition ne la consomme pas.
   */
  const confirmDemolish = useCallback(async () => {
    if (upgradeTarget === null || pending !== null) return

    if (demolishPreview !== null && demolishPreview.outcome === 'refused') {
      const { code, ...details } = demolishPreview.refusal
      setRefusal(new PlanetRefusal(409, code, 'Cette démolition est refusée.', details))
      return
    }

    await launch('demolish', { nature: 'demolish', buildingId: upgradeTarget.id })
  }, [upgradeTarget, pending, demolishPreview, launch])

  const handleConfirm = useCallback(
    (_cell: CellView) => {
      void confirm()
    },
    [confirm],
  )

  return (
    /*
      **La divergence de catalogue enveloppe tout l'écran**, et ce n'est pas un excès
      de prudence (R15). Chaque chiffre visible ici — coûts, durées, productions,
      plafonds, temps avant saturation — est calculé *localement* depuis le catalogue
      embarqué, par le même code que le serveur (R8). Si les deux catalogues
      divergent, il n'y a pas un chiffre à sauver : ils sont tous faux ensemble, et un
      avertissement placé à côté d'eux laisserait le joueur décider lesquels croire.
    */
    <CatalogNotice fromServer={snapshot.catalogVersion}>
      <h1>Ma planète</h1>

      <BuildPanel
        catalogs={DEFAULT_CATALOGS}
        selection={selection}
        preview={preview}
        pending={pending === 'build'}
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

      {/*
        L'amélioration **après** la grille, parce qu'elle en dépend : sa cible est
        la case du curseur. La placer avant obligerait à désigner un bâtiment qu'on
        n'a pas encore vu.
      */}
      <UpgradePanel
        building={upgradeTarget}
        preview={upgradePreview}
        pending={pending === 'upgrade'}
        onConfirm={() => void confirmUpgrade()}
      />

      {/*
        La démolition juste après l'amélioration, parce que ce sont les deux décisions
        qu'on prend devant un bâtiment posé. Les mettre côte à côte rend le choix
        lisible ; les séparer le cacherait derrière une navigation.
      */}
      <DemolishPanel
        building={upgradeTarget}
        preview={demolishPreview}
        pending={pending === 'demolish'}
        onConfirm={() => void confirmDemolish()}
      />

      {/*
        Le déblaiement après, et pour la même raison qu'ils suivent tous la
        grille : leur cible est la case du curseur. Les panneaux sont armés par la
        même position et ne se disputent jamais — une case porte un obstacle ou
        un bâtiment, jamais les deux.
      */}
      <ClearPanel
        cell={cell ?? null}
        preview={clearPreview}
        pending={pending === 'clear'}
        onConfirm={() => void confirmClear()}
      />

      <ResourcePanel holdings={state.holdings} at={state.at} />
      {/*
        L'énergie après les ressources, et avant le chantier. L'ordre est celui
        de la lecture : « ce que j'ai », puis « ce qui le limite », puis « ce qui
        est en cours ». Placer l'énergie avant les compteurs ferait ouvrir l'écran
        sur une contrainte plutôt que sur un état.
      */}
      <EnergyPanel energy={state.energy} buildings={state.buildings} />
      <CurrentWork work={state.work} buildings={state.buildings} />
    </CatalogNotice>
  )
}
