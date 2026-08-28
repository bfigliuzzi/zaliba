/**
 * Les sept silhouettes de la Régie (R5, INV-S1 à INV-S4).
 *
 * **C'est le canal qui porte l'accessibilité de la grille.** Les hachures de la
 * version précédente ont été supprimées — elles étaient jugées laides —, et la
 * silhouette les remplace parce qu'elle se lit à quatre pixels de large et sous
 * n'importe quel filtre : niveaux de gris, protanopie, contrastes forcés.
 *
 * **Contrepartie assumée : cinq à sept formes lisibles au maximum.** Au-delà, la
 * reconnaissance à quatre pixels s'effondre — c'est le constat qui a produit la
 * contrainte, et le contourner rendrait SC-003 infranchissable pour de bon. Un
 * huitième état exige donc d'ouvrir un canal de redondance — le mot, la position
 * —, jamais une teinte de plus (INV-S4).
 *
 * **La géométrie vit ici, et c'est voulu.** `tokens.json` la porte comme
 * référence ; ce fichier la rend. Elle n'est pas transcrite dans `tokens.css`
 * parce qu'une forme n'est pas une valeur CSS : c'est ce que déclare la porte de
 * conformité en rangeant `glyphes` parmi les groupes non transcrits.
 *
 * ---
 *
 * **Trois corrections au dossier de design, assumées.**
 *
 * 1. `jus` et `bave` décrivaient leur évidement par **une seconde forme peinte à
 *    la teinte du fond**. En mode contrastes forcés, cette forme hérite d'une
 *    couleur système et **rebouche** l'évidement : le losange barré devient un
 *    losange plein et se confond avec le triangle de l'obstacle. Les deux sont
 *    redessinés en un seul chemin à `fill-rule="evenodd"`, dont le trou est un
 *    vrai trou (R5).
 *
 * 2. `refus` porte **le même défaut**, que R5 ne relève pas : sa croix y est
 *    tracée en `stroke="[papier]"`, donc à la teinte du fond. Elle devient ici un
 *    **trou en forme de croix** dans le disque — douze sommets, contour d'union
 *    des deux barres, calculé et non approché. Le constat est consigné en
 *    `specs/002-la-regie-approximative/verdicts.md`.
 *
 * 3. `pose_valide` était tracée au **contour** (`fill="none"`,
 *    `stroke="currentColor"`, épaisseur 4). INV-S1 exige `fill="currentColor"`
 *    sur chaque forme, sans exception ; la croix devient donc une forme
 *    **pleine** d'épaisseur 4. L'apparence est celle du dossier — une croix, trait
 *    4 —, et le composant n'a plus de cas particulier à porter.
 *
 * Les noms `relief` et `pose_valide` du dossier deviennent `obstacle` et `visee`,
 * qui sont ceux de R5 et du modèle : le vocabulaire du code suit celui de la
 * spécification, pas celui du prototype.
 */

/** Le vocabulaire **fermé**. Sept entrées, et la porte le vérifie (INV-S4). */
export const SILHOUETTES = [
  'camelote',
  'jus',
  'bave',
  'chantier',
  'obstacle',
  'visee',
  'refus',
] as const

export type Silhouette = (typeof SILHOUETTES)[number]

/** Le style de trait — un **modificateur**, il ne consomme pas de silhouette. */
export type Trait = 'plein' | 'evide'

/**
 * Le viewBox du dossier (`tokens.json → glyphes.$viewBox`).
 *
 * Toutes les formes y sont exprimées, ce qui rend la silhouette indépendante de
 * sa taille rendue : c'est `parcelle.css` qui la dimensionne, en `cqmin`, et donc
 * proportionnellement à sa case (R8).
 */
const VUE = '0 0 24 24'

/**
 * L'épaisseur du contour d'une silhouette évidée, **en unités de viewBox**.
 *
 * Elle vit ici et non dans `tokens.css` pour la même raison que les coordonnées
 * des chemins : c'est de la géométrie dans l'espace du dessin, pas une longueur
 * CSS. L'y ranger la ferait passer pour un pixel, ce qu'elle n'est pas — elle
 * grandit et rétrécit avec la silhouette.
 */
