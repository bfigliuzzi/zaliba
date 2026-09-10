import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import type { CellView } from '@zaliba/domain'
import { instant, layoutOf, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { ETATS_DE_CASE, type PoseVisee } from '../../../src/features/grid/appearance.js'
import { GridView } from '../../../src/features/grid/GridView.js'
import { useGridCursor } from '../../../src/features/grid/useGridCursor.js'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { CATALOGS } from '../../catalogs.js'
import rawDouzeEtats from '../../fixtures/planet-douze-etats.json' with { type: 'json' }
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * La grille 6×6.
 *
 * **Le canvas est une vue, jamais le contrôle.** L'interaction passe par des
 * éléments du document focalisables, dont l'état est la source de vérité. Une
 * grille peinte serait plus jolie et inatteignable au clavier comme au lecteur
 * d'écran — et FR-058 en fait une exigence, pas une préférence.
 *
 * **FR-060 : jamais la couleur seule.** Une case obstruée, une case libre et une
 * case portant un gisement doivent se distinguer par autre chose qu'une teinte —
 * ici, par le nom accessible de la case. C'est ce qui la rend lisible pour qui
 * ne distingue pas les couleurs, et énonçable pour qui écoute la page.
 */

afterEach(cleanup)

const payload = PlanetSnapshotV1.parse(rawFresh)

/**
 * La parcelle des **douze états**, dont dix tiennent dans un instantané.
 *
 * Les deux derniers — visée valide, visée refusée — viennent de l'empreinte
 * armée : ils décrivent une interaction, pas un état de planète. C'est aussi la
 * parcelle que la recette humaine du quickstart § 10.1 met sous les yeux d'une
 * personne extérieure au projet, en niveaux de gris.
 */
const douzeEtats = PlanetSnapshotV1.parse(rawDouzeEtats)

/**
 * La grille est **contrôlée** : son curseur vit au-dessus d'elle, dans l'écran
 * de planète, parce que le fantôme, l'aperçu, l'annonce et le lancement en
 * dépendent tous. Ce harnais tient donc le curseur à sa place, avec le vrai
 * réducteur — un simulacre de curseur éprouverait le simulacre.
 */
interface HarnaisProps {
  readonly payload?: typeof payload
  /** Les dimensions **imposées**, pour éprouver une parcelle non carrée. */
  readonly bounds?: { readonly width: number; readonly height: number }
  readonly pose?: PoseVisee | null
}

/**
 * Une parcelle **rase** aux dimensions demandées.
 *
 * Les archétypes à venir vont du 3 × 10 au 8 × 4, et aucune disposition ne les
 * porte encore. Fabriquer les cases plutôt que découper celles du Berceau est ce
 * qui rend le cas honnête : découper trente-six cases en dix rangées de trois
 * aurait rendu des cases dont les coordonnées ne correspondent pas à leur place, et
 * le test aurait mesuré le découpage au lieu de la mise en page.
 */
function parcelleRase(width: number, height: number): readonly CellView[] {
  return Array.from({ length: width * height }, (_, index) => ({
    x: index % width,
    y: Math.floor(index / width),
    state: 'free' as const,
    obstacleId: null,
    depositOf: null,
    buildingId: null,
  }))
}

function ControlledGrid({ payload: donnees = payload, bounds, pose = null }: HarnaisProps) {
  const snapshot = snapshotFromContract(donnees, CATALOGS)
  const state = projectPlanet(snapshot, CATALOGS, instant(donnees.planet.consolidatedAt))
  const layout = layoutOf(CATALOGS, donnees.planet.layoutId as never)
  const dimensions = bounds ?? { width: layout.width, height: layout.height }
  const cursor = useGridCursor(dimensions)

  const cells =
    bounds === undefined ? state.grid : parcelleRase(dimensions.width, dimensions.height)

  return (
    <GridView
      cells={cells}
      catalogs={CATALOGS}
      width={dimensions.width}
      height={dimensions.height}
      buildings={bounds === undefined ? state.buildings : []}
      work={bounds === undefined ? state.work : null}
      pose={pose}
      cursorIndex={cursor.index}
      onKey={cursor.handleKey}
      onPoint={cursor.point}
    />
  )
}

function renderGrid(props: HarnaisProps = {}) {
  return render(<ControlledGrid {...props} />)
}

describe('la grille est une grille, au sens du document', () => {
  it('expose un rôle de grille', () => {
    renderGrid()
    expect(screen.getByRole('grid')).toBeDefined()
  })

  it('expose trente-six cases', () => {
    renderGrid()
    expect(screen.getAllByRole('gridcell')).toHaveLength(36)
  })

  it('expose six rangées', () => {
    renderGrid()
    expect(screen.getAllByRole('row')).toHaveLength(6)
  })

  /**
   * `tabindex` mobile : **une seule** case est atteignable par tabulation, et
   * les flèches déplacent le curseur à l'intérieur. Rendre les trente-six cases
   * tabulables obligerait à trente-six tabulations pour traverser la grille.
   */
  it('n’offre qu’un seul point d’entrée au clavier', () => {
    renderGrid()
    const focusable = screen.getAllByRole('gridcell').filter((cell) => cell.tabIndex === 0)
    expect(focusable).toHaveLength(1)
  })

  it('rend les trente-cinq autres cases atteignables au curseur', () => {
    renderGrid()
    const cells = screen.getAllByRole('gridcell')
    expect(cells.filter((cell) => cell.tabIndex === -1)).toHaveLength(35)
  })
})

/**
 * La case à ces coordonnées, atteinte **par sa rangée**.
 *
 * Et non par un index calculé sur la liste plate : une parcelle non carrée casse
 * `y * 6 + x`, et c'est exactement le genre de constante que la spécification
 * refuse (« jamais une constante de 6 × 6 »).
 */
function cellAt(x: number, y: number) {
  const rows = screen.getAllByRole('row')
  const row = rows[y]
  if (row === undefined) throw new Error(`Rangée ${y} absente.`)
  return within(row).getAllByRole('gridcell')[x]
}

describe('l’état d’une case se lit sans la voir (FR-060)', () => {
  it('nomme une case libre', () => {
    renderGrid()
    expect(cellAt(0, 0)?.getAttribute('aria-label')).toMatch(/libre/i)
  })

  it('nomme une case obstruée et son obstacle', () => {
    renderGrid()
    const label = cellAt(3, 0)?.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/obstruée/i)
    expect(label).toMatch(/éboulis/i)
  })

  it('nomme le gisement d’une case qui en porte un', () => {
    renderGrid()
    expect(cellAt(0, 4)?.getAttribute('aria-label')).toMatch(/camelote/i)
  })

  /**
   * *Réécrit par 002.* L'assertion comparait le numéro de colonne en base 1 — donc
   * sans jamais écrire le mot « Colonne », ce qui la rendait invisible à la liste
   * de T017. Elle porte désormais l'**adresse courte** de FR-016, qui est ce que
   * le joueur entend et se dit à l'oral.
   */
  it('annonce toujours la position de la case, par son adresse', () => {
    renderGrid()
    for (const [x, y, adresse] of [
      [0, 0, 'A1'],
      [3, 0, 'D1'],
      [5, 5, 'F6'],
    ] as const) {
      expect(cellAt(x, y)?.getAttribute('aria-label')).toContain(adresse)
    }
  })

  /**
   * Le test qui rend FR-060 vérifiable plutôt que promis : deux états distincts
   * doivent porter des noms accessibles distincts. Une différence purement
   * visuelle ne passerait pas ici.
   */
  it('distingue les trois états autrement que par le style', () => {
    renderGrid()
    const libre = cellAt(0, 0)?.getAttribute('aria-label')
    const obstruee = cellAt(3, 0)?.getAttribute('aria-label')
    const gisement = cellAt(0, 4)?.getAttribute('aria-label')

    expect(new Set([libre, obstruee, gisement]).size).toBe(3)
  })
})

