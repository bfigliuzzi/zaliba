import type { Curve } from '@zaliba/catalogs'

/**
 * L'évaluation des courbes nommées (R19).
 *
 * Une règle gouverne ce fichier : **une seule troncature, en fin de calcul**.
 * C'est elle qui rend une valeur reproductible à la main, donc publiable — et
 * SC-002 exige qu'un joueur puisse refaire n'importe quel chiffre affiché.
 * `⌊300 × 1,5⁴⌋` s'écrit et se vérifie ; un arrondi appliqué à chaque niveau ne
 * se raconte pas.
 *
 * L'exponentiation passe par `bigint`. Ce n'est pas de la prudence gratuite :
 * `3^29` dépasse déjà 68 millions de milliards, et un `number` y perdrait des
 * bits de poids faible — donc des unités de ressource, silencieusement.
 */

/** Le niveau maximal qu'une courbe accepte d'évaluer. */
const MAX_LEVEL = 1_000

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(
      `Niveau invalide : ${level}. Un niveau est un entier ≥ 1 — ` +
        `une valeur hors de ce domaine est une erreur de programmation, pas un cas de jeu.`,
    )
  }
  if (level > MAX_LEVEL) {
    throw new RangeError(`Niveau ${level} au-delà de la borne de garde (${MAX_LEVEL}).`)
  }
}

/**
 * La valeur d'une courbe au niveau `level`, entière.
 *
 * @throws RangeError si le niveau n'est pas un entier ≥ 1, ou si une table de
 *   `steps` ne va pas jusque-là — un catalogue incomplet doit se voir bruyamment.
 */
export function evaluateCurve(curve: Curve, level: number): number {
  assertLevel(level)

  switch (curve.kind) {
    case 'linear':
      return curve.base + curve.step * (level - 1)

    case 'geometric': {
      if (curve.den === 0) {
        throw new RangeError('Courbe géométrique de dénominateur nul.')
      }
      // Arithmétique entière étendue, et une seule troncature — celle de la
      // division finale. Élever puis diviser, jamais diviser puis élever.
      const exponent = BigInt(level - 1)
      const numerator = BigInt(curve.base) * BigInt(curve.num) ** exponent
      const denominator = BigInt(curve.den) ** exponent
      return Number(numerator / denominator)
    }

    case 'steps': {
      const value = curve.values[level - 1]
      if (value === undefined) {
        throw new RangeError(
          `La table de la courbe s'arrête au niveau ${curve.values.length}, ` +
            `niveau ${level} demandé.`,
        )
      }
      return value
    }
  }
}

/**
 * `Σ(k=1..level)` sur les valeurs **déjà tronquées** de la courbe (R9, R19).
 *
 * C'est cette somme, et non une formule fermée, qui est publiée — parce que
 * c'est celle que le joueur peut refaire. C'est aussi elle qui rend le
 * remboursement d'une démolition **dérivable** plutôt que stocké : une valeur
 * stockée survivrait à un rééquilibrage et deviendrait fausse en silence.
 */
export function cumulativeCost(curve: Curve, level: number): number {
  assertLevel(level)
  let total = 0
  for (let k = 1; k <= level; k += 1) {
    total += evaluateCurve(curve, k)
  }
  return total
}
