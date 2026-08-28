/**
 * L'adresse courte d'une case, **recomposée** par le parcours (FR-016, R7).
 *
 * Elle duplique délibérément la règle de `src/lib/labels.ts` au lieu de
 * l'importer. Un parcours de bout en bout qui appellerait la fonction sous test
 * ne pourrait plus rien dire de son format : il affirmerait que le code est égal
 * à lui-même. Ici, la forme est écrite une seconde fois, et un changement de
 * convention fait rougir la porte 8 — ce qui est le but.
 *
 * Les vingt-six lettres suffisent : aucun archétype annoncé ne dépasse dix
 * colonnes, et au-delà la fonction de production **lève** plutôt que d'inventer
 * `AA1` (INV-A3).
 */
export function adresse(x: number, y: number): string {
  return `${String.fromCharCode(65 + x)}${y + 1}`
}