describe('la grille est un tableau de données, pas une image', () => {
  it('porte un nom accessible', () => {
    renderGrid()
    expect(screen.getByRole('grid').getAttribute('aria-label')).toBeTruthy()
  })

  it('annonce ses dimensions', () => {
    renderGrid()
    const grid = screen.getByRole('grid')
    expect(grid.getAttribute('aria-colcount')).toBe('6')
    expect(grid.getAttribute('aria-rowcount')).toBe('6')
  })
})

describe('les flèches déplacent réellement le focus', () => {
  /**
   * Le défaut que les cas précédents ne voyaient pas, et que le parcours de bout
   * en bout a trouvé : déplacer le curseur **n'est pas** déplacer le focus.
   * Changer quel élément porte `tabIndex={0}` ne focalise rien — le navigateur
   * garde le focus là où il était, et un joueur au clavier reste bloqué sur la
   * première case en croyant que la grille ne répond pas.
   *
   * Compter les `tabIndex` ne pouvait pas l'attraper : le compte était juste.
   */
  it('va à la case de droite sur ArrowRight', () => {
    renderGrid()
    const cells = screen.getAllByRole('gridcell')
    const first = cells[0]
    if (first === undefined) throw new Error('grille vide')

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })

    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/B1/)
  })

  it('va à la case du dessous sur ArrowDown', () => {
    renderGrid()
    const cells = screen.getAllByRole('gridcell')
    const first = cells[0]
    if (first === undefined) throw new Error('grille vide')

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })

    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/A2/)
  })

  it('ne bouge pas au bord de la grille', () => {
    renderGrid()
    const cells = screen.getAllByRole('gridcell')
    const first = cells[0]
    if (first === undefined) throw new Error('grille vide')

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    fireEvent.keyDown(document.activeElement ?? first, { key: 'ArrowUp' })

    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/A1/)
  })

  it('ne change pas de rangée en fin de ligne', () => {
    renderGrid()
    const cells = screen.getAllByRole('gridcell')
    const lastOfRow = cells[5]
    if (lastOfRow === undefined) throw new Error('grille trop courte')

    lastOfRow.focus()
    fireEvent.keyDown(lastOfRow, { key: 'ArrowRight' })

    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/F1/)
  })

  /** Le focus suit le curseur : la case atteinte devient la seule tabulable. */
  it('transfère la tabulation à la case atteinte', () => {
    renderGrid()
    const cells = screen.getAllByRole('gridcell')
    const first = cells[0]
    if (first === undefined) throw new Error('grille vide')

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })

    expect(first.tabIndex).toBe(-1)
    expect((document.activeElement as HTMLElement).tabIndex).toBe(0)
  })
})

