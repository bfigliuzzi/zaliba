/**
 * Le vocabulaire fermé de courbes nommées (R19).
 *
 * Ce fichier **déclare** et n'évalue rien. La couture est placée là par un
 * critère de fréquence (doc de stack § 5.1) : ajouter un bâtiment est fréquent,
 * donc c'est une donnée ; ajouter une *forme* de courbe est rare, donc c'est du
 * code délibéré dans `domain`. Trois formes couvrent tout ce dont 001 a besoin.
 *
 * L'alternative — un champ de formule interprété dans le catalogue — est écartée
 * nommément : ce serait un langage de script, donc une surface d'attaque et un
 * cauchemar de mise au point.
 */

/** `base + step × (n − 1)`. Consommation d'énergie, durées plates. */
export interface LinearCurve {
  readonly kind: 'linear'
  readonly base: number
  readonly step: number
}

/**
 * `⌊ base × num^(n−1) ÷ den^(n−1) ⌋`. Coûts, productions, capacités.
 *
 * Le ratio est déclaré en **fraction entière** et non en flottant : c'est ce qui
 * permet à l'évaluation de n'opérer qu'une seule troncature, à la toute fin.
 * Écrire `1.5` ici rendrait la valeur du niveau 30 dépendante de la
 * représentation binaire du nombre.
 */
export interface GeometricCurve {
  readonly kind: 'geometric'
  readonly base: number
  readonly num: number
  readonly den: number
}

/** `vₙ`, table explicite. Pour les valeurs qu'aucune formule ne décrit bien. */
export interface StepsCurve {
  readonly kind: 'steps'
  readonly values: readonly number[]
}

export type Curve = LinearCurve | GeometricCurve | StepsCurve

export type CurveId = Curve['kind']

/**
 * Le vocabulaire, énuméré. Il sert au contrôle de fermeture : un catalogue ne
 * peut porter une forme que cette liste ne nomme pas.
 */
export const CURVE_KINDS = ['linear', 'geometric', 'steps'] as const satisfies readonly CurveId[]
