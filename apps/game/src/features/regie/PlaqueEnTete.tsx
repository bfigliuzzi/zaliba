import type { ArchetypeId } from '@zaliba/catalogs'
import { ARCHETYPE_LABELS } from '../../lib/labels.js'
import { COPIE } from './copie.js'

/**
 * La plaque d'en-tête : l'identité de la planète, et le registre de la Régie.
 *
 * **Le nom d'archétype tient le rôle du nom propre** (FR-008). 001 affichait
 * « Ma planète », qui ne disait pas *où* le joueur se trouvait — c'est-à-dire la
 * première des quatre choses que l'écran doit dire en une seconde. « Berceau » le
 * dit, et c'est vrai : la disposition est identique pour tous, et la nommer est
 * plus honnête que d'inventer « Fond de Tiroir ».
 *
 * **Trois zones de la maquette sont omises, et c'est le sujet de FR-008a** :
 * l'ancien nom raturé, les coordonnées système, les possessions multiples. Le
 * modèle de 001 n'en alimente aucune. Les remplir d'une valeur inventée aurait
 * produit un écran plausible et faux — la faute la plus facile à commettre en
 * partant d'une maquette de haute fidélité.
 *
 * **L'agencement, lui, reste celui de la cible** : la plaque est disposée comme la
 * maquette la dispose, de sorte que l'arrivée de ces données avec le système
 * solaire ne redispose pas l'écran. Mais aucune structure ne les attend — pas de
 * composant `Coordonnees` inemployé, pas de liste vide.
 */

export interface PlaqueEnTeteProps {
  readonly archetypeId: ArchetypeId
}

export function PlaqueEnTete({ archetypeId }: PlaqueEnTeteProps) {
  return (
    <header data-bloc="en-tete" className="plaque cadre-main">
      {/*
        Le surtitre est du **décor**, et il est marqué comme tel. La marque n'est
        pas une commodité de test : c'est ce qui permet à la porte du plancher
        typographique de mesurer 9,5 px plutôt que 14 (FR-039). Un nœud non marqué
        est présumé porteur d'information — le défaut échoue du côté exigeant.
      */}
      <p data-role-texte="decor" className="surtitre">
        {COPIE.surtitre}
      </p>

      <h1 className="nom-de-planete">{ARCHETYPE_LABELS[archetypeId] ?? archetypeId}</h1>

      {/*
        Le tampon : la **seule** exception au plafond de rotation de 1,5°
        (FR-032). Il ne porte aucune information et il est masqué aux technologies
        d'assistance — c'est ce qui rend l'exception soutenable, et c'est pourquoi
        les deux propriétés sont posées ici plutôt que supposées.
      */}
      <p data-tampon="etat" data-role-texte="decor" className="tampon" aria-hidden="true">
        {COPIE.tampon.map((ligne) => (
          <span key={ligne}>{ligne}</span>
        ))}
      </p>
    </header>
  )
}