/**
 * Les crochets de 002 (§ 2.2 du contrat d'interface).
 *
 * **Aucun crochet de 001 n'est retiré.** `data-index`, `data-state`,
 * `data-deposit` et `data-ghost` sont lus par les parcours de bout en bout de 001,
 * et une refonte de rendu qui les emporterait ferait rougir la porte 8 pour une
 * raison sans rapport avec ce qu'elle mesure. Les crochets s'**ajoutent**.
 */
describe('chaque case porte les crochets de 002 (§ 2.2)', () => {
  it('porte data-adresse, et c’est l’adresse de FR-016', () => {
    renderGrid()
    expect(cellAt(0, 0)?.getAttribute('data-adresse')).toBe('A1')
    expect(cellAt(3, 0)?.getAttribute('data-adresse')).toBe('D1')
    expect(cellAt(5, 5)?.getAttribute('data-adresse')).toBe('F6')
  })

  it('porte data-etat, pris dans le vocabulaire fermé des douze', () => {
    renderGrid()
    const etats = screen.getAllByRole('gridcell').map((une) => une.getAttribute('data-etat') ?? '')
    expect(etats.length).toBe(36)
    for (const etat of etats) {
      expect(ETATS_DE_CASE as readonly string[]).toContain(etat)
    }
  })

  it('porte data-glyphe quand l’état en porte une, et l’omet sinon', () => {
    renderGrid({ payload: douzeEtats })

    // Un gisement nu porte la silhouette de sa ressource.
    expect(cellAt(1, 1)?.getAttribute('data-glyphe')).toBe('jus')
    // Une case libre n'en porte aucune — et l'attribut est **absent**, non vide.
    expect(cellAt(2, 5)?.hasAttribute('data-glyphe')).toBe(false)
    // Un bâtiment posé sans gisement dessous n'en porte aucune non plus : son
    // identité est le cadre d'emprise et le niveau lisible dessus (R6).
    expect(cellAt(1, 4)?.hasAttribute('data-glyphe')).toBe(false)
  })

  it('porte data-trait avec la silhouette, et jamais sans elle', () => {
    renderGrid({ payload: douzeEtats })
    expect(cellAt(1, 1)?.getAttribute('data-trait')).toBe('plein')

    for (const une of screen.getAllByRole('gridcell')) {
      if (une.hasAttribute('data-trait')) {
        expect(
          une.hasAttribute('data-glyphe'),
          `${une.getAttribute('data-adresse')} porte un trait sans silhouette`,
        ).toBe(true)
      }
    }
  })

  it('porte data-marque sur les états qui en ont une', () => {
    renderGrid({ payload: douzeEtats })
    // L'obstacle qui libère un gisement nomme la ressource révélée.
    expect(cellAt(3, 2)?.getAttribute('data-marque')).toBe('jus')
    // Le gisement productif : la marque d'angle, pleine.
    expect(cellAt(0, 4)?.getAttribute('data-marque')).toBe('camelote')
    // Le gisement stérile : la même marque, évidée.
    expect(cellAt(4, 4)?.getAttribute('data-marque')).toBe('bave')
    // Un obstacle qui ne libère que du terrain nu n'en porte aucune.
    expect(cellAt(3, 0)?.hasAttribute('data-marque')).toBe(false)
  })

  it('porte data-emprise sur les cases d’un bâtiment', () => {
    renderGrid({ payload: douzeEtats })
    for (const [x, y] of [
      [0, 4],
      [1, 4],
      [0, 5],
      [1, 5],
    ] as const) {
      expect(cellAt(x, y)?.hasAttribute('data-emprise'), `la case (${x},${y}) de la Mine`).toBe(
        true,
      )
    }
    expect(cellAt(2, 5)?.hasAttribute('data-emprise')).toBe(false)
  })

  it.each(['data-index', 'data-state', 'data-deposit', 'data-ghost'])(
    'ne retire pas le crochet de 001 %s',
    (crochet) => {
      renderGrid({
        payload: douzeEtats,
        pose: { cells: [{ x: 2, y: 5 }], fautives: [], valide: true },
      })
      expect(document.querySelectorAll(`[${crochet}]`).length).toBeGreaterThan(0)
    },
  )
})

