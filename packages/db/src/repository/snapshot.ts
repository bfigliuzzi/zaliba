import type { GameTransaction } from '../client.js'
import {
  grainsFromDb,
  grainsToDb,
  instantFromDb,
  instantToDb,
  nullableInstantFromDb,
  nullableInstantToDb,
} from '../conversions.js'
import { type BuildingWrite, syncBuildings } from './buildings.js'
import { syncClearedCells } from './cells.js'
import type {
  BuildingRecord,
  CellRecord,
  HoldingRecord,
  PlanetRecord,
  WorkRecord,
} from './records.js'

export type { BuildingRecord, CellRecord, HoldingRecord, PlanetRecord, WorkRecord }

/**
 * Le dépôt d'instantanés.
 *
 * **Ce paquet n'importe ni `domain` ni `contracts`** : le schéma de persistance
 * est une préoccupation d'infrastructure, il ne porte aucune règle de jeu et
 * n'expose aucun contrat réseau. Il rend donc une forme **de persistance**, que
 * la couche serveur traduit en instantané de domaine.
 *
 * La séparation coûte une traduction et évite une confusion durable : si le
 * dépôt rendait directement un `PlanetSnapshot`, une colonne renommée
 * deviendrait une modification du domaine, et le modèle de jeu se mettrait à
 * suivre la forme des tables plutôt que l'inverse.
 *
 * **Les conversions sont faites ici**, à la frontière : les grains sont des
 * `bigint` en base et des `number` en mémoire (avec l'assertion de sûreté de
 * `conversions.ts`), et les instants sont des `timestamptz` en base et des
 * entiers de secondes en mémoire (R2). Convertir ailleurs, ou plusieurs fois,
 * est la façon habituelle de perdre une seconde ou un facteur 3600.
 */

/**
 * **Pourquoi du SQL explicite ici, alors que le schéma est en Drizzle.**
 *
 * Drizzle détient le schéma et engendre les migrations : c'est sa force, et il
 * la garde. Mais son pilote `postgres-js` lit `client.options.parsers` — une
 * propriété du **pool**, absente d'une transaction `postgres.js`. Or la couche
 * de commande contrôle la transaction elle-même, parce qu'elle a besoin de
 * `SELECT … FOR UPDATE` et de `transaction_timestamp()` sur la connexion
 * verrouillée.
 *
 * Les deux ne se rejoignent pas : soit la transaction appartient à Drizzle et la
 * forme unique de commande lui est subordonnée, soit elle appartient à
 * postgres.js et les requêtes sont écrites à la main. Le second choix est le
 * moindre — il laisse à la forme unique le contrôle de ce qui compte, le verrou
 * et l'instant, et le prix payé est une liste de colonnes écrites en clair, que
 * les tests d'intégration confrontent au **vrai** schéma à chaque exécution.
 *
 * La dérive silencieuse d'une colonne renommée est donc attrapée par ces tests,
 * qui tournent contre un PostgreSQL réel — pas par la compilation, qui ne les
 * verrait pas.
 */

/**
 * Charge la planète d'un joueur **en la verrouillant** (`SELECT … FOR UPDATE`).
 *
 * Le verrou est posé sur la ligne de planète et sur elle seule : c'est
 * l'agrégat, et tout le reste — ressources, bâtiments, cases, chantiers — lui
 * appartient. Verrouiller l'agrégat plutôt que chaque table évite un ordre de
 * verrouillage à respecter, donc une classe entière d'interblocages.
 */
export async function lockPlanetByOwner(
  tx: GameTransaction,
  ownerId: string,
): Promise<PlanetRecord | undefined> {
  const [row] = await tx<PlanetRow[]>`
    select id, owner_id as "ownerId", occupant_id as "occupantId",
           archetype_id as "archetypeId", layout_id as "layoutId",
           consolidated_at as "consolidatedAt"
    from game.planets
    where owner_id = ${ownerId}
    for update
  `
  return row === undefined ? undefined : loadParts(tx, row)
}

/** Charge sans verrou — pour un `GET`, qui n'écrit rien (FR-031). */
export async function readPlanetByOwner(
  tx: GameTransaction,
  ownerId: string,
): Promise<PlanetRecord | undefined> {
  const [row] = await tx<PlanetRow[]>`
    select id, owner_id as "ownerId", occupant_id as "occupantId",
           archetype_id as "archetypeId", layout_id as "layoutId",
           consolidated_at as "consolidatedAt"
    from game.planets
    where owner_id = ${ownerId}
  `
  return row === undefined ? undefined : loadParts(tx, row)
}

interface PlanetRow {
  readonly id: string
  readonly ownerId: string
  readonly occupantId: string
  readonly archetypeId: string
  readonly layoutId: string
  readonly consolidatedAt: Date
}

