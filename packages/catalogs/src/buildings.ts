import type { GeometricCurve, LinearCurve } from './curves.js'
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
 * La courbe de **capacité** de l'entrepôt est arrivée avec US7, la tranche qui la
 * consomme. Elle n'était pas là avant, et c'était voulu : une donnée d'équilibrage
 * qu'aucun test ne tient est une valeur qui dérive en silence.
 *
 * **Les deux colonnes d'énergie sont exclusives** : la centrale produit et ne
 * consomme pas, tout le reste consomme et ne produit pas (FR-022, R20). Aucun
 * type ne remplit les deux, aucun n'en laisse deux vides.
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
  /**
   * Production **par gisement recouvert**, en unités par heure, ou `null` pour
   * un type qui n'extrait rien.
   *
   * « Par gisement recouvert » est la moitié de la règle de R5 :
   * `taux nominal = courbeProduction(niveau) × gisements`. La formuler ainsi
   * dans la donnée plutôt que comme un total évite la seule confusion possible —
   * un extracteur qui ne recouvre rien produit **zéro**, et non la valeur de
   * base de son type (I-12, FR-017).
   */
  readonly production: GeometricCurve | null
  /**
   * Consommation d'énergie par niveau, ou `null` pour la **centrale**, seul type
   * qui n'en consomme pas (FR-022, R20).
   *
   * Linéaire, et non géométrique : le déficit doit rester lisible. Une
   * consommation qui croîtrait comme les coûts rendrait le rapport d'énergie
   * imprévisible d'un niveau à l'autre, alors que SC-002 promet au joueur de
   * pouvoir refaire le calcul à la main.
   */
  readonly energyConsumption: LinearCurve | null
  /**
   * Énergie **produite** par niveau, ou `null` pour tout type qui n'en produit
   * pas. La centrale est le seul à porter cette courbe (FR-022, R20).
   *
   * Linéaire elle aussi, et par la même raison : les deux plateaux du rapport
   * doivent croître de façon comparable, sans quoi le déficit serait une falaise
   * qu'aucun niveau n'annonce. Un joueur qui monte sa centrale d'un niveau doit
   * pouvoir dire, de tête, combien d'extracteurs cela lui achète.
   *
   * Les deux courbes sont **exclusives** : un type qui produit ne consomme pas,
   * et réciproquement. La règle est tenue par un test de cohérence du catalogue
   * plutôt que par la forme du type — l'exprimer en TypeScript demanderait une
   * union discriminée qui compliquerait tous les autres champs pour une seule
   * ligne de garantie.
   */
  readonly energyProduction: LinearCurve | null
  /**
   * Capacité de stockage ajoutée par niveau, en **grains**, ou `null` pour tout
   * type qui ne stocke rien (FR-025).
   *
   * **Un seul nombre pour les trois ressources**, et c'est la spécification qui le
   * tranche : un entrepôt d'un type unique plutôt que trois entrepôts spécialisés.
   * La conséquence est voulue — la Bave d'étoiles, dont la base est la plus faible,
   * progresse relativement plus vite. Un joueur peut le calculer, et c'est tout ce
   * qu'on lui demande de pouvoir faire (SC-002).
   *
   * Géométrique en `3/2`, **comme les coûts** : payer une fois et demie pour stocker
   * une fois et demie de plus est une progression neutre, donc lisible. Un facteur
   * plus doux ferait de l'entrepôt un mauvais investissement à haut niveau sans que
   * rien ne l'annonce ; un facteur plus raide en ferait le seul achat rationnel.
   *
   * La capacité n'est **jamais** dégradée par le déficit d'énergie (FR-023b, R21),
   * et cela ne se lit pas ici : c'est `storageCaps` qui ne reçoit pas le rapport.
   * Ce qu'on ne reçoit pas, on ne peut pas l'appliquer par mégarde.
   */
  readonly capacity: GeometricCurve | null
}

/** Le facteur de croissance commun : chaque niveau coûte une fois et demie. */
function growing(baseUnits: number): GeometricCurve {
  return { kind: 'geometric', base: baseUnits * GRAINS_PER_UNIT, num: 3, den: 2 }
}

