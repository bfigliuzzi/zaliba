import type { BuildingView, Catalogs, CellView, WorkView } from '@zaliba/domain'
import type React from 'react'
import { type KeyboardEvent, useEffect, useRef } from 'react'
import { Glyphe } from '../../design/Glyphe.js'
import { adresseOf } from '../../lib/labels.js'
import { appearanceOf, type CellAppearance, type PoseVisee } from './appearance.js'
import { type GhostState, ghostMarkOf } from './FootprintGhost.js'

/**
 * Le plan de parcelle.
 *
 * **Le canvas est une vue, jamais le contrôle.** L'interaction passe par des
 * éléments du document focalisables, dont l'état est la source de vérité. Une
 * grille peinte serait plus jolie et inatteignable au clavier comme au lecteur
 * d'écran — et peindre les douze états rendrait douze informations inaccessibles.
 *
 * **`tabindex` mobile.** Une seule case est atteignable par tabulation ; les
 * flèches déplacent le curseur à l'intérieur. Rendre les trente-six cases
 * tabulables obligerait à trente-six tabulations pour traverser la grille, ce qui
 * est la façon habituelle de rendre une interface « accessible » et impraticable.
 *
 * **Le curseur n'est pas ici.** Il vit au-dessus, dans l'écran de planète, parce
 * que l'aperçu, le fantôme, l'annonce et le lancement en dépendent tous.
 *
 * ---
 *
 * **Ce que 002 change.**
 *
 * Les caractères `▓ ■ · ◆` disparaissent au profit des **sept silhouettes**. Ils
 * se lisaient en noir et blanc — c'était leur mérite — mais quatre caractères ne
 * peuvent pas porter douze états, et six des douze retombaient sur rien du tout.
 *
 * Les **bandes de coordonnées** sont hors de `role="grid"` et `aria-hidden` :
 * l'adresse est déjà dans le nom accessible de chaque case, et la lire deux fois
 * ferait de la navigation au lecteur d'écran une répétition (INV-A2).
 *
 * Le **nom de la grille** énonce ses dimensions et ses bornes d'adresse, au lieu
 * du « Grille de la planète » de 001 : un joueur qui entre dans la grille apprend
 * ainsi l'espace qu'il va parcourir avant de le parcourir.
 *
 * L'**emprise d'un bâtiment se délimite comme un seul objet**, et son niveau n'est
 * lisible **qu'une fois** dessus (FR-017, INV-C3) — non une fois par case, ce qui
 * ferait énoncer « niveau 2 » quatre fois à un lecteur d'écran... si le niveau
 * était énoncé, ce qu'il n'est pas : il double le nom accessible, qui le porte déjà.
 */

/** Les touches qui confirment. Alignées sur celles du curseur. */
const CONFIRM = new Set(['Enter', ' '])

export interface GridViewProps {
  readonly cells: readonly CellView[]
  /**
   * Le catalogue **résolu à la longueur du serveur** — une propriété, et non un
   * import.
   *
   * La grille l'importait de `@zaliba/domain` avant 003, ce qui était possible
   * tant qu'il existait un catalogue « par défaut ». Il n'y en a plus : résoudre
   * demande une longueur de gong, et cette longueur appartient au serveur. Le
   * recevoir en propriété rend au passage cette vue éprouvable contre un monde
   * synthétique, ce qu'un import cachait.
   */
  readonly catalogs: Catalogs
  readonly width: number
  readonly height: number
  /** Les bâtiments projetés : l'emprise, le niveau, et le gisement exploité. */
  readonly buildings: readonly BuildingView[]
  /** Le chantier en cours, dont les cases se lisent « chantier ». */
  readonly work: WorkView | null
  /**
   * L'empreinte armée, sa validité et **la raison de son refus**.
   *
   * `null` avant tout choix de bâtiment : le curseur existe pour explorer, et
   * annoncer une empreinte imaginaire perdrait le joueur.
   */
  readonly pose?: PoseVisee | null
  /** L'index de la case du curseur : la seule tabulable. */
  readonly cursorIndex: number
  /** Traite une touche ; rend `true` si la grille l'a consommée. */
  readonly onKey?: (key: string) => boolean
  /** Un appui sur une case — le **même** parcours que le clavier (R14). */
  readonly onPoint?: (x: number, y: number) => void
  /**
   * Le focus **entre** dans la grille, depuis l'extérieur.
   *
   * Distinct de `onPoint`, qui se déclenche à chaque case atteinte : « entrer dans
   * la grille » et « se déplacer dedans » sont deux événements que le contrat
   * énumère séparément, et les confondre ferait réénoncer l'entrée à chaque flèche.
   */
  readonly onEnterGrid?: () => void
  readonly onConfirm?: (cell: CellView) => void
}

