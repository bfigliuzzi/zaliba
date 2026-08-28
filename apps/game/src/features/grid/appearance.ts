import type { ResourceId } from '@zaliba/catalogs'
import type { BuildingView, Catalogs, Cell, CellView, WorkView } from '@zaliba/domain'
import type { Silhouette, Trait } from '../../design/Glyphe.js'
import {
  type Adresse,
  adresseOf,
  articleIndefini,
  type ContexteDeCase,
  DEPOSIT_GENRE,
  DEPOSIT_LABELS,
  describeCell,
} from '../../lib/labels.js'
import { SILHOUETTE_DE_RESSOURCE } from '../regie/Comptoir.js'

/**
 * Les douze états de case — **douze lectures, aucune donnée nouvelle** (FR-013, R6).
 *
 * Six des douze ne sont pas dans `CellState` : gisement productif, gisement
 * stérile, les deux natures d'obstacle et les deux visées. Ils se dérivent de
 * `depositOf`, du type du bâtiment posé et du type de l'obstacle — tout ce que la
 * projection de 001 rend déjà.
 *
 * **Pourquoi une fonction et non trois classes CSS.** S'en remettre au CSS sur
 * `data-state` couvrirait trois états sur douze ; les neuf autres retomberaient sur
 * la teinte, c'est-à-dire sur exactement ce que FR-012 interdit.
 *
 * **Pourquoi ici et non dans `packages/domain`.** « Quel glyphe » est une question
 * de présentation, et ranger cette fonction dans le domaine le ferait connaître des
 * silhouettes — la frontière du principe II franchie dans le mauvais sens. La
 * question de jeu qui la précède — *ce bâtiment exploite-t-il ce gisement ?* — se
 * répond avec `catalogs.buildings[typeId].extracts`, que le client importe déjà.
 *
 * **Pure, donc éprouvable sans DOM.** C'est ce qui rend SC-003 et SC-009
 * mécanisables à moitié : un automate ne peut pas vérifier qu'un humain reconnaît
 * une forme, il peut vérifier que les douze quadruplets sont distincts (INV-C1).
 */

/** Le vocabulaire **fermé** des douze états. `data-etat` porte l'un de ces noms. */
export const ETATS_DE_CASE = [
  'libre',
  'gisement-camelote',
  'gisement-jus',
  'gisement-bave',
  'gisement-productif',
  'gisement-sterile',
  'obstacle-terrain-nu',
  'obstacle-gisement',
  'batiment',
  'chantier',
  'visee-valide',
  'visee-refusee',
] as const

export type EtatDeCase = (typeof ETATS_DE_CASE)[number]

/** La place d'une case dans l'emprise de son bâtiment (FR-017, INV-C3). */
export type Emprise = 'seule' | 'debut' | 'milieu' | 'fin'

export interface Marque {
  readonly silhouette: Silhouette
  readonly trait: Trait
}

export interface CellAppearance {
  readonly adresse: Adresse
  readonly etat: EtatDeCase
  readonly silhouette: Silhouette | null
  readonly trait: Trait | null
  /** La silhouette d'angle, qui qualifie sans consommer de forme du vocabulaire. */
  readonly marque: Marque | null
  /** Lisible **une seule fois** sur l'emprise, jamais une fois par case (INV-C3). */
  readonly niveau: number | null
  readonly emprise: Emprise | null
  readonly nomAccessible: string
  readonly raisonDeRefus: string | null
}

/**
 * L'empreinte armée sous le curseur, telle que l'écran doit la lire.
 *
 * La **raison** est déjà mise en mots : elle vient de `refusal.ts`, qui traduit le
 * verdict du domaine. La faire calculer ici mélangerait deux questions — *quel
 * dessin* et *quelle phrase* — et la seconde a ses propres cas limites (R12).
 */
export interface PoseVisee {
  readonly cells: readonly Cell[]
  readonly fautives: readonly Cell[]
  readonly valide: boolean
  readonly raison?: string
}

const meme = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y

/** Les cases que le chantier courant occupe, quelle que soit la nature de sa cible. */
function casesDuChantier(work: WorkView, buildings: readonly BuildingView[]): readonly Cell[] {
  switch (work.target.kind) {
    case 'building': {
      const buildingId = work.target.buildingId
      return buildings.find((one) => one.id === buildingId)?.cells ?? []
    }
    case 'cell':
      return [work.target.cell]
    case 'build':
      /*
       * Une construction en cours n'a **pas** encore de bâtiment : ses cases ne
       * sont donc pas dans `buildings`, et les recalculer ici demanderait
       * `placementCells` — c'est-à-dire refaire la géométrie du domaine dans une
       * fonction d'affichage. La case d'ancrage suffit : c'est ce que le chantier
       * désigne, et l'emprise apparaîtra quand le bâtiment existera.
       */
      return [work.target.anchor]
  }
}

