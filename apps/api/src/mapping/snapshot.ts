import type {
  ArchetypeId,
  BuildingTypeId,
  FootprintId,
  LayoutId,
  ResourceId,
} from '@zaliba/catalogs'
import type { PlanetSnapshotV1, WorkTargetV1 } from '@zaliba/contracts'
import type { PlanetRecord, WorkRecord } from '@zaliba/db'
import type { Catalogs, PlanetSnapshot, WorkTarget } from '@zaliba/domain'
import { grains, instant } from '@zaliba/domain'

/**
 * Les trois formes d'une planète, et pourquoi elles sont trois.
 *
 * - `PlanetRecord` — la **persistance**. Colonnes plates, `bigint`,
 *   `timestamptz`. `db` n'importe ni `domain` ni `contracts` : le schéma ne
 *   porte aucune règle et n'expose aucun contrat.
 * - `PlanetSnapshot` — le **domaine**. Grandeurs typées, cible de chantier en
 *   union discriminée, aucune valeur dérivable.
 * - `PlanetSnapshotV1` — le **contrat**. Redéclaré sans importer `domain`, pour
 *   qu'une refactorisation interne ne change pas silencieusement ce qui part sur
 *   le réseau.
 *
 * Ce fichier est le seul endroit où les trois se rencontrent, et c'est
 * délibéré : les fusionner ferait suivre au modèle de jeu la forme des tables,
 * ou ferait suivre au réseau les renommages internes. Le prix est une
 * traduction ; la contrepartie est que chacune des trois peut bouger sans
 * entraîner les deux autres.
 */

/** La cible d'un chantier, des colonnes plates vers l'union du domaine. */
function targetFromRecord(work: WorkRecord): WorkTarget {
  switch (work.nature) {
    case 'build':
      return {
        kind: 'build',
        typeId: work.typeId ?? '',
        variantId: (work.variantId ?? 'single') as FootprintId,
        orientation: work.orientation ?? 0,
        anchor: { x: work.targetX ?? 0, y: work.targetY ?? 0 },
      }
    case 'upgrade':
    case 'demolish':
      return { kind: 'building', buildingId: work.targetBuildingId ?? '' }
    default:
      return { kind: 'cell', cell: { x: work.targetX ?? 0, y: work.targetY ?? 0 } }
  }
}

/** La persistance vers le domaine. */
export function toSnapshot(record: PlanetRecord, catalogs: Catalogs): PlanetSnapshot {
  const holdings = Object.fromEntries(
    catalogs.resourceIds.map((resourceId) => {
      const held = record.holdings.find((h) => h.resourceId === resourceId)
      return [
        resourceId,
        { amount: grains(held?.amountGrains ?? 0), lost: grains(held?.lostGrains ?? 0) },
      ]
    }),
  ) as PlanetSnapshot['holdings']

  return {
    planetId: record.id,
    ownerId: record.ownerId,
    occupantId: record.occupantId,
    archetypeId: record.archetypeId as ArchetypeId,
    layoutId: record.layoutId as LayoutId,
    consolidatedAt: instant(record.consolidatedAt),
    holdings,
    buildings: record.buildings.map((building) => ({
      id: building.id,
      typeId: building.typeId as BuildingTypeId,
      variantId: building.variantId as FootprintId,
      orientation: building.orientation,
      anchor: { x: building.anchorX, y: building.anchorY },
      level: building.level,
    })),
    clearedCells: record.clearedCells.map((cell) => ({ x: cell.x, y: cell.y })),
    work:
      record.work === null
        ? null
        : {
            id: record.work.id,
            nature: record.work.nature as PlanetSnapshot['work'] extends null
              ? never
              : 'build' | 'upgrade' | 'demolish' | 'clear',
            target: targetFromRecord(record.work),
            startedAt: instant(record.work.startedAt),
            dueAt: instant(record.work.dueAt),
          },
  }
}

/** Le domaine vers la persistance — pour l'écriture de l'instantané consolidé. */
export function toRecord(snapshot: PlanetSnapshot, previous: PlanetRecord): PlanetRecord {
  return {
    ...previous,
    occupantId: snapshot.occupantId,
    consolidatedAt: snapshot.consolidatedAt,
    holdings: Object.entries(snapshot.holdings).map(([resourceId, holding]) => ({
      resourceId,
      amountGrains: holding.amount,
      lostGrains: holding.lost,
    })),
  }
}

/** La cible du domaine vers celle du contrat. */
function targetToContract(
  nature: 'build' | 'upgrade' | 'demolish' | 'clear',
  target: WorkTarget,
): WorkTargetV1 {
  if (nature === 'build' && target.kind === 'build') {
    return {
      nature: 'build',
      typeId: target.typeId as BuildingTypeId,
      variantId: target.variantId,
      orientation: target.orientation,
      anchorX: target.anchor.x,
      anchorY: target.anchor.y,
    }
  }
  if ((nature === 'upgrade' || nature === 'demolish') && target.kind === 'building') {
    return { nature, buildingId: target.buildingId }
  }
  if (target.kind === 'cell') {
    return { nature: 'clear', x: target.cell.x, y: target.cell.y }
  }
  throw new Error(`Chantier incohérent : nature ${nature}, cible ${target.kind}.`)
}

/**
 * Le domaine vers le contrat.
 *
 * `serverInstant` est **le maintenant du serveur**, distinct de
 * `consolidatedAt` qui est l'instant du dernier écrit. Le client en tire son
 * décalage d'horloge ; les confondre ferait extrapoler depuis une date
 * arbitrairement ancienne, et les compteurs feraient un bond à chaque lecture.
 */
export function toContract(
  snapshot: PlanetSnapshot,
  serverInstant: number,
  catalogVersion: string,
): PlanetSnapshotV1 {
  return {
    serverInstant,
    catalogVersion,
    planet: {
      id: snapshot.planetId,
      archetypeId: snapshot.archetypeId,
      layoutId: snapshot.layoutId,
      ownerId: snapshot.ownerId,
      occupantId: snapshot.occupantId,
      consolidatedAt: snapshot.consolidatedAt,
    },
    holdings: Object.entries(snapshot.holdings).map(([resourceId, holding]) => ({
      resourceId: resourceId as ResourceId,
      amountGrains: holding.amount,
      lostGrains: holding.lost,
    })),
    buildings: snapshot.buildings.map((building) => ({
      id: building.id,
      typeId: building.typeId,
      variantId: building.variantId,
      orientation: building.orientation,
      anchorX: building.anchor.x,
      anchorY: building.anchor.y,
      level: building.level,
    })),
    clearedCells: snapshot.clearedCells.map((cell) => ({ x: cell.x, y: cell.y })),
    work:
      snapshot.work === null
        ? null
        : {
            id: snapshot.work.id,
            startedAt: snapshot.work.startedAt,
            dueAt: snapshot.work.dueAt,
            target: targetToContract(snapshot.work.nature, snapshot.work.target),
          },
  }
}
