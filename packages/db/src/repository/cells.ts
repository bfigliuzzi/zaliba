import type { GameTransaction } from '../client.js'
import { instantToDb } from '../conversions.js'
import type { CellRecord } from './records.js'

/**
 * L'écriture des cases déblayées.
 *
 * L'état obstrué d'une case est *la disposition du catalogue **moins** ces
 * lignes*. Il n'y a donc aucune table de trente-six lignes par planète, et
 * surtout : **une case déblayée ne peut pas redevenir obstruée**, parce qu'il
 * n'existe aucun chemin d'écriture pour cela (I-8, FR-045).
 *
 * Ce fichier n'a délibérément pas de fonction inverse. Ce n'est pas un oubli à
 * combler le jour où quelqu'un en aura besoin : c'est la garantie elle-même. Une
 * fonction de re-obstruction, même appelée nulle part, serait un chemin
 * d'écriture — et l'invariant ne tiendrait plus que par la discipline de ne pas
 * l'appeler.
 */

/**
 * Enregistre les cases déblayées que la base ne connaît pas encore.
 *
 * `on conflict do nothing` est ici la bonne réponse, et pour une raison
 * différente de celle des cases de bâtiment : déblayer deux fois la même case
 * est **idempotent** par nature — la case est libre, elle le reste. Le conflit
 * ne cache aucune faute, il dit seulement que le travail était déjà fait.
 */
export async function syncClearedCells(
  tx: GameTransaction,
  planetId: string,
  cells: readonly CellRecord[],
  at: number,
): Promise<void> {
  for (const cell of cells) {
    await tx`
      insert into game.cleared_cells (planet_id, x, y, cleared_at)
      values (${planetId}, ${cell.x}, ${cell.y}, ${instantToDb(at)})
      on conflict (planet_id, x, y) do nothing
    `
  }
}
