import { cleanup, render, screen } from '@testing-library/react'
import type { BuildingView, WorkView } from '@zaliba/domain'
import { duration, instant, ratePerHour } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { PlaqueChantier } from '../../../src/features/regie/PlaqueChantier.js'

/**
 * La plaque de chantier (FR-009, US1-AC3).
 *
 * **Elle reste, même sans chantier**, et elle le dit. C'est un cas limite nommé
 * par la spécification, et le motif est de mise en page autant que de lisibilité :
 * un bloc qui disparaît fait sauter l'écran à chaque achèvement, et une jauge vide
 * sans explication laisse le joueur chercher ce qui se construit.
 *
 * **La jauge est du décor par-dessus un fait déjà écrit.** Elle est masquée aux
 * technologies d'assistance, et l'avancement est publié **en texte** à côté
 * d'elle. C'est la discipline de FR-012 appliquée à une barre : jamais la
 * géométrie seule. Un `role="progressbar"` aurait fait énoncer un pourcentage qui
 * double le chrono, sans rien ajouter.
 */

afterEach(cleanup)

const BUILDING_ID = '88888888-8888-4888-8888-888888888888'

const MINE: BuildingView = {
  id: BUILDING_ID,
  typeId: 'mine',
  variantId: 'square-4',
  orientation: 0,
  anchor: { x: 0, y: 4 },
  cells: [
    { x: 0, y: 4 },
    { x: 1, y: 4 },
    { x: 0, y: 5 },
    { x: 1, y: 5 },
  ],
  level: 2,
  coveredDeposits: 1,
  nominalRate: ratePerHour(18),
  effectiveRate: ratePerHour(18),
}

/**
 * Une amélioration en cours sur la Mine, aux valeurs de la maquette.
 *
 * 38 800 secondes au total, 15 129 restantes : 23 671 écoulées, soit 610 pour
 * mille et **04:12:09** au chrono. L'avancement n'est pas porté par le domaine —
 * il se dérive de `dueAt`, `startedAt` et `remaining`, et c'est de la
 * présentation.
 */
const T0 = instant(1_787_750_000)

const AMELIORATION: WorkView = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  nature: 'upgrade',
  target: { kind: 'building', buildingId: BUILDING_ID },
  startedAt: T0,
  dueAt: instant(T0 + 38_800),
  remaining: duration(15_129),
}

describe('sans chantier, la plaque reste et le dit (US1-AC3)', () => {
  it('porte le groupe nommé « Chantier »', () => {
    render(<PlaqueChantier work={null} buildings={[]} />)
    expect(screen.getByRole('group', { name: /^chantier$/i })).toBeDefined()
  })

  it('énonce explicitement qu’aucun chantier n’est en cours', () => {
    render(<PlaqueChantier work={null} buildings={[]} />)
    expect(screen.getByText(/aucun chantier en cours/i)).toBeDefined()
  })

  /** Ni jauge, ni chrono : une jauge vide se lit comme un chantier à 0 %. */
  it('n’affiche ni jauge ni chrono', () => {
    const { container } = render(<PlaqueChantier work={null} buildings={[]} />)
    expect(container.querySelector('[data-jauge]')).toBeNull()
    expect(container.querySelector('[data-chrono]')).toBeNull()
  })
})

describe('avec un chantier, elle porte les quatre grandeurs de FR-009', () => {
  const rendre = () => render(<PlaqueChantier work={AMELIORATION} buildings={[MINE]} />)

  it('nomme le bâtiment concerné et son niveau', () => {
    const { container } = rendre()
    const texte = container.textContent ?? ''
    expect(texte).toMatch(/mine/i)
    expect(texte).toMatch(/niveau 2/i)
  })

  it('nomme la nature du chantier', () => {
    const { container } = rendre()
    expect(container.textContent ?? '').toMatch(/amélioration/i)
  })

  it('porte une jauge d’avancement', () => {
    const { container } = rendre()
    const jauge = container.querySelector('[data-jauge]')
    expect(jauge, 'la jauge d’avancement').not.toBeNull()
    // 23 671 écoulées sur 38 800 : 610 pour mille.
    expect(Number(jauge?.getAttribute('data-jauge'))).toBe(610)
  })

  it('masque la jauge, et publie l’avancement en texte à côté d’elle', () => {
    const { container } = rendre()
    expect(container.querySelector('[data-jauge]')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('[data-avancement]')?.textContent ?? '').toMatch(/61\s*%/)
  })

  /**
   * Le chrono en `HH:MM:SS`, en chasse fixe tabulaire (FR-002, FR-009).
   *
   * 15 129 secondes font 04:12:09 — la valeur même de la maquette. Le format
   * complet plutôt que « 4 h » : c'est la seule grandeur de l'écran qui bouge à la
   * seconde, et l'arrondir la rendrait immobile.
   */
  it('porte le temps restant au format HH:MM:SS', () => {
    const { container } = rendre()
    const chrono = container.querySelector('[data-chrono]')
    expect(chrono, 'le chrono').not.toBeNull()
    expect(chrono?.textContent).toBe('04:12:09')
  })

  it('range le chrono dans la famille tabulaire', () => {
    const { container } = rendre()
    expect(container.querySelector('[data-chrono]')?.classList.contains('chiffre')).toBe(true)
  })

  /**
   * Un chantier lancé n'est ni annulable ni remplaçable (FR-037 de 001). L'écran
   * le dit, parce que c'est précisément quand l'erreur est irréversible que le
   * joueur doit pouvoir la constater.
   */
  it('redit que le chantier n’est ni annulable ni remplaçable', () => {
    const { container } = rendre()
    expect(container.textContent ?? '').toMatch(/ni annulé ni remplacé/i)
  })
})
