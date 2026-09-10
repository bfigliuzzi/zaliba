import { GONG_CANONICAL } from '@zaliba/catalogs'
import { DECLARED_CATALOGS } from '../src/kernel/catalogs.js'
import { resolveCatalogs } from '../src/kernel/gong.js'

/**
 * **Le catalogue du jeu, résolu au gong canonique** — celui que les tests du
 * domaine emploient.
 *
 * Il remplace l'ancien `DEFAULT_CATALOGS`, et le remplacement est *exactement*
 * neutre : au gong canonique de dix secondes, les 240 valeurs résolues sont
 * strictement égales à celles d'avant la tranche 003. Aucune assertion
 * d'équilibrage n'a donc été réécrite dans les tests du domaine — seul l'appel a
 * changé. C'est la conséquence heureuse de G16 : les formes *résolues* gardent
 * les noms et les unités que le domaine lisait déjà.
 *
 * Il vit ici plutôt que dans `src/` parce qu'un catalogue prêt à l'emploi
 * suppose une longueur de gong par défaut, et qu'un défaut silencieux est
 * précisément ce que FR-007 refuse au serveur. Ce qui est un confort légitime
 * en test serait un piège en production.
 *
 * **Un test qui veut éprouver une autre longueur appelle `resolveCatalogs`
 * lui-même** : ce faisceau-ci n'est pas paramétrable, et c'est voulu — il est
 * la référence, pas un utilitaire.
 */
export const CATALOGS = resolveCatalogs(DECLARED_CATALOGS, GONG_CANONICAL)
