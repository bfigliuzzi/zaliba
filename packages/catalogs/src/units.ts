/**
 * Le grain : l'unité dans laquelle **toutes** les quantités du catalogue sont
 * libellées (R1).
 *
 * Une unité affichée vaut 3600 grains. Le choix n'est pas arbitraire : il rend
 * un taux de « une unité par heure » exactement égal à **un grain par seconde**,
 * donc exprimable sans division dans un jeu dont toutes les durées sont des
 * secondes entières. C'est ce qui permet à la projection de n'employer que de
 * l'arithmétique entière, et donc de donner le même résultat au client et au
 * serveur, à la seconde près et sans dérive de flottant.
 *
 * La constante vit ici plutôt que dans `domain` parce que `catalogs` n'importe
 * rien — c'est la feuille du graphe de dépendances. `domain` la redéclare et un
 * test tient les deux valeurs ensemble.
 */
export const GRAINS_PER_UNIT = 3600
