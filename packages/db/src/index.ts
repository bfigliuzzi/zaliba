/**
 * Point d'entrée public de `@zaliba/db`.
 *
 * Le schéma de persistance et ses conversions de frontière. Ce paquet
 * n'importe ni `domain` ni `contracts` : la persistance est une préoccupation
 * d'infrastructure, elle ne porte aucune règle de jeu.
 */
export * from './client.js'
export * from './conversions.js'
export * from './schema.js'
