/**
 * Point d'entrée public de `@zaliba/contracts`.
 *
 * Les schémas Zod et les routes versionnées. Ce paquet **n'importe pas
 * `domain`** : les notions y sont redéclarées, et la duplication est
 * volontaire. Sans elle, une refactorisation interne changerait silencieusement
 * le format transmis et casserait les clients anciens sans qu'aucune
 * compilation n'échoue.
 */

export * from './v1/errors.js'
export * from './v1/planet.js'
