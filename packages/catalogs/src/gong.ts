import type { Fraction } from './buildings.js'

/**
 * Le **gong** : l'unité de temps dans laquelle le catalogue déclare ses durées
 * et ses productions.
 *
 * Le catalogue ne dit plus « cent vingt secondes » mais « douze gongs », et
 * plus « quinze unités par heure » mais « cent cinquante grains par gong ».
 * Chaque serveur déclare la longueur de son gong ; il résout son catalogue une
 * fois au démarrage, puis annonce cette longueur au client dans la réponse qui
 * porte l'état de la planète.
 *
 * Le bénéfice tient en une phrase : durées et production sont couplées **par
 * l'unité elle-même** et ne peuvent plus diverger. Un serveur qui bat deux fois
 * plus vite voit ses chantiers **et** son accumulation de ressources accélérés
 * dans le même rapport — ce qu'un réglage portant sur les seules durées ne
 * ferait pas, et qui laisserait le joueur affamé devant des chantiers instantanés.
 *
 * **Ce module n'est pas fait pour être atteint par le client** : la longueur du
 * gong appartient au serveur, et le client la reçoit au lieu de la deviner
 * (G17). Une porte lexicale de `apps/game/tests/design/` le vérifie.
 */

/**
 * Une longueur de gong, en secondes : une **fraction entière**, jamais un
 * flottant (G3).
 *
 * Écrire `0.5` rendrait la résolution dépendante de la représentation binaire
 * du nombre, et une durée de jeu deviendrait fonction de l'arrondi de la
 * machine plutôt que du catalogue. La forme `{ num, den }` est celle que le
 * dépôt emploie déjà pour le remboursement de démolition.
 */
export type GongLength = Fraction

/**
 * Le gong **canonique** : dix secondes.
 *
 * Ce n'est pas un chiffre rond choisi pour l'être — c'est le plus grand commun
 * diviseur exact des quinze durées que le catalogue déclarait avant 003 (G2).
 * Résolu à cette longueur, le catalogue rend **exactement** les mêmes valeurs
 * qu'avant la tranche, jusqu'à la seconde et sur les 240 chiffres comparables.
 * C'est ce qui permet de changer d'unité sans rien rééquilibrer.
 */
export const GONG_CANONICAL: GongLength = { num: 10, den: 1 }
