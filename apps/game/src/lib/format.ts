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

/**
 * Le temps restant d'un chantier, au format **`HH:MM:SS`** (FR-009, FR-002).
 *
 * Le format complet plutôt que `formatDuration` — qui rendrait « 5 h » —, et ce
 * n'est pas une préférence : le chrono est la **seule** grandeur de l'écran qui
 * bouge à la seconde, et l'arrondir à l'heure la rendrait immobile. Un joueur qui
 * revient sur son écran doit voir que le temps passe, sans quoi rien ne distingue
 * un chantier en cours d'un affichage figé.
 *
 * **Les deux chiffres de tête ne sont pas plafonnés à 24.** Ce sont des heures
 * cumulées, pas une heure du jour : un chantier de trois jours affiche `72:00:00`,
 * qui se lit, là où `00:00:00` mentirait. Et les heures dépassent deux chiffres
 * plutôt que d'être tronquées.
 *
 * Rendu en chasse fixe tabulaire par la classe `.chiffre` du composant : sans
 * elle, les deux-points sautilleraient à chaque seconde.
 */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const deuxChiffres = (valeur: number): string => String(valeur).padStart(2, '0')

  return [
    deuxChiffres(Math.floor(total / 3_600)),
    deuxChiffres(Math.floor((total % 3_600) / 60)),
    deuxChiffres(total % 60),
  ].join(':')
}

/**
 * Une durée **écoulée** en clair — « depuis combien de temps » (US1/AC5).
 *
 * Elle tronque vers le bas, à l'inverse de `formatDuration`, et ce n'est pas une
 * incohérence : les deux arrondissent dans le sens qui ne trompe pas. Un temps
 * *restant* arrondi au-dessous annoncerait « dans 0 heure » alors qu'il reste
 * cinquante minutes, ce qui coûte cher. Un temps *écoulé* arrondi au-dessus
 * dirait « saturée depuis 4 j » quand il y en a trois et demi, c'est-à-dire
 * accuserait le joueur d'une négligence plus longue que la vraie.
 *
 * Le plancher est nommé plutôt que chiffré : « depuis 0 s » se lit comme une
 * panne d'affichage, « depuis moins d'une minute » se lit comme un fait.
 */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return 'moins d’une minute'
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} h`
  return `${Math.floor(seconds / 86_400)} j`
}
