import { cleanup, render, screen } from '@testing-library/react'
import type { BuildingView, WorkView } from '@zaliba/domain'
import { duration, instant, ratePerHour } from '@zaliba/domain'
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
const BUILDING_ID = '88888888-8888-4888-8888-888888888888'

/** La mine posée, telle que la projection la rend. */
const MINE: BuildingView = {
  id: BUILDING_ID,
  typeId: 'mine',
  variantId: 'square-4',
  orientation: 0,
  anchor: { x: 0, y: 4 },
  level: 3,
  cells: [
    { x: 0, y: 4 },
    { x: 1, y: 4 },
    { x: 0, y: 5 },
    { x: 1, y: 5 },
  ],
  coveredDeposits: 1,
  nominalRate: ratePerHour(18),
  effectiveRate: ratePerHour(18),
}

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
    render(<CurrentWork work={null} buildings={[]} />)
    expect(screen.getByRole('group', { name: /chantier/i }).textContent).toMatch(/aucun chantier/i)
  })
})

describe('avec un chantier, les trois informations de FR-038 sont là', () => {
  it('nomme la nature', () => {
    render(<CurrentWork work={work()} buildings={[]} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/construction/i)
  })

  it('nomme la cible : le type, l’empreinte et la position', () => {
    render(<CurrentWork work={work()} buildings={[]} />)
    const shown = screen.getByRole('group', { name: /chantier/i }).textContent ?? ''
    expect(shown).toMatch(/Mine/)
    expect(shown).toMatch(/carré de quatre/i)
    expect(shown).toContain('Colonne 1, rangée 5')
  })

  it('donne le temps restant en clair', () => {
    render(<CurrentWork work={work({ remaining: duration(90) })} buildings={[]} />)
    expect(screen.getByRole('group', { name: /chantier/i }).textContent).toMatch(/2 min/)
  })

  /**
   * FR-037 est énoncé à l'écran, et non seulement tenu par l'absence de route.
   * Un joueur qui cherche le bouton d'annulation doit apprendre qu'il n'existe
   * pas, au lieu de continuer à le chercher.
   */
  it('énonce qu’un chantier n’est ni annulable ni remplaçable', () => {
    render(<CurrentWork work={work()} buildings={[]} />)
    expect(screen.getByRole('group', { name: /chantier/i }).textContent).toMatch(
      /ni annulé ni remplacé/i,
    )
  })

  it('n’offre aucun bouton d’annulation', () => {
    render(<CurrentWork work={work()} buildings={[]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('les autres natures ont leur libellé et leur cible', () => {
  it('nomme un déblaiement par sa case', () => {
    render(
      <CurrentWork
        work={work({ nature: 'clear', target: { kind: 'cell', cell: { x: 3, y: 2 } } })}
        buildings={[]}
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
    render(
      <CurrentWork
        work={work({ nature, target: { kind: 'building', buildingId: 'b-1' } })}
        buildings={[]}
      />,
    )
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(expected)
  })

  /**
   * **La cible d'une amélioration est nommée**, depuis US4.
   *
   * Elle est résolue dans la liste des bâtiments projetés — la même liste dont
   * l'aperçu et le panneau d'énergie tirent leurs chiffres. « Un bâtiment posé »
   * suffisait tant qu'aucune tranche ne produisait ce genre de chantier ; dès
   * qu'un joueur peut en lancer un, FR-038 exige de savoir *lequel*, parce qu'un
   * chantier n'est ni annulable ni remplaçable (FR-037).
   */
  it('nomme le bâtiment cible par son type, son niveau et sa position', () => {
    render(
      <CurrentWork
        work={work({ nature: 'upgrade', target: { kind: 'building', buildingId: BUILDING_ID } })}
        buildings={[MINE]}
      />,
    )
    const shown = screen.getByRole('group', { name: /chantier/i }).textContent ?? ''
    expect(shown).toMatch(/Mine/)
    expect(shown).toMatch(/niveau 3/i)
    // La position est énoncée en minuscule initiale : elle est ici au milieu
    // d'une phrase, là où la cible d'une pose la commence.
    expect(shown).toMatch(/colonne 1, rangée 5/i)
  })

  /**
   * Un identifiant technique n'est **jamais** affiché, pas même en repli.
   *
   * Le repli existe : un second onglet peut démolir le bâtiment que ce chantier
   * visait, et la cible cesse alors d'être résoluble. Dire « un bâtiment posé »
   * est vrai et inoffensif ; afficher un UUID serait dire quelque chose
   * d'illisible.
   */
  it('n’affiche jamais un identifiant technique, cible introuvable comprise', () => {
    render(
      <CurrentWork
        work={work({
          nature: 'upgrade',
          target: { kind: 'building', buildingId: 'b-1234-technique' },
        })}
        buildings={[MINE]}
      />,
    )
    const shown = screen.getByRole('group', { name: /chantier/i }).textContent ?? ''
    expect(shown).not.toContain('b-1234-technique')
    expect(shown).toMatch(/un bâtiment posé/i)
  })
})