/** Les durées ne sont pas des grains : leur base est en secondes. */
function lengthening(baseSeconds: number): GeometricCurve {
  return { kind: 'geometric', base: baseSeconds, num: 7, den: 5 }
}

/**
 * La production, en **unités par heure** — pas en grains.
 *
 * L'unité est dans le commentaire parce que la confusion est facile et
 * silencieuse : un taux se multiplie par des secondes pour donner des grains
 * (une unité par heure vaut exactement un grain par seconde), tandis qu'un coût
 * est déjà en grains. Les deux sont des entiers, et rien dans le type ne les
 * distingue.
 *
 * Le facteur `11/10` est plus doux que le `3/2` des coûts, et c'est le cœur de
 * l'équilibrage : améliorer coûte une fois et demie pour rendre un dixième de
 * plus. Le joueur qui veut produire davantage a donc deux voies — monter un
 * niveau, ou trouver un second gisement — et la seconde est de la géométrie, pas
 * de la dépense. C'est ce qui fait de la grille une décision.
 */
function yielding(baseUnitsPerHour: number): GeometricCurve {
  return { kind: 'geometric', base: baseUnitsPerHour, num: 11, den: 10 }
}

/** La consommation d'énergie : une base, et un pas par niveau. */
function drawing(base: number, step: number): LinearCurve {
  return { kind: 'linear', base, step }
}

/**
 * La production d'énergie de la centrale, de même forme que la consommation.
 *
 * Le choix des valeurs porte l'équilibrage de la tranche : avec les vingt de
 * base du Berceau, une centrale de niveau 1 alimente **un de chaque type**
 * d'extracteur et l'entrepôt. La tension revient avec les niveaux — la
 * consommation d'un racloir croît de sept par niveau, la production d'une
 * centrale de quinze —, donc monter ses extracteurs finit toujours par exiger de
 * monter sa centrale. C'est la boucle que US3 doit rendre lisible, pas subie.
 */
function producing(base: number, step: number): LinearCurve {
  return { kind: 'linear', base, step }
}

/**
 * La capacité, en **grains** — comme les coûts, et non comme les taux.
 *
 * L'unité est dans le nom parce que la confusion est facile et silencieuse : un
 * plafond se compare à une quantité, donc il est en grains ; un taux se multiplie
 * par des secondes. Les deux sont des entiers, et rien dans le type ne les
 * distingue.
 */
function holding(baseUnits: number): GeometricCurve {
  return { kind: 'geometric', base: baseUnits * GRAINS_PER_UNIT, num: 3, den: 2 }
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
    production: yielding(15),
    energyConsumption: drawing(8, 4),
    energyProduction: null,
    capacity: null,
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
    production: yielding(8),
    energyConsumption: drawing(10, 5),
    energyProduction: null,
    capacity: null,
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
    production: yielding(4),
    energyConsumption: drawing(14, 7),
    energyProduction: null,
    capacity: null,
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
    production: null,
    // Le seul `null` de cette colonne, et c'est une exigence (FR-022, R20).
    energyConsumption: null,
    // Et le seul type qui produise. Les deux `null` se répondent : la colonne
    // qu'un type ne remplit pas est celle que l'autre remplit.
    energyProduction: producing(30, 15),
    capacity: null,
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
    production: null,
    // L'entrepôt consomme, lui aussi : c'est ce qui fait que le poser sans
    // centrale se paie — le prix étant payé par les extracteurs (R21).
    energyConsumption: drawing(2, 1),
    energyProduction: null,
    /**
     * **Deux mille unités au niveau 1**, sur une base de cinq mille pour la Camelote
     * et de deux mille pour la Bave d'étoiles.
     *
     * Le choix porte l'équilibrage de la tranche : un premier entrepôt relève la
     * Camelote de deux cinquièmes et **double** la Bave d'étoiles — donc il vaut la
     * peine tout de suite, sans être indispensable. La saturation reste ce qui
     * pousse à en poser, pas une falaise qui l'exige.
     */
    capacity: holding(2_000),
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