/**
 * Une parcelle **non carrée** — le cas limite que la spécification nomme.
 *
 * Les archétypes à venir vont du 3 × 10 au 8 × 4. La mise en page, les adresses et
 * les bandes de coordonnées suivent les dimensions reçues, **jamais une constante
 * de 6 × 6** — et c'est le genre de constante qu'un écran garde des années sans
 * que rien ne la révèle, jusqu'à la tranche qui livre un second archétype.
 */
describe('la grille suit les dimensions reçues, jamais une constante (INV-A2)', () => {
  it.each([
    [3, 10],
    [8, 4],
  ])('rend une parcelle de %i × %i', (width, height) => {
    renderGrid({ bounds: { width, height } })

    expect(screen.getAllByRole('row')).toHaveLength(height)
    expect(screen.getByRole('grid').getAttribute('aria-colcount')).toBe(String(width))
    expect(screen.getByRole('grid').getAttribute('aria-rowcount')).toBe(String(height))
  })

  it('adresse la dernière case selon les dimensions, non selon 6 × 6', () => {
    renderGrid({ bounds: { width: 3, height: 10 } })
    const cases = screen.getAllByRole('gridcell')
    expect(cases[0]?.getAttribute('data-adresse')).toBe('A1')
    expect(cases[cases.length - 1]?.getAttribute('data-adresse')).toBe('C10')
  })

  it('porte les bandes de coordonnées à toute dimension (FR-016, INV-A2)', () => {
    for (const [width, height] of [
      [3, 10],
      [8, 4],
      [6, 6],
    ] as const) {
      cleanup()
      const { container } = renderGrid({ bounds: { width, height } })

      const colonnes = container.querySelector('[data-bande="colonnes"]')
      const rangees = container.querySelector('[data-bande="rangees"]')

      expect(colonnes, `bande des colonnes en ${width} × ${height}`).not.toBeNull()
      expect(rangees, `bande des rangées en ${width} × ${height}`).not.toBeNull()
      expect(colonnes?.children.length).toBe(width)
      expect(rangees?.children.length).toBe(height)
    }
  })

  /**
   * Les bandes sont **hors** de `role="grid"` et `aria-hidden` : l'adresse est
   * déjà dans le nom accessible de chaque case, et la lire deux fois ferait de la
   * navigation au lecteur d'écran une répétition (INV-A2).
   */
  it('garde les bandes hors de la grille et masquées', () => {
    const { container } = renderGrid()
    const grille = screen.getByRole('grid')

    for (const nom of ['colonnes', 'rangees']) {
      const bande = container.querySelector(`[data-bande="${nom}"]`)
      expect(bande?.getAttribute('aria-hidden')).toBe('true')
      expect(grille.contains(bande ?? null), `la bande des ${nom} est hors de la grille`).toBe(
        false,
      )
    }
  })

  it('énonce ses dimensions et ses bornes d’adresse dans le nom de la grille', () => {
    renderGrid({ bounds: { width: 8, height: 4 } })
    const nom = screen.getByRole('grid').getAttribute('aria-label') ?? ''
    expect(nom).toMatch(/8 colonnes/)
    expect(nom).toMatch(/A à H/)
    expect(nom).toMatch(/4 rangées/)
    expect(nom).toMatch(/1 à 4/)
  })
})

