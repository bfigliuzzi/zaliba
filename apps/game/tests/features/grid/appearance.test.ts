import type { ResourceId } from '@zaliba/catalogs'
import type { BuildingView, CellView, WorkView } from '@zaliba/domain'
import { duration, instant, ratePerHour } from '@zaliba/domain'
import { describe, expect, it } from 'vitest'
import {
  appearanceOf,
  type CellAppearance,
  ETATS_DE_CASE,
  type EtatDeCase,
  type PoseVisee,
} from '../../../src/features/grid/appearance.js'
import { CATALOGS } from '../../catalogs.js'

/**
 * Les douze états de case (FR-013, R6, INV-C1, INV-C4).
 *
 * **Douze *lectures* de ce que 001 projette déjà.** Aucune donnée nouvelle, ni
 * côté serveur, ni au contrat : la fonction lit `state`, `depositOf`,
 * `obstacleId`, `buildingId`, les bâtiments projetés, le chantier et l'empreinte
 * armée. Six des douze états ne sont pas dans `CellState` — productif, stérile, les
 * deux natures d'obstacle et les deux visées —, et c'est précisément pourquoi
 * s'en remettre à trois classes CSS sur `data-state` en aurait couvert trois sur
 * douze, les neuf autres retombant sur la teinte : exactement ce que FR-012
 * interdit.
 *
 * **Une fonction pure, éprouvée sans DOM.** C'est ce qui rend SC-003 et SC-009
 * mécanisables à moitié : un automate ne peut pas vérifier qu'un humain reconnaît
 * une forme, il peut vérifier que les douze quadruplets sont **distincts**.
 *
 * **Et elle vit dans le client, pas dans le domaine** (principe II) : « quel
 * glyphe » est une question de présentation. La question de jeu qui la précède —
 * *ce gisement est-il exploité par ce bâtiment ?* — se répond avec
 * `catalogs.buildings[typeId].extracts`, que le client importe déjà.
 */

const T0 = instant(1_787_750_000)

const BATIMENT_ID = '88888888-8888-4888-8888-888888888888'

function cellule(patch: Partial<CellView> = {}): CellView {
  return {
    x: 2,
    y: 2,
    state: 'free',
    obstacleId: null,
    depositOf: null,
    buildingId: null,
    ...patch,
  }
}

function batiment(patch: Partial<BuildingView> = {}): BuildingView {
  return {
    id: BATIMENT_ID,
    typeId: 'mine',
    variantId: 'square-4',
    orientation: 0,
    anchor: { x: 2, y: 2 },
    level: 2,
    cells: [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ],
    coveredDeposits: 1,
    nominalRate: ratePerHour(18),
    effectiveRate: ratePerHour(18),
    ...patch,
  }
}

function chantier(patch: Partial<WorkView> = {}): WorkView {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    nature: 'upgrade',
    target: { kind: 'building', buildingId: BATIMENT_ID },
    startedAt: T0,
    dueAt: instant(T0 + 120),
    remaining: duration(60),
    ...patch,
  }
}

/** L'appel, avec les valeurs par défaut de l'écran au repos. */
function apparence(options: {
  cell: CellView
  buildings?: readonly BuildingView[]
  work?: WorkView | null
  pose?: PoseVisee | null
}): CellAppearance {
  return appearanceOf(
    options.cell,
    options.buildings ?? [],
    options.work ?? null,
    options.pose ?? null,
    CATALOGS,
  )
}

/**
 * Les douze lignes de la table de R6, chacune avec son état attendu.
 *
 * La table est le contrat ; ce tableau est sa transcription exécutable. Un
 * treizième état ne peut pas arriver sans que l'union le dise, et le premier test
 * ci-dessous compare les deux.
 */
