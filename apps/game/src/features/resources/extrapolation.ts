import type { ArchetypeId, BuildingTypeId, FootprintId, LayoutId } from '@zaliba/catalogs'
import type { PlanetSnapshotV1 } from '@zaliba/contracts'
import {
  type Catalogs,
  grains,
  type Instant,
  instant,
  type PlanetSnapshot,
  type ProjectedState,
  projectPlanet,
  type WorkTarget,
} from '@zaliba/domain'

/**
 * L'extrapolation locale : **le même `project()` que le serveur** (R8).
 *
 * Le client reçoit `{ instantané, instantServeur }`, calcule une fois son
 * décalage, et anime ses compteurs **sans un seul appel réseau** (doc de stack
 * § 4.7). La propriété qui compte n'est pas « ça avance » mais « ça avance
 * exactement comme le serveur » : deux vérités qui divergent seraient pires
 * qu'une seule qui attend — le joueur verrait un compteur, cliquerait, et le
 * serveur répondrait un autre chiffre, sans qu'aucun des deux ait tort de son
 * point de vue.
 *
 * **La traduction contrat → domaine vit ici, et non dans un paquet partagé.**
 * C'est le coût assumé de la séparation : `contracts` n'importe pas `domain`,
 * et `domain` n'importe pas `contracts`. Le serveur a la sienne, symétrique. La
 * duplication est de la **forme**, pas de la règle : le calcul, lui, est
 * strictement partagé, et c'est le seul point où la duplication serait fatale.
 */

/** L'instantané du contrat, relu en instantané de domaine. */
export function snapshotFromContract(
  payload: PlanetSnapshotV1,
  catalogs: Catalogs,
): PlanetSnapshot {
  const holdings = Object.fromEntries(
    catalogs.resourceIds.map((resourceId) => {
      const held = payload.holdings.find((holding) => holding.resourceId === resourceId)
      return [
        resourceId,
        {
          amount: grains(held?.amountGrains ?? 0),
          lost: grains(held?.lostGrains ?? 0),
          saturatedSince:
            held?.saturatedSince === undefined || held.saturatedSince === null
              ? null
              : instant(held.saturatedSince),
        },
      ]
    }),
  ) as PlanetSnapshot['holdings']

  return {
    planetId: payload.planet.id,
    ownerId: payload.planet.ownerId,
    occupantId: payload.planet.occupantId,
    archetypeId: payload.planet.archetypeId as ArchetypeId,
    layoutId: payload.planet.layoutId as LayoutId,
    consolidatedAt: instant(payload.planet.consolidatedAt),
    holdings,
    buildings: payload.buildings.map((building) => ({
      id: building.id,
      typeId: building.typeId as BuildingTypeId,
      variantId: building.variantId as FootprintId,
      orientation: building.orientation,
      anchor: { x: building.anchorX, y: building.anchorY },
      level: building.level,
    })),
    clearedCells: payload.clearedCells.map((cell) => ({ x: cell.x, y: cell.y })),
    work:
      payload.work === null
        ? null
        : {
            id: payload.work.id,
            nature: payload.work.target.nature,
            target: targetFromContract(payload.work.target),
            startedAt: instant(payload.work.startedAt),
            dueAt: instant(payload.work.dueAt),
          },
  }
}

function targetFromContract(target: NonNullable<PlanetSnapshotV1['work']>['target']): WorkTarget {
  switch (target.nature) {
    case 'build':
      return {
        kind: 'build',
        typeId: target.typeId,
        variantId: target.variantId,
        orientation: target.orientation,
        anchor: { x: target.anchorX, y: target.anchorY },
      }
    case 'upgrade':
    case 'demolish':
      return { kind: 'building', buildingId: target.buildingId }
    default:
      return { kind: 'cell', cell: { x: target.x, y: target.y } }
  }
}

/**
 * L'état projeté à l'instant demandé, calculé **localement**.
 *
 * Un instant antérieur à la consolidation n'est pas une erreur ici, alors que
 * c'en est une côté serveur. La différence est réelle : le décalage d'horloge
 * peut rendre l'instant estimé antérieur à l'instantané, juste après une
 * resynchronisation qui corrige une avance locale. Le serveur, lui, tire son
 * instant de la transaction et ne peut pas remonter le temps. La réponse juste
 * côté client est donc de **rester à l'instantané reçu** plutôt que de lever.
 */
export function extrapolate(
  payload: PlanetSnapshotV1,
  catalogs: Catalogs,
  at: Instant,
): ProjectedState {
  const snapshot = snapshotFromContract(payload, catalogs)
  const target = at < snapshot.consolidatedAt ? snapshot.consolidatedAt : at
  return projectPlanet(snapshot, catalogs, target)
}
