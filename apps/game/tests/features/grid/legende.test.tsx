import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ETATS_DE_CASE } from '../../../src/features/grid/appearance.js'
import { LEGENDE, Legende } from '../../../src/features/grid/Legende.js'

/**
 * La légende des silhouettes (FR-018, § 7 du contrat d'interface).
 *
 * **Elle est indispensable depuis qu'on a supprimé les hachures** : tout tient à
 * la silhouette, donc il faut donner la clé. C'est le dossier de design qui le dit,
 * et SC-003 repose entièrement dessus — une personne extérieure au projet doit
 * nommer les douze états en niveaux de gris, **avec la seule légende sous les
 * yeux**.
 *
 * **Le compte est comparé à la taille de l'union `EtatDeCase`, jamais écrit en
 * dur.** C'est ce qui empêche qu'un treizième état arrive un jour sans sa clé : le
 * type le dirait, et ce test échouerait. Un nombre littéral aurait laissé passer.
 */

afterEach(cleanup)

describe('la légende couvre exactement les douze états', () => {
  it('compte autant d’entrées que l’union en compte de noms', () => {
    expect(LEGENDE.length).toBe(ETATS_DE_CASE.length)
  })

  it('n’en oublie aucun et n’en invente aucun', () => {
    expect(LEGENDE.map((entree) => entree.etat).sort()).toEqual([...ETATS_DE_CASE].sort())
  })

  it('rend une entrée par état', () => {
    const { container } = render(<Legende />)
    expect(container.querySelectorAll('[data-legende]').length).toBe(ETATS_DE_CASE.length)
  })
})

describe('chaque entrée porte la silhouette rendue et son libellé', () => {
  it('rend la silhouette par le composant, jamais par une capture', () => {
    const { container } = render(<Legende />)

    for (const entree of LEGENDE) {
      const ligne = container.querySelector(`[data-legende="${entree.etat}"]`)
      expect(ligne, `l’entrée « ${entree.etat} »`).not.toBeNull()

      if (entree.silhouette === null) {
        // Quatre états ne portent aucune silhouette — libre, productif, stérile,
        // bâtiment posé. Leur clé est ailleurs : le cadre d'emprise, la marque
        // d'angle. La légende doit donc les **montrer autrement**, pas les taire.
        expect(ligne?.querySelector('[data-repere]'), entree.etat).not.toBeNull()
        continue
      }

      const svg = ligne?.querySelector('svg[data-silhouette]')
      expect(svg, `la silhouette de « ${entree.etat} »`).not.toBeNull()
      expect(svg?.getAttribute('data-silhouette')).toBe(entree.silhouette)
    }
  })

  it('porte un libellé lisible sur chaque entrée', () => {
    render(<Legende />)
    for (const entree of LEGENDE) {
      expect(screen.getByText(entree.libelle), `le libellé de ${entree.etat}`).toBeDefined()
    }
  })

  /**
   * Le § 7 du contrat : « chaque `data-glyphe` de la légende apparaît dans la table
   * des états ». Une légende qui montrerait une forme que la grille ne dessine pas
   * enseignerait une clé fausse — le défaut le plus coûteux possible sur un écran
   * dont toute la lisibilité repose sur la clé.
   */
  it('ne montre aucune silhouette absente du vocabulaire des états', () => {
    const { container } = render(<Legende />)
    const dansLaLegende = [...container.querySelectorAll('svg[data-silhouette]')].map((svg) =>
      svg.getAttribute('data-silhouette'),
    )
    const dansLaTable = LEGENDE.map((entree) => entree.silhouette).filter(
      (silhouette) => silhouette !== null,
    )

    for (const silhouette of dansLaLegende) {
      expect(dansLaTable as readonly (string | null)[]).toContain(silhouette)
    }
  })

  /** Les marques d'angle sont des silhouettes du même vocabulaire de sept. */
  it('distingue productif et stérile par le trait de leur marque', () => {
    const { container } = render(<Legende />)
    const productif = container.querySelector('[data-legende="gisement-productif"] [data-marque]')
    const sterile = container.querySelector('[data-legende="gisement-sterile"] [data-marque]')

    expect(productif?.getAttribute('data-trait')).toBe('plein')
    expect(sterile?.getAttribute('data-trait')).toBe('evide')
  })
})

describe('la légende est atteignable, et elle n’est pas une commande (FR-018, FR-025)', () => {
  it('porte un intitulé', () => {
    render(<Legende />)
    expect(screen.getByText(/légende/i)).toBeDefined()
  })

  it('n’est ni un lien ni un bouton — elle n’a aucun effet à produire', () => {
    const { container } = render(<Legende />)
    expect(container.querySelectorAll('a, button').length).toBe(0)
  })

  /**
   * FR-018 exige qu'elle soit atteignable **sur toutes les largeurs**. Le document
   * n'a qu'un ordre : la légende y est toujours présente, et c'est le guichet qui
   * la déplace visuellement au-delà du palier (R10). Rien ici ne la masque.
   */
  it('ne se replie derrière aucun mécanisme d’ouverture', () => {
    const { container } = render(<Legende />)
    expect(container.querySelectorAll('details, dialog, [hidden]').length).toBe(0)
  })
})