const LIGNES: readonly { readonly etat: EtatDeCase; readonly rendu: () => CellAppearance }[] = [
  {
    etat: 'libre',
    rendu: () => apparence({ cell: cellule() }),
  },
  {
    etat: 'gisement-camelote',
    rendu: () => apparence({ cell: cellule({ depositOf: 'camelote' }) }),
  },
  {
    etat: 'gisement-jus',
    rendu: () => apparence({ cell: cellule({ depositOf: 'jus' }) }),
  },
  {
    etat: 'gisement-bave',
    rendu: () => apparence({ cell: cellule({ depositOf: 'bave-etoiles' }) }),
  },
  {
    // La Mine extrait la Camelote : le gisement est **exploité**.
    etat: 'gisement-productif',
    rendu: () =>
      apparence({
        cell: cellule({ state: 'occupied', depositOf: 'camelote', buildingId: BATIMENT_ID }),
        buildings: [batiment({ typeId: 'mine' })],
      }),
  },
  {
    // Le Puits extrait le Jus : sur une veine de Camelote, il ne l'exploite pas.
    etat: 'gisement-sterile',
    rendu: () =>
      apparence({
        cell: cellule({ state: 'occupied', depositOf: 'camelote', buildingId: BATIMENT_ID }),
        buildings: [batiment({ typeId: 'puits' })],
      }),
  },
  {
    etat: 'obstacle-terrain-nu',
    rendu: () => apparence({ cell: cellule({ state: 'obstructed', obstacleId: 'eboulis' }) }),
  },
  {
    etat: 'obstacle-gisement',
    rendu: () => apparence({ cell: cellule({ state: 'obstructed', obstacleId: 'filon-enfoui' }) }),
  },
  {
    etat: 'batiment',
    rendu: () =>
      apparence({
        cell: cellule({ state: 'occupied', buildingId: BATIMENT_ID }),
        buildings: [batiment()],
      }),
  },
  {
    etat: 'chantier',
    rendu: () =>
      apparence({
        cell: cellule({ state: 'occupied', buildingId: BATIMENT_ID }),
        buildings: [batiment()],
        work: chantier(),
      }),
  },
  {
    etat: 'visee-valide',
    rendu: () =>
      apparence({
        cell: cellule(),
        pose: { cells: [{ x: 2, y: 2 }], fautives: [], valide: true },
      }),
  },
  {
    etat: 'visee-refusee',
    rendu: () =>
      apparence({
        cell: cellule(),
        pose: {
          cells: [{ x: 2, y: 2 }],
          fautives: [{ x: 2, y: 2 }],
          valide: false,
          raison: 'la case D3 est obstruée par un rocher',
        },
      }),
  },
]

describe('le vocabulaire des états est fermé et compte douze noms (FR-013)', () => {
  it('en compte exactement douze', () => {
    expect(ETATS_DE_CASE.length).toBe(12)
  })

  it('la table de R6 couvre les douze, et rien qu’eux', () => {
    expect(LIGNES.map((ligne) => ligne.etat).sort()).toEqual([...ETATS_DE_CASE].sort())
  })
})

describe('appearanceOf range chaque case dans son état (R6)', () => {
  it.each(LIGNES)('rend « $etat »', ({ etat, rendu }) => {
    expect(rendu().etat).toBe(etat)
  })

  it('porte l’adresse de la case, produite par la fonction unique (INV-A1)', () => {
    expect(apparence({ cell: cellule({ x: 2, y: 2 }) }).adresse).toBe('C3')
  })
})

/**
 * Le discriminant productif / stérile est le **catalogue**, jamais la teinte.
 *
 * `catalogs.buildings[typeId].extracts` répond à la question de jeu — *ce
 * bâtiment exploite-t-il ce gisement ?* — et le client l'importe déjà. Le domaine
 * n'a pas à connaître la réponse : elle ne sert qu'à choisir un dessin.
 */
