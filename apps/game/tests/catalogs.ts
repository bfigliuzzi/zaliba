import { GONG_CANONICAL } from '@zaliba/catalogs'
import { DECLARED_CATALOGS, resolveCatalogs } from '@zaliba/domain'

/**
 * **Le catalogue du jeu, résolu au gong canonique** — celui que les tests du
 * client emploient.
 *
 * Il remplace l'ancien `CATALOGS`, et le remplacement est *exactement*
 * neutre : au gong canonique de dix secondes, les 240 valeurs résolues sont
 * strictement égales à celles d'avant la tranche 003. Aucune assertion n'a donc
 * été réécrite — seule la source a changé.
 *
 * **Il ne dit rien de ce que le client fait en vrai.** Le client de production
 * n'a aucun gong par-devers lui : il reçoit la longueur du serveur dans
 * l'instantané de planète et résout en un seul endroit, `src/lib/catalogs.ts`.
 * Ce faisceau-ci est un décor de test, et c'est pourquoi il vit dans `tests/` —
 * la porte lexicale de `tests/design/gong-hors-du-client.ts` ne laisserait pas
 * un fichier de `src/` nommer une longueur de gong.
 */
export const CATALOGS = resolveCatalogs(DECLARED_CATALOGS, GONG_CANONICAL)
