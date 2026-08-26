import type { GameTransaction } from '../client.js'
import type { BuildingRecord, CellRecord } from './records.js'

/**
 * L'écriture des bâtiments et de leurs cases (R10).
 *
 * **`game.building_cells` est écrite dans la même transaction que
 * `game.buildings`**, et sa clé primaire `(planet_id, x, y)` rend la
 * superposition de deux bâtiments *impossible à écrire* — pas seulement
 * interdite. C'est l'invariant central de la fonctionnalité (I-5), et il vaut y
 * compris face à un futur chemin d'écriture qui aurait oublié la validation du
 * domaine. La garantie ne se dégrade pas avec la fatigue ; la discipline, si.
 *
 * **Pourquoi les cases sont fournies et non calculées ici.** Elles se dérivent
 * de la variante, de l'orientation et de l'ancre — un calcul qui appartient au
 * domaine, avec le repli d'orientation de R6. Le recopier dans `db` en ferait
 * une seconde implémentation de la même règle, et deux implémentations d'une
 * géométrie finissent par diverger sur un cas de rotation. Ce paquet écrit donc
 * ce que le domaine a dérivé, et la contrainte de base vérifie que le résultat
 * est cohérent.
 */

/**
 * Un bâtiment et les cases qu'il occupe, tel qu'on l'écrit.
 *
 * Distinct de `BuildingRecord`, la forme **lue** : à la lecture, les cases sont
 * inutiles — le domaine les redérive — alors qu'à l'écriture elles sont ce qui
 * fait tenir l'invariant. Les fusionner obligerait chaque lecture à charger une
 * table dérivée dont personne ne se sert.
 */
export interface BuildingWrite extends BuildingRecord {
  readonly cells: readonly CellRecord[]
}

/**
 * Aligne les bâtiments de la planète sur ceux de l'instantané.
 *
 * Trois temps, et l'ordre compte :
 *
 * 1. **retirer** ceux que l'instantané ne porte plus. La suppression en cascade
 *    emporte leurs cases, ce qui libère le terrain avant qu'un autre le réclame ;
 * 2. **insérer ou mettre à jour** les bâtiments. Seul le niveau peut changer —
 *    la variante, l'orientation et l'ancre sont figées à la pose (FR-010) ;
 * 3. **insérer** les cases des bâtiments *nouveaux*, sans aucun `on conflict`.
 *
 * Le troisième point est le plus important et le moins visible. Un
 * `on conflict … do update` — ou même un `do nothing` — paraîtrait plus robuste
 * et détruirait la garantie : il transformerait une superposition en écrasement
 * silencieux, c'est-à-dire exactement la faute que la clé primaire est là pour
 * rendre impossible. Ici, un conflit **lève**, et la transaction s'annule tout
 * entière.
 *
 * C'est pourquoi seules les cases des bâtiments nouveaux sont insérées : celles
 * d'un bâtiment déjà en base sont déjà justes, puisque variante, orientation et
 * ancre sont figées à la pose. Les réinsérer entrerait en conflit avec
 * elles-mêmes, et il faudrait alors le tolérer — donc tolérer aussi le conflit
 * qu'on veut voir.
 */
export async function syncBuildings(
  tx: GameTransaction,
  planetId: string,
  buildings: readonly BuildingWrite[],
): Promise<void> {
  const keptIds = buildings.map((building) => building.id)

  const known = await tx<{ id: string }[]>`
    select id from game.buildings where planet_id = ${planetId}
  `
  const knownIds = new Set(known.map((row) => row.id))

  // `<> all(…)` plutôt que `not in (…)`, et le transtypage explicite plutôt
  // qu'une inférence : sur un tableau **vide**, `not in` est faux pour toute
  // ligne — donc ne supprimerait rien là où il faut tout supprimer — et un
  // paramètre vide sans type ne s'infère pas. Les deux pièges ne se voient qu'à
  // la démolition du dernier bâtiment d'une planète.
  await tx`
    delete from game.buildings
    where planet_id = ${planetId} and id <> all(${keptIds}::uuid[])
  `

  for (const building of buildings) {
    await tx`
      insert into game.buildings
        (id, planet_id, type_id, variant_id, orientation, anchor_x, anchor_y, level)
      values (
        ${building.id}, ${planetId}, ${building.typeId}, ${building.variantId},
        ${building.orientation}, ${building.anchorX}, ${building.anchorY}, ${building.level}
      )
      on conflict (id) do update set level = excluded.level
    `
  }

  for (const building of buildings.filter((candidate) => !knownIds.has(candidate.id))) {
    for (const cell of building.cells) {
      await tx`
        insert into game.building_cells (planet_id, x, y, building_id)
        values (${planetId}, ${cell.x}, ${cell.y}, ${building.id})
      `
    }
  }
}

/**
 * Le nombre de cases réclamées par les bâtiments d'une planète.
 *
 * Sert aux diagnostics et aux tests d'intégration : c'est par ce compte que l'on
 * vérifie que la table dérivée suit bien la table maîtresse, plutôt que de
 * l'espérer.
 */
export async function countBuildingCells(tx: GameTransaction, planetId: string): Promise<number> {
  const [row] = await tx<{ total: string }[]>`
    select count(*)::text as total from game.building_cells where planet_id = ${planetId}
  `
  return Number(row?.total ?? '0')
}
