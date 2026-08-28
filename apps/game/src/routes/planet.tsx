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
  gridOccupancy,
  layoutOf,
  placementAvailability,
  placementCells,
  previewBuild,
  previewClear,
  previewDemolish,
  previewUpgrade,
  validatePlacement,
} from '@zaliba/domain'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { phraseDeReleve } from '../features/announce/releve.js'
import { type Transition, useAnnonce } from '../features/announce/useAnnonce.js'
import type { PlanetGateway } from '../features/auth/gateway.js'
import { PlanetLoader } from '../features/auth/PlanetLoader.js'
import { SessionGate } from '../features/auth/SessionGate.js'
import { CatalogNotice } from '../features/catalog/CatalogNotice.js'
import { announcePlacement } from '../features/grid/announce.js'
import type { PoseVisee } from '../features/grid/appearance.js'
import type { GhostState } from '../features/grid/FootprintGhost.js'
import { GridLiveRegion } from '../features/grid/GridLiveRegion.js'
import { GridView } from '../features/grid/GridView.js'
import { Legende } from '../features/grid/Legende.js'
import { raisonDeRefus } from '../features/grid/refusal.js'
import { isCancelKey, useGridCursor } from '../features/grid/useGridCursor.js'
import { BarreDActions } from '../features/regie/BarreDActions.js'
import { COPIE } from '../features/regie/copie.js'
import { PlaqueEnTete } from '../features/regie/PlaqueEnTete.js'
import { Registre } from '../features/regie/Registre.js'
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
import { ARCHETYPE_LABELS, describePosition, RESOURCE_LABELS } from '../lib/labels.js'
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

/**
 * La mise en mots d'une transition (R11).
 *
 * Elle est ici et non dans `useAnnonce` : le crochet détecte, il ne nomme pas. Lui
 * faire fabriquer une phrase en ferait un second endroit où le jeu se nomme, à côté
 * de `labels.ts` — et deux vocabulaires finissent par énoncer un mot que l'écran
 * n'affiche pas.
 */