describe('productif et stérile se lisent sur le catalogue', () => {
  const surGisement = (typeId: BuildingView['typeId'], depositOf: ResourceId) =>
    apparence({
      cell: cellule({ state: 'occupied', depositOf, buildingId: BATIMENT_ID }),
      buildings: [batiment({ typeId })],
    })

  it.each([
    ['mine', 'camelote', 'gisement-productif'],
    ['puits', 'jus', 'gisement-productif'],
    ['racloir', 'bave-etoiles', 'gisement-productif'],
    ['mine', 'jus', 'gisement-sterile'],
    ['puits', 'camelote', 'gisement-sterile'],
    ['centrale', 'camelote', 'gisement-sterile'],
  ] as const)('un %s sur du %s est %s', (typeId, depositOf, attendu) => {
    expect(surGisement(typeId, depositOf).etat).toBe(attendu)
  })

  it('distingue les deux par le trait de la marque d’angle, non par la silhouette', () => {
    const productif = surGisement('mine', 'camelote')
    const sterile = surGisement('puits', 'camelote')

    // Ni l'un ni l'autre ne porte de silhouette centrale : le niveau du bâtiment
    // n'est pas une forme, et le vocabulaire de R5 ne compte que sept formes.
    expect(productif.silhouette).toBeNull()
    expect(sterile.silhouette).toBeNull()

    expect(productif.marque?.trait).toBe('plein')
    expect(sterile.marque?.trait).toBe('evide')
    expect(productif.marque?.silhouette).toBe(sterile.marque?.silhouette)
  })
})

/**
 * Les deux natures d'obstacle se lisent sur `reveals.kind`.
 *
 * **Et la marque d'angle ne révèle rien de nouveau** : que le déblaiement d'un
 * `filon-enfoui` donne une veine de Camelote est déjà une information publique du
 * jeu — le § 2.1 du document de conception en fait une règle, et la page de règles
 * la publie. La marque rend visible sur la parcelle ce qu'il fallait aller lire
 * ailleurs, ce qui est exactement ce que P4 demande.
 */
describe('les deux natures d’obstacle se lisent sur ce qu’elles libèrent', () => {
  it.each([
    ['eboulis', 'obstacle-terrain-nu'],
    ['rocher', 'obstacle-terrain-nu'],
    ['filon-enfoui', 'obstacle-gisement'],
    ['poche-scellee', 'obstacle-gisement'],
    ['croute-calcifiee', 'obstacle-gisement'],
  ] as const)('%s est %s', (obstacleId, attendu) => {
    expect(apparence({ cell: cellule({ state: 'obstructed', obstacleId }) }).etat).toBe(attendu)
  })

  it('nomme la ressource révélée dans la marque d’angle', () => {
    const filon = apparence({ cell: cellule({ state: 'obstructed', obstacleId: 'filon-enfoui' }) })
    expect(filon.marque?.silhouette).toBe('camelote')

    const poche = apparence({ cell: cellule({ state: 'obstructed', obstacleId: 'poche-scellee' }) })
    expect(poche.marque?.silhouette).toBe('jus')
  })

  it('ne met aucune marque sur un obstacle qui ne libère que du terrain nu', () => {
    expect(
      apparence({ cell: cellule({ state: 'obstructed', obstacleId: 'eboulis' }) }).marque,
    ).toBe(null)
  })
})

/**
 * INV-C1 et INV-C4 — **les douze états portent douze quadruplets distincts**.
 *
 * *Le triplet ne suffit pas*, et c'est le constat qui a corrigé l'invariant : « case
 * libre » et « bâtiment posé » ne portent ni silhouette, ni trait, ni marque. Ils
 * ne se distinguent que par l'**emprise** — et le niveau lisible dessus (FR-017).
 * Sans ce quatrième champ, deux des douze états devenaient indistinguables au
 * regard de l'unicité que SC-003 et SC-009 exigent.
 *
 * C'est la moitié mécanisable de SC-003. L'autre — qu'un humain les nomme en
 * niveaux de gris — est la recette du quickstart § 10.1.
 */
