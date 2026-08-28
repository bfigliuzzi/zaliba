import { COPIE } from './copie.js'

/**
 * Le registre des possessions (FR-007, INV-P1, INV-P2, FR-008a).
 *
 * ---
 *
 * **Il en compte une, et cette entrée unique est vraie.**
 *
 * La maquette en montre quatre : « Fond de Tiroir », « Bout du Couloir (1:204:9) »,
 * « Cul-de-Sac 2 (1:211:1) » et une possession **perdue**, « ~~Bel Horizon~~ (perdue
 * mardi) ». Le modèle de 001 n'en alimente aucune : il n'y a qu'une planète, celle du
 * joueur, et ni système solaire, ni coordonnées, ni occupation par un tiers.
 *
 * **Les remplir aurait produit un écran plausible et faux** — la faute la plus facile
 * à commettre en partant d'une maquette de haute fidélité, et celle que FR-008a
 * interdit nommément. Une liste de voisines fictives n'est pas « en attendant les
 * vraies » : c'est un mensonge que le joueur n'a aucun moyen de démentir.
 *
 * **L'agencement, lui, reste celui de la cible** : le registre occupe sa place dans
 * la colonne de gauche du guichet, de sorte que l'arrivée du système solaire ajoute
 * des entrées sans redisposer l'écran.
 *
 * ---
 *
 * **L'entrée active n'est pas un lien** (INV-P2, FR-025).
 *
 * Elle désigne l'écran courant, et un lien vers l'écran courant est une commande sans
 * effet. `aria-current="page"` dit ce qu'un lien aurait dit, sans promettre une
 * navigation qui n'irait nulle part.
 */

export interface Possession {
  /** Le nom d'archétype, tant qu'il n'y a pas de nom propre (FR-008). */
  readonly nom: string
  readonly active: boolean
}

export interface RegistreProps {
  readonly possessions: readonly Possession[]
}

export function Registre({ possessions }: RegistreProps) {
  return (
    /*
      **Un groupe, et non un repère de navigation.**

      Un `<nav>` aurait été le réflexe — c'est un registre de planètes. Mais R10
      établit que ce bloc **ne contient aucun élément focalisable** : l'entrée active
      désigne l'écran courant et n'est pas un lien (INV-P2, FR-025), et les autres
      n'existent pas encore. Un repère de navigation qui ne mène nulle part encombre
      la navigation par repères — et l'écran en portait déjà un, la navigation
      principale de 001, que `getByRole('navigation')` ne trouvait plus seul.

      `role="group"` est le rôle juste : un ensemble de valeurs liées. C'est le même
      choix que pour les cartes de ressources, et pour la même raison.
    */
    // biome-ignore lint/a11y/useSemanticElements: `group` est le rôle juste, et aucun élément natif ne le porte. `<nav>` créerait un repère de navigation sans rien à naviguer ; `<section>` étiquetée créerait un repère `region`.
    <div
      role="group"
      data-bloc="registre"
      className="registre plaque cadre-main"
      aria-labelledby="registre-intitule"
    >
      <p id="registre-intitule" data-role-texte="intitule" className="intitule">
        {COPIE.registreIntitule}
      </p>

      <ul className="registre-entrees">
        {possessions.map((possession) => (
          <li
            key={possession.nom}
            className="registre-entree"
            data-possession={possession.active ? 'active' : 'autre'}
            {...(possession.active ? { 'aria-current': 'page' as const } : {})}
          >
            {/*
              Le chevron du dossier de design, purement décoratif : il double la
              teinte inversée de l'entrée active, qui n'est pas un canal suffisante
              à elle seule (FR-012). `aria-current` porte l'information.
            */}
            {possession.active && (
              <span aria-hidden="true" className="registre-chevron">
                ▶
              </span>
            )}
            {possession.nom}
          </li>
        ))}
      </ul>
    </div>
  )
}
