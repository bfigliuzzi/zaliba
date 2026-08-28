/**
 * Les quatre familles de la Régie, **servies par l'application elle-même**.
 *
 * FR-004 interdit toute requête vers un domaine tiers, et le dossier de design
 * le sait : il charge ses polices depuis Google Fonts en prototypage et marque
 * lui-même cette voie comme inacceptable ici. Les paquets `@fontsource/*`
 * distribuent les `woff2` ; Vite les émet dans le paquet compilé et réécrit les
 * `@font-face` en chemins relatifs, sans une ligne de configuration (R4).
 *
 * **Une graisse par import, et seulement celles qui servent.** Le point d'entrée
 * `@fontsource/archivo` charge les neuf graisses de la famille, soit neuf
 * fichiers dont cinq ne sont jamais employés : l'écran paierait quatre requêtes
 * et quatre-vingts kilooctets pour du poids mort. Les sous-chemins `latin-NNN`
 * chargent le **sous-ensemble latin** d'une seule graisse, ce qui est exactement
 * ce que R4 énumère.
 *
 * **Aucun `@font-face` n'est écrit à la main ici.** Les piles de repli, elles,
 * vivent dans `tokens.css` : le cas limite « les polices ne se chargent pas »
 * est nommé par la spécification, et une famille sans repli s'y disloque.
 *
 * ---
 *
 * **Archivo Narrow s'arrête à 700, et le dossier en demande 800.**
 *
 * L'axe de graisse de cette famille ne va pas au-delà de 700 — ce n'est pas une
 * lacune du paquet, c'est la police. Le dossier prescrit pourtant 800 pour le
 * niveau d'un bâtiment dans sa case (`README.md` § *La grille*, et
 * `tokens.json → police.etroit.graisses`).
 *
 * La graisse est donc **plafonnée à 700**. Déclarer 800 sans fichier ne produit
 * pas une erreur mais une graisse **synthétique** : le navigateur épaissit le
 * 700 de lui-même, et livre un rendu que le dossier n'a jamais mesuré, obtenu en
 * silence. L'écart est consigné en [verdicts.md § T004](../../../../specs/002-la-regie-approximative/verdicts.md)
 * au titre de FR-001a, plutôt qu'appliqué sans trace.
 */

// Archivo — l'interface. 400, 500, 600, 700, 800 (R4).
import '@fontsource/archivo/latin-400.css'
import '@fontsource/archivo/latin-500.css'
import '@fontsource/archivo/latin-600.css'
import '@fontsource/archivo/latin-700.css'
import '@fontsource/archivo/latin-800.css'

// Archivo Narrow — les niveaux dans les cases, les titres serrés. 400 à 700 :
// la 800 que R4 nomme n'existe pas dans la famille (voir l'en-tête).
import '@fontsource/archivo-narrow/latin-400.css'
import '@fontsource/archivo-narrow/latin-500.css'
import '@fontsource/archivo-narrow/latin-600.css'
import '@fontsource/archivo-narrow/latin-700.css'

// JetBrains Mono — tout chiffre, en chasse fixe tabulaire (FR-002). 400, 500, 700.
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'

// Saira Stencil One — le pochoir : nom de planète, gros boutons, tampons. 400
// seule, la famille n'en a pas d'autre.
import '@fontsource/saira-stencil-one/latin-400.css'