/**
 * La place d'une case dans l'emprise de son bâtiment.
 *
 * `seule` pour une empreinte d'une case, puis `debut`, `milieu` et `fin` dans
 * l'ordre de lecture. C'est ce qui permet à `parcelle.css` de délimiter l'emprise
 * comme **un seul objet** (FR-017) : le cadre s'ouvre au début, se poursuit au
 * milieu, se ferme à la fin.
 */
function empriseDe(cell: CellView, cells: readonly Cell[]): Emprise {
  if (cells.length <= 1) return 'seule'

  const ordonnees = [...cells].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
  const index = ordonnees.findIndex((one) => meme(one, cell))

  if (index <= 0) return 'debut'
  if (index === ordonnees.length - 1) return 'fin'
  return 'milieu'
}

/** La silhouette d'un gisement, pleine ou évidée selon qu'il est exploité. */
const marqueDeGisement = (resourceId: ResourceId, trait: Trait): Marque => ({
  silhouette: SILHOUETTE_DE_RESSOURCE[resourceId],
  trait,
})

/** Ce que le déblaiement d'un obstacle libère, **mis en mots**. */
function libereDe(cell: CellView, catalogs: Catalogs): string | undefined {
  if (cell.obstacleId === null) return undefined
  const reveals = catalogs.obstacles[cell.obstacleId]?.reveals
  if (reveals === undefined) return undefined
  if (reveals.kind === 'bare-ground') return 'du terrain nu'

  const nom = DEPOSIT_LABELS[reveals.resourceId] ?? reveals.resourceId
  return `${articleIndefini(DEPOSIT_GENRE[reveals.resourceId])} ${nom}`
}

interface Dessin {
  readonly etat: EtatDeCase
  readonly silhouette: Silhouette | null
  readonly trait: Trait | null
  readonly marque: Marque | null
  readonly niveau: number | null
  readonly emprise: Emprise | null
}

const RIEN = { silhouette: null, trait: null, marque: null, niveau: null, emprise: null } as const

/**
 * Le dessin d'une case visée. **Il prime sur tout le reste**, et le motif est le
 * joueur : il vient d'armer une pose et déplace son curseur, donc ce qu'il a
 * besoin de lire est le verdict, non le contenu de la case — qu'il connaît déjà et
 * que le nom accessible conserve.
 */
function dessinDeVisee(cell: CellView, pose: PoseVisee): Dessin | null {
  if (!pose.cells.some((one) => meme(one, cell))) return null

  const fautive = pose.fautives.some((one) => meme(one, cell))
  if (fautive || !pose.valide) {
    return { ...RIEN, etat: 'visee-refusee', silhouette: 'refus' }
  }
  return { ...RIEN, etat: 'visee-valide', silhouette: 'visee' }
}

/** Le dessin d'une case obstruée : la silhouette d'obstacle, et ce qu'elle cache. */
function dessinDObstacle(cell: CellView, catalogs: Catalogs): Dessin {
  const reveals =
    cell.obstacleId === null ? undefined : catalogs.obstacles[cell.obstacleId]?.reveals

  if (reveals !== undefined && reveals.kind === 'deposit') {
    return {
      ...RIEN,
      etat: 'obstacle-gisement',
      silhouette: 'obstacle',
      trait: 'plein',
      marque: marqueDeGisement(reveals.resourceId, 'plein'),
    }
  }

  return { ...RIEN, etat: 'obstacle-terrain-nu', silhouette: 'obstacle', trait: 'plein' }
}

/**
 * Le dessin d'une case occupée.
 *
 * **Le niveau du bâtiment n'est pas une silhouette.** Le vocabulaire fermé de R5
 * ne compte que sept **formes**, et un chiffre n'en est pas une : ces états ne
 * portent donc aucune silhouette centrale. Ce qui les identifie est la marque
 * d'angle — pour productif et stérile — et, pour tous, le cadre d'emprise avec le
 * niveau lisible dessus (FR-017).
 */
