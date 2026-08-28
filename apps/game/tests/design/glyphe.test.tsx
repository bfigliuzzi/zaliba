import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Glyphe, SILHOUETTES, type Silhouette } from '../../src/design/Glyphe.js'

/**
 * Le vocabulaire de silhouettes (INV-S1, INV-S2, INV-S4).
 *
 * **C'est le canal qui porte l'accessibilité de la grille.** Les hachures de la
 * version précédente ont été supprimées ; tout tient désormais à la forme, qui se
 * lit à quatre pixels de large et sous n'importe quel filtre. Sans elle, la
 * refonte serait une **régression** par rapport aux caractères `▓ ■ · ◆` de 001,
 * qui se lisaient en noir et blanc.
 *
 * Trois invariants, et chacun est ce qui fait survivre une silhouette au mode
 * contrastes forcés :
 *
 * - **INV-S1** — `fill="currentColor"` sur chaque forme, sans exception ;
 * - **INV-S2** — un évidement est un **trou** (`fill-rule="evenodd"` sur un
 *   chemin unique), jamais une seconde forme peinte à la teinte du fond ;
 * - **INV-S4** — le vocabulaire ne dépasse pas sept formes. Un huitième état
 *   exige d'ouvrir un canal de redondance — le mot, la position —, jamais une
 *   teinte de plus.
 */

afterEach(cleanup)

/** Les sept formes de R5, nommées ici pour que le test soit opposable au dessin. */
const LES_SEPT: readonly Silhouette[] = [
  'camelote',
  'jus',
  'bave',
  'chantier',
  'obstacle',
  'visee',
  'refus',
]

/**
 * Les trois silhouettes à évidement.
 *
 * R5 en nomme **deux** — `jus` et `bave`. `refus` porte le même défaut dans
 * `tokens.json` : sa croix y est tracée en `stroke="[papier]"`, c'est-à-dire à la
 * teinte du fond. Le constat est consigné en `specs/002-la-regie-approximative/verdicts.md` ;
 * INV-S2 est universel et le couvre.
 */
const A_EVIDEMENT: readonly Silhouette[] = ['jus', 'bave', 'refus']

function dessiner(nom: Silhouette, trait?: 'plein' | 'evide') {
  const { container } = render(
    trait === undefined ? <Glyphe nom={nom} /> : <Glyphe nom={nom} trait={trait} />,
  )
  const svg = container.querySelector('svg')
  if (svg === null) throw new Error(`<Glyphe nom="${nom}" /> ne rend aucun SVG`)
  return svg
}

/** Les nœuds qui peignent réellement quelque chose. */
const formesDe = (svg: SVGElement): readonly Element[] => [
  ...svg.querySelectorAll('path, circle, rect, polygon, polyline, ellipse, line'),
]

describe('le vocabulaire est fermé à sept formes (INV-S4)', () => {
  it('en compte exactement sept, et ce sont celles de R5', () => {
    expect([...SILHOUETTES].sort()).toEqual([...LES_SEPT].sort())
  })

  it('n’en compte pas plus de sept', () => {
    expect(SILHOUETTES.length).toBeLessThanOrEqual(7)
  })
})

describe('chaque silhouette est rendue sur le viewBox du dossier', () => {
  it.each(LES_SEPT)('%s porte viewBox="0 0 24 24"', (nom) => {
    expect(dessiner(nom).getAttribute('viewBox')).toBe('0 0 24 24')
  })

  it.each(LES_SEPT)('%s dessine au moins une forme', (nom) => {
    expect(formesDe(dessiner(nom)).length).toBeGreaterThan(0)
  })

  it.each(LES_SEPT)('%s est masquée aux technologies d’assistance', (nom) => {
    // La silhouette double le nom accessible de la case, elle ne le remplace
    // pas : la lire ferait de la navigation au lecteur d'écran une répétition.
    expect(dessiner(nom).getAttribute('aria-hidden')).toBe('true')
  })
})

