import type { Cell } from '@zaliba/domain'

/**
 * Le fantôme de l'empreinte orientée, sous le curseur.
 *
 * **Il vit dans les cases, et non par-dessus.** Un calque positionné en absolu
 * serait plus simple à dessiner et reproduirait le défaut que la constitution
 * proscrit : une surface peinte que ni le clavier ni le lecteur d'écran
 * n'atteignent. Ici, chaque case porte sa propre marque, dans le même document
 * que son rôle et son nom accessible.
 *
 * **FR-012 : jamais la couleur seule.** La validité est portée par une
 * **silhouette** — `visee` ou `refus`, qui se lisent en noir et blanc comme sous
 * n'importe quel filtre — et par la grammaire du nom accessible, qui s'entend. La
 * teinte n'est qu'un troisième signal redondant.
 *
 * *002 a réduit ce fichier à ses deux pièces encore utiles ; le motif est en bas.*
 */

/** L'empreinte armée sous le curseur, telle que l'écran doit la montrer. */
export interface GhostState {
  /** Les cases que l'empreinte orientée occuperait. */
  readonly cells: readonly Cell[]
  readonly valid: boolean
  /** Les cases qui font échouer le placement, énumérées (FR-013). */
  readonly faultyCells: readonly Cell[]
}

/** Ce qu'une case a à montrer du fantôme, ou `null` si elle n'est pas dessous. */
export type GhostMark = 'valid' | 'invalid' | 'faulty'

const key = (cell: Cell): string => `${cell.x},${cell.y}`

/**
 * La marque d'une case.
 *
 * L'ordre est significatif : une case **fautive** l'emporte sur « invalide ».
 * Sans cela, les quatre cases d'un carré porteraient le même signe et le joueur
 * saurait que quelque chose ne va pas sans savoir *où* — ce qui est précisément
 * ce que FR-013 refuse.
 */
export function ghostMarkOf(ghost: GhostState | null, cell: Cell): GhostMark | null {
  if (ghost === null) return null
  if (ghost.faultyCells.some((faulty) => key(faulty) === key(cell))) return 'faulty'
  if (!ghost.cells.some((covered) => key(covered) === key(cell))) return null
  return ghost.valid ? 'valid' : 'invalid'
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce que 002 **retire** de ce fichier, et pourquoi.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **`ghostSuffix` et le composant `FootprintGhost` sont supprimés.** T046
 * demandait de réécrire le composant « pour employer les silhouettes `visee` et
 * `refus` au lieu des caractères, sans changer `ghostMarkOf` ni `ghostSuffix` » ;
 * l'implémentation les rend l'un et l'autre **sans objet**, et les garder aurait
 * coûté plus que leur suppression.
 *
 * `ghostSuffix` rendait `, sous l’empreinte, placement refusé` et
 * `, sous l’empreinte, case fautive`. Le § 2.3 du contrat d'interface prescrit
 * désormais une **grammaire** — `{adresse} : {état}{, gisement}{, sous
 * l’empreinte}{, refusé : raison}` — implémentée une fois dans `describeCell`.
 * Conserver le suffixe aurait laissé **deux** façons de nommer une case visée,
 * dont une que le contrat ne prescrit plus : exactement le « deux tables
 * divergeraient » contre lequel `labels.ts` met en garde, et le lecteur d'écran
 * aurait fini par énoncer une phrase que l'écran n'affiche pas.
 *
 * Le composant, lui, dessinait la marque du fantôme. `appearanceOf` range
 * désormais une case visée dans « visée valide » ou « visée refusée », et la
 * grille en rend la silhouette comme celle de n'importe quel autre état. Un second
 * dessin aurait mis **deux** silhouettes dans la même case.
 *
 * **Ce qui reste, et qui est nécessaire** : `GhostState` et `ghostMarkOf`, qui
 * produisent le crochet `data-ghost` que les parcours de bout en bout de 001
 * lisent, et dont la disparition aurait fait rougir la porte 8 pour une raison
 * sans rapport avec ce qu'elle mesure.
 */
