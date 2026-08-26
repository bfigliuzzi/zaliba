import type { GeometricCurve } from './curves.js'
import type { FootprintId } from './footprints.js'
import type { ResourceId } from './resources.js'
import { GRAINS_PER_UNIT } from './units.js'

/**
 * Les cinq types de bâtiment de 001 (R20).
 *
 * **Les caractéristiques appartiennent au type, jamais à la variante.** C'est la
 * forme de donnée qui tient FR-009 : la mine a trois empreintes de quatre cases,
 * et le choix entre elles est purement géométrique. Si une variante pouvait
 * porter un chiffre, le vocabulaire d'empreintes deviendrait un arbre de
 * progression déguisé, et « quelle forme ? » cesserait d'être une question
 * d'espace pour devenir un calcul d'optimisation.
 *
 * **Aucun coût n'est libellé en Jus** (FR-062, R22) : il n'a aucun débouché en
 * 001, et l'exiger serait un blocage définitif déguisé en contenu.
 *
 * Les courbes de production, de consommation d'énergie et de capacité arrivent
 * avec les tranches qui les emploient — US2, US3 et US7. Ce fichier porte ce
 * dont US1 a besoin : l'identité des types, leurs variantes, leurs bornes et
 * leurs coûts, sans lesquels FR-019 n'est pas vérifiable.
 */

/** Une fraction en entiers — jamais un flottant (R19). */
export interface Fraction {
  readonly num: number
  readonly den: number
}

export interface Building {
  readonly id: BuildingTypeId
  /**
   * Les empreintes admissibles. Plusieurs pour la mine, une pour les autres :
   * même surface, mêmes chiffres, géométrie différente.
   */
  readonly variants: readonly FootprintId[]
  /** La ressource extraite, ou `null` pour un bâtiment qui n'extrait rien. */
  readonly extracts: ResourceId | null
  /** Le niveau au-delà duquel `max-level-reached` est opposé (FR-040). */
  readonly maxLevel: number
  readonly demolitionSeconds: number
  /** La part remboursée à la démolition (FR-046), en fraction entière. */
  readonly refund: Fraction
  /** Coût par niveau, en grains. Géométrique : une seule troncature (R19). */
  readonly cost: Readonly<Partial<Record<ResourceId, GeometricCurve>>>
  /** Durée de construction par niveau, en secondes. */
  readonly buildDuration: GeometricCurve
}

/** Le facteur de croissance commun : chaque niveau coûte une fois et demie. */
function growing(baseUnits: number): GeometricCurve {
  return { kind: 'geometric', base: baseUnits * GRAINS_PER_UNIT, num: 3, den: 2 }
}

/** Les durées ne sont pas des grains : leur base est en secondes. */
function lengthening(baseSeconds: number): GeometricCurve {
  return { kind: 'geometric', base: baseSeconds, num: 7, den: 5 }
}

/** La moitié, remboursée à la démolition. Énonçable en une phrase (SC-002). */
const HALF: Fraction = { num: 1, den: 2 }

const TYPES = {
  mine: {
    id: 'mine',
    variants: ['square-4', 'l-4', 't-4'],
    extracts: 'camelote',
    maxLevel: 30,
    demolitionSeconds: 300,
    refund: HALF,
    cost: { camelote: growing(100), 'bave-etoiles': growing(20) },
    buildDuration: lengthening(120),
  },
  puits: {
    id: 'puits',
    variants: ['rect-6'],
    extracts: 'jus',
    maxLevel: 30,
    demolitionSeconds: 420,
    refund: HALF,
    cost: { camelote: growing(120), 'bave-etoiles': growing(30) },
    buildDuration: lengthening(150),
  },
  /** L'extracteur de Bave d'étoiles. Nommé le 2026-08-23 (T014). */
  racloir: {
    id: 'racloir',
    variants: ['square-9'],
    extracts: 'bave-etoiles',
    maxLevel: 30,
    demolitionSeconds: 600,
    refund: HALF,
    cost: { camelote: growing(150), 'bave-etoiles': growing(45) },
    buildDuration: lengthening(200),
  },
  /** Le **seul** type qui ne consomme pas d'énergie (R20). */
  centrale: {
    id: 'centrale',
    variants: ['line-2'],
    extracts: null,
    maxLevel: 30,
    demolitionSeconds: 240,
    refund: HALF,
    cost: { camelote: growing(60), 'bave-etoiles': growing(15) },
    buildDuration: lengthening(90),
  },
  /**
   * Relève le plafond des trois ressources. Il consomme de l'énergie sans que
   * sa capacité soit dégradée par le rapport (R21) : sa consommation grossit
   * malgré tout le dénominateur, donc poser un entrepôt sans centrale se paie —
   * simplement, le prix est payé par les extracteurs.
   */
  entrepot: {
    id: 'entrepot',
    variants: ['single'],
    extracts: null,
    maxLevel: 20,
    demolitionSeconds: 180,
    refund: HALF,
    cost: { camelote: growing(80), 'bave-etoiles': growing(25) },
    buildDuration: lengthening(100),
  },
} as const satisfies Record<string, Omit<Building, 'id'> & { id: string }>

export const BUILDINGS: Readonly<Record<BuildingTypeId, Building>> = TYPES

export type BuildingTypeId = keyof typeof TYPES

export const BUILDING_TYPE_IDS = Object.keys(TYPES) as readonly BuildingTypeId[]

/**
 * Les types qui extraient une ressource sous leur empreinte.
 *
 * Dérivé plutôt que listé : ajouter un extracteur au catalogue le fait entrer
 * ici sans qu'on y pense, et une liste oubliée ne peut donc pas mentir.
 */
export const EXTRACTOR_TYPE_IDS = BUILDING_TYPE_IDS.filter(
  (id) => TYPES[id].extracts !== null,
) as readonly BuildingTypeId[]