describe('chaque forme hérite de la couleur de texte courante (INV-S1)', () => {
  it.each(LES_SEPT)('%s peint en currentColor, et rien d’autre', (nom) => {
    const formes = formesDe(dessiner(nom))
    const fautives = formes
      .map((forme) => forme.getAttribute('fill'))
      .filter((fill) => fill !== 'currentColor')
    expect(
      fautives,
      `un remplissage qui n’est pas currentColor ne survit pas au mode ` +
        `contrastes forcés : ${fautives.join(', ')}`,
    ).toEqual([])
  })

  it.each(LES_SEPT)('%s ne peint aucune teinte littérale', (nom) => {
    const svg = dessiner(nom)
    const litterales = formesDe(svg)
      .flatMap((forme) => [forme.getAttribute('fill'), forme.getAttribute('stroke')])
      .filter((teinte): teinte is string => teinte !== null)
      .filter((teinte) => teinte !== 'currentColor' && teinte !== 'none')
    expect(
      litterales,
      `INV-S2 : une forme peinte à la teinte du fond **rebouche** l’évidement dès ` +
        `que cette teinte devient une couleur système : ${litterales.join(', ')}`,
    ).toEqual([])
  })
})

describe('un évidement est un trou, jamais une seconde forme peinte (INV-S2)', () => {
  it.each(A_EVIDEMENT)('%s est un chemin unique à fill-rule evenodd', (nom) => {
    const svg = dessiner(nom)
    const chemins = svg.querySelectorAll('path')

    expect(chemins.length, `${nom} doit être **un seul** chemin, à trou`).toBe(1)
    expect(chemins[0]?.getAttribute('fill-rule')).toBe('evenodd')
  })

  it.each(A_EVIDEMENT)('%s ne porte aucune seconde forme peinte', (nom) => {
    const svg = dessiner(nom)
    const autres = svg.querySelectorAll('circle, rect, polygon, polyline, ellipse, line')
    expect(
      autres.length,
      `${nom} porte ${autres.length} forme(s) hors du chemin : c’est la dette du ` +
        'dossier de design, et elle ne se reprend pas',
    ).toBe(0)
  })

  it.each(A_EVIDEMENT)('%s décrit au moins deux sous-chemins — le contour et son trou', (nom) => {
    const trace = dessiner(nom).querySelector('path')?.getAttribute('d') ?? ''
    const sousChemins = trace.match(/M/gi) ?? []
    expect(
      sousChemins.length,
      `${nom} n’a qu’un sous-chemin : sans second contour, evenodd ne perce rien`,
    ).toBeGreaterThanOrEqual(2)
  })
})

describe('le modificateur de trait qualifie une forme, sans en ajouter (data-model § 2.2)', () => {
  it.each(LES_SEPT)('%s évidée garde exactement la même géométrie', (nom) => {
    const traces = (trait: 'plein' | 'evide') =>
      formesDe(dessiner(nom, trait))
        .map(
          (forme) =>
            forme.getAttribute('d') ?? forme.outerHTML.replace(/\s(fill|stroke)[^ >]*/g, ''),
        )
        .join('|')

    expect(traces('evide')).toBe(traces('plein'))
  })

  it.each(LES_SEPT)('%s évidée se trace au contour, en currentColor', (nom) => {
    const formes = formesDe(dessiner(nom, 'evide'))
    for (const forme of formes) {
      expect(forme.getAttribute('fill')).toBe('none')
      expect(forme.getAttribute('stroke')).toBe('currentColor')
    }
  })

  it('le trait plein est le défaut — une silhouette non qualifiée est pleine', () => {
    expect(dessiner('camelote').querySelector('path')?.getAttribute('fill')).toBe('currentColor')
  })
})

describe('la taille est portée par la case, jamais par la silhouette', () => {
  it('sans taille demandée, le SVG remplit sa boîte', () => {
    const svg = dessiner('camelote')
    // FR-015 exige 38 % du plus petit côté de la case, et R8 l'exprime en
    // `cqmin` : la proportion est donc vraie **par construction** à toute
    // largeur. Une taille en pixels ici la rendrait vraie à trois largeurs et
    // fausse entre les trois.
    expect(svg.getAttribute('width')).toBe('100%')
    expect(svg.getAttribute('height')).toBe('100%')
  })

  it('une taille demandée s’exprime en em, donc suit le texte', () => {
    const svg = render(<Glyphe nom="bave" taille={2} />).container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('2em')
    expect(svg?.getAttribute('height')).toBe('2em')
  })
})
