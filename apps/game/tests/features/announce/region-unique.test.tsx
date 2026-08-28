import { cleanup, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderEcran } from '../regie/ecran.js'

/**
 * **Une seule région d'annonce polie sur l'écran** (FR-022, INV-N1).
 *
 * L'écran en comptait **deux** avant cette tranche, et c'est un défaut :
 * `GridLiveRegion` portait `role="status"`, et `BuildPanel` en portait un second.
 * Deux régions polies sur une même page se disputent l'ordre de restitution — le
 * joueur entend l'une des deux, sans savoir laquelle, et l'information qu'il croit
 * complète ne l'est pas.
 *
 * **Les régions assertives ne sont pas comptées**, et l'exception est nommée par
 * FR-022 : `RefusalNotice` garde son `role="alert"`. C'est une autre urgence — un
 * refus de commande interrompt légitimement, un déplacement de curseur non — et
 * c'est l'inverse du choix fait pour la région de curseur, pour la raison inverse.
 */

afterEach(cleanup)

/**
 * Ce que « région polie » veut dire, écrit une fois.
 *
 * `role="status"` **implique** `aria-live="polite"` : compter les deux séparément
 * laisserait passer une seconde région déclarée par son rôle plutôt que par son
 * attribut. C'est précisément la forme que prenait celle de `BuildPanel`.
 */
function regionsPolies(racine: HTMLElement): readonly Element[] {
  return [...racine.querySelectorAll('[aria-live="polite"], [role="status"]')].filter(
    (noeud) =>
      noeud.getAttribute('role') !== 'alert' && noeud.getAttribute('aria-live') !== 'assertive',
  )
}

describe('l’écran de parcelle ne porte qu’une région polie (INV-N1)', () => {
  it('en compte exactement une', () => {
    const { container } = renderEcran()
    const polies = regionsPolies(container)

    expect(
      polies.length,
      `régions polies trouvées :\n  ${polies.map((une) => une.outerHTML.slice(0, 120)).join('\n  ')}`,
    ).toBe(1)
  })

  /**
   * **Montée en permanence, et vide au départ.** Un conteneur créé au moment de
   * l'annonce n'est pas lu de façon fiable : les lecteurs d'écran n'observent que
   * les régions live déjà présentes dans le document.
   */
  it('la monte dès le premier rendu, et vide', () => {
    const { container } = renderEcran()
    const region = regionsPolies(container)[0]

    expect(region, 'la région doit exister au premier rendu').toBeDefined()
    expect((region?.textContent ?? '').trim()).toBe('')
  })

  it('la déclare atomique — l’annonce se lit d’un bloc', () => {
    const { container } = renderEcran()
    expect(regionsPolies(container)[0]?.getAttribute('aria-atomic')).toBe('true')
  })

  it('reste unique après une pose refusée, qui ajoute une région **assertive**', async () => {
    const utilisateur = userEvent.setup()
    const { container } = renderEcran()

    const cases = screen.getAllByRole('gridcell')
    const enA2 = cases[6]
    if (enA2 === undefined) throw new Error('grille trop courte')
    await utilisateur.click(enA2)
    await utilisateur.click(screen.getByRole('radio', { name: 'Mine' }))
    await utilisateur.click(screen.getByRole('button', { name: 'JE POSE ÇA' }))

    expect(screen.getByRole('alert'), 'le refus de commande est assertif').toBeDefined()
    expect(regionsPolies(container).length, 'et la région polie reste unique').toBe(1)
  })

  /**
   * La seconde région de `BuildPanel` : elle annonçait la grille pleine. Le message
   * n'est pas perdu — il est porté par l'annonce unique —, mais la **région** a
   * disparu, et c'est ce qui est vérifié ici.
   */
  it('ne porte plus la seconde région polie du panneau de construction', () => {
    const { container } = renderEcran()
    const dansLesActions = container.querySelector('[data-bloc="pose"]')
    expect(
      dansLesActions === null ? [] : regionsPolies(dansLesActions as HTMLElement),
      'le panneau de construction ne porte plus de région polie',
    ).toEqual([])
  })
})