async function loadParts(tx: GameTransaction, planet: PlanetRow): Promise<PlanetRecord> {
  const [resourceRows, buildingRows, clearedRows, workRows] = await Promise.all([
    tx<
      {
        resourceId: string
        amountGrains: bigint
        lostGrains: bigint
        saturatedSince: Date | null
      }[]
    >`
      select resource_id as "resourceId", amount_grains as "amountGrains",
             lost_grains as "lostGrains", saturated_since as "saturatedSince"
      from game.planet_resources where planet_id = ${planet.id}
      order by resource_id
    `,
    tx<
      {
        id: string
        typeId: string
        variantId: string
        orientation: number
        anchorX: number
        anchorY: number
        level: number
      }[]
    >`
      select id, type_id as "typeId", variant_id as "variantId", orientation,
             anchor_x as "anchorX", anchor_y as "anchorY", level
      from game.buildings where planet_id = ${planet.id}
      order by id
    `,
    tx<{ x: number; y: number }[]>`
      select x, y from game.cleared_cells where planet_id = ${planet.id} order by x, y
    `,
    tx<
      {
        id: string
        nature: string
        startedAt: Date
        dueAt: Date
        targetBuildingId: string | null
        targetX: number | null
        targetY: number | null
        typeId: string | null
        variantId: string | null
        orientation: number | null
      }[]
    >`
      select id, nature, started_at as "startedAt", due_at as "dueAt",
             target_building_id as "targetBuildingId", target_x as "targetX",
             target_y as "targetY", type_id as "typeId", variant_id as "variantId",
             orientation
      from game.works
      where planet_id = ${planet.id} and resolved_at is null
    `,
  ])

  const work = workRows[0]

  return {
    id: planet.id,
    ownerId: planet.ownerId,
    occupantId: planet.occupantId,
    archetypeId: planet.archetypeId,
    layoutId: planet.layoutId,
    consolidatedAt: instantFromDb(planet.consolidatedAt),
    holdings: resourceRows.map((row) => ({
      resourceId: row.resourceId,
      amountGrains: grainsFromDb(row.amountGrains),
      lostGrains: grainsFromDb(row.lostGrains),
      saturatedSince: nullableInstantFromDb(row.saturatedSince),
    })),
    buildings: buildingRows.map((row) => ({
      id: row.id,
      typeId: row.typeId,
      variantId: row.variantId,
      orientation: row.orientation,
      anchorX: row.anchorX,
      anchorY: row.anchorY,
      level: row.level,
    })),
    clearedCells: clearedRows.map((row) => ({ x: row.x, y: row.y })),
    work:
      work === undefined
        ? null
        : {
            id: work.id,
            nature: work.nature,
            startedAt: instantFromDb(work.startedAt),
            dueAt: instantFromDb(work.dueAt),
            targetBuildingId: work.targetBuildingId,
            targetX: work.targetX,
            targetY: work.targetY,
            typeId: work.typeId,
            variantId: work.variantId,
            orientation: work.orientation,
          },
  }
}

/**
 * Crée une planète et son stock de départ.
 *
 * Rend `undefined` si le joueur en a **déjà** une : l'unicité de `owner_id` est
 * ce qui rend `POST /v1/me/planet` idempotente sous concurrence, sans verrou
 * applicatif (R11). De deux transactions simultanées, la seconde ne touche
 * aucune ligne — et l'API répond `200` avec la planète existante plutôt que
 * `201`.
 */
export async function insertPlanet(
  tx: GameTransaction,
  planet: {
    readonly id: string
    readonly ownerId: string
    readonly occupantId: string
    readonly archetypeId: string
    readonly layoutId: string
    readonly consolidatedAt: number
    readonly holdings: readonly HoldingRecord[]
  },
): Promise<boolean> {
  // La course est arbitrée par la base, seule à pouvoir le faire.
  const inserted = await tx<{ id: string }[]>`
    insert into game.planets (id, owner_id, occupant_id, archetype_id, layout_id, consolidated_at)
    values (
      ${planet.id}, ${planet.ownerId}, ${planet.occupantId},
      ${planet.archetypeId}, ${planet.layoutId}, ${instantToDb(planet.consolidatedAt)}
    )
    on conflict (owner_id) do nothing
    returning id
  `

  if (inserted.length === 0) return false

  for (const holding of planet.holdings) {
    await tx`
      insert into game.planet_resources (
        planet_id, resource_id, amount_grains, lost_grains, saturated_since
      )
      values (
        ${planet.id}, ${holding.resourceId},
        ${grainsToDb(holding.amountGrains)}, ${grainsToDb(holding.lostGrains)},
        ${nullableInstantToDb(holding.saturatedSince)}
      )
    `
  }

  return true
}

/**
 * L'instantané tel qu'on l'écrit.
 *
 * Distinct de `PlanetRecord`, la forme **lue** : les bâtiments y portent leurs
 * cases, que la lecture n'a pas à charger puisque le domaine les redérive. Le
 * propriétaire et l'archétype n'y figurent pas non plus — ils ne changent
 * jamais, et offrir un champ pour les modifier serait offrir un chemin pour les
 * corrompre.
 */
