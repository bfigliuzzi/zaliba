import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlaqueEnTete } from '../../../src/features/regie/PlaqueEnTete.js'

/**
 * La plaque d'en-tête (FR-008, FR-008a, FR-038).
 *
 * Elle porte **l'identité de la planète** et le surtitre administratif de la
 * Régie. Tant que la planète n'a pas de nom propre, c'est le nom de son archétype
 * qui tient ce rôle : le Berceau est le même pour tous, et l'écrire est plus vrai
 * qu'inventer « Fond de Tiroir ».
 *
 * **FR-008a est le sujet de la moitié de ce fichier.** La maquette montre un
 * ancien nom raturé, des coordonnées système et quatre possessions ; le modèle de
 * 001 n'en alimente aucun. Les remplir d'une valeur inventée aurait produit un
 * écran plausible et faux — et c'est la faute la plus facile à commettre en
 * partant d'une maquette de haute fidélité. Les zones sont donc **omises**, et
 * l'agencement reste celui de la cible pour que l'arrivée du système solaire ne
 * redispose pas l'écran.
 */

afterEach(cleanup)

const rendre = () => render(<PlaqueEnTete archetypeId="berceau" />)

describe('l’identité de la planète est le titre de l’écran', () => {
  it('porte un h1', () => {
    rendre()
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
  })

  /**
   * Le nom d'archétype **tant qu'il n'y a pas de nom propre** (FR-008).
   *
   * Et non « Ma planète », qui était le titre de 001 : il ne disait pas *où* le
   * joueur était, ce qui est la première des quatre choses que l'écran doit dire
   * en une seconde.
   */
  it('affiche le nom de l’archétype, et non un intitulé générique', () => {
    rendre()
    const titre = screen.getByRole('heading', { level: 1 })
    expect(titre.textContent).toMatch(/berceau/i)
    expect(titre.textContent).not.toMatch(/ma planète/i)
  })
})

describe('le surtitre est du décor, et il est marqué comme tel', () => {
  /**
   * `data-role-texte="decor"` n'est pas une commodité de test : c'est ce qui
   * permet à la porte du plancher typographique de mesurer le bon seuil (FR-039).
   * Un nœud **non marqué** est présumé porteur d'information — le défaut est du
   * côté exigeant, donc un oubli échoue le test au lieu de passer.
   */
  it('porte data-role-texte="decor"', () => {
    const { container } = rendre()
    const surtitre = container.querySelector('[data-role-texte="decor"]')
    expect(surtitre, 'le surtitre administratif doit être marqué comme décor').not.toBeNull()
    expect(surtitre?.textContent).toMatch(/régie interplanétaire/i)
  })

  /** FR-038 : aucun texte humoristique n'est cliquable ni porteur d'information. */
  it('n’est ni un lien ni un bouton', () => {
    const { container } = rendre()
    for (const decor of container.querySelectorAll('[data-role-texte="decor"]')) {
      expect(decor.querySelector('a, button')).toBeNull()
      expect(decor.closest('a, button')).toBeNull()
    }
  })
})

describe('le tampon est du décor pur', () => {
  it('est masqué aux technologies d’assistance', () => {
    const { container } = rendre()
    const tampon = container.querySelector('[data-tampon]')
    expect(tampon, 'le tampon « VU, MAIS PAS LU »').not.toBeNull()
    expect(tampon?.getAttribute('aria-hidden')).toBe('true')
  })

  /**
   * Le tampon est la **seule** exception au plafond de rotation de 1,5° (FR-032).
   *
   * Il ne porte aucune information et il est masqué : c'est ce qui rend
   * l'exception soutenable, et c'est pourquoi elle est vérifiée ici plutôt que
   * supposée.
   */
  it('ne dit rien que l’écran ne dise ailleurs', () => {
    rendre()
    /*
      **`ignore` est indispensable ici**, et l'oublier est le piège de ce test :
      `queryByText` ne respecte pas `aria-hidden` — seul `getByRole` le fait —,
      donc l'assertion trouvait le tampon et prouvait le contraire de ce qu'elle
      annonçait. En excluant l'arbre masqué, elle dit ce qu'elle doit dire : rien
      de ce que le tampon porte n'est atteignable par une technologie
      d'assistance. S'il l'était, il porterait de l'information, et le plafond de
      rotation de FR-032 s'appliquerait à lui.
    */
    expect(
      screen.queryByText(/VU, MAIS/i, { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' }),
    ).toBeNull()
  })
})

/**
 * FR-008a — **aucune structure n'est construite pour des données qui n'existent
 * pas**.
 *
 * La liste ci-dessous est exhaustive : c'est celle du § 7.2 de `data-model.md`.
 * Chaque entrée est une zone que la maquette montre et que 002 n'affiche pas.
 */
describe('les zones que le modèle de 001 n’alimente pas sont omises (FR-008a)', () => {
  it.each([
    ['l’ancien nom de planète', /trou du cul du monde/i],
    ['les coordonnées système', /1:204:6/],
    ['le nom inventé de la maquette', /fond de tiroir/i],
    ['la date de vérification inventée', /en 2387/i],
  ])('n’affiche pas %s', (_quoi, motif) => {
    const { container } = rendre()
    expect(container.textContent ?? '').not.toMatch(motif)
  })

  it('ne construit aucun réceptacle vide pour elles', () => {
    const { container } = rendre()
    // Pas de composant `Coordonnees` inemployé, pas de liste vide : l'agencement
    // accueillera ces données, mais rien ne les attend aujourd'hui.
    expect(container.querySelector('[data-coordonnees]')).toBeNull()
    expect(container.querySelector('[data-ancien-nom]')).toBeNull()
  })
})
