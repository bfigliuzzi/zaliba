import type {
  ArchetypeId,
  Building,
  BuildingTypeId,
  Footprint,
  FootprintId,
  Layout,
  LayoutId,
  Obstacle,
  ObstacleId,
  ResourceId,
} from '@zaliba/catalogs'
import {
  ARCHETYPES,
  BERCEAU,
  BUILDINGS,
  CATALOG_VERSION,
  FOOTPRINTS,
  LAYOUTS,
  OBSTACLES,
  RESOURCE_IDS,
} from '@zaliba/catalogs'

/**
 * Le faisceau de catalogues, passé **en argument** aux fonctions de domaine.
 *
 * `project(snapshot, catalogs, at)` — le catalogue est un paramètre, pas un
 * import caché, exactement comme l'instant. Les deux motifs sont le même : une
 * fonction qui va chercher sa donnée ailleurs qu'entre ses arguments n'est plus
 * éprouvable en isolation, et son résultat cesse d'être une fonction de ce
 * qu'on lui montre.
 *
 * Ici, le bénéfice est concret : un test d'équilibrage peut projeter contre un
 * catalogue synthétique — plafond bas, taux nul, courbe extrême — sans toucher
 * au contenu du jeu, et un aperçu client peut employer le catalogue de la
 * version qu'il détient plutôt que celui du serveur, ce qui rend la divergence
 * visible au lieu de la rendre invisible (R15).
 */
export interface Catalogs {
  readonly layouts: Readonly<Record<LayoutId, Layout>>
  readonly archetypes: Readonly<Record<ArchetypeId, { readonly layoutId: LayoutId }>>
  readonly buildings: Readonly<Record<BuildingTypeId, Building>>
  readonly obstacles: Readonly<Record<ObstacleId, Obstacle>>
  readonly footprints: Readonly<Record<FootprintId, Footprint>>
  readonly resourceIds: readonly ResourceId[]
  readonly version: string
}

/** Le catalogue du jeu tel qu'il est livré. */
export const DEFAULT_CATALOGS: Catalogs = {
  layouts: LAYOUTS,
  archetypes: ARCHETYPES,
  buildings: BUILDINGS,
  obstacles: OBSTACLES,
  footprints: FOOTPRINTS,
  resourceIds: RESOURCE_IDS,
  version: CATALOG_VERSION,
}

/** La disposition d'une planète, résolue depuis son identifiant. */
export function layoutOf(catalogs: Catalogs, layoutId: LayoutId): Layout {
  const layout = catalogs.layouts[layoutId]
  if (layout === undefined) {
    throw new RangeError(`Disposition inconnue : ${layoutId}.`)
  }
  return layout
}

export { BERCEAU }
