import { describe, expect, it } from 'vitest'
import { BUILDINGS, EXTRACTOR_TYPE_IDS } from '../src/buildings.js'
import { FOOTPRINT_IDS, FOOTPRINTS, type FootprintId, type Offset } from '../src/footprints.js'
import { BERCEAU, cellAt } from '../src/layouts/berceau.js'
import type { ResourceId } from '../src/resources.js'

/**
 * FR-005, et **la seule autorité sur cette exigence**.
 *
 * La vérification menée à la main dans R7 n'est qu'un brouillon : elle nomme un
 * bloc libre par empreinte et conclut. Un brouillon ne survit pas à la première
 * retouche de la disposition — déplacer un obstacle d'une case suffirait à le
 * démentir sans que personne ne le relise. Ce fichier énumère.
 *
 * **La recherche est écrite ici, et n'appelle pas `domain`.** Ce n'est pas une
 * contrainte de dépendance seulement : c'est ce qui empêche la circularité. Si
 * l'autorité sur FR-005 employait `validatePlacement`, elle vérifierait que le
 * catalogue est compatible avec l'implémentation, et une erreur commune aux deux
 * — un décalage d'ancre, une orientation mal renormalisée — passerait inaperçue.
 * Ici, la validité est recalculée par un second chemin, sur la seule donnée.
 */

/** Les cases qu'occuperait une empreinte orientée, ancrée en `(ax, ay)`. */
function placementCells(offsets: readonly Offset[], ax: number, ay: number): readonly Offset[] {
  return offsets.map((offset) => ({ x: ax + offset.x, y: ay + offset.y }))
}

/**
 * Vrai si toutes les cases sont dans la grille et **non obstruées**.
 *
 * L'état de départ est celui d'une planète neuve : aucun bâtiment, aucun
 * déblaiement. FR-005 porte sur cet état — une disposition dont une empreinte
 * n'aurait de place qu'après travaux enfermerait le joueur.
 */
function isPlaceable(cells: readonly Offset[]): boolean {
  return cells.every((cell) => {
    const layoutCell = cellAt(BERCEAU, cell.x, cell.y)
    return layoutCell !== undefined && layoutCell.obstacleId === null
  })
}

/** Tous les placements valides d'une empreinte, orientations comprises. */
function validPlacements(
  footprintId: FootprintId,
): readonly { readonly orientation: number; readonly cells: readonly Offset[] }[] {
  const found: { orientation: number; cells: readonly Offset[] }[] = []

  for (const [orientation, offsets] of FOOTPRINTS[footprintId].orientations.entries()) {
    for (let ay = 0; ay < BERCEAU.height; ay += 1) {
      for (let ax = 0; ax < BERCEAU.width; ax += 1) {
        const cells = placementCells(offsets, ax, ay)
        if (isPlaceable(cells)) found.push({ orientation, cells })
      }
    }
  }
  return found
}

/** Les placements qui recouvrent le gisement **affleurant** de `resourceId`. */
function placementsCovering(
  footprintId: FootprintId,
  resourceId: ResourceId,
): readonly (readonly Offset[])[] {
  return validPlacements(footprintId)
    .filter(({ cells }) =>
      cells.some((cell) => cellAt(BERCEAU, cell.x, cell.y)?.depositOf === resourceId),
    )
    .map(({ cells }) => cells)
}

describe('chacune des sept empreintes admet au moins un placement valide (FR-005)', () => {
  it.each(FOOTPRINT_IDS)('%s trouve sa place sur le Berceau', (footprintId) => {
    const placements = validPlacements(footprintId)
    expect(
      placements.length,
      `${footprintId} n’a aucun placement valide sur la disposition du Berceau`,
    ).toBeGreaterThan(0)
  })

  /**
   * Le carré de neuf est le cas critique : neuf cases contiguës et libres sur
   * une grille de trente-six dont dix sont obstruées, avec une bande d'obstacles
   * qui coupe la planète en deux. C'est lui qui tombe le premier si la
   * disposition est retouchée sans y penser.
   */
  it('laisse au carré de neuf la place d’un bloc entier', () => {
    expect(validPlacements('square-9').length).toBeGreaterThan(0)
  })
})

describe('chaque extracteur peut recouvrir le gisement de sa ressource (FR-005)', () => {
  it.each(EXTRACTOR_TYPE_IDS)('%s atteint son gisement', (typeId) => {
    const type = BUILDINGS[typeId]
    const resourceId = type.extracts
    expect(resourceId, `${typeId} n’extrait rien`).not.toBeNull()
    if (resourceId === null) return

    const reachable = type.variants.flatMap((variantId) =>
      placementsCovering(variantId, resourceId),
    )
    expect(
      reachable.length,
      `aucune variante de ${typeId} ne recouvre un gisement de ${resourceId}`,
    ).toBeGreaterThan(0)
  })

  /**
   * Le compte, et non la seule existence : un extracteur qui n'aurait qu'**un**
   * placement possible ferait de FR-005 une exigence tenue au cheveu près, que
   * la prochaine retouche de la disposition casserait. Le racloir en est le cas
   * le plus serré — neuf cases autour d'un récif.
   */
  it('laisse au moins un placement à chaque variante d’extracteur', () => {
    for (const typeId of EXTRACTOR_TYPE_IDS) {
      const resourceId = BUILDINGS[typeId].extracts
      if (resourceId === null) continue
      for (const variantId of BUILDINGS[typeId].variants) {
        expect(
          placementsCovering(variantId, resourceId).length,
          `${typeId} / ${variantId} sur ${resourceId}`,
        ).toBeGreaterThan(0)
      }
    }
  })
})

describe('la recherche elle-même est éprouvée', () => {
  /**
   * Un test qui cherche doit prouver qu'il sait aussi **ne pas** trouver. Sans
   * ce contre-exemple, une erreur dans `isPlaceable` rendrait tout valide et les
   * cas ci-dessus passeraient en silence — c'est-à-dire qu'ils cesseraient
   * d'être l'autorité sur FR-005 tout en prétendant l'être.
   */
  it('refuse un placement qui sort de la grille', () => {
    expect(isPlaceable(placementCells(FOOTPRINTS['square-4'].cells, 5, 5))).toBe(false)
  })

  it('refuse un placement sur une case obstruée', () => {
    // (0,2) porte un filon enfoui dans la disposition de R7.
    expect(isPlaceable(placementCells(FOOTPRINTS.single.cells, 0, 2))).toBe(false)
  })

  it('accepte le carré de quatre sur la veine de Camelote', () => {
    expect(isPlaceable(placementCells(FOOTPRINTS['square-4'].cells, 0, 4))).toBe(true)
  })
})
