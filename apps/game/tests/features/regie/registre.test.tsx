import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Registre } from '../../../src/features/regie/Registre.js'

/**
 * Le registre des possessions (FR-007, FR-008a, FR-025, INV-P1, INV-P2).
 *
 * **Deux invariants, et le premier est le plus facile à trahir.** La maquette montre
 * quatre entrées, dont une possession perdue au nom raturé. Le modèle de 001 n'en
 * alimente aucune : il y a **une** planète, celle du joueur. Reproduire la maquette
 * aurait produit un écran plausible et faux, et c'est nommément ce que FR-008a
 * interdit.
 */

afterEach(cleanup)

const COURANTE = [{ nom: 'Berceau', active: true }] as const

describe('le registre énumère les possessions réelles (INV-P1)', () => {
  it('en compte une en 001, et cette entrée est vraie', () => {
    render(<Registre possessions={COURANTE} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem').textContent).toMatch(/Berceau/)
  })

  it.each([
    ['une voisine inventée', /bout du couloir|cul-de-sac/i],
    ['une possession perdue', /bel horizon|perdue/i],
    ['des coordonnées système', /1:2\d\d:\d/],
  ])('n’invente pas %s (FR-008a)', (_quoi, motif) => {
    const { container } = render(<Registre possessions={COURANTE} />)
    expect(container.textContent ?? '').not.toMatch(motif)
  })

  it('grandit avec ce que le modèle lui donne, sans place réservée', () => {
    // L'agencement accueillera le système solaire ; rien ne l'attend aujourd'hui.
    render(
      <Registre
        possessions={[
          { nom: 'Berceau', active: true },
          { nom: 'Bout du Couloir', active: false },
        ]}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('n’affiche rien plutôt qu’un réceptacle vide quand il n’y a rien', () => {
    const { container } = render(<Registre possessions={[]} />)
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })
})

/**
 * INV-P2 et FR-025 — **l'entrée active n'est pas un lien**.
 *
 * Elle désigne l'écran courant, et un lien vers l'écran courant est une commande sans
 * effet. `aria-current="page"` dit ce qu'un lien aurait dit sans promettre une
 * navigation qui n'irait nulle part.
 */
describe('l’entrée active n’est pas une commande (INV-P2, FR-025)', () => {
  it('n’est ni un lien ni un bouton', () => {
    const { container } = render(<Registre possessions={COURANTE} />)
    expect(container.querySelectorAll('a, button')).toHaveLength(0)
  })

  it('se désigne par aria-current plutôt que par un lien', () => {
    render(<Registre possessions={COURANTE} />)
    expect(screen.getByRole('listitem').getAttribute('aria-current')).toBe('page')
  })

  it('ne marque comme courante que l’entrée active', () => {
    const { container } = render(
      <Registre
        possessions={[
          { nom: 'Berceau', active: true },
          { nom: 'Bout du Couloir', active: false },
        ]}
      />,
    )
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  /**
   * FR-012 — la teinte inversée de l'entrée active n'est pas un canal suffisant. Le
   * chevron la double à l'œil, et `aria-current` la porte pour tout le monde.
   */
  it('double la teinte de l’entrée active par un repère non chromatique', () => {
    const { container } = render(<Registre possessions={COURANTE} />)
    const chevron = container.querySelector('.registre-chevron')
    expect(chevron, 'le chevron de l’entrée active').not.toBeNull()
    expect(chevron?.getAttribute('aria-hidden')).toBe('true')
  })
})

/**
 * **Un groupe, et non un repère de navigation.**
 *
 * Le réflexe serait `<nav>` — c'est un registre de planètes. Mais R10 établit que ce
 * bloc ne contient **aucun élément focalisable** : l'entrée active désigne l'écran
 * courant et n'est pas un lien, et les autres n'existent pas encore. Un repère de
 * navigation qui ne mène nulle part encombre la navigation par repères, et l'écran en
 * porte déjà un — la navigation principale de 001.
 */
describe('le registre est un groupe nommé, non un repère de navigation', () => {
  it('porte un nom accessible', () => {
    render(<Registre possessions={COURANTE} />)
    expect(screen.getByRole('group', { name: /registre des possessions/i })).toBeDefined()
  })

  it('n’ajoute aucun repère de navigation', () => {
    render(<Registre possessions={COURANTE} />)
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('porte l’intitulé de la Régie', () => {
    render(<Registre possessions={COURANTE} />)
    expect(screen.getByText(/registre des possessions/i)).toBeDefined()
  })
})
