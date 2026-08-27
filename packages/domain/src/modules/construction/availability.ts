import type { BuildingTypeId, FootprintId } from '@zaliba/catalogs'
import type { Catalogs } from '../../kernel/catalogs.js'
import type { Cell } from '../../kernel/effects.js'
import {
  type CellView,
  orientationCount,
  orientedCells,
  placementCells,
  validatePlacement,
} from '../../kernel/grid.js'

/**
 * **Existe-t-il un placement pour ce type ?** — et sinon, pourquoi.
 *
 * La spécification pose le cas limite ainsi : « aucune empreinte d'un type donné
 * ne tient nulle part sur la grille : le type reste consultable, **son aperçu
 * énonce l'impossibilité et son motif** ».
 *
 * C'est une question que rien d'autre ne sait poser. `previewBuild` exige une
 * position, et `validatePlacement` répond case par case : tous deux répondent
 * « ici, oui ou non », jamais « quelque part, oui ou non ». Les enchaîner à la
 * main dans l'interface reviendrait à écrire cette fonction — mais dans la
 * couche qui n'a pas le droit de connaître les règles de placement.
 *
 * **Le motif importe autant que le verdict**, et c'est la raison d'être des deux
 * refus distincts. « Plus assez de cases libres » se règle en libérant
 * n'importe quelle case ; « il en reste, mais pas dans cette forme » se règle en
 * libérant *les bonnes*, ou en choisissant une autre empreinte. Un booléen les
 * confondrait, et le joueur démolirait au hasard.
 *
 * **La recherche est exhaustive, et c'est sans conséquence.** Trente-six cases,
 * au plus trois variantes par type, au plus quatre orientations : quelques
 * centaines de validations d'empreinte, sur une grille que le client tient déjà
 * en mémoire. Un index de blocs libres serait plus savant, et faux le jour où
 * une empreinte cesserait d'être rectangulaire.
 */

/** Un placement possible — le premier trouvé, dans l'ordre de lecture. */
export interface PlacementFound {
  readonly kind: 'available'
  readonly variantId: FootprintId
  readonly orientation: number
  readonly anchor: Cell
}

/**
 * Les deux motifs d'impossibilité.
 *
 * Ils portent les **mêmes** grandeurs — cases libres, plus petite empreinte du
 * type — parce que c'est leur comparaison qui les distingue, et que le joueur a
 * besoin des deux nombres dans les deux cas : ils disent l'ampleur de ce qu'il
 * faut libérer.
 */
export interface PlacementImpossible {
  /**
   * `not-enough-free-cells` : il reste moins de cases libres que la plus petite
   * empreinte du type n'en demande. Aucune forme ne peut tenir.
   *
   * `no-shape-fits` : il en reste assez, mais aucune position ni orientation ne
   * trouve de place. La géométrie, et non la quantité.
   */
  readonly kind: 'not-enough-free-cells' | 'no-shape-fits'
  readonly freeCells: number
  /** La plus petite des empreintes admissibles du type, en cases. */
  readonly smallestFootprint: number
}

export type PlacementAvailability = PlacementFound | PlacementImpossible

/**
 * @throws RangeError si le type est inconnu — c'est une faute de programmation,
 * pas une impossibilité de jeu, et les confondre ferait afficher « ce bâtiment
 * ne tient nulle part » pour un identifiant mal orthographié.
 */
export function placementAvailability(
  grid: readonly CellView[],
  typeId: BuildingTypeId,
  catalogs: Catalogs,
): PlacementAvailability {
  const type = catalogs.buildings[typeId]
  if (type === undefined) {
    throw new RangeError(`Type de bâtiment inconnu : ${typeId}.`)
  }

  for (const variantId of type.variants) {
    for (
      let orientation = 0;
      orientation < orientationCount(variantId, catalogs);
      orientation += 1
    ) {
      for (const anchor of grid) {
        const cells = placementCells(variantId, orientation, anchor, catalogs)
        if (validatePlacement(grid, cells).kind === 'ok') {
          return { kind: 'available', variantId, orientation, anchor: { x: anchor.x, y: anchor.y } }
        }
      }
    }
  }

  const freeCells = grid.filter((cell) => cell.state === 'free').length
  const smallestFootprint = Math.min(
    ...type.variants.map((variantId) => orientedCells(variantId, 0, catalogs).length),
  )

  return {
    kind: freeCells < smallestFootprint ? 'not-enough-free-cells' : 'no-shape-fits',
    freeCells,
    smallestFootprint,
  }
}