/**
 * FR-017 et INV-C3 — **l'emprise d'un bâtiment est un seul objet**.
 *
 * C'est le discriminant qui sépare « case libre » de « bâtiment posé » dans le
 * quadruplet d'INV-C1 : sans lui, SC-003 et SC-009 reposeraient sur un rendu que
 * rien ne vérifie. Aucun test ne le portait avant le 2026-08-28.
 */
describe('l’emprise se délimite comme un seul objet (FR-017, INV-C3)', () => {
  const Mine = [
    [0, 4],
    [1, 4],
    [0, 5],
    [1, 5],
  ] as const

  it('ouvre, poursuit et ferme le cadre — debut, milieu, fin', () => {
    renderGrid({ payload: douzeEtats })
    const places = Mine.map(([x, y]) => cellAt(x, y)?.getAttribute('data-emprise'))
    expect(places).toEqual(['debut', 'milieu', 'milieu', 'fin'])
  })

  it('rend le niveau **une seule fois** sur l’emprise, jamais une fois par case', () => {
    renderGrid({ payload: douzeEtats })
    const niveaux = Mine.map(([x, y]) => cellAt(x, y)?.querySelector('[data-niveau]')).filter(
      (noeud) => noeud !== null && noeud !== undefined,
    )
    expect(niveaux.length, 'le niveau doit être rendu une fois sur les quatre cases').toBe(1)
    expect(niveaux[0]?.textContent).toBe('2')
  })

  it('porte le niveau sur la case qui ouvre l’emprise', () => {
    renderGrid({ payload: douzeEtats })
    expect(cellAt(0, 4)?.querySelector('[data-niveau]')?.textContent).toBe('2')
  })

  it('marque « seule » une empreinte d’une seule case', () => {
    // Le déblaiement en cours de B3 cible **une** case : son emprise est unique.
    renderGrid({ payload: douzeEtats })
    expect(cellAt(1, 2)?.getAttribute('data-emprise')).toBe('seule')
  })
})

