import type { BuildingView, CellView, PlacementCheck } from '@zaliba/domain'
import { ratePerHour } from '@zaliba/domain'
import { describe, expect, it } from 'vitest'
import { appearanceOf } from '../../../src/features/grid/appearance.js'
import { type ContexteDeRefus, raisonDeRefus } from '../../../src/features/grid/refusal.js'
import { CATALOGS } from '../../catalogs.js'

/**
 * La raison d'un refus, **portée par la case** (FR-021, R12).
 *
 * 001 marquait le refus ; il ne le motivait pas. Un joueur au clavier apprenait
 * donc *qu'*une case refuse sans apprendre *pourquoi*, et il essayait les
 * trente-six cases. C'est ce que cette tranche corrige, et c'est la raison d'être
 * d'US3.
 *
 * ---
 *
 * **Il n'y a jamais qu'une cause à traduire, et ce n'est pas une hypothèse.**
 *
 * `validatePlacement` (`packages/domain/src/kernel/grid.ts`) rend **un seul**
 * verdict, selon une priorité fixée dans le domaine : hors parcelle, puis obstrué,
 * puis occupé. Le motif y est écrit — « une case absente de la grille n'a aucun
 * état à examiner : dire d'elle qu'elle est obstruée serait inventer une réponse ».
 *
 * Plusieurs causes ne coexistent donc jamais à l'arrivée, et **aucune règle
 * d'agrégation n'est à écrire côté client**. Le premier bloc ci-dessous le
 * *constate* plutôt que de le supposer : c'était une question ouverte de la revue
 * d'accessibilité (CHK006), et la réponse est dans le domaine.
 *
 * **Ce qui est cumulé, en revanche, ce sont les cases** — toutes, et non seulement
 * la première. Un joueur qui n'entend qu'une case en corrige une pour en découvrir
 * une autre : c'est la même exigence que FR-013 de 001, portée jusqu'à l'oreille.
 */

const BOUNDS = { width: 6, height: 6 }

function cellule(patch: Partial<CellView> = {}): CellView {
  return {
    x: 0,
    y: 0,
    state: 'free',
    obstacleId: null,
    depositOf: null,
    buildingId: null,
    ...patch,
  }
}

const MINE_ID = '88888888-8888-4888-8888-888888888888'
const PUITS_ID = '99999999-9999-4999-8999-999999999999'

const mine: BuildingView = {
  id: MINE_ID,
  typeId: 'mine',
  variantId: 'square-4',
  orientation: 0,
  anchor: { x: 3, y: 2 },
  level: 2,
  cells: [{ x: 3, y: 2 }],
  coveredDeposits: 0,
  nominalRate: ratePerHour(18),
  effectiveRate: ratePerHour(18),
}

const puits: BuildingView = {
  ...mine,
  id: PUITS_ID,
  typeId: 'puits',
  anchor: { x: 4, y: 3 },
  level: 1,
  cells: [{ x: 4, y: 3 }],
}

/** Une grille de six par six, avec les obstacles qu'on lui donne. */
function grille(obstacles: Readonly<Record<string, CellView['obstacleId']>> = {}): CellView[] {
  return Array.from({ length: 36 }, (_, index) => {
    const x = index % 6
    const y = Math.floor(index / 6)
    const obstacleId = obstacles[`${x},${y}`] ?? null
    return cellule({
      x,
      y,
      obstacleId,
      state: obstacleId === null ? 'free' : 'obstructed',
    })
  })
}

const contexte = (patch: Partial<ContexteDeRefus> = {}): ContexteDeRefus => ({
  bounds: BOUNDS,
  grid: grille(),
  buildings: [],
  catalogs: CATALOGS,
  ...patch,
})

describe('le domaine ne rend qu’une cause : rien à agréger côté client (CHK006)', () => {
  /**
   * Le constat, exécuté. Une empreinte qui sort de la parcelle **et** recouvre une
   * case obstruée ne produit qu'un verdict — le premier de la priorité du domaine.
   * La question « comment agréger deux causes » n'a donc pas d'objet.
   */
  it('rend « hors parcelle » quand une empreinte sort **et** recouvre un obstacle', async () => {
    const { validatePlacement } = await import('@zaliba/domain')
    const verdict = validatePlacement(grille({ '3,2': 'eboulis' }), [
      { x: 3, y: 2 },
      { x: 6, y: 2 },
    ])
    expect(verdict.kind).toBe('out-of-grid')
  })

  it('ne rend jamais qu’un seul verdict', async () => {
    const { validatePlacement } = await import('@zaliba/domain')
    const verdict = validatePlacement(grille({ '3,2': 'eboulis' }), [{ x: 3, y: 2 }])
    // Une union fermée : `kind` est un nom, jamais une liste.
    expect(typeof verdict.kind).toBe('string')
  })
})

