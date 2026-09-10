import type {
  Building,
  BuildingTypeId,
  DeclaredBuilding,
  DeclaredLayout,
  DeclaredObstacle,
  GeometricCurve,
  GongLength,
  Layout,
  LayoutId,
  Obstacle,
  ObstacleId,
  ResourceId,
} from '@zaliba/catalogs'
import type { Catalogs, DeclaredCatalogs } from './catalogs.js'

/**
 * **La résolution du catalogue : des gongs vers des secondes.**
 *
 * Le catalogue déclare ses durées en gongs et ses productions en grains par
 * gong ; le domaine, lui, ne connaît que des secondes et des grains par
 * seconde. Cette fonction est le seul pont entre les deux, et elle est **pure** :
 * elle ne lit ni horloge, ni environnement, ni fichier. La longueur du gong est
 * un argument, exactement comme l'instant l'est ailleurs — et pour la même
 * raison, qui est qu'une fonction allant chercher sa donnée hors de ses
 * arguments cesse d'être éprouvable en isolation.
 *
 * Elle n'importe que `@zaliba/catalogs` : la règle `domain-n-importe-que-catalogs`
 * la couvre sans qu'aucune règle de frontière nouvelle ait été ajoutée.
 *
 * ## La règle, en deux lignes
 *
 * ```
 * base de durée résolue = max(1, ⌊ baseGongs × num ÷ den ⌋)      puis evaluateCurve
 * base de taux résolue  =        baseGrainsParGong × den ÷ num   puis evaluateCurve
 * ```
 *
 * **La résolution porte sur la base, jamais sur la valeur évaluée** (G4), et
 * c'est ce qui décide de l'exactitude de toute la tranche. Résoudre après
 * l'évaluation empilerait deux troncatures : `⌊12 × 1,4²⌋ × 10` donne 230 là où
 * le jeu met 235, qui est `⌊120 × 1,4²⌋`. Résoudre la base préserve la règle
 * d'une seule troncature en fin de calcul (R19) et rend l'égalité au gong
 * canonique **exacte** — où résoudre n'est qu'une multiplication par dix.
 *
 * La courbe elle-même n'est jamais touchée : son `num`, son `den` et sa nature
 * décrivent une *progression*, qui n'a pas de dimension de temps. La modifier
 * rééquilibrerait le jeu en prétendant changer une unité.
 *
 * ## Ce qui traverse intact
 *
 * Coûts, capacités, énergie consommée et produite, empreintes, variantes,
 * plafonds de niveau, fraction de remboursement, gisements et géométrie des
 * dispositions (G13). Aucune de ces grandeurs n'a de dimension de temps, et
 * l'omission est écrite pour qu'un futur lecteur ne la « corrige » pas.
 *
 * **La production de base d'une disposition, elle, est bien résolue**, et c'est
 * la seule exception à la ligne ci-dessus. Les documents de conception de 003
 * écartaient « les dispositions » en bloc ; c'était trop large. La production
 * de base est un **taux**, donc elle a une dimension de temps, et elle est la
 * seule source de revenu d'une planète fraîche : ne pas la résoudre laisserait
 * le premier écran du jeu battre au rythme canonique sur un serveur rapide.
 * SC-002 l'interdit nommément — « tout délai du jeu, chantier **comme
 * accumulation de ressources**, dans le même rapport, et jamais l'un sans
 * l'autre » — et c'est le défaut qui avait fait écarter le premier design de la
 * tranche 900 : des chantiers instantanés et un joueur affamé.
 *
 * **Les deux formes de faisceau — `DeclaredCatalogs` et `Catalogs` — vivent dans
 * `catalogs.ts`, pas ici.** Le découpage de tâches les plaçait dans ce
 * fichier-ci ; les y laisser créait un cycle d'import entre les deux modules,
 * que `graphe-de-modules-acyclique` refuse à juste titre. Les formes vont donc
 * avec les formes, et la résolution reste seule dans ce fichier : la dépendance
 * est unidirectionnelle, et les deux faisceaux se lisent désormais côte à côte,
 * ce que le modèle de données montrait déjà.
 */

/**
 * Une durée déclarée, en secondes : `max(1, ⌊ gongs × num ÷ den ⌋)`.
 *
 * Le plancher tient FR-008 — un chantier instantané n'est pas un chantier : il
 * ne s'affiche pas, ne se regarde pas finir, et rendrait `work-in-progress`
 * inatteignable.
 */
function resolveDuration(gongs: number, gong: GongLength): number {
  return Math.max(1, Math.floor((gongs * gong.num) / gong.den))
}

