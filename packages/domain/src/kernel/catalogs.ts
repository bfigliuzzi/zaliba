import type {
  ArchetypeId,
  Building,
  BuildingTypeId,
  DeclaredBuilding,
  DeclaredLayout,
  DeclaredObstacle,
  Footprint,
  FootprintId,
  GongLength,
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
 *
 * **Ce faisceau est le catalogue *résolu*** (003) : ses durées sont en secondes
 * et ses taux en grains par seconde, tandis que `DeclaredCatalogs` — ce que
 * `packages/catalogs` exporte — est en gongs et en grains par gong.
 * `resolveCatalogs` est le seul chemin de l'un à l'autre, et il faut une
 * longueur de gong pour l'emprunter. Les deux formes sont mutuellement
 * inassignables : le résolu porte un champ `gong` que le déclaré n'a pas, et
 * leurs champs à dimension de temps ne portent pas le même nom.
 */
export interface Catalogs {
  readonly layouts: Readonly<Record<LayoutId, Layout>>
  readonly archetypes: Readonly<Record<ArchetypeId, { readonly layoutId: LayoutId }>>
  readonly buildings: Readonly<Record<BuildingTypeId, Building>>
  readonly obstacles: Readonly<Record<ObstacleId, Obstacle>>
  readonly footprints: Readonly<Record<FootprintId, Footprint>>
  readonly resourceIds: readonly ResourceId[]
  readonly version: string
  /**
   * La longueur de gong avec laquelle ce faisceau a été résolu.
   *
   * Elle voyage **avec** le catalogue plutôt qu'à côté de lui, et c'est une
   * garantie de forme : un serveur qui annoncerait au client une longueur autre
   * que celle qu'il applique devient un état qu'on ne peut plus écrire, plutôt
   * qu'un état qu'un test surveille (G10).
   */
  readonly gong: GongLength
}

/**
 * Ce que le catalogue **déclare**, avant toute résolution : en gongs, et en
 * grains par gong.
 *
 * Sa forme est celle de `Catalogs` à trois différences près, et ces trois-là
 * sont toute la tranche 003 — les durées et les taux y portent d'autres noms
 * parce qu'ils portent d'autres unités, et il n'a pas de champ `gong` puisqu'il
 * n'a pas encore été résolu. C'est ce qui rend les deux faisceaux mutuellement
 * inassignables malgré le typage structurel de TypeScript.
 */
export interface DeclaredCatalogs {
  readonly layouts: Readonly<Record<LayoutId, DeclaredLayout>>
  readonly archetypes: Readonly<Record<ArchetypeId, { readonly layoutId: LayoutId }>>
  readonly buildings: Readonly<Record<BuildingTypeId, DeclaredBuilding>>
  readonly obstacles: Readonly<Record<ObstacleId, DeclaredObstacle>>
  readonly footprints: Readonly<Record<FootprintId, Footprint>>
  readonly resourceIds: readonly ResourceId[]
  readonly version: string
}

/**
 * Le catalogue du jeu tel qu'il est **déclaré**, en gongs.
 *
 * Il n'est pas consommable par une fonction de domaine : il faut le faire
 * passer par `resolveCatalogs`, qui a besoin d'une longueur de gong — et cette
 * longueur appartient au serveur. C'est ce qui remplace l'ancien
 * `DEFAULT_CATALOGS` : il n'existe plus de catalogue « par défaut », parce
 * qu'un catalogue prêt à l'emploi supposerait une longueur par défaut, et
 * qu'un défaut silencieux est exactement ce que FR-007 refuse.
 */
export const DECLARED_CATALOGS: DeclaredCatalogs = {
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
