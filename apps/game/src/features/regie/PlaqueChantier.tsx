import type { BuildingView, WorkView } from '@zaliba/domain'
import { formatClock } from '../../lib/format.js'
import { BUILDING_LABELS, describePosition, FOOTPRINT_LABELS } from '../../lib/labels.js'
import { COPIE } from './copie.js'
import { Rature } from './Rature.js'
import { useRature } from './useRature.js'

/**
 * La plaque de chantier : la nature, la cible, la jauge et le chrono (FR-009).
 *
 * **Elle reste même sans chantier, et elle le dit** (US1-AC3). Le motif est de
 * mise en page autant que de lisibilité : un bloc qui disparaît fait sauter
 * l'écran à chaque achèvement, et une jauge vide sans explication laisse le joueur
 * chercher ce qui se construit.
 *
 * **La jauge est du décor par-dessus un fait déjà écrit.** Elle est `aria-hidden`,
 * et l'avancement est publié **en texte** juste à côté d'elle. C'est la discipline
 * de FR-012 appliquée à une barre : jamais la géométrie seule. Un
 * `role="progressbar"` aurait fait énoncer un pourcentage qui double le chrono, et
 * la spécification demande le temps restant, pas un ratio.
 *
 * **Le chrono est en `HH:MM:SS`**, en chasse fixe tabulaire (FR-002). C'est la
 * seule grandeur de l'écran qui bouge à la seconde : l'arrondir à l'heure la
 * rendrait immobile, et un joueur qui revient ne verrait plus que le temps passe.
 *
 * La dérivation de l'état n'est pas touchée : ce composant reçoit la `WorkView` que
 * la projection rend, et n'en tire que de la présentation.
 */

const NATURES: Readonly<Record<WorkView['nature'], string>> = {
  build: 'Construction',
  upgrade: 'Amélioration',
  demolish: 'Démolition',
  clear: 'Déblaiement',
}

export interface PlaqueChantierProps {
  readonly work: WorkView | null
  /**
   * Les bâtiments projetés, pour **nommer** la cible d'une amélioration ou d'une
   * démolition (FR-038 de 001).
   *
   * La liste vient de la projection, la même dont l'aperçu et le panneau
   * d'énergie tirent leurs chiffres. La redemander au serveur, ou en tenir une
   * copie ici, donnerait deux vérités sur un écran qui les montre côte à côte.
   */
  readonly buildings: readonly BuildingView[]
}

/**
 * La cible, en clair.
 *
 * L'union discriminée du domaine rend ce `switch` exhaustif : ajouter une nature
 * de cible fera échouer la compilation ici, plutôt qu'afficher un chantier sans
 * cible. Le repli « un bâtiment posé » n'est pas décoratif — un second onglet peut
 * démolir la cible, et afficher un identifiant technique serait pire que ne rien
 * dire : ce serait dire quelque chose d'illisible.
 */
function decrireCible(work: WorkView, buildings: readonly BuildingView[]): string {
  switch (work.target.kind) {
    case 'build': {
      const typeId = work.target.typeId as keyof typeof BUILDING_LABELS
      const nom = BUILDING_LABELS[typeId] ?? typeId
      const empreinte = FOOTPRINT_LABELS[work.target.variantId] ?? work.target.variantId
      return `${nom} (${empreinte.toLowerCase()}) en ${describePosition(work.target.anchor)}`
    }
    case 'building': {
      // Lié avant la fermeture : le rétrécissement de l'union se perd à
      // l'intérieur du rappel de `find`, et `work.target.buildingId` n'y compile
      // plus. Un `as` masquerait le vrai motif.
      const buildingId = work.target.buildingId
      const cible = buildings.find((one) => one.id === buildingId)
      if (cible === undefined) return 'un bâtiment posé'
      const nom = BUILDING_LABELS[cible.typeId] ?? cible.typeId
      return `${nom} niveau ${cible.level}, ${describePosition(cible.anchor)}`
    }
    case 'cell':
      return describePosition(work.target.cell)
  }
}

