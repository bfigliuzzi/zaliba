/**
 * Point d'entrée public de `@zaliba/domain`.
 *
 * Les règles du jeu, en fonctions pures. Ce paquet n'importe que `catalogs` :
 * il se teste sans serveur, sans navigateur et sans base. C'est le principe II
 * rendu physique, et `dependency-cruiser` le vérifie à chaque poussée.
 */
export * from './kernel/curves.js'