/** Le nom de la grille : ses dimensions, et les bornes de ses adresses. */
function nommerLaGrille(width: number, height: number): string {
  const derniereColonne = adresseOf({ x: width - 1, y: 0 }).replace(/\d+$/, '')
  return `Parcelle, ${width} colonnes A à ${derniereColonne}, ${height} rangées 1 à ${height}`
}

/**
 * Ce qu'une case dessine, hors de sa sémantique.
 *
 * Séparé du corps de `GridView` parce que c'est la seule partie qui grandit : les
 * douze états y arrivent, et les mêler à la gestion du focus et du clavier
 * rendrait les deux illisibles.
 */
function DessinDeCase({ vue }: { readonly vue: CellAppearance }) {
  return (
    <>
      {vue.silhouette !== null && (
        <span className="silhouette" aria-hidden="true">
          <Glyphe nom={vue.silhouette} {...(vue.trait === null ? {} : { trait: vue.trait })} />
        </span>
      )}

      {/*
        La marque d'angle : une silhouette réduite qui **qualifie** sans consommer
        de forme du vocabulaire de sept (R5). C'est elle qui distingue un gisement
        productif d'un gisement stérile, par son trait, et qui nomme la ressource
        qu'un obstacle libérerait.
      */}
      {vue.marque !== null && (
        <span
          className="marque"
          data-marque={vue.marque.silhouette}
          data-trait={vue.marque.trait}
          aria-hidden="true"
        >
          <Glyphe nom={vue.marque.silhouette} trait={vue.marque.trait} />
        </span>
      )}

      {/*
        **Le niveau, une seule fois par emprise** (INV-C3), sur la case qui l'ouvre.
        `aria-hidden` : le nom accessible de la case le porte déjà, en clair et avec
        le nom du bâtiment.
      */}
      {vue.niveau !== null && (vue.emprise === 'debut' || vue.emprise === 'seule') && (
        <span className="niveau" data-niveau={vue.niveau} aria-hidden="true">
          {vue.niveau}
        </span>
      )}
    </>
  )
}

