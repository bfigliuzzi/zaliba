import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { type Rature, useRature } from '../../../src/features/regie/useRature.js'

/**
 * Le crochet de rature (§ 5.3 de data-model, FR-026a, FR-029, R13).
 *
 * Trois propriétés, et la troisième est celle qui a demandé un amendement de la
 * spécification :
 *
 * 1. `{ courante, ancienne: null }` tant que rien n'a changé ;
 * 2. la **dernière valeur différente** est retenue au changement ;
 * 3. **aucune minuterie ne l'efface** (FR-026a). Les deux seules sorties sont le
 *    changement suivant de la même valeur et le démontage.
 */

afterEach(cleanup)

/** Un harnais qui expose l'état du crochet, sans passer par un composant réel. */
function Sonde<T>({ valeur, vu }: { readonly valeur: T; readonly vu: Rature<T>[] }) {
  vu.push(useRature(valeur))
  return null
}

function suivre<T>(depart: T) {
  const vu: Rature<T>[] = []
  const rendu = render(<Sonde valeur={depart} vu={vu} />)
  return {
    vu,
    changer(valeur: T) {
      act(() => {
        rendu.rerender(<Sonde valeur={valeur} vu={vu} />)
      })
    },
    dernier: () => vu[vu.length - 1] as Rature<T>,
    demonter: () => rendu.unmount(),
  }
}

describe('tant que rien ne change, il n’y a rien à corriger', () => {
  it('rend { courante, ancienne: null }', () => {
    const suivi = suivre(2)
    expect(suivi.dernier()).toEqual({ courante: 2, ancienne: null })
  })

  it('reste à null après plusieurs rendus à valeur constante', () => {
    const suivi = suivre(2)
    suivi.changer(2)
    suivi.changer(2)
    expect(suivi.dernier().ancienne).toBeNull()
  })
})

describe('au changement, la dernière valeur différente est retenue', () => {
  it('retient 2 quand la valeur passe à 3', () => {
    const suivi = suivre(2)
    suivi.changer(3)
    expect(suivi.dernier()).toEqual({ courante: 3, ancienne: 2 })
  })

  it('retient l’avant-dernière au changement suivant', () => {
    const suivi = suivre(2)
    suivi.changer(3)
    suivi.changer(4)
    expect(suivi.dernier()).toEqual({ courante: 4, ancienne: 3 })
  })

  /**
   * **La rature subsiste**, et c'est le cœur de FR-026a. Les rendus qui suivent —
   * ceux que la progression des compteurs provoque à chaque seconde — ne l'effacent
   * pas : seul le changement suivant de la **même** valeur la remplace.
   */
  it('subsiste à travers les rendus que rien ne change', () => {
    const suivi = suivre(2)
    suivi.changer(3)
    for (let rendu = 0; rendu < 30; rendu += 1) suivi.changer(3)
    expect(suivi.dernier()).toEqual({ courante: 3, ancienne: 2 })
  })
})

describe('elle repart de null au démontage (§ 5.3)', () => {
  it('un nouveau montage n’hérite d’aucune ancienne valeur', () => {
    const premier = suivre(2)
    premier.changer(3)
    expect(premier.dernier().ancienne).toBe(2)
    premier.demonter()

    const second = suivre(3)
    expect(second.dernier().ancienne, 'rien n’est persisté ni transmis (FR-029)').toBeNull()
  })
})

describe('elle fonctionne sur toute valeur comparable, pas seulement un nombre', () => {
  it('suit une chaîne', () => {
    const suivi = suivre('niveau 2')
    suivi.changer('niveau 3')
    expect(suivi.dernier()).toEqual({ courante: 'niveau 3', ancienne: 'niveau 2' })
  })
})