const TRAIT_EVIDE = 2

/**
 * Les sept tracés.
 *
 * `fill-rule="evenodd"` sur les sept, uniformément : sur les formes sans
 * évidement, deux sous-chemins disjoints se remplissent tous deux sous l'une ou
 * l'autre règle, donc l'uniformité ne coûte rien — et elle évite qu'un évidement
 * ajouté un jour à une forme existante n'oublie sa règle.
 */
const TRACES: Readonly<Record<Silhouette, string>> = {
  // Triangle sur socle. Deux sous-chemins disjoints, tous deux pleins.
  camelote: 'M12 3 L21 19.5 H3 Z M2.5 20.5 H21.5 V22.9 H2.5 Z',

  // Losange barré : le contour, puis la barre **en trou**.
  jus: 'M12 2 L21.5 12 L12 22 L2.5 12 Z M10.7 6.5 H13.3 V17.5 H10.7 Z',

  // Disque évidé : deux cercles concentriques, le second en trou.
  bave:
    'M2 12 A10 10 0 1 0 22 12 A10 10 0 1 0 2 12 Z ' + 'M8 12 A4 4 0 1 0 16 12 A4 4 0 1 0 8 12 Z',

  // Sablier.
  chantier: 'M5 3 H19 L13 12 L19 21 H5 L11 12 Z',

  // Triangle plein.
  obstacle: 'M12 4 L22 20 H2 Z',

  // Croix pleine, épaisseur 4, bras de 3 à 21.
  visee: 'M10 3 H14 V10 H21 V14 H14 V21 H10 V14 H3 V10 H10 Z',

  // Disque barré : le disque, puis la croix **en trou**. Les douze sommets sont
  // le contour d'union de deux barres d'épaisseur 3 sur les diagonales, bras à
  // 5,5 unités du centre — la boîte de la croix reste à 7,92 du centre, donc bien
  // à l'intérieur du disque de rayon 10,5.
  refus:
    'M1.5 12 A10.5 10.5 0 1 0 22.5 12 A10.5 10.5 0 1 0 1.5 12 Z ' +
    'M18.56 16.44 L16.44 18.56 L12 14.12 L7.56 18.56 L5.44 16.44 L9.88 12 ' +
    'L5.44 7.56 L7.56 5.44 L12 9.88 L16.44 5.44 L18.56 7.56 L14.12 12 Z',
}

export interface GlypheProps {
  readonly nom: Silhouette
  /**
   * La taille, **en `em`** — donc relative au texte du contexte.
   *
   * Omise, la silhouette remplit sa boîte (`100%`), ce qui est le cas de la
   * grille : c'est la case qui la dimensionne, en `cqmin`, et la proportion de
   * FR-015 est alors vraie par construction à toute largeur (R8). La taille
   * explicite sert la légende et les compteurs, où la silhouette accompagne un
   * texte et doit grandir avec lui.
   */
  readonly taille?: number
  readonly trait?: Trait
}

export function Glyphe({ nom, taille, trait = 'plein' }: GlypheProps) {
  const cote = taille === undefined ? '100%' : `${taille}em`
  const evide = trait === 'evide'

  return (
    /*
      `aria-hidden` sans exception : la silhouette **double** le nom accessible de
      sa case, elle ne le remplace pas. Le lire ferait de la navigation au lecteur
      d'écran une répétition — et l'information qu'elle porte est déjà dans le nom
      accessible, où elle est plus précise.
    */
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={VUE}
      width={cote}
      height={cote}
      data-silhouette={nom}
      data-trait={trait}
    >
      <path
        d={TRACES[nom]}
        fillRule="evenodd"
        fill={evide ? 'none' : 'currentColor'}
        {...(evide ? { stroke: 'currentColor', strokeWidth: TRAIT_EVIDE } : {})}
      />
    </svg>
  )
}