/**
 * Les **trois derniers exemples normatifs** du § 2.3 : le nom accessible d'une
 * case visée refusée porte `« refusé : … »` **avec sa raison** (FR-021).
 *
 * Les huit premiers sont éprouvés sur `describeCell` sans DOM
 * (`tests/lib/labels.test.ts`) ; ceux-ci le sont **sur la case rendue**, parce que
 * c'est là que l'assemblage peut se tromper : une raison calculée juste et non
 * transmise à l'attribut donnerait une case muette et un test vert.
 */
describe('une case visée refusée nomme sa cause dans son nom accessible (FR-021)', () => {
  const nomDe = (x: number, y: number) => cellAt(x, y)?.getAttribute('aria-label') ?? ''

  /**
   * F1 et non F3 : la troisième rangée du Berceau porte une croûte calcifiée en
   * `(5,2)`. L'exemple normatif du contrat décrit une case **libre** sous
   * l'empreinte, et le choisir sur une case obstruée aurait éprouvé une autre
   * phrase que celle qu'on croit lire.
   */
  it('9 — débordement : les cases existantes portent la raison', () => {
    renderGrid({
      pose: {
        cells: [
          { x: 5, y: 0 },
          { x: 6, y: 0 },
        ],
        fautives: [{ x: 6, y: 0 }],
        valide: false,
        raison: '2 cases sortent de la parcelle par la droite',
      },
    })
    expect(nomDe(5, 0)).toBe(
      'F1 : libre, sous l’empreinte, refusé : 2 cases sortent de la parcelle par la droite',
    )
  })

  it('10 — obstacle : la cause nomme l’obstacle et sa case', () => {
    renderGrid({
      pose: {
        cells: [{ x: 2, y: 5 }],
        fautives: [{ x: 2, y: 5 }],
        valide: false,
        raison: 'la case D3 est obstruée par un rocher',
      },
    })
    expect(nomDe(2, 5)).toBe(
      'C6 : libre, sous l’empreinte, refusé : la case D3 est obstruée par un rocher',
    )
  })

  it('11 — bâtiment : la cause nomme le bâtiment, son niveau et sa case', () => {
    renderGrid({
      pose: {
        cells: [{ x: 2, y: 5 }],
        fautives: [{ x: 2, y: 5 }],
        valide: false,
        raison: 'chevauche la Mine niveau 2 en D3',
      },
    })
    expect(nomDe(2, 5)).toBe(
      'C6 : libre, sous l’empreinte, refusé : chevauche la Mine niveau 2 en D3',
    )
  })

  it('ne porte aucune mention de refus quand la pose est acceptée', () => {
    renderGrid({ pose: { cells: [{ x: 2, y: 5 }], fautives: [], valide: true } })
    expect(nomDe(2, 5)).toBe('C6 : libre, sous l’empreinte')
    expect(nomDe(2, 5)).not.toMatch(/refusé/)
  })

  /**
   * La silhouette double la cause à l'œil : `refus` sur une case refusée, `visee`
   * sur une case acceptée. Jamais la couleur seule (FR-012).
   */
  it('double la cause par une silhouette', () => {
    renderGrid({
      pose: {
        cells: [{ x: 2, y: 5 }],
        fautives: [{ x: 2, y: 5 }],
        valide: false,
        raison: 'la case D3 est obstruée par un rocher',
      },
    })
    expect(cellAt(2, 5)?.getAttribute('data-glyphe')).toBe('refus')
    expect(cellAt(2, 5)?.getAttribute('data-etat')).toBe('visee-refusee')
  })
})
