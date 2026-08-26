import { type Instant, instant } from './time.js'

/**
 * Les grandeurs de ressource (R1, R4).
 *
 * Une quantité est un **entier de grains**, où `1 grain = 1/3600 unité`. Un
 * taux est un **entier d'unités par heure**. Le choix du diviseur n'est pas
 * arbitraire : il fait tomber la division. Le gain sur `s` secondes vaut
 * `taux × s` grains — un entier, toujours, sans reste à arrondir.
 *
 * C'est de là que vient l'**additivité**, qui est la propriété la plus
 * importante du modèle de temps : consolider deux fois donne exactement le même
 * résultat que consolider une fois. Sans elle, la fortune d'un joueur
 * dépendrait du nombre de fois où il a ouvert le jeu, ce qui est un exploit ou
 * une injustice selon le sens de l'arrondi.
 */

declare const grainsBrand: unique symbol
declare const rateBrand: unique symbol

/** Une quantité, en sous-unités de 1/3600 d'unité. */
export type Grains = number & { readonly [grainsBrand]: true }

/** Un taux de production, en unités par heure. */
export type RatePerHour = number & { readonly [rateBrand]: true }

/**
 * Le nombre de grains dans une unité.
 *
 * Sa valeur est aussi le nombre de secondes dans une heure, et ce n'est pas une
 * coïncidence : c'est précisément ce qui fait qu'un taux d'une unité par heure
 * produit exactement un grain par seconde.
 */
export const GRAINS_PER_UNIT = 3600

/** @throws RangeError si la valeur n'est pas un entier ≥ 0. */
export function grains(value: number): Grains {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Quantité invalide : ${value}. Une quantité est un entier de grains ≥ 0.`)
  }
  return value as Grains
}

/** @throws RangeError si la valeur n'est pas un entier ≥ 0. */
export function ratePerHour(value: number): RatePerHour {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Taux invalide : ${value}. Un taux est un entier d'unités par heure ≥ 0.`)
  }
  return value as RatePerHour
}

/**
 * Le gain brut sur `seconds` secondes, en grains.
 *
 * Aucune division, aucun arrondi : c'est tout l'intérêt du grain.
 */
export function gainOver(rate: RatePerHour, seconds: number): number {
  return rate * seconds
}

/** La partie entière d'unités qu'une quantité représente — ce que le joueur voit. */
export function toDisplayUnits(amount: Grains): number {
  return Math.floor(amount / GRAINS_PER_UNIT)
}

export interface SegmentInput {
  readonly amount: Grains
  readonly lost: Grains
  readonly rate: RatePerHour
  readonly seconds: number
  readonly cap: Grains
}

export interface SegmentResult {
  readonly amount: number
  readonly lost: number
}

/**
 * Fait avancer une ressource d'un segment, plafond compris (R4) :
 *
 * ```
 * brut   = q₀ + r × s
 * q      = min(brut, P)
 * perdu += max(0, brut − P)
 * ```
 *
 * **Le cumul de la perte est ce qui rend l'opération additive.** Le
 * plafonnement seul ne l'est pas : deux segments successifs plafonnés
 * donneraient la même quantité qu'un segment unique, mais on aurait perdu la
 * trace de ce qui a débordé. En cumulant, la somme des pertes de deux segments
 * vaut exactement la perte du segment unique équivalent — et l'état complet
 * `(quantité, perte)` devient une fonction du seul temps écoulé.
 */
export function advanceSegment({ amount, lost, rate, seconds, cap }: SegmentInput): SegmentResult {
  const raw = amount + gainOver(rate, seconds)
  return {
    amount: Math.min(raw, cap),
    lost: lost + Math.max(0, raw - cap),
  }
}

/**
 * L'instant où la ressource atteindra son plafond au rythme courant (FR-027) :
 * `t₀ + ⌈(P − q₀) ÷ r⌉`.
 *
 * Retourne `null` quand la saturation n'arrivera pas — taux nul, ou plafond
 * déjà atteint. Ce `null` est une **information utile, pas un cas d'erreur** :
 * il dit au joueur soit qu'il ne produit rien, soit qu'il perd déjà.
 *
 * L'arrondi va vers le haut parce que la saturation survient à la seconde où
 * elle est atteinte, pas à celle qui la précède.
 */
export function saturationAt(
  from: Instant,
  amount: Grains,
  cap: Grains,
  rate: RatePerHour,
): Instant | null {
  if (rate === 0 || amount >= cap) {
    return null
  }
  return instant(from + Math.ceil((cap - amount) / rate))
}