/**
 * L'avancement en **millièmes**, tronqué vers le bas.
 *
 * Dérivé de `startedAt`, `dueAt` et `remaining` : le domaine ne porte pas de
 * pourcentage, et il n'a pas à en porter — un avancement est de la présentation.
 * Les millièmes plutôt que les centièmes parce qu'un chantier de plusieurs jours
 * ne bougerait pas d'un centième pendant vingt minutes, et qu'un test comme un
 * parcours ont besoin d'une résolution qui distingue deux états proches.
 *
 * La troncature va vers le bas, comme partout ailleurs : annoncer 100 % à 99,7 %
 * dirait au joueur que c'est fini alors qu'il reste du temps.
 */
function avancementPourMille(work: WorkView): number {
  const total = work.dueAt - work.startedAt
  if (total <= 0) return 1_000
  const ecoule = Math.max(0, total - work.remaining)
  return Math.min(1_000, Math.floor((ecoule * 1_000) / total))
}

/**
 * Le niveau de la cible, **raturé**.
 *
 * Un composant à part, et non un appel de crochet dans `PlaqueChantier` : un crochet
 * ne s'appelle pas conditionnellement, et le niveau n'existe que pour une cible
 * résolue. L'extraire est ce qui garde l'ordre des crochets stable.
 */
function RatureDeNiveau({ niveau }: { readonly niveau: number }) {
  const { courante, ancienne } = useRature(niveau)
  return <Rature etiquette="niveau" courante={courante} ancienne={ancienne} />
}

export function PlaqueChantier({ work, buildings }: PlaqueChantierProps) {
  if (work === null) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste pour un ensemble de valeurs liées, et c'est celui de 001. Une `<section>` étiquetée deviendrait un point de repère `region` de plus dans la navigation, et `<fieldset>` annonce un groupe de champs de saisie : il n'y en a aucun.
      <div role="group" aria-label="Chantier" data-bloc="chantier" className="plaque cadre-main">
        <p data-role-texte="intitule" className="intitule">
          {COPIE.chantierIntitule}
        </p>
        <p>Aucun chantier en cours.</p>
      </div>
    )
  }

  const pourMille = avancementPourMille(work)

  /**
   * Le niveau de la cible, quand le chantier porte sur un bâtiment résolu.
   *
   * L'identifiant est lié **avant** la fermeture : le rétrécissement de l'union se
   * perd à l'intérieur du rappel de `find`, et un `as` masquerait le vrai motif.
   */
  const cible = work.target
  const niveauDeLaCible =
    cible.kind === 'building'
      ? (buildings.find((une) => une.id === cible.buildingId)?.level ?? null)
      : null

  return (
    // biome-ignore lint/a11y/useSemanticElements: idem — un ensemble de valeurs liées, pas un point de repère.
    <div role="group" aria-label="Chantier" data-bloc="chantier" className="plaque cadre-main">
      <p data-role-texte="intitule" className="intitule">
        {COPIE.chantierIntitule}
      </p>

      <h2 className="titre-chantier">{NATURES[work.nature]}</h2>
      <p className="cible-chantier">{decrireCible(work, buildings)}</p>

      {/*
        **Le niveau du bâtiment est raturé** (FR-026, FR-029a) : il change par saut,
        à l'achèvement d'une amélioration, et c'est exactement le cas que le dossier
        de design illustre — « niveau ~~2~~ **3** ».
      */}
      {niveauDeLaCible !== null && (
        <p>
          <RatureDeNiveau niveau={niveauDeLaCible} />
        </p>
      )}

      {/*
        La jauge, masquée, **et** son équivalent textuel à côté d'elle. Les deux,
        toujours : la barre pour l'œil, le pourcentage pour l'oreille et pour qui
        lit en noir et blanc.
      */}
      <div data-jauge={pourMille} className="jauge" aria-hidden="true">
        <span className="jauge-remplissage" style={{ inlineSize: `${pourMille / 10}%` }} />
      </div>
      <p>
        <span data-avancement={pourMille} className="chiffre">
          {`${Math.floor(pourMille / 10)} %`}
        </span>
      </p>

      <p>
        <span data-chrono="restant" className="chiffre chrono">
          {formatClock(work.remaining)}
        </span>
      </p>
      <p data-role-texte="decor" className="note-regie">
        {COPIE.chantierRestant}
      </p>

      <p>Un chantier lancé ne peut être ni annulé ni remplacé.</p>
    </div>
  )
}
