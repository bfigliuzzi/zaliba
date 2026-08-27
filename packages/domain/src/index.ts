/**
 * Point d'entrée public de `@zaliba/domain`.
 *
 * Les règles du jeu, en fonctions pures. Ce paquet n'importe que `catalogs` :
 * il se teste sans serveur, sans navigateur et sans base. C'est le principe II
 * rendu physique, et `dependency-cruiser` le vérifie à chaque poussée.
 */
export * from './game.js'
export * from './kernel/breakdown.js'
export * from './kernel/catalogs.js'
export * from './kernel/curves.js'
export * from './kernel/effects.js'
export * from './kernel/energy.js'
export * from './kernel/grid.js'
export * from './kernel/projection.js'
export * from './kernel/rates.js'
export * from './kernel/resources.js'
export * from './kernel/snapshot.js'
export * from './kernel/time.js'
export * from './modules/construction/availability.js'
export * from './modules/construction/build.js'
export * from './modules/construction/clear.js'
export * from './modules/construction/completion.js'
export * from './modules/construction/demolish.js'
export * from './modules/construction/preview.js'
export * from './modules/construction/refusals.js'
export * from './modules/construction/upgrade.js'
