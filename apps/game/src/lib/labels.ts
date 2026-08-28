import type {
  ArchetypeId,
  BuildingTypeId,
  FootprintId,
  ObstacleId,
  ResourceId,
} from '@zaliba/catalogs'
import type { CellView } from '@zaliba/domain'

/**
 * Le vocabulaire que le joueur lit.
 *
 * Les identifiants de contenu de jeu sont en kebab-case français (R18) : ce sont
 * des clés, pas des phrases. `square-4` se déchiffre, « carré de quatre » se dit
 * — et ce fichier est la **seule** table de correspondance entre les deux.
 *
 * Une seule table, et non une par composant : la grille, le panneau de
 * construction et la région d'annonce nomment forcément les mêmes choses. Deux
 * tables divergeraient, et le lecteur d'écran finirait par énoncer un nom que
 * l'écran n'affiche pas — c'est-à-dire par décrire un autre jeu.
 *
 * **002 n'en remplace aucune** (FR-040). La Régie ajoute un registre lexical :
 * l'adresse courte, le genre grammatical qui accorde les articles, et la
 * grammaire du nom accessible d'une case. Les cinq tables ci-dessous sont celles
 * de 001, au mot près.
 */

export const RESOURCE_LABELS: Readonly<Record<ResourceId, string>> = {
  camelote: 'Camelote',
  jus: 'Jus',
  'bave-etoiles': 'Bave d’étoiles',
}

/**
 * Les gisements, nommés par le **vocabulaire du jeu** et non par leur ressource.
 *
 * « Veine », « geyser », « récif » : ce sont les mots du document de conception
 * § 1, et ils ne sont pas de la décoration. Un joueur qui lit « geyser de Jus »
 * apprend que ce gisement se nomme, donc qu'il existe un vocabulaire à connaître ;
 * « gisement de Jus » lui aurait fait croire à une catégorie interchangeable.
 * L'aperçu du déblaiement en dépend directement — il annonce ce que le joueur
 * achète —, et la grille emploie les mêmes mots pour que ce soit le même jeu des
 * deux côtés.
 */
export const DEPOSIT_LABELS: Readonly<Record<ResourceId, string>> = {
  camelote: 'veine de Camelote',
  jus: 'geyser de Jus',
  'bave-etoiles': 'récif de Bave d’étoiles',
}

export const OBSTACLE_LABELS: Readonly<Record<ObstacleId, string>> = {
  eboulis: 'éboulis',
  rocher: 'rocher',
  'filon-enfoui': 'filon enfoui',
  'poche-scellee': 'poche scellée',
  'croute-calcifiee': 'croûte calcifiée',
}

export const BUILDING_LABELS: Readonly<Record<BuildingTypeId, string>> = {
  mine: 'Mine',
  puits: 'Puits',
  racloir: 'Racloir',
  centrale: 'Centrale',
  entrepot: 'Entrepôt',
}

/**
 * Les sept empreintes, nommées par leur **forme** et non par leur taille seule.
 *
 * « L de quatre » plutôt que « L » : le nombre de cases est ce qui décide si une
 * empreinte tient dans un espace, et le joueur doit l'entendre sans avoir à
 * compter les cases d'un fantôme.
 */
export const FOOTPRINT_LABELS: Readonly<Record<FootprintId, string>> = {
  single: 'Une case',
  'line-2': 'Deux en ligne',
  'square-4': 'Carré de quatre',
  'l-4': 'L de quatre',
  't-4': 'T de quatre',
  'rect-6': 'Rectangle de six',
  'square-9': 'Carré de neuf',
}

/**
 * Le nom d'un archétype de planète.
 *
 * **Une table de plus, ajoutée par 002**, et le motif est FR-008 : tant que la
 * planète n'a pas de nom propre, c'est le nom de son archétype qui porte son
 * identité dans la plaque d'en-tête. `packages/catalogs` ne porte aucun libellé
 * d'affichage — il porte des identifiants —, et ce fichier est le seul endroit du
 * dépôt où un identifiant devient une phrase.
 *
 * 001 affichait « Ma planète », qui ne disait pas *où* le joueur se trouvait :
 * c'est-à-dire la première des quatre choses que l'écran doit dire en une seconde.
 */
export const ARCHETYPE_LABELS: Readonly<Record<ArchetypeId, string>> = {
  berceau: 'Berceau',
}

/* ── Le genre grammatical ──────────────────────────────────────────────────── */