export function GridView({
  cells,
  catalogs,
  width,
  height,
  buildings,
  work,
  pose = null,
  cursorIndex,
  onKey,
  onPoint,
  onEnterGrid,
  onConfirm,
}: GridViewProps) {
  const container = useRef<HTMLDivElement>(null)

  /**
   * Déplacer le curseur **et** le focus.
   *
   * Les deux sont distincts, et les confondre est le défaut que le parcours de
   * bout en bout a trouvé : changer quel élément porte `tabIndex={0}` ne focalise
   * rien. Le navigateur garde le focus là où il était, et un joueur au clavier
   * reste bloqué sur la première case en croyant que la grille ne répond pas.
   * Compter les `tabIndex` ne pouvait pas l'attraper — le compte était juste.
   *
   * La garde `contains` est ce qui empêche la grille de **voler** le focus : elle
   * ne le déplace que si elle l'avait déjà.
   */
  useEffect(() => {
    const root = container.current
    if (root === null) return
    if (!root.contains(document.activeElement)) return
    root.querySelector<HTMLElement>(`[data-index="${cursorIndex}"]`)?.focus()
  }, [cursorIndex])

  const rows = Array.from({ length: height }, (_, y) => cells.slice(y * width, (y + 1) * width))

  /**
   * Le fantôme de 001, conservé pour son **crochet**.
   *
   * `data-ghost` est lu par les parcours de bout en bout de 001 : la refonte
   * l'aurait emporté, et la porte 8 aurait rougi pour une raison sans rapport avec
   * ce qu'elle mesure. Le *dessin* du fantôme, lui, vient désormais de
   * `appearanceOf`, qui range la case dans « visée valide » ou « visée refusée ».
   */
  const ghost: GhostState | null =
    pose === null ? null : { cells: pose.cells, valid: pose.valide, faultyCells: pose.fautives }

  function handleKey(event: KeyboardEvent<HTMLDivElement>, cell: CellView) {
    if (CONFIRM.has(event.key)) {
      event.preventDefault()
      onConfirm?.(cell)
      return
    }
    // Les flèches font défiler la page par défaut : ne pas les retenir ferait
    // bouger l'écran sous le joueur à chaque déplacement de curseur.
    if (onKey?.(event.key) === true) event.preventDefault()
  }

  /**
   * L'entrée dans la grille, reconnue à la **provenance du focus**.
   *
   * `relatedTarget` porte l'élément qui perd le focus : s'il est hors de la grille,
   * on y entre ; s'il est dedans, on s'y déplace. Sans cette garde, chaque flèche
   * réénoncerait l'entrée, et le joueur entendrait deux phrases par case.
   */
  function handleFocusIn(event: React.FocusEvent<HTMLDivElement>) {
    const root = container.current
    if (root === null) return
    const venantDe = event.relatedTarget
    if (venantDe !== null && root.contains(venantDe)) return
    onEnterGrid?.()
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: le gestionnaire n'ajoute aucune interaction — il observe la **provenance** d'un focus que les cases, elles, portent déjà. Les rendre responsables de reconnaître l'entrée obligerait chacune à savoir si le focus venait d'une sœur.
    <div ref={container} className="plan" onFocus={handleFocusIn}>
      {/*
        **Les bandes sont hors de la grille, et masquées** (INV-A2). Elles doublent
        l'adresse à l'œil ; l'adresse elle-même est dans le nom accessible de chaque
        case, où elle est plus précise. Les lire deux fois doublerait la durée d'une
        exploration au lecteur d'écran.

        Et elles restent affichées **à toute largeur** (FR-016) : les masquer à
        320 px aurait libéré quatorze pixels et supprimé un palier que l'exigence
        n'admet pas.
      */}
      <div data-bande="rangees" className="bande bande--rangees" aria-hidden="true">
        {/*
          La clé est le **numéro de rangée**, non l'index de la boucle : c'est
          l'identité de l'élément, et c'est ce que React attend d'une clé. Un index
          se rejoue à l'identique quand la parcelle change de dimensions.
        */}
        {Array.from({ length: height }, (_, index) => index + 1).map((rangee) => (
          <span key={`rangee-${rangee}`} className="chiffre">
            {rangee}
          </span>
        ))}
      </div>

      {/*
        Des `div` portant les rôles ARIA, et non une `<table>`.
        Une `<table role="grid">` serait le motif canonique — et deux outils s'y
        opposent : le lint refuse un rôle interactif sur une table, et le calcul de
        rôle accessible employé par les tests ne dérive pas `td` → `gridcell` du
        rôle de la table ancêtre. Les rôles explicites sont donc **plus** fiables
        ici, parce qu'ils sont lus tels quels par tout le monde.
      */}
      {/* biome-ignore lint/a11y/useSemanticElements: aucun élément natif ne porte le rôle `grid` ; une `<table role="grid">` est refusée par la règle noNoninteractiveElementToInteractiveRole. */}
      <div
        role="grid"
        aria-label={nommerLaGrille(width, height)}
        aria-colcount={width}
        aria-rowcount={height}
        className="grille"
        /*
          Le nombre de colonnes passe au CSS par une propriété personnalisée : une
          grille de 3 × 10 ou de 8 × 4 doit se disposer sans qu'aucune feuille ne
          porte la constante 6. C'est la seule voie — `repeat()` n'accepte pas de
          valeur calculée autrement.
        */
        style={{ '--colonnes': width } as React.CSSProperties}
      >
        {rows.map((row, y) => (
          // biome-ignore lint/a11y/useSemanticElements: `<tr>` hors d'une table n'est pas du HTML valide ; le rôle explicite est la seule voie. `tabIndex={-1}` rend la rangée atteignable par programme sans la rendre tabulable — seule la case du curseur l'est —, ce que le motif ARIA de grille attend d'une rangée.
          <div role="row" tabIndex={-1} key={`row-${row[0]?.y ?? y}`}>
            {row.map((cell, x) => {
              const index = y * width + x
              /*
                Le catalogue employé pour **dessiner**, et rien d'autre : deux
                lectures, `buildings[type].extracts` et `obstacles[id].reveals`.
                Le recevoir en propriété aurait ajouté un argument à six appelants
                pour une constante que le client embarque déjà, et que
                l'avertissement de divergence garde honnête (R15).
              */
              const vue = appearanceOf(cell, buildings, work, pose, catalogs)
              const mark = ghostMarkOf(ghost, cell)

              return (
                // biome-ignore lint/a11y/useSemanticElements: idem pour `<td>`.
                <div
                  role="gridcell"
                  key={`cell-${cell.x}-${cell.y}`}
                  data-index={index}
                  tabIndex={index === cursorIndex ? 0 : -1}
                  aria-label={vue.nomAccessible}
                  data-state={cell.state}
                  data-deposit={cell.depositOf ?? undefined}
                  data-ghost={mark ?? undefined}
                  data-adresse={vue.adresse}
                  data-etat={vue.etat}
                  data-glyphe={vue.silhouette ?? undefined}
                  data-trait={vue.trait ?? undefined}
                  data-marque={vue.marque?.silhouette ?? undefined}
                  data-emprise={vue.emprise ?? undefined}
                  onFocus={() => onPoint?.(cell.x, cell.y)}
                  onKeyDown={(event) => handleKey(event, cell)}
                  onClick={() => onPoint?.(cell.x, cell.y)}
                >
                  <DessinDeCase vue={vue} />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div data-bande="colonnes" className="bande bande--colonnes" aria-hidden="true">
        {Array.from({ length: width }, (_, index) =>
          adresseOf({ x: index, y: 0 }).replace(/\d+$/, ''),
        ).map((lettre) => (
          <span key={`colonne-${lettre}`} className="chiffre">
            {lettre}
          </span>
        ))}
      </div>
    </div>
  )
}
