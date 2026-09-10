import type {
  ArchetypeId,
  BuildingTypeId,
  FootprintId,
  LayoutId,
  ResourceId,
} from '@zaliba/catalogs'
import type { PlanetSnapshotV1, WorkTargetV1 } from '@zaliba/contracts'
import type { PlanetRecord, PlanetWrite, WorkRecord } from '@zaliba/db'
import type { Catalogs, PlanetSnapshot, WorkTarget } from '@zaliba/domain'
import { cellsOf, grains, instant } from '@zaliba/domain'

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

/**
 * La cible d'un chantier, de l'union du domaine vers les colonnes plates.
 *
 * Le `null` explicite de chaque colonne non concernée n'est pas du remplissage :
 * la contrainte `works_target_matches_nature` exige qu'un `build` porte type,
 * variante, orientation et coordonnées, **et rien d'autre**. Une colonne laissée
 * renseignée par mégarde ferait échouer l'insertion — ce qui est exactement ce
 * qu'on veut, plutôt qu'une ligne que le domaine ne saurait pas relire.
 */
function targetToRecord(work: NonNullable<PlanetSnapshot['work']>): WorkRecord {
  const base = {
    id: work.id,
    nature: work.nature,
    startedAt: work.startedAt,
    dueAt: work.dueAt,
  }

  switch (work.target.kind) {
    case 'build':
      return {
        ...base,
        targetBuildingId: null,
        targetX: work.target.anchor.x,
        targetY: work.target.anchor.y,
        typeId: work.target.typeId,
        variantId: work.target.variantId,
        orientation: work.target.orientation,
      }
    case 'building':
      return {
        ...base,
        targetBuildingId: work.target.buildingId,
        targetX: null,
        targetY: null,
        typeId: null,
        variantId: null,
        orientation: null,
      }
    case 'cell':
      return {
        ...base,
        targetBuildingId: null,
        targetX: work.target.cell.x,
        targetY: work.target.cell.y,
        typeId: null,
        variantId: null,
        orientation: null,
      }
  }
}

/**
 * Le domaine vers la persistance — pour l'écriture de l'instantané consolidé.
 *
 * **Les cases de chaque bâtiment sont dérivées ici**, par le domaine, et
 * transmises à `db`. Le paquet de persistance ne saurait pas les calculer : le
 * repli d'orientation de R6 est une règle de jeu, et la recopier dans le dépôt
 * en ferait une seconde implémentation d'une géométrie — deux implémentations
 * qui finissent par diverger sur un cas de rotation, avec pour arbitre une clé
 * primaire qui refuserait alors des poses parfaitement valides.
 */
export function toWrite(snapshot: PlanetSnapshot, catalogs: Catalogs): PlanetWrite {
  return {
    id: snapshot.planetId,
    occupantId: snapshot.occupantId,
    consolidatedAt: snapshot.consolidatedAt,
    holdings: Object.entries(snapshot.holdings).map(([resourceId, holding]) => ({
      resourceId,
      amountGrains: holding.amount,
      lostGrains: holding.lost,
      saturatedSince: holding.saturatedSince,
    })),
    buildings: snapshot.buildings.map((building) => ({
      id: building.id,
      typeId: building.typeId,
      variantId: building.variantId,
      orientation: building.orientation,
      anchorX: building.anchor.x,
      anchorY: building.anchor.y,
      level: building.level,
      cells: cellsOf(building, catalogs).map((cell) => ({ x: cell.x, y: cell.y })),
    })),
    clearedCells: snapshot.clearedCells.map((cell) => ({ x: cell.x, y: cell.y })),
    work: snapshot.work === null ? null : targetToRecord(snapshot.work),
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
 *
 * **La longueur du gong voyage ici, avec l'état qu'elle explique** (G7). Elle
 * n'a pas de route à elle, et c'est délibéré : un point d'accès séparé pourrait
 * être appelé une fois puis mis en cache, et le client dériverait alors des
 * chiffres exacts pour un serveur qui a changé de rythme depuis. La réponse qui
 * porte l'état porte les règles qui l'expliquent — comme `catalogVersion`, et
 * pour exactement la même raison.
 */
export function toContract(
  snapshot: PlanetSnapshot,
  serverInstant: number,
  catalogs: Catalogs,
): PlanetSnapshotV1 {
  return {
    serverInstant,
    // Version **et** longueur de gong sont lues sur le catalogue résolu, jamais
    // sur deux arguments qui pourraient se contredire. C'est ce qui fait qu'un
    // serveur ne peut annoncer que ce qu'il applique (G10) : la garantie est
    // de forme, pas de vigilance.
    catalogVersion: catalogs.version,
    gong: catalogs.gong,
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
      saturatedSince: holding.saturatedSince,
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