describe('les douze états portent douze quadruplets distincts (INV-C1)', () => {
  const quadruplet = (a: CellAppearance): string =>
    JSON.stringify([a.silhouette, a.trait, a.marque, a.emprise])

  it('n’en partage aucun deux à deux', () => {
    const vus = new Map<string, EtatDeCase>()
    const collisions: string[] = []

    for (const { etat, rendu } of LIGNES) {
      const clef = quadruplet(rendu())
      const deja = vus.get(clef)
      if (deja !== undefined) collisions.push(`« ${deja} » et « ${etat} » : ${clef}`)
      else vus.set(clef, etat)
    }

    expect(
      collisions,
      `états indistinguables sans la couleur :\n  ${collisions.join('\n  ')}`,
    ).toEqual([])
    expect(vus.size).toBe(12)
  })

  /**
   * Le couple qui a produit la correction de l'invariant. Il est éprouvé
   * séparément pour que sa disparition se remarque : c'est lui qui rend le
   * quatrième champ nécessaire.
   */
  it('distingue « case libre » de « bâtiment posé » par l’emprise seule', () => {
    const libre = apparence({ cell: cellule() })
    const pose = apparence({
      cell: cellule({ state: 'occupied', buildingId: BATIMENT_ID }),
      buildings: [batiment()],
    })

    expect([libre.silhouette, libre.trait, libre.marque]).toEqual([null, null, null])
    expect([pose.silhouette, pose.trait, pose.marque]).toEqual([null, null, null])
    expect(libre.emprise).toBeNull()
    expect(pose.emprise).not.toBeNull()
    expect(pose.niveau).toBe(2)
  })

  /**
   * INV-C4 — retirer toute couleur doit laisser les douze états distinguables.
   *
   * Le quadruplet **ne contient aucune couleur**, et c'est l'énoncé exécutable de
   * l'invariant : ce sur quoi porte l'unicité est fait de formes, de traits, de
   * marques et d'emprises.
   */
  it('ne fait dépendre l’unicité d’aucune teinte (INV-C4)', () => {
    for (const { rendu } of LIGNES) {
      expect(quadruplet(rendu())).not.toMatch(/#|rgb|couleur/i)
    }
  })
})

/**
 * La visée prime sur tout le reste.
 *
 * C'est l'interaction **en cours** : le joueur a armé une pose et déplace son
 * curseur, et ce qu'il a besoin de lire est le verdict, non le contenu de la case
 * qu'il connaît déjà. La case garde son contenu dans son **nom accessible**, où
 * rien n'est perdu.
 */
describe('la visée prime sur le contenu de la case', () => {
  const sousEmpreinte = (cell: CellView, valide: boolean) =>
    apparence({
      cell,
      pose: {
        cells: [{ x: cell.x, y: cell.y }],
        fautives: valide ? [] : [{ x: cell.x, y: cell.y }],
        valide,
        ...(valide ? {} : { raison: 'chevauche la Mine niveau 2 en D3' }),
      },
    })

  it('marque une case de gisement visée comme visée, non comme gisement', () => {
    expect(sousEmpreinte(cellule({ depositOf: 'camelote' }), true).etat).toBe('visee-valide')
  })

  it('garde le contenu de la case dans son nom accessible', () => {
    const vue = sousEmpreinte(cellule({ depositOf: 'camelote' }), true)
    expect(vue.nomAccessible).toContain('veine de Camelote')
    expect(vue.nomAccessible).toContain('sous l’empreinte')
  })

  it('porte la raison du refus, et elle entre dans le nom accessible (FR-021)', () => {
    const vue = sousEmpreinte(cellule(), false)
    expect(vue.raisonDeRefus).toBe('chevauche la Mine niveau 2 en D3')
    expect(vue.nomAccessible).toBe(
      'C3 : libre, sous l’empreinte, refusé : chevauche la Mine niveau 2 en D3',
    )
  })

  it('ne porte aucune raison quand la pose est acceptée', () => {
    expect(sousEmpreinte(cellule(), true).raisonDeRefus).toBeNull()
  })
})
