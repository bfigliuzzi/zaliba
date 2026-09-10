import type { GongLength } from '@zaliba/catalogs'

/**
 * **La lecture de `GONG_SECONDS`.**
 *
 * Elle vit ici plutôt que dans `main.ts` parce que ce qui doit être éprouvé n'a
 * rien à faire dans un point d'entrée qu'aucun test ne monte — la même raison
 * qui avait fait sortir les routes du point d'entrée en 001.
 *
 * **La forme acceptée est un entier, ou une fraction entière** : `10`, `1/2`,
 * `1/6`. Jamais un flottant. `1.5` rendrait les durées du jeu dépendantes de la
 * représentation binaire d'un nombre, et une durée qui varierait avec l'arrondi
 * de la machine ne serait plus refaisable à la main, ce que SC-003 promet.
 *
 * **Chaque refus nomme la variable et la valeur.** Ce n'est pas de la
 * courtoisie : un serveur qui bat au mauvais rythme est indétectable de
 * l'intérieur, donc le seul moment où l'exploitant peut corriger est celui du
 * démarrage, et le seul endroit où il lit est ce message.
 */

/** Le format attendu, tel qu'on le dit à l'exploitant. */
const EXPECTED =
  `Attendu : un entier de secondes (« 10 »), ou une fraction entière (« 1/2 », « 1/6 »). ` +
  `Jamais un flottant : écrire « 3/2 » plutôt que « 1.5 ». Voir .env.example.`

function refuse(raw: string | undefined, why: string): never {
  const shown = raw === undefined ? '(absente)' : `« ${raw} »`
  throw new Error(`GONG_SECONDS ${shown} : ${why} ${EXPECTED}`)
}

/** Un entier strictement positif, écrit sans signe ni point décimal. */
function positiveInteger(text: string): number | null {
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * La longueur du gong, lue depuis la configuration du serveur.
 *
 * @throws Error si la variable est absente, vide, mal formée, nulle ou négative.
 *   Le refus est un refus de **démarrage** : un repli silencieux sur le gong
 *   canonique masquerait une erreur de configuration au lieu de l'exposer
 *   (FR-007).
 */
export function parseGongSeconds(raw: string | undefined): GongLength {
  if (raw === undefined) {
    refuse(raw, 'la variable est requise et n’a pas été fournie.')
  }

  const text = raw.trim()
  if (text.length === 0) {
    refuse(raw, 'la variable est requise et sa valeur est vide.')
  }

  const parts = text.split('/')
  if (parts.length > 2) {
    refuse(raw, 'une fraction ne porte qu’un seul « / ».')
  }

  const num = positiveInteger((parts[0] ?? '').trim())
  if (num === null) {
    refuse(raw, 'le numérateur n’est pas un entier strictement positif.')
  }

  if (parts.length === 1) {
    return { num, den: 1 }
  }

  const den = positiveInteger((parts[1] ?? '').trim())
  if (den === null) {
    refuse(raw, 'le dénominateur n’est pas un entier strictement positif.')
  }

  return { num, den }
}
