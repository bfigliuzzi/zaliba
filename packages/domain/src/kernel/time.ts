/**
 * Le modèle de temps (R2).
 *
 * `Instant` est un entier de secondes depuis l'époque, en UTC. Pas de
 * millisecondes : `taux × s` cesserait d'être entier, ce qui détruirait R1 — ou
 * imposerait de redéfinir le grain à un trois-million-six-cent-millième d'unité
 * pour rien. Pas plus grossier : la spécification promet l'exactitude à la
 * seconde.
 *
 * **Aucune fonction de ce module n'appelle l'horloge système.** Il n'y a ni
 * `now()`, ni `today()`, ni valeur par défaut qui en tiendrait lieu. L'instant
 * est toujours un argument explicite, et c'est ce qui rend testable un jeu dont
 * le sujet est le temps. La constitution en fait un invariant d'architecture.
 */

declare const instantBrand: unique symbol
declare const durationBrand: unique symbol

/** Un entier de secondes UTC depuis l'époque. */
export type Instant = number & { readonly [instantBrand]: true }

/** Un entier de secondes. Strictement positif dès qu'il s'agit d'un chantier. */
export type Duration = number & { readonly [durationBrand]: true }

/**
 * Construit un `Instant`.
 *
 * @throws RangeError si la valeur n'est pas un entier ≥ 0. Un instant mal formé
 *   est une erreur de programmation : le laisser passer produirait une quantité
 *   de ressource fausse, très loin d'ici.
 */
export function instant(seconds: number): Instant {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new RangeError(
      `Instant invalide : ${seconds}. Un instant est un entier de secondes UTC ≥ 0.`,
    )
  }
  return seconds as Instant
}

/**
 * Construit une `Duration` de chantier.
 *
 * @throws RangeError si la valeur n'est pas un entier > 0. Zéro est refusé :
 *   un chantier instantané n'est pas un chantier, et l'accepter ferait
 *   coïncider `startedAt` et `dueAt`, donc un segment de longueur nulle.
 */
export function duration(seconds: number): Duration {
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new RangeError(
      `Durée invalide : ${seconds}. Une durée de chantier est un entier de secondes > 0.`,
    )
  }
  return seconds as Duration
}

/**
 * Convertit des millisecondes en `Instant`, **en tronquant vers le bas**.
 *
 * C'est la conversion de frontière de R2 — celle qu'emploie `packages/db` en
 * lisant un `timestamptz`. Tronquer plutôt qu'arrondir garantit qu'un instant
 * ne devance jamais la réalité : une ressource ne peut pas être créditée pour
 * une seconde qui n'a pas eu lieu.
 */
export function instantFromMillis(millis: number): Instant {
  if (!Number.isFinite(millis) || millis < 0) {
    throw new RangeError(`Millisecondes invalides : ${millis}.`)
  }
  return instant(Math.floor(millis / 1000))
}

/** L'instant obtenu en laissant s'écouler `by` depuis `from`. */
export function addDuration(from: Instant, by: Duration): Instant {
  return instant(from + by)
}

/**
 * Le nombre de secondes écoulées de `from` à `to`.
 *
 * @throws RangeError si `to` précède `from`. La projection ne remonte pas le
 *   temps : une demande antérieure à la consolidation est une erreur de
 *   programmation, pas un cas de jeu (data-model § 1.3).
 */
export function secondsBetween(from: Instant, to: Instant): number {
  if (to < from) {
    throw new RangeError(
      `Écart négatif : de ${from} à ${to}. La projection ne remonte pas le temps.`,
    )
  }
  return to - from
}

/** Vrai si `candidate` est à l'échéance ou l'a dépassée à l'instant `at`. */
export function isDue(dueAt: Instant, at: Instant): boolean {
  return dueAt <= at
}

/** Le plus tôt des deux instants. Sert à borner un segment sur une échéance. */
export function earliest(a: Instant, b: Instant): Instant {
  return a <= b ? a : b
}