export interface PlanetWrite {
  readonly id: string
  readonly occupantId: string
  readonly consolidatedAt: number
  readonly holdings: readonly HoldingRecord[]
  readonly buildings: readonly BuildingWrite[]
  readonly clearedCells: readonly CellRecord[]
  /** Le chantier en cours, ou `null` s'il n'y en a plus. Au plus un (FR-033). */
  readonly work: WorkRecord | null
}

/**
 * Écrit l'instantané consolidé, **en une seule transaction**.
 *
 * L'ordre suit les dépendances : la planète et ses ressources, puis les
 * bâtiments et leurs cases, puis les déblaiements, puis le chantier. Un chantier
 * écrit avant le bâtiment qu'il vient d'achever violerait la clé étrangère de
 * `target_building_id` le jour où une amélioration la renseignera.
 *
 * Les possessions sont écrites en `upsert` plutôt qu'en `delete` puis `insert` :
 * la seconde forme laisserait, entre les deux, un instant où la planète n'a
 * aucune ressource. Invisible dans une transaction — jusqu'au jour où un
 * déclencheur ou une réplique lit cet état intermédiaire.
 */
export async function writePlanet(tx: GameTransaction, write: PlanetWrite): Promise<void> {
  await tx`
    update game.planets
    set consolidated_at = ${instantToDb(write.consolidatedAt)},
        occupant_id = ${write.occupantId}
    where id = ${write.id}
  `

  for (const holding of write.holdings) {
    await tx`
      insert into game.planet_resources (
        planet_id, resource_id, amount_grains, lost_grains, saturated_since
      )
      values (
        ${write.id}, ${holding.resourceId},
        ${grainsToDb(holding.amountGrains)}, ${grainsToDb(holding.lostGrains)},
        ${nullableInstantToDb(holding.saturatedSince)}
      )
      on conflict (planet_id, resource_id) do update
      set amount_grains = excluded.amount_grains,
          lost_grains = excluded.lost_grains,
          saturated_since = excluded.saturated_since
    `
  }

  await syncBuildings(tx, write.id, write.buildings)
  await syncClearedCells(tx, write.id, write.clearedCells, write.consolidatedAt)
  await syncWork(tx, write.id, write.work, write.consolidatedAt)
}

/**
 * Aligne la ligne de chantier sur l'instantané.
 *
 * Deux mouvements, et une absence :
 *
 * - le chantier que l'instantané ne porte plus est **marqué résolu**, jamais
 *   supprimé. Les lignes résolues sont l'histoire de la planète et le support
 *   d'une enquête ultérieure — c'est ce qui impose que l'index d'unicité soit
 *   *partiel* ;
 * - le chantier nouveau est inséré. C'est ici que l'index unique
 *   `(planet_id) where resolved_at is null` arbitre : de deux transactions
 *   simultanées, la seconde échoue. Ce n'est **pas** une vérification préalable
 *   qui tient FR-033, et la différence est celle entre une règle et une fenêtre
 *   de course.
 *
 * L'absence est celle d'une mise à jour : un chantier ne se modifie pas. Il n'est
 * ni annulable ni remplaçable (FR-037), et aucune instruction de ce fichier ne
 * saurait le faire.
 */
export async function syncWork(
  tx: GameTransaction,
  planetId: string,
  work: WorkRecord | null,
  at: number,
): Promise<void> {
  const unresolved = await tx<{ id: string }[]>`
    select id from game.works where planet_id = ${planetId} and resolved_at is null
  `

  for (const row of unresolved) {
    if (row.id !== work?.id) await resolveWork(tx, row.id, at)
  }

  if (work === null) return
  if (unresolved.some((row) => row.id === work.id)) return

  await tx`
    insert into game.works (
      id, planet_id, nature, started_at, due_at,
      target_building_id, target_x, target_y, type_id, variant_id, orientation
    )
    values (
      ${work.id}, ${planetId}, ${work.nature},
      ${instantToDb(work.startedAt)}, ${instantToDb(work.dueAt)},
      ${work.targetBuildingId}, ${work.targetX}, ${work.targetY},
      ${work.typeId}, ${work.variantId}, ${work.orientation}
    )
  `
}

/**
 * Marque résolu un chantier.
 *
 * Les lignes résolues **restent** : elles sont l'histoire de la planète, et le
 * support d'une enquête ultérieure. C'est ce qui impose que l'index d'unicité
 * soit *partiel*.
 */
export async function resolveWork(tx: GameTransaction, workId: string, at: number): Promise<void> {
  await tx`
    update game.works set resolved_at = ${instantToDb(at)} where id = ${workId}
  `
}

/** Le nombre de planètes existantes — pour les diagnostics et les tests. */
export async function countPlanets(tx: GameTransaction): Promise<number> {
  const [row] = await tx<{ total: string }[]>`select count(*)::text as total from game.planets`
  return Number(row?.total ?? '0')
}