function dessinDOccupation(
  cell: CellView,
  buildings: readonly BuildingView[],
  catalogs: Catalogs,
): Dessin {
  const batiment = buildings.find((one) => one.cells.some((une) => meme(une, cell)))
  const emprise = batiment === undefined ? 'seule' : empriseDe(cell, batiment.cells)
  const niveau = batiment?.level ?? null

  const depot = cell.depositOf
  if (depot === null || batiment === undefined) {
    return { ...RIEN, etat: 'batiment', niveau, emprise }
  }

  const extrait = catalogs.buildings[batiment.typeId]?.extracts ?? null
  const exploite = extrait === depot

  return {
    ...RIEN,
    etat: exploite ? 'gisement-productif' : 'gisement-sterile',
    marque: marqueDeGisement(depot, exploite ? 'plein' : 'evide'),
    niveau,
    emprise,
  }
}

/** Le dessin d'un gisement nu : la silhouette de sa ressource, pleine. */
function dessinDeGisement(depot: ResourceId): Dessin {
  const etats: Readonly<Record<ResourceId, EtatDeCase>> = {
    camelote: 'gisement-camelote',
    jus: 'gisement-jus',
    'bave-etoiles': 'gisement-bave',
  }
  return {
    ...RIEN,
    etat: etats[depot],
    silhouette: SILHOUETTE_DE_RESSOURCE[depot],
    trait: 'plein',
  }
}

/**
 * L'ordre de priorité, et il n'est pas arbitraire.
 *
 * La **visée** d'abord : c'est l'interaction en cours. Le **chantier** ensuite :
 * il porte sur une case dont l'état va changer, et le dire prime sur l'état
 * présent. Puis l'obstacle, l'occupation, le gisement, et enfin le vide.
 */
function dessinDe(
  cell: CellView,
  buildings: readonly BuildingView[],
  work: WorkView | null,
  pose: PoseVisee | null,
  catalogs: Catalogs,
): Dessin {
  if (pose !== null) {
    const visee = dessinDeVisee(cell, pose)
    if (visee !== null) return visee
  }

  if (work !== null && casesDuChantier(work, buildings).some((one) => meme(one, cell))) {
    const cases = casesDuChantier(work, buildings)
    return { ...RIEN, etat: 'chantier', silhouette: 'chantier', emprise: empriseDe(cell, cases) }
  }

  if (cell.state === 'obstructed') return dessinDObstacle(cell, catalogs)
  if (cell.state === 'occupied') return dessinDOccupation(cell, buildings, catalogs)
  if (cell.depositOf !== null) return dessinDeGisement(cell.depositOf)

  return { ...RIEN, etat: 'libre' }
}

/** Le contexte que `describeCell` attend, tiré du même état que le dessin. */
function contexteDe(
  cell: CellView,
  buildings: readonly BuildingView[],
  pose: PoseVisee | null,
  catalogs: Catalogs,
  dessin: Dessin,
): ContexteDeCase {
  const batiment = buildings.find((one) => one.cells.some((une) => meme(une, cell)))
  const sousEmpreinte = pose?.cells.some((one) => meme(one, cell)) === true
  const libere = libereDe(cell, catalogs)

  return {
    ...(batiment !== undefined && dessin.etat !== 'chantier'
      ? { batiment: { typeId: batiment.typeId, niveau: batiment.level } }
      : {}),
    ...(dessin.etat === 'chantier' && batiment !== undefined
      ? { chantier: { typeId: batiment.typeId, niveau: batiment.level } }
      : {}),
    ...(libere === undefined ? {} : { libere }),
    ...(dessin.etat === 'gisement-productif' ? { gisementExploite: true } : {}),
    ...(dessin.etat === 'gisement-sterile' ? { gisementExploite: false } : {}),
    ...(sousEmpreinte ? { sousEmpreinte: true } : {}),
    ...(pose?.raison === undefined || !sousEmpreinte ? {} : { refus: pose.raison }),
  }
}

export function appearanceOf(
  cell: CellView,
  buildings: readonly BuildingView[],
  work: WorkView | null,
  pose: PoseVisee | null,
  catalogs: Catalogs,
): CellAppearance {
  const dessin = dessinDe(cell, buildings, work, pose, catalogs)
  const contexte = contexteDe(cell, buildings, pose, catalogs, dessin)

  return {
    adresse: adresseOf(cell),
    etat: dessin.etat,
    silhouette: dessin.silhouette,
    trait: dessin.trait,
    marque: dessin.marque,
    niveau: dessin.niveau,
    emprise: dessin.emprise,
    nomAccessible: describeCell(cell, contexte),
    raisonDeRefus: contexte.refus ?? null,
  }
}