/**
 * Le genre des noms du jeu — **une table de plus, jamais une modification**.
 *
 * FR-040 interdit de toucher aux cinq tables ci-dessus, et le contrat d'interface
 * exige pourtant « occupée par **une** Mine niveau 2 » et « occupée par **un**
 * Puits niveau 1 » : deux exemples normatifs qu'un article unique ne peut pas
 * produire. Le genre est donc porté à côté du libellé.
 *
 * Il sert aussi l'accord du participe — « veine de Camelote exploitée » contre
 * « geyser de Jus exploité » —, que le contrat n'illustre que sur la Camelote et
 * qui serait faux sur les deux autres ressources.
 */
export type Genre = 'm' | 'f'

export const BUILDING_GENRE: Readonly<Record<BuildingTypeId, Genre>> = {
  mine: 'f',
  puits: 'm',
  racloir: 'm',
  centrale: 'f',
  entrepot: 'm',
}

export const DEPOSIT_GENRE: Readonly<Record<ResourceId, Genre>> = {
  camelote: 'f',
  jus: 'm',
  'bave-etoiles': 'm',
}

export const OBSTACLE_GENRE: Readonly<Record<ObstacleId, Genre>> = {
  eboulis: 'm',
  rocher: 'm',
  'filon-enfoui': 'm',
  'poche-scellee': 'f',
  'croute-calcifiee': 'f',
}

export const articleIndefini = (genre: Genre): string => (genre === 'f' ? 'une' : 'un')
export const articleDefini = (genre: Genre): string => (genre === 'f' ? 'la' : 'le')

/** L'accord d'un participe passé, pour « exploité » et « exploitée ». */
const accorde = (mot: string, genre: Genre): string => (genre === 'f' ? `${mot}e` : mot)

/* ── L'adresse courte ──────────────────────────────────────────────────────── */

export type Adresse = string

/** Vingt-six lettres, et pas de vingt-septième colonne (INV-A3). */
const COLONNES_NOMMABLES = 26

/**
 * L'adresse d'une case : **la lettre de sa colonne, puis le numéro de sa
 * rangée**, tous deux en base 1 (FR-016, R7).
 *
 * `A1` en haut à gauche, `F6` en bas à droite sur le Berceau.
 *
 * **C'est un besoin fonctionnel, pas une décoration.** Les joueurs s'échangent
 * des plans à l'oral, et « C3 » se dit en une syllabe là où « colonne trois,
 * rangée trois » en prend sept. La conséquence est que l'adresse doit être **la
 * même partout** — nom accessible de la case, annonce de curseur, motif de refus,
 * cible d'un chantier —, sans quoi le joueur apprend deux systèmes. Une seule
 * fonction la produit, et c'est celle-ci (INV-A1).
 *
 * **Au-delà de vingt-six colonnes, elle lève.** Aucun archétype annoncé n'y
 * arrive — ils vont du 3 × 10 au 8 × 4. Produire `AA1` sans que la conception
 * l'ait tranché serait inventer une convention, et une convention inventée dans
 * une fonction d'affichage est celle que personne ne retrouve. Une planète à
 * vingt-sept colonnes est un changement de conception, pas un cas limite
 * d'affichage.
 */
export function adresseOf(cell: { readonly x: number; readonly y: number }): Adresse {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    throw new Error(`Adresse non entière : (${cell.x}, ${cell.y}).`)
  }
  if (cell.x < 0 || cell.y < 0) {
    throw new Error(`Adresse hors parcelle : (${cell.x}, ${cell.y}).`)
  }
  if (cell.x >= COLONNES_NOMMABLES) {
    throw new Error(
      `La colonne ${cell.x + 1} dépasse les vingt-six colonnes nommables. ` +
        'Une parcelle plus large est un changement de conception (R7), pas un cas ' +
        'limite d’affichage : la convention au-delà de Z reste à trancher.',
    )
  }
  return `${String.fromCharCode(65 + cell.x)}${cell.y + 1}`
}

/**
 * La position d'une case, telle que les appelants de 001 la demandent.
 *
 * **C'est `adresseOf`**, sous le nom que six fichiers du client emploient déjà.
 * Elle rendait « Colonne 4, rangée 1 » ; elle rend « D1 ». Les appelants n'ont pas
 * à changer — leurs *attentes*, si, et c'est ce que la tranche a fait.
 *
 * Deux noms pour une fonction, et non deux fonctions : INV-A1 exige que l'adresse
 * soit produite d'un seul endroit, et c'est le cas.
 */
export const describePosition = adresseOf

/* ── La grammaire du nom accessible d'une case ─────────────────────────────── */

/**
 * Ce que la case ne sait pas d'elle-même.
 *
 * `CellView` porte son état, son obstacle et son gisement. Elle ignore quel
 * bâtiment la recouvre, si ce bâtiment exploite le gisement qui est dessous, ce
 * que son obstacle libérerait, si elle est sous l'empreinte armée et pourquoi
 * cette empreinte est refusée. Ces cinq faits viennent d'ailleurs — de la
 * projection, du catalogue et de l'interaction en cours —, et c'est
 * `appearanceOf` qui les rassemble.
 *
 * Les recevoir en argument plutôt que d'aller les chercher est ce qui garde cette
 * fonction **pure et éprouvable sans DOM** : les onze exemples normatifs du
 * contrat s'écrivent alors comme onze appels.
 */