function phraseDeTransition(transition: Transition): string {
  if (transition.origine === 'stockage-sature') {
    const nom =
      transition.resourceId === undefined
        ? 'Une ressource'
        : (RESOURCE_LABELS[transition.resourceId] ?? transition.resourceId)
    return `${nom} : stockage saturé. La production se perd désormais.`
  }

  const acheve = transition.acheve
  if (acheve === undefined) return 'Chantier achevé.'

  const cible =
    acheve.target.kind === 'cell'
      ? `en ${describePosition(acheve.target.cell)}`
      : acheve.target.kind === 'build'
        ? `en ${describePosition(acheve.target.anchor)}`
        : 'sur un bâtiment posé'

  return `Chantier achevé ${cible}.`
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

  /**
   * **Le désarmement** (FR-020, US3-AC4).
   *
   * Il vit ici parce que la sélection vit ici : le curseur reconnaît `Échap` — ce
   * qui lui permet de retenir la touche — mais ne détient pas ce qu'il faudrait
   * effacer. Un curseur qui effacerait une sélection qu'il ne détient pas serait un
   * état muté à distance.
   *
   * Le curseur, lui, **ne bouge pas** : le joueur vient de dire qu'il ne voulait pas
   * poser *ce* bâtiment ici, pas qu'il voulait perdre la case qu'il visait.
   */
  const desarmer = useCallback(() => {
    setSelection({ typeId: null, variantId: null })
    setRefusal(null)
  }, [])

  /** La touche, traitée par le curseur **puis** par l'écran s'il s'agit d'`Échap`. */
  const handleGridKey = useCallback(
    (key: string): boolean => {
      const consommee = cursor.handleKey(key)
      if (isCancelKey(key)) desarmer()
      return consommee
    },
    [cursor, desarmer],
  )

  /** La rotation, déclenchée par le bouton visible autant que par la touche `R`. */
  const pivoter = useCallback(() => {
    cursor.handleKey('r')
  }, [cursor])

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

  /**
   * Ce que la grille contient, et l'existence d'un placement pour le type choisi.
   *
   * **Deux questions que l'aperçu ne pose pas.** `previewBuild` répond « ici, oui
   * ou non » ; celles-ci répondent « quelque part, oui ou non » et « reste-t-il
   * seulement de la place ». Ce sont les deux cas limites de la spécification, et
   * ils ont ceci de commun qu'un joueur ne peut pas les déduire d'une suite de
   * refus case par case : il essaierait trente-six fois sans jamais apprendre
   * qu'il n'y avait rien à trouver.
   */
  const occupancy = useMemo(() => gridOccupancy(state.grid), [state.grid])

  const availability = useMemo(() => {
    if (selection.typeId === null) return null
    return placementAvailability(state.grid, selection.typeId, DEFAULT_CATALOGS)
  }, [selection.typeId, state.grid])

  /**
   * Les cases sous l'empreinte, leur validité et **la raison d'un refus**.
   *
   * La raison est ce que 002 ajoute : 001 marquait le refus, il ne le motivait
   * pas, et un joueur au clavier apprenait le refus sans sa cause — donc essayait
   * les trente-six cases (FR-021).
   *
   * `validatePlacement` ne rend qu'**un seul** verdict, selon une priorité fixée
   * dans le domaine — hors parcelle, puis obstrué, puis occupé. Plusieurs causes ne
   * coexistent jamais à l'arrivée : il n'y a donc aucune règle d'agrégation à
   * écrire ici, et le client n'a qu'une phrase à produire.
   */
  const pose = useMemo((): PoseVisee | null => {
    if (command === null) return null
    const cells = placementCells(
      command.variantId,
      command.orientation,
      command.anchor,
      DEFAULT_CATALOGS,
    )
    const check = validatePlacement(state.grid, cells)
    const raison = raisonDeRefus(check, {
      bounds,
      grid: state.grid,
      buildings: state.buildings,
      catalogs: DEFAULT_CATALOGS,
    })

    return {
      cells,
      valide: check.kind === 'ok',
      fautives: check.kind === 'ok' ? [] : check.cells,
      ...(raison === null ? {} : { raison }),
    }
  }, [command, state.grid, state.buildings, bounds])

  /** Le fantôme de 001, dérivé de la pose : son crochet `data-ghost` subsiste. */
  const ghost = useMemo((): GhostState | null => {
    if (pose === null) return null
    return { cells: pose.cells, valid: pose.valide, faultyCells: pose.fautives }
  }, [pose])

  const cell = state.grid.find(
    (candidate) => candidate.x === cursor.state.x && candidate.y === cursor.state.y,
  )

  /**
   * **L'annonce unique de l'écran** (FR-022, R11).
   *
   * Elle vit ici pour la même raison que le curseur et la sélection : sept
   * événements l'écrivent, et aucun ne lui appartient. La faire vivre dans la région
   * l'obligerait à connaître la pose, le chantier et la saturation.
   */
  /*
    **Déstructuré, et c'est nécessaire.** `useAnnonce` rend un objet neuf à chaque
    rendu — il porte l'annonce courante, qui change. Un effet qui dépendrait de
    l'objet entier se rejouerait donc à chaque rendu, écrirait l'annonce, provoquerait
    un rendu, et boucherait sans fin. Les deux rappels sont stables (`useCallback`
    sans dépendance) ; c'est d'eux que les effets dépendent.
  */
  const { annonce, annoncer, observer } = useAnnonce()

  /**
   * L'archétype de la planète, nommé **une fois**.
   *
   * Deux blocs en ont besoin — la plaque d'en-tête et le registre —, et tant que la
   * planète n'a pas de nom propre c'est lui qui porte son identité (FR-008).
   */
  const archetypeId = snapshot.planet.archetypeId as keyof typeof ARCHETYPE_LABELS

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

  /**
   * Le texte de l'annonce de curseur, **tenu dans une référence**.
   *
   * C'est le point délicat de tout ce fichier, et il vaut d'être écrit : `state` est
   * reprojeté **à chaque seconde** pour animer les compteurs, donc `announcement`
   * aussi. Un effet qui dépendrait de lui écrirait l'annonce une fois par seconde —
   * c'est-à-dire exactement ce que INV-N2 interdit, et exactement le défaut que la
   * région du curseur de 001 avait sous une autre forme.
   *
   * La référence sépare donc le **déclencheur** du **contenu** : l'effet ne se
   * rejoue que lorsque le curseur ou l'empreinte bougent, et il lit alors la phrase
   * la plus fraîche. C'est la seule façon d'énoncer un état courant sans énoncer son
   * écoulement.
   */
  const phraseDuCurseur = useRef('')
  phraseDuCurseur.current =
    announcement === null ? '' : announcePlacement(announcement, DEFAULT_CATALOGS)

  /**
   * **Ce qui déclenche une annonce de curseur, écrit comme une valeur.**
   *
   * La position, l'orientation et l'empreinte armée : rien d'autre. Pas `state`, qui
   * est reprojeté à la seconde — dépendre de lui écrirait l'annonce une fois par
   * seconde, c'est-à-dire exactement ce qu'INV-N2 interdit.
   *
   * Une **chaîne** plutôt qu'un tableau de dépendances : elle rend le déclencheur
   * comparable, donc explicite. La version précédente listait les valeurs en
   * dépendances sans les lire dans le corps de l'effet, et s'appuyait pour cela sur
   * l'identité de référence que `reduceCursor` préserve — une propriété vraie mais
   * invisible, que le lint ne pouvait pas comprendre et qu'une retouche du réducteur
   * aurait pu emporter en silence.
   */
  const declencheurDuCurseur = `${cursor.state.x},${cursor.state.y},${cursor.state.orientation},${selection.variantId ?? ''}`

  /**
   * Le déplacement du curseur, et la rotation — qui n'a pas d'origine propre.
   *
   * **Rien au montage**, et c'est l'objet de la comparaison à `null`. Un effet
   * s'exécute toujours une première fois : sans garde, ouvrir l'écran annoncerait la
   * case A1 alors que le joueur n'a rien fait — exactement le défaut que la région du
   * curseur de 001 avait, et exactement ce qu'US4-AC2 refuse. La région est **vide au
   * départ**, et c'est `entree-grille` qui énonce la case du curseur, au moment où le
   * focus y arrive.
   */
  const dernierDeclencheur = useRef<string | null>(null)
  useEffect(() => {
    const premier = dernierDeclencheur.current === null
    if (dernierDeclencheur.current === declencheurDuCurseur) return
    dernierDeclencheur.current = declencheurDuCurseur

    if (premier || phraseDuCurseur.current === '') return
    annoncer('curseur', phraseDuCurseur.current)
  }, [declencheurDuCurseur, annoncer])

  /**
   * Les deux **transitions** de l'état extrapolé (R11, INV-N4).
   *
   * Cet effet se rejoue à chaque projection — donc à la seconde —, et c'est sans
   * conséquence : `observer` ne rend une transition que lorsque l'état a réellement
   * changé de nature. C'est le seul endroit de la tranche où le client regarde le
   * temps passer pour en tirer une phrase, et il le fait **par comparaison**, jamais
   * en lisant une échéance.
   */
  useEffect(() => {
    for (const transition of observer(state)) {
      annoncer(transition.origine, phraseDeTransition(transition))
    }
  }, [state, observer, annoncer])

  /** Le relevé, à la demande du joueur (FR-023). */
  const releve = useCallback(() => {
    annoncer(
      'releve',
      phraseDeReleve({
        holdings: state.holdings,
        work: state.work,
        buildings: state.buildings,
      }),
    )
  }, [annoncer, state.holdings, state.work, state.buildings])

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

      **L'ordre des blocs est celui de FR-006**, et il a changé avec 002 :

      - le **panneau de construction passe après la grille** (R16). Le motif de 001 —
        « sélectionner un type, choisir une empreinte, puis déplacer le curseur » —
        reste vrai comme séquence d'apprentissage, et il perd son argument de mise en
        page dès lors que le plan devient le sujet visuel de l'écran. L'aller-retour
        au clavier se paie **une fois par choix de bâtiment**, pas une fois par
        placement : la grille garde sa confirmation par `Entrée` ;
      - l'**alerte de refus quitte sa place** entre le plan et les compteurs pour
        suivre les boutons de pose. Un message d'échec loin du bouton qui a échoué
        oblige à le chercher ;
      - les **quatre mécaniques restent toutes visibles** (FR-011), rassemblées sous
        le plan, sans navigation supplémentaire ni repli derrière un menu.
    */
    <CatalogNotice fromServer={snapshot.catalogVersion}>
      <div className="ecran">
        <PlaqueEnTete archetypeId={archetypeId} />

        <ResourcePanel holdings={state.holdings} at={state.at} />

        {/*
          L'énergie après les compteurs, et dans son **propre bloc** (FR-010) : sa
          nature est différente — instantanée, ni stockée ni plafonnée. L'ordre est
          celui de la lecture : « ce que j'ai », puis « ce qui le limite », puis « ce
          qui est en cours ».
        */}
        <EnergyPanel energy={state.energy} buildings={state.buildings} />

        {/*
          La note de bas de page renvoie à l'astérisque des débits. Du décor, marqué
          comme tel : c'est ce qui autorise son corps 9,5 (FR-038, FR-039).
        */}
        <p data-bloc="note" data-role-texte="decor" className="note-regie">
          {COPIE.note}
        </p>

        <CurrentWork work={state.work} buildings={state.buildings} />

        <div data-bloc="plan" className="plaque cadre-main--fort">
          <GridView
            cells={state.grid}
            width={layout.width}
            height={layout.height}
            buildings={state.buildings}
            work={state.work}
            pose={pose}
            cursorIndex={cursor.index}
            onKey={handleGridKey}
            onPoint={cursor.point}
            onEnterGrid={() => annoncer('entree-grille', phraseDuCurseur.current)}
            onConfirm={handleConfirm}
          />
        </div>

        <div data-bloc="actions" className="actions">
          {/*
            **Le choix de bâtiment d'abord**, les commandes ensuite.

            L'ordre est celui de la séquence que R16 décrit : *sélectionner un type,
            choisir une empreinte, puis déplacer le curseur et poser*.

            Et il a un second effet, décisif. Le sélecteur de type devient le
            **premier** arrêt de tabulation du bloc des actions, et le compte de
            frappes de SC-001 de 001 tient malgré le déplacement du panneau après la
            grille. La rédaction précédente mettait les commandes en tête : cela
            coûtait deux arrêts avant le sélecteur — un par bouton toujours actif —, et
            portait le parcours à **dix-sept** frappes là où le critère en admet quinze.
          */}
          <div data-bloc="pose">
            <BuildPanel
              catalogs={DEFAULT_CATALOGS}
              selection={selection}
              preview={preview}
              occupancy={occupancy}
              availability={availability}
              onSelectType={selectType}
              onSelectVariant={selectVariant}
            />
          </div>

          {/*
            **Les trois commandes de pose, visibles** (FR-020) — plus le relevé.

            Le § 6 du contrat nomme **une** commande de pose, `JE POSE ÇA`, et conclut
            « aucune autre commande n'existe » : le bouton de confirmation de
            `BuildPanel` a donc quitté ce panneau pour venir ici, où `Pivoter` et
            `Annuler` l'accompagnent.
          */}
          <BarreDActions
            poseArmee={selection.typeId !== null}
            enVol={pending === 'build'}
            onPoser={() => void confirm()}
            onPivoter={pivoter}
            onAnnuler={desarmer}
            onReleve={releve}
          />

          {/*
            **Le refus de commande, immédiatement après les boutons de pose**
            (§ 1.1 du contrat). Il garde sa région **assertive** distincte : c'est
            l'exception que FR-022 nomme, et elle porte le refus *de la commande*,
            pas celui d'une case.
          */}
          <RefusalNotice refusal={refusal} at={state.at} />

          {/*
            L'amélioration après la grille, parce que sa cible est la case du
            curseur. La placer avant obligerait à désigner un bâtiment qu'on n'a pas
            encore vu.
          */}
          <UpgradePanel
            building={upgradeTarget}
            preview={upgradePreview}
            pending={pending === 'upgrade'}
            onConfirm={() => void confirmUpgrade()}
          />

          {/*
            La démolition juste après l'amélioration : ce sont les deux décisions
            qu'on prend devant un bâtiment posé, et les mettre côte à côte rend le
            choix lisible plutôt que caché derrière une navigation.
          */}
          <DemolishPanel
            building={upgradeTarget}
            preview={demolishPreview}
            pending={pending === 'demolish'}
            onConfirm={() => void confirmDemolish()}
          />

          {/*
            Le déblaiement après, et pour la même raison qu'ils suivent tous la
            grille : leur cible est la case du curseur. Les panneaux sont armés par
            la même position et ne se disputent jamais — une case porte un obstacle
            ou un bâtiment, jamais les deux.
          */}
          <ClearPanel
            cell={cell ?? null}
            preview={clearPreview}
            pending={pending === 'clear'}
            onConfirm={() => void confirmClear()}
          />
        </div>

        <p data-bloc="mention" data-role-texte="decor" className="note-regie">
          {COPIE.mention}
        </p>

        {/*
          **Le registre, après la mention** (§ 1 du contrat d'interface).

          Une seule entrée en 001 — la planète courante —, et cette entrée unique est
          vraie. La maquette en montre quatre, dont une possession perdue au nom
          raturé : le modèle ne les alimente pas, et FR-008a interdit de les inventer.
          Une liste de voisines fictives n'est pas « en attendant les vraies » : c'est
          un mensonge que le joueur n'a aucun moyen de démentir.
        */}
        <Registre
          possessions={[{ nom: ARCHETYPE_LABELS[archetypeId] ?? archetypeId, active: true }]}
        />

        {/*
          **La légende, après la mention** (§ 1 du contrat d'interface).
          
          Elle est livrée par US2 et montée ici plutôt qu'en US6 : un composant qui
          n'est monté nulle part n'est pas livré, et FR-018 exige qu'elle soit
          atteignable **sur toutes les largeurs**. Le guichet la déplacera
          visuellement dans la colonne de gauche sans changer sa place dans le
          document (R10).
        */}
        <Legende />

        {/*
          **La région d'annonce polie, unique et montée en permanence** (FR-022).
          Elle n'occupe aucun rang dans l'ordre des blocs : elle est destinée aux
          lecteurs d'écran, pas aux yeux, et son emplacement dans le document ne
          change rien à ce qu'elle énonce.
        */}
        <GridLiveRegion annonce={annonce} />
      </div>
    </CatalogNotice>
  )
}
