/**
 * Les sept empreintes du vocabulaire fermé (R6).
 *
 * Une empreinte est un **ensemble d'offsets entiers normalisé** — `min x` et
 * `min y` valent zéro. Ses orientations sont précalculées par application
 * répétée du quart de tour horaire, puis renormalisées et dédoublonnées.
 *
 * **La symétrie n'est jamais implémentée.** FR-011 interdit le retournement, et
 * la façon de le tenir n'est pas d'écrire une garde qui refuserait un miroir :
 * c'est de ne jamais écrire l'opération qui le produirait. Une garde s'oublie
 * dans six mois ; une opération absente ne s'appelle pas.
 *
 * Le dédoublonnage sert directement l'accessibilité : le carré de quatre n'a
 * qu'une orientation, donc la commande de rotation ne change rien, donc un
 * lecteur d'écran n'a rien à annoncer.
 */

export interface Offset {
  readonly x: number
  readonly y: number
}

export interface Footprint {
  readonly id: FootprintId
  /** Les offsets de l'orientation 0, normalisés. */
  readonly cells: readonly Offset[]
  /**
   * Les orientations **distinctes**, dans l'ordre des quarts de tour. Sa
   * longueur va de 1 à 4 : `single`, `square-4` et `square-9` n'en ont qu'une.
   */
  readonly orientations: readonly (readonly Offset[])[]
}

/**
 * Les offsets de l'orientation 0, tels que R6 les publie.
 *
 * La disposition en grille est **le sens de cette donnée** : on doit pouvoir
 * lire la forme dans le code source. Le formateur la mettrait à la verticale,
 * une coordonnée par ligne, et le carré de neuf cesserait de ressembler à un
 * carré. C'est la seule dérogation de format du dépôt, et elle est ici parce
 * que la lisibilité d'un catalogue de formes *est* sa correction.
 */
// biome-ignore format: la mise en grille rend la forme lisible à l'œil nu
const SHAPES = {
  'single':   [[0,0]],
  'line-2':   [[0,0], [1,0]],
  'square-4': [[0,0], [1,0],
               [0,1], [1,1]],
  'l-4':      [[0,0],
               [0,1],
               [0,2], [1,2]],
  't-4':      [[0,0], [1,0], [2,0],
                      [1,1]],
  'rect-6':   [[0,0], [1,0], [2,0],
               [0,1], [1,1], [2,1]],
  'square-9': [[0,0], [1,0], [2,0],
               [0,1], [1,1], [2,1],
               [0,2], [1,2], [2,2]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>

export type FootprintId = keyof typeof SHAPES

export const FOOTPRINT_IDS = Object.keys(SHAPES) as readonly FootprintId[]

/** Cale un ensemble d'offsets sur `min x = min y = 0`. */
function normalize(cells: readonly Offset[]): readonly Offset[] {
  const minX = Math.min(...cells.map((c) => c.x))
  const minY = Math.min(...cells.map((c) => c.y))
  return cells.map((c) => ({ x: c.x - minX, y: c.y - minY }))
}

/**
 * Le quart de tour horaire : `(x, y) → (−y, x)`.
 *
 * C'est la **seule** transformation géométrique du fichier. Il n'y a
 * délibérément aucune fonction de symétrie à côté d'elle.
 */
function rotate(cells: readonly Offset[]): readonly Offset[] {
  return normalize(cells.map((c) => ({ x: -c.y, y: c.x })))
}

/** Signature stable d'un ensemble d'offsets, pour comparer deux orientations. */
function signature(cells: readonly Offset[]): string {
  return cells
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join('|')
}

/** Les orientations distinctes, dans l'ordre des quarts de tour. */
function distinctOrientations(base: readonly Offset[]): readonly (readonly Offset[])[] {
  const found: (readonly Offset[])[] = []
  const seen = new Set<string>()
  let current = base
  for (let quarter = 0; quarter < 4; quarter += 1) {
    const key = signature(current)
    if (!seen.has(key)) {
      seen.add(key)
      found.push(current)
    }
    current = rotate(current)
  }
  return found
}

function build(id: FootprintId): Footprint {
  const cells = normalize(SHAPES[id].map(([x, y]) => ({ x, y })))
  return { id, cells, orientations: distinctOrientations(cells) }
}

export const FOOTPRINTS: Readonly<Record<FootprintId, Footprint>> = Object.fromEntries(
  FOOTPRINT_IDS.map((id) => [id, build(id)]),
) as Readonly<Record<FootprintId, Footprint>>