export interface ContexteDeCase {
  /** Le bâtiment posé sur la case. */
  readonly batiment?: { readonly typeId: BuildingTypeId; readonly niveau: number }
  /** Le chantier dont la case est la cible — il prime sur l'état de la case. */
  readonly chantier?: { readonly typeId: BuildingTypeId; readonly niveau: number }
  /** Ce que le déblaiement de l'obstacle libérerait, déjà mis en mots. */
  readonly libere?: string
  /** Vrai si le bâtiment posé exploite le gisement qui est dessous. */
  readonly gisementExploite?: boolean
  readonly sousEmpreinte?: boolean
  /** La raison du refus, déjà mise en mots par `refusal.ts`. */
  readonly refus?: string
}

/** Le segment d'état : « libre », « obstruée par un éboulis », « chantier en cours »… */
function etatDe(cell: CellView, contexte: ContexteDeCase): string {
  if (contexte.chantier !== undefined) return 'chantier en cours'

  if (cell.state === 'obstructed') {
    const id = cell.obstacleId
    if (id === null) return 'obstruée'
    return `obstruée par ${articleIndefini(OBSTACLE_GENRE[id])} ${OBSTACLE_LABELS[id]}`
  }

  if (cell.state === 'occupied') {
    const batiment = contexte.batiment
    // Un second onglet peut avoir démoli la cible : afficher un identifiant
    // technique serait pire que ne rien dire, ce serait dire quelque chose
    // d'illisible.
    if (batiment === undefined) return 'occupée par un bâtiment'
    const genre = BUILDING_GENRE[batiment.typeId]
    const nom = BUILDING_LABELS[batiment.typeId] ?? batiment.typeId
    return `occupée par ${articleIndefini(genre)} ${nom} niveau ${batiment.niveau}`
  }

  return 'libre'
}

/**
 * Le segment de gisement — ou ce que l'obstacle libérerait, qui prend sa place.
 *
 * Les deux ne coexistent jamais : une case obstruée n'expose pas son gisement,
 * elle expose ce que son déblaiement donnerait. C'est la même information à deux
 * moments du jeu, et c'est ce que le joueur a besoin de savoir pour décider
 * (R6, § 2.1 du document de conception).
 */
function gisementDe(cell: CellView, contexte: ContexteDeCase): string | null {
  if (cell.state === 'obstructed') {
    return contexte.libere === undefined ? null : `libère ${contexte.libere}`
  }

  const depot = cell.depositOf
  if (depot === null) return null

  const nom = DEPOSIT_LABELS[depot] ?? depot
  if (contexte.gisementExploite === undefined) return nom

  const exploite = accorde('exploité', DEPOSIT_GENRE[depot])
  return contexte.gisementExploite ? `${nom} ${exploite}` : `${nom} non ${exploite}`
}

/**
 * Le nom accessible d'une case — la seule description que **tout le monde**
 * reçoit (§ 2.3 de `contracts/ui-parcelle.md`).
 *
 * **Une grammaire, et non une phrase par état** :
 *
 * ```
 * {adresse} : {état}{, gisement}{, sous l’empreinte}{, refusé : raison}
 * ```
 *
 * Les segments absents sont **omis avec leur ponctuation** : douze états écrits
 * comme douze phrases auraient divergé au premier ajout, et c'est le nom
 * accessible — donc ce qu'un lecteur d'écran énonce — qui aurait divergé.
 *
 * FR-012 : jamais la couleur seule. L'état d'une case, son gisement, sa place
 * sous l'empreinte et la **raison** d'un refus sont ici, parce qu'une teinte
 * n'existe pas pour qui ne la distingue pas, ni pour qui écoute la page.
 */
export function describeCell(cell: CellView, contexte: ContexteDeCase = {}): string {
  const segments = [
    gisementDe(cell, contexte),
    contexte.chantier === undefined
      ? null
      : `${BUILDING_LABELS[contexte.chantier.typeId] ?? contexte.chantier.typeId} niveau ${contexte.chantier.niveau}`,
    contexte.sousEmpreinte === true ? 'sous l’empreinte' : null,
    contexte.refus === undefined ? null : `refusé : ${contexte.refus}`,
  ].filter((segment): segment is string => segment !== null)

  return [`${adresseOf(cell)} : ${etatDe(cell, contexte)}`, ...segments].join(', ')
}
