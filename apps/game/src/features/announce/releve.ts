import type { ResourceId } from '@zaliba/catalogs'
import type { HoldingView, WorkView } from '@zaliba/domain'
import { formatClock, formatHeld, formatUnits, formatWhole } from '../../lib/format.js'
import { BUILDING_LABELS, describePosition, RESOURCE_LABELS } from '../../lib/labels.js'

/**
 * Le relevé — **l'état courant, à la demande** (FR-023, FR-023a, INV-N3, INV-N3a).
 *
 * **C'est un besoin d'accessibilité, pas une commodité.** Les compteurs changent en
 * continu ; les annoncer noierait tout le reste, donc ils ne sont **jamais** annoncés
 * d'eux-mêmes (INV-N2). Le relevé est ce qui rend l'information malgré tout
 * accessible à qui écoute la page : sans lui, un joueur au lecteur d'écran ne peut
 * pas savoir combien il possède sans parcourir l'écran nœud par nœud.
 *
 * Fonction **pure**, éprouvable sans DOM : la phrase se compare, donc elle se
 * vérifie.
 */

export interface EtatDuReleve {
  readonly holdings: Readonly<Record<ResourceId, HoldingView>>
  readonly work: WorkView | null
  readonly buildings: readonly {
    readonly id: string
    readonly typeId: string
    readonly level: number
    readonly anchor: { readonly x: number; readonly y: number }
  }[]
}

/** Une ressource : son nom, ce qu'on en détient, son plafond et son débit. */
function clauseDeRessource(resourceId: ResourceId, holding: HoldingView): string {
  const nom = RESOURCE_LABELS[resourceId] ?? resourceId
  const debit = holding.rate === 0 ? 'débit nul' : `${formatWhole(holding.rate)} par heure`

  /*
    La **saturation est dite**, et ce n'est pas du confort : c'est l'information qui
    décide. Une ressource au plafond perd sa production à chaque seconde, et un
    joueur qui écoute la page n'a aucun autre moyen de l'apprendre — l'écran le
    montre par une phrase que rien n'annonce.
  */
  const sature = holding.saturatedSince === null ? '' : ', saturée — la production se perd'

  return `${nom} : ${formatHeld(holding.amount)} sur ${formatUnits(holding.cap)}, ${debit}${sature}`
}

/** Le chantier, ou son absence — qui est une information autant que sa présence. */
function clauseDeChantier(etat: EtatDuReleve): string {
  const work = etat.work
  if (work === null) return 'Aucun chantier en cours.'

  const cible = decrireCible(work, etat.buildings)
  return `Chantier : ${cible}, ${formatClock(work.remaining)} restant.`
}

function decrireCible(work: WorkView, buildings: EtatDuReleve['buildings']): string {
  switch (work.target.kind) {
    case 'build': {
      const typeId = work.target.typeId as keyof typeof BUILDING_LABELS
      return `${BUILDING_LABELS[typeId] ?? typeId} en ${describePosition(work.target.anchor)}`
    }
    case 'building': {
      const buildingId = work.target.buildingId
      const cible = buildings.find((une) => une.id === buildingId)
      if (cible === undefined) return 'un bâtiment posé'
      const nom = BUILDING_LABELS[cible.typeId as keyof typeof BUILDING_LABELS] ?? cible.typeId
      return `${nom} niveau ${cible.level} en ${describePosition(cible.anchor)}`
    }
    case 'cell':
      return `déblaiement en ${describePosition(work.target.cell)}`
  }
}

/**
 * La phrase du relevé : **les trois quantités, les trois débits et le chantier**.
 *
 * Une seule fois par appel (INV-N3). L'ordre des ressources est celui de la
 * projection, qui est celui du catalogue : deux relevés successifs énoncent donc les
 * mêmes choses dans le même ordre, et un joueur apprend où écouter.
 */
export function phraseDeReleve(etat: EtatDuReleve): string {
  const ressources = (Object.entries(etat.holdings) as [ResourceId, HoldingView][]).map(
    ([resourceId, holding]) => clauseDeRessource(resourceId, holding),
  )

  return `${ressources.join(' ; ')}. ${clauseDeChantier(etat)}`
}

/**
 * Le **jeton d'unicité**, invisible et muet (INV-N3a, FR-023a).
 *
 * ---
 *
 * **Pourquoi il existe, alors que R11 avait conclu l'inverse.**
 *
 * R11 raisonnait ainsi : « la phrase du relevé porte les quantités détenues, qui
 * changent à la seconde ; deux relevés successifs ne produisent pas le même texte,
 * l'artifice est donc inutile ». **C'est faux dès la saturation** — que 001 produit
 * déjà : au plafond, la quantité ne bouge plus. Un débit nul et aucun chantier
 * suffisent à rendre deux relevés strictement identiques, et une région `aria-live`
 * ne réénonce pas un contenu inchangé. Le second appui était donc **silencieux**, et
 * le joueur n'avait aucun moyen de distinguer le silence d'une panne.
 *
 * **Ce que le jeton est, et ce qu'il n'est pas.** Un espace de largeur nulle
 * (U+200B) répété selon la parité du compteur d'appuis. Il n'occupe aucun pixel,
 * n'est prononcé par aucune synthèse vocale, et n'ajoute **aucune information
 * fausse** — ce que FR-023a exige. Ce n'est pas un horodatage, qui serait prononcé ;
 * ce n'est pas un compteur visible, qui serait du bruit à l'écran.
 *
 * **La parité suffit.** Il n'y a qu'une comparaison à tromper : celle du contenu
 * courant avec le précédent. Deux états alternés rendent tout appui distinct de
 * celui qui le précède, et un compteur croissant n'ajouterait qu'une chaîne qui
 * s'allonge indéfiniment.
 */
/*
  Écrit par son point de code, et non littéralement : un caractère invisible dans la
  source est invisible en relecture, et le premier à le « nettoyer » casserait
  FR-023a sans qu'aucune porte ne l'annonce.
*/
const JETON = '\u200B'

export function avecJeton(texte: string, appui: number): string {
  return appui % 2 === 0 ? texte : `${texte}${JETON}`
}
