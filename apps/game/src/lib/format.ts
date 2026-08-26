import { GRAINS_PER_UNIT } from '@zaliba/domain'

/**
 * Le formatage des grandeurs du jeu, écrit une fois.
 *
 * Trois formats, et chacun répond à une question distincte. Les recopier dans
 * chaque panneau ferait diverger la résolution d'affichage d'un écran à l'autre :
 * le même stock apparaîtrait à deux décimales dans un compteur et arrondi dans un
 * aperçu, et le joueur ne saurait pas lequel croire au moment de payer.
 */

/**
 * La quantité détenue, **au centième d'unité**.
 *
 * Le critère 3 d'US1 exige une progression *continue*. En unités entières, la
 * Camelote change une fois toutes les trois minutes à vingt unités par heure et
 * la Bave d'étoiles toutes les douze : rien ne bouge sous les yeux du joueur.
 * Deux décimales font changer la seconde environ toutes les 1,8 s.
 *
 * **R1 n'est pas touché** : le grain reste l'unité canonique, et le serveur
 * comme le client comptent toujours en entiers. Ce qui augmente ici est la
 * *résolution d'affichage*, pas la précision du modèle.
 *
 * La troncature va vers le bas, comme partout ailleurs. Arrondir au-dessus
 * annoncerait une ressource qu'on n'a pas — et ferait refuser une commande que
 * l'écran venait de présenter comme payable.
 */
const HELD_FORMAT = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatHeld(grains: number): string {
  const hundredths = Math.floor((grains * 100) / GRAINS_PER_UNIT)
  return HELD_FORMAT.format(hundredths / 100)
}

/**
 * Les grandeurs qui ne bougent pas, en unités entières.
 *
 * Un plafond est constant et un coût est fixe : y mettre des décimales n'ajoute
 * que du bruit autour du seul chiffre qui doit attirer l'œil.
 */
const WHOLE_FORMAT = new Intl.NumberFormat('fr-FR')

export function formatUnits(grains: number): string {
  return WHOLE_FORMAT.format(Math.floor(grains / GRAINS_PER_UNIT))
}

/** Un nombre entier en clair — un taux, un compte, une consommation. */
export function formatWhole(value: number): string {
  return WHOLE_FORMAT.format(value)
}

/**
 * Une durée en clair.
 *
 * Arrondie à l'unité **au-dessus** : annoncer « dans 0 heure » quand il reste
 * cinquante minutes serait faux dans le sens qui coûte cher.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3_600) return `${Math.ceil(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.ceil(seconds / 3_600)} h`
  return `${Math.ceil(seconds / 86_400)} j`
}
