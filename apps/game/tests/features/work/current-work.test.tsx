import { cleanup, render, screen } from '@testing-library/react'
import type { WorkView } from '@zaliba/domain'
import { duration, instant } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { CurrentWork } from '../../../src/features/work/CurrentWork.js'

/**
 * Le chantier en cours : nature, **cible** et temps restant (FR-038).
 *
 * La cible est ce qui manquait au premier écran, et son absence n'était pas
 * anodine : « construction en cours, deux minutes » ne dit pas *quoi*, donc ne
 * permet pas de vérifier qu'on a lancé ce qu'on croyait lancer. Or un chantier
 * n'est ni annulable ni remplaçable (FR-037) — c'est précisément quand l'erreur
 * est irréversible que le joueur doit pouvoir la constater.
 */

afterEach(cleanup)

const T0 = instant(1_787_750_000)

function work(overrides: Partial<WorkView> = {}): WorkView {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    nature: 'build',
    target: {
      kind: 'build',
      typeId: 'mine',
      variantId: 'square-4',
      orientation: 0,
      anchor: { x: 0, y: 4 },
    },
    startedAt: T0,
    dueAt: instant(T0 + 120),
    remaining: duration(120),
    ...overrides,
  }
}

describe('sans chantier, l’écran le dit', () => {
  it('annonce l’absence plutôt que de ne rien montrer', () => {
    render(<CurrentWork work={null} />)
    expect(screen.getByRole('group', { name: /chantier/i }).textContent).toMatch(/aucun chantier/i)
  })
})

describe('avec un chantier, les trois informations de FR-038 sont là', () => {
  it('nomme la nature', () => {
    render(<CurrentWork work={work()} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/construction/i)
  })

  it('nomme la cible : le type, l’empreinte et la position', () => {
    render(<CurrentWork work={work()} />)
    const shown = screen.getByRole('group', { name: /chantier/i }).textContent ?? ''
    expect(shown).toMatch(/Mine/)
    expect(shown).toMatch(/carré de quatre/i)
    expect(shown).toContain('Colonne 1, rangée 5')
  })

  it('donne le temps restant en clair', () => {
    render(<CurrentWork work={work({ remaining: duration(90) })} />)
    expect(screen.getByRole('group', { name: /chantier/i }).textContent).toMatch(/2 min/)
  })

  /**
   * FR-037 est énoncé à l'écran, et non seulement tenu par l'absence de route.
   * Un joueur qui cherche le bouton d'annulation doit apprendre qu'il n'existe
   * pas, au lieu de continuer à le chercher.
   */
  it('énonce qu’un chantier n’est ni annulable ni remplaçable', () => {
    render(<CurrentWork work={work()} />)
    expect(screen.getByRole('group', { name: /chantier/i }).textContent).toMatch(
      /ni annulé ni remplacé/i,
    )
  })

  it('n’offre aucun bouton d’annulation', () => {
    render(<CurrentWork work={work()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('les autres natures ont leur libellé et leur cible', () => {
  it('nomme un déblaiement par sa case', () => {
    render(
      <CurrentWork
        work={work({ nature: 'clear', target: { kind: 'cell', cell: { x: 3, y: 2 } } })}
      />,
    )
    const shown = screen.getByRole('group', { name: /chantier/i }).textContent ?? ''
    expect(shown).toMatch(/déblaiement/i)
    expect(shown).toContain('Colonne 4, rangée 3')
  })

  it.each([
    ['upgrade', /amélioration/i],
    ['demolish', /démolition/i],
  ] as const)('nomme %s', (nature, expected) => {
    render(<CurrentWork work={work({ nature, target: { kind: 'building', buildingId: 'b-1' } })} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(expected)
  })

  /**
   * La cible d'une amélioration reste sans nom de bâtiment : le nommer
   * demanderait la liste des bâtiments projetés, et les tranches qui produisent
   * ce genre de chantier ne sont pas livrées. Afficher un identifiant technique
   * en attendant serait pire que ne rien dire.
   */
  it('n’affiche jamais un identifiant technique', () => {
    render(
      <CurrentWork
        work={work({
          nature: 'upgrade',
          target: { kind: 'building', buildingId: 'b-1234-technique' },
        })}
      />,
    )
    expect(screen.getByRole('group', { name: /chantier/i }).textContent).not.toContain(
      'b-1234-technique',
    )
  })
})
