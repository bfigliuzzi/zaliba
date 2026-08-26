/**
 * Les conversions de frontière de `packages/db`.
 *
 * Ce module est le **seul** endroit où les représentations de la base et celles
 * du domaine se rencontrent. Le rassembler ici n'est pas une commodité de
 * rangement : c'est ce qui permet d'affirmer qu'aucun `bigint` ne se transforme
 * en `number` ailleurs, donc qu'aucune perte de précision ne peut survenir dans
 * un recoin.
 */

/**
 * `2⁵³ − 1` — au-delà, un `number` cesse de représenter fidèlement chaque
 * entier, et `Number(9007199254740993n)` rend `9007199254740992` sans le dire.
 */
const MAX_SAFE_GRAINS = BigInt(Number.MAX_SAFE_INTEGER)

/**
 * Convertit une quantité de grains lue en base.
 *
 * @throws RangeError si la valeur dépasse `2⁵³ − 1`.
 *
 * Aux échelles de 001, cette borne est hors d'atteinte : une planète produisant
 * mille unités par heure sans jamais saturer mettrait plus de deux cent
 * quatre-vingt mille ans à l'approcher. L'assertion ne protège donc pas
 * aujourd'hui — elle protège le jour où un rééquilibrage, un bâtiment nouveau ou
 * une redéfinition du grain à 1/36000 rapprocherait la borne. Sans elle, ce jour
 * se manifesterait par une quantité de ressource silencieusement fausse chez un
 * joueur. Avec elle, il se manifeste par un échec de CI.
 */
export function grainsFromDb(value: bigint): number {
  if (value < 0n) {
    throw new RangeError(`Quantité de grains négative en base : ${value}.`)
  }
  if (value > MAX_SAFE_GRAINS) {
    throw new RangeError(
      `Dépassement de sûreté : ${value} grains excède 2^53 − 1. ` +
        `Un number ne représente plus fidèlement cette valeur ; la convertir ` +
        `perdrait des grains en silence. Redéfinir la représentation avant de continuer.`,
    )
  }
  return Number(value)
}

/** Convertit une quantité de grains vers la représentation de la base. */
export function grainsToDb(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Quantité de grains invalide : ${value}. Attendu un entier sûr ≥ 0.`)
  }
  return BigInt(value)
}

/**
 * Convertit un `timestamptz` lu en base vers un entier de secondes UTC (R2).
 *
 * **Tronque vers le bas**, et n'arrondit jamais : arrondir vers le haut
 * permettrait de créditer une ressource pour une seconde qui n'a pas eu lieu.
 */
export function instantFromDb(value: Date): number {
  const millis = value.getTime()
  if (!Number.isFinite(millis)) {
    throw new RangeError(`Date invalide lue en base : ${String(value)}.`)
  }
  if (millis < 0) {
    throw new RangeError(`Date antérieure à l'époque : ${value.toISOString()}.`)
  }
  return Math.floor(millis / 1000)
}

/** Convertit un entier de secondes UTC vers la représentation de la base. */
export function instantToDb(seconds: number): Date {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new RangeError(`Instant invalide : ${seconds}. Attendu un entier de secondes ≥ 0.`)
  }
  return new Date(seconds * 1000)
}