/**
 * Un taux déclaré, en grains par seconde : `grainsParGong × den ÷ num`.
 *
 * **Sans troncature, et c'est vérifié plutôt que toléré** : l'exactitude à la
 * seconde de R1 tient à ce que tous les taux soient entiers, puisque c'est ce
 * qui permet à la projection de n'employer que de l'arithmétique entière et de
 * donner le même chiffre au client et au serveur. Un taux fractionnaire y
 * introduirait un arrondi par segment de temps, donc une dérive — et une dérive
 * dont chaque valeur prise séparément aurait l'air juste.
 */
function resolveRate(
  grainsPerGong: number,
  gong: GongLength,
  /** Ce qui porte le taux : un type de bâtiment, ou une disposition. */
  bearer: BuildingTypeId | string,
  resourceId: ResourceId | null,
): number {
  const numerator = grainsPerGong * gong.den
  if (numerator % gong.num !== 0) {
    throw new RangeError(
      `Longueur de gong inutilisable : ${gong.num}/${gong.den} s. ` +
        `Le taux de « ${bearer} » (${grainsPerGong} grains par gong de ${resourceId ?? '—'}) ` +
        `se résout sur ${numerator / gong.num}, qui n'est pas un entier de grains par seconde. ` +
        `Tous les taux doivent tomber juste, sans quoi la projection dérive en silence (R1). ` +
        `Choisir une longueur dont le numérateur divise ${grainsPerGong} × ${gong.den}.`,
    )
  }
  return numerator / gong.num
}

/** La base d'une courbe change, la courbe ne change pas. */
function withBase(curve: GeometricCurve, base: number): GeometricCurve {
  return { kind: curve.kind, base, num: curve.num, den: curve.den }
}

function resolveBuilding(declared: DeclaredBuilding, gong: GongLength): Building {
  const { demolitionGongs, buildDuration, production, ...common } = declared

  return {
    ...common,
    demolitionSeconds: resolveDuration(demolitionGongs, gong),
    buildDuration: withBase(buildDuration, resolveDuration(buildDuration.base, gong)),
    production:
      production === null
        ? null
        : withBase(production, resolveRate(production.base, gong, declared.id, declared.extracts)),
  }
}

function resolveObstacle(declared: DeclaredObstacle, gong: GongLength): Obstacle {
  const { durationGongs, ...common } = declared
  return { ...common, durationSeconds: resolveDuration(durationGongs, gong) }
}

/**
 * La production de base d'une disposition, résolue comme n'importe quel taux :
 * elle doit tomber sur un entier de grains par seconde, ou la longueur est
 * refusée (FR-006).
 */
function resolveLayout(declared: DeclaredLayout, gong: GongLength): Layout {
  const { baseProductionPerGong, ...common } = declared

  const baseProductionPerHour = Object.fromEntries(
    Object.entries(baseProductionPerGong).map(([resourceId, grainsPerGong]) => [
      resourceId,
      resolveRate(grainsPerGong, gong, `disposition ${declared.id}`, resourceId as ResourceId),
    ]),
  ) as Record<ResourceId, number>

  return { ...common, baseProductionPerHour }
}

/**
 * Le catalogue résolu à une longueur de gong donnée.
 *
 * @throws RangeError si la longueur n'est pas une fraction d'entiers
 *   strictement positifs, ou si un taux de production ne s'y résout pas en
 *   entier. Les deux refus sont des refus de **démarrage** : un serveur qui bat
 *   au mauvais rythme est indétectable de l'intérieur.
 */
export function resolveCatalogs(declared: DeclaredCatalogs, gong: GongLength): Catalogs {
  if (
    !Number.isInteger(gong.num) ||
    !Number.isInteger(gong.den) ||
    gong.num <= 0 ||
    gong.den <= 0
  ) {
    throw new RangeError(
      `Longueur de gong invalide : ${gong.num}/${gong.den}. ` +
        `Une longueur est une fraction d'entiers strictement positifs — jamais un flottant, ` +
        `dont l'arrondi ferait dépendre les durées du jeu de la représentation binaire.`,
    )
  }

  const buildings = Object.fromEntries(
    Object.entries(declared.buildings).map(([id, type]) => [id, resolveBuilding(type, gong)]),
  ) as Record<BuildingTypeId, Building>

  const obstacles = Object.fromEntries(
    Object.entries(declared.obstacles).map(([id, shape]) => [id, resolveObstacle(shape, gong)]),
  ) as Record<ObstacleId, Obstacle>

  const layouts = Object.fromEntries(
    Object.entries(declared.layouts).map(([id, layout]) => [id, resolveLayout(layout, gong)]),
  ) as Record<LayoutId, Layout>

  return {
    layouts,
    archetypes: declared.archetypes,
    buildings,
    obstacles,
    footprints: declared.footprints,
    resourceIds: declared.resourceIds,
    version: declared.version,
    // La longueur employée voyage avec le catalogue qu'elle a produit : un
    // serveur ne peut annoncer que ce qu'il applique, parce qu'il n'a plus
    // d'autre endroit où lire la longueur (G10).
    gong,
  }
}