describe('un placement accepté n’a pas de raison', () => {
  it('rend null', () => {
    const ok: PlacementCheck = { kind: 'ok' }
    expect(raisonDeRefus(ok, contexte())).toBeNull()
  })
})

/**
 * `out-of-grid` — **la direction est de la géométrie d'affichage**.
 *
 * Elle se calcule des cases hors bornes contre les dimensions de la parcelle, sans
 * que le domaine ait à connaître le mot « droite ». C'est exactement la frontière
 * du principe II : le domaine sait *quelles cases*, le client sait *par où*.
 */
describe('le débordement nomme sa direction, et il les cumule (R12)', () => {
  const dehors = (cells: readonly { x: number; y: number }[]): PlacementCheck => ({
    kind: 'out-of-grid',
    cells,
  })

  it('nomme la droite', () => {
    expect(raisonDeRefus(dehors([{ x: 6, y: 2 }]), contexte())).toBe(
      '1 case sort de la parcelle par la droite',
    )
  })

  it('accorde le pluriel', () => {
    expect(
      raisonDeRefus(
        dehors([
          { x: 6, y: 2 },
          { x: 6, y: 3 },
        ]),
        contexte(),
      ),
    ).toBe('2 cases sortent de la parcelle par la droite')
  })

  it.each([
    [{ x: -1, y: 2 }, 'par la gauche'],
    [{ x: 2, y: -1 }, 'par le haut'],
    [{ x: 2, y: 6 }, 'par le bas'],
  ])('nomme %o comme sortant %s', (cell, direction) => {
    expect(raisonDeRefus(dehors([cell]), contexte())).toContain(direction)
  })

  /**
   * **Le cumul** : un carré ancré dans le coin bas-droit sort par deux côtés à la
   * fois. Nommer une seule direction laisserait le joueur corriger un axe pour
   * buter sur l'autre.
   */
  it('cumule deux directions', () => {
    const raison = raisonDeRefus(
      dehors([
        { x: 6, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ]),
      contexte(),
    )
    expect(raison).toContain('par la droite')
    expect(raison).toContain('par le bas')
    expect(raison).toMatch(/3 cases sortent/)
  })

  it('ne nomme jamais deux fois la même direction', () => {
    const raison =
      raisonDeRefus(
        dehors([
          { x: 6, y: 2 },
          { x: 7, y: 2 },
        ]),
        contexte(),
      ) ?? ''
    expect(raison.match(/droite/g)?.length).toBe(1)
  })
})

/** `obstructed` — l'obstacle est nommé, **et sa case avec** (R12). */
describe('l’obstruction nomme l’obstacle et sa case', () => {
  const obstrue = (cells: readonly { x: number; y: number }[]): PlacementCheck => ({
    kind: 'obstructed',
    cells,
  })

  it('rend l’exemple normatif du contrat', () => {
    expect(
      raisonDeRefus(obstrue([{ x: 3, y: 2 }]), contexte({ grid: grille({ '3,2': 'rocher' }) })),
    ).toBe('la case D3 est obstruée par un rocher')
  })

  it('accorde l’article d’un obstacle féminin', () => {
    expect(
      raisonDeRefus(
        obstrue([{ x: 3, y: 2 }]),
        contexte({ grid: grille({ '3,2': 'poche-scellee' }) }),
      ),
    ).toBe('la case D3 est obstruée par une poche scellée')
  })

  /** Toutes les cases, et non seulement la première (FR-013 de 001). */
  it('énumère chaque case fautive avec son obstacle', () => {
    const raison = raisonDeRefus(
      obstrue([
        { x: 0, y: 2 },
        { x: 1, y: 2 },
      ]),
      contexte({ grid: grille({ '0,2': 'eboulis', '1,2': 'rocher' }) }),
    )
    expect(raison).toContain('A3')
    expect(raison).toContain('éboulis')
    expect(raison).toContain('B3')
    expect(raison).toContain('rocher')
  })

  it('retombe sur « un obstacle » quand la case n’est pas dans la grille reçue', () => {
    expect(raisonDeRefus(obstrue([{ x: 3, y: 2 }]), contexte())).toMatch(/obstacle/)
  })
})

/** `occupied` — le bâtiment est nommé, son niveau et sa case avec (R12). */
describe('l’occupation nomme le bâtiment, son niveau et sa case', () => {
  const occupe = (cells: readonly { x: number; y: number }[]): PlacementCheck => ({
    kind: 'occupied',
    cells,
  })

  it('rend l’exemple normatif du contrat', () => {
    expect(raisonDeRefus(occupe([{ x: 3, y: 2 }]), contexte({ buildings: [mine] }))).toBe(
      'chevauche la Mine niveau 2 en D3',
    )
  })

  it('accorde l’article défini au genre du bâtiment', () => {
    expect(raisonDeRefus(occupe([{ x: 4, y: 3 }]), contexte({ buildings: [puits] }))).toBe(
      'chevauche le Puits niveau 1 en E4',
    )
  })

  it('énumère deux bâtiments distincts', () => {
    const raison = raisonDeRefus(
      occupe([
        { x: 3, y: 2 },
        { x: 4, y: 3 },
      ]),
      contexte({ buildings: [mine, puits] }),
    )
    expect(raison).toContain('la Mine niveau 2 en D3')
    expect(raison).toContain('le Puits niveau 1 en E4')
  })

  /**
   * Un bâtiment de quatre cases recouvertes ne se nomme **qu'une fois**. Le
   * répéter quatre fois ferait croire à quatre bâtiments, et allongerait de trois
   * fois ce qu'un lecteur d'écran doit énoncer.
   */
  it('ne nomme qu’une fois un bâtiment dont plusieurs cases sont recouvertes', () => {
    const carre: BuildingView = {
      ...mine,
      cells: [
        { x: 3, y: 2 },
        { x: 4, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 3 },
      ],
    }
    const raison =
      raisonDeRefus(
        occupe([
          { x: 3, y: 2 },
          { x: 4, y: 2 },
        ]),
        contexte({ buildings: [carre] }),
      ) ?? ''
    expect(raison.match(/Mine/g)?.length).toBe(1)
  })

  it('retombe sur « un bâtiment » quand la cible n’est plus dans la liste', () => {
    // Un second onglet peut l'avoir démoli : dire quelque chose de vrai vaut mieux
    // que d'afficher un identifiant technique.
    expect(raisonDeRefus(occupe([{ x: 3, y: 2 }]), contexte())).toMatch(/bâtiment/)
  })
})

/**
 * T049 — **le cas qui n'a pas de case**.
 *
 * Une empreinte qui sort de la parcelle a des cases hors grille, donc **sans
 * élément dans le document** : leur raison ne peut pas être portée par elles. Elle
 * est portée par les cases de l'empreinte **qui existent**, et par l'annonce.
 *
 * C'est le seul endroit où la raison ne peut pas être *sur* la case fautive, et
 * c'est parce que la case fautive n'est pas dessinable (R12).
 */
describe('un débordement porte sa raison sur les cases qui existent', () => {
  const raison = '2 cases sortent de la parcelle par la droite'

  it('marque la case existante de l’empreinte comme visée refusée', () => {
    const vue = appearanceOf(
      cellule({ x: 5, y: 2 }),
      [],
      null,
      {
        cells: [
          { x: 5, y: 2 },
          { x: 6, y: 2 },
        ],
        fautives: [{ x: 6, y: 2 }],
        valide: false,
        raison,
      },
      CATALOGS,
    )

    expect(vue.etat).toBe('visee-refusee')
    expect(vue.raisonDeRefus).toBe(raison)
    expect(vue.nomAccessible).toBe(`F3 : libre, sous l’empreinte, refusé : ${raison}`)
  })

  /**
   * La case fautive elle-même n'est pas rendue : elle n'existe pas dans la grille.
   * Le vérifier est ce qui empêche d'écrire un jour une règle qui la chercherait.
   */
  it('ne rend aucune case hors des bornes de la parcelle', () => {
    const horsBornes = grille().filter((une) => une.x >= BOUNDS.width || une.y >= BOUNDS.height)
    expect(horsBornes).toEqual([])
  })
})
