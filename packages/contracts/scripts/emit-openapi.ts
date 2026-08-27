import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { openApiDocumentV1 } from './openapi.js'

/**
 * Écrit le document OpenAPI de la version 1 sur le disque.
 *
 * **Publié en artefact de CI, et non servi par l'API** : une route de documentation
 * serait une surface de plus à protéger et à versionner, pour une donnée qui ne change
 * qu'aux déploiements. L'artefact, lui, est attaché à la vérification qui l'a produit
 * — donc daté, tracé et associé au commit exact du contrat qu'il décrit.
 *
 * Le chemin est un argument, avec un défaut : c'est ce qui permet à la CI de le placer
 * où elle veut sans que le script connaisse son arborescence.
 */
const target = resolve(process.argv[2] ?? 'dist/openapi/v1.json')

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, `${JSON.stringify(openApiDocumentV1(), null, 2)}\n`, 'utf8')

process.stdout.write(`Document OpenAPI v1 écrit dans ${target}\n`)
