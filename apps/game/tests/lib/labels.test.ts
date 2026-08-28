import type { CellView } from '@zaliba/domain'
import { describe, expect, it } from 'vitest'
import {
  adresseOf,
  articleDefini,
  articleIndefini,
  BUILDING_GENRE,
  BUILDING_LABELS,
  DEPOSIT_GENRE,
  DEPOSIT_LABELS,
  describeCell,
  describePosition,
  FOOTPRINT_LABELS,
  OBSTACLE_GENRE,
  OBSTACLE_LABELS,
  RESOURCE_LABELS,
} from '../../src/lib/labels.js'

/**
 * L'adresse courte de case, et la grammaire du nom accessible (R7, FR-016).
 *
 * **L'adresse est un besoin fonctionnel, pas une décoration.** Les joueurs
 * s'échangent des plans à l'oral, et « C3 » se dit en une syllabe là où
 * « colonne trois, rangée trois » en prend sept. La conséquence est qu'elle doit
 * être **la même partout** — nom accessible, annonce de curseur, motif de refus,
 * cible d'un chantier —, sans quoi le joueur apprend deux systèmes (INV-A1).
 */

const libre = (x: number, y: number): CellView => ({
  x,
  y,
  state: 'free',
  obstacleId: null,
  depositOf: null,
  buildingId: null,
})

describe('adresseOf : la lettre de colonne et le numéro de rangée, en base 1', () => {
  it('rend « C3 » pour la troisième colonne de la troisième rangée', () => {
    expect(adresseOf({ x: 2, y: 2 })).toBe('C3')
  })

  it('rend « A1 » en haut à gauche et « F6 » en bas à droite du Berceau', () => {
    expect(adresseOf({ x: 0, y: 0 })).toBe('A1')
    expect(adresseOf({ x: 5, y: 5 })).toBe('F6')
  })

  it('suit les dimensions d’une parcelle non carrée, jamais une constante', () => {
    // Les archétypes à venir vont du 3 × 10 au 8 × 4 : la fonction ne connaît
    // aucune borne, elle traduit une coordonnée.
    expect(adresseOf({ x: 2, y: 9 })).toBe('C10')
    expect(adresseOf({ x: 7, y: 3 })).toBe('H4')
  })

  /**
   * INV-A3 — au-delà de vingt-six colonnes, la fonction **lève**.
   *
   * Aucun archétype annoncé n'y arrive. Produire `AA1` sans que la conception
   * l'ait tranché serait inventer une convention, et une convention inventée dans
   * une fonction d'affichage est celle que personne ne retrouve (R7).
   */
  it('lève au-delà de vingt-six colonnes plutôt que d’inventer une convention', () => {
    expect(() => adresseOf({ x: 26, y: 0 })).toThrow(/vingt-six|26/i)
    expect(adresseOf({ x: 25, y: 0 })).toBe('Z1')
  })

  it('lève sur une coordonnée négative ou non entière', () => {
    expect(() => adresseOf({ x: -1, y: 0 })).toThrow()
    expect(() => adresseOf({ x: 1.5, y: 0 })).toThrow()
  })
})

describe('describePosition rend désormais l’adresse', () => {
  it('ne rend plus « Colonne 4, rangée 1 »', () => {
    expect(describePosition({ x: 3, y: 0 })).toBe('D1')
  })

  it('rend exactement ce que rend adresseOf — une seule fonction la produit', () => {
    for (let x = 0; x < 8; x += 1) {
      for (let y = 0; y < 10; y += 1) {
        expect(describePosition({ x, y })).toBe(adresseOf({ x, y }))
      }
    }
  })
})

/**
 * Le genre grammatical, **ajouté** sans toucher aux tables de vocabulaire.
 *
 * FR-040 exige que `RESOURCE_LABELS`, `DEPOSIT_LABELS`, `OBSTACLE_LABELS`,
 * `BUILDING_LABELS` et `FOOTPRINT_LABELS` restent inchangés : la Régie ajoute un
 * registre lexical, elle n'en remplace aucun. Le genre est donc une table de
 * plus, et c'est elle qui rend « occupée par **une** Mine » et « occupée par
 * **un** Puits » — deux exemples normatifs du contrat qu'un article unique
 * n'aurait pas pu produire.
 */
describe('le genre grammatical accompagne les tables sans les modifier (FR-040)', () => {
  it('laisse les cinq tables de 001 intactes', () => {
    expect(RESOURCE_LABELS['camelote']).toBe('Camelote')
    expect(DEPOSIT_LABELS['camelote']).toBe('veine de Camelote')
    expect(OBSTACLE_LABELS['eboulis']).toBe('éboulis')
    expect(BUILDING_LABELS['mine']).toBe('Mine')
    expect(FOOTPRINT_LABELS['square-4']).toBe('Carré de quatre')
  })

  it('couvre les cinq bâtiments, les cinq obstacles et les trois gisements', () => {
    expect(Object.keys(BUILDING_GENRE).sort()).toEqual(Object.keys(BUILDING_LABELS).sort())
    expect(Object.keys(DEPOSIT_GENRE).sort()).toEqual(Object.keys(DEPOSIT_LABELS).sort())
    expect(Object.keys(OBSTACLE_GENRE).sort()).toEqual(Object.keys(OBSTACLE_LABELS).sort())
  })

  /**
   * Le contrat n'illustre l'obstacle qu'au masculin — « obstruée par un éboulis »,
   * « un rocher ». Deux des cinq obstacles sont féminins, et sans genre l'écran
   * dirait « obstruée par un poche scellée » : un accord faux dans le nom
   * accessible, c'est-à-dire dans ce qu'un lecteur d'écran énonce.
   */
  it('accorde les deux obstacles féminins que le contrat n’illustre pas', () => {
    expect(articleIndefini(OBSTACLE_GENRE['poche-scellee'])).toBe('une')
    expect(articleIndefini(OBSTACLE_GENRE['croute-calcifiee'])).toBe('une')
    expect(articleIndefini(OBSTACLE_GENRE['eboulis'])).toBe('un')
  })

  it('accorde les articles', () => {
    expect(articleIndefini(BUILDING_GENRE['mine'])).toBe('une')
    expect(articleIndefini(BUILDING_GENRE['puits'])).toBe('un')
    expect(articleDefini(BUILDING_GENRE['mine'])).toBe('la')
    expect(articleDefini(BUILDING_GENRE['puits'])).toBe('le')
    expect(articleIndefini(DEPOSIT_GENRE['camelote'])).toBe('une')
    expect(articleIndefini(DEPOSIT_GENRE['jus'])).toBe('un')
  })
})

/**
 * Les **onze exemples normatifs** du § 2.3 de `contracts/ui-parcelle.md`.
 *
 * La grammaire, et non une phrase par état :
 *
 * ```
 * {adresse} : {état}{, gisement}{, sous l’empreinte}{, refusé : raison}
 * ```
 *
 * Les onze sont ici parce qu'un contrat qui donne des exemples et un test qui en
 * vérifie trois laissent huit lectures possibles. C'est le seul endroit du dépôt
 * où la phrase que **tout le monde** reçoit est figée.
 */
describe('describeCell suit la grammaire du contrat sur ses onze exemples', () => {
  const enC3 = { x: 2, y: 2 }

  it('1 — case libre', () => {
    expect(describeCell(libre(2, 2))).toBe('C3 : libre')
  })

  it('2 — gisement nu', () => {
    expect(describeCell({ ...libre(2, 2), depositOf: 'camelote' })).toBe(
      'C3 : libre, veine de Camelote',
    )
  })

  it('accorde l’article d’un obstacle féminin', () => {
    expect(describeCell({ ...libre(2, 2), state: 'obstructed', obstacleId: 'poche-scellee' })).toBe(
      'C3 : obstruée par une poche scellée',
    )
  })

  it('3 — obstacle libérant du terrain nu', () => {
    expect(
      describeCell(
        { ...libre(2, 2), state: 'obstructed', obstacleId: 'eboulis' },
        { libere: 'du terrain nu' },
      ),
    ).toBe('C3 : obstruée par un éboulis, libère du terrain nu')
  })

  it('4 — obstacle libérant un gisement', () => {
    expect(
      describeCell(
        { ...libre(2, 2), state: 'obstructed', obstacleId: 'filon-enfoui' },
        { libere: 'une veine de Camelote' },
      ),
    ).toBe('C3 : obstruée par un filon enfoui, libère une veine de Camelote')
  })

  it('5 — gisement productif', () => {
    expect(
      describeCell(
        { ...libre(2, 2), state: 'occupied', depositOf: 'camelote', buildingId: 'b1' as never },
        { batiment: { typeId: 'mine', niveau: 2 }, gisementExploite: true },
      ),
    ).toBe('C3 : occupée par une Mine niveau 2, veine de Camelote exploitée')
  })

  it('6 — gisement stérile', () => {
    expect(
      describeCell(
        { ...libre(2, 2), state: 'occupied', depositOf: 'camelote', buildingId: 'b1' as never },
        { batiment: { typeId: 'puits', niveau: 1 }, gisementExploite: false },
      ),
    ).toBe('C3 : occupée par un Puits niveau 1, veine de Camelote non exploitée')
  })

  it('accorde « exploité » au genre du gisement', () => {
    expect(
      describeCell(
        { ...libre(2, 2), state: 'occupied', depositOf: 'jus', buildingId: 'b1' as never },
        { batiment: { typeId: 'puits', niveau: 1 }, gisementExploite: true },
      ),
    ).toBe('C3 : occupée par un Puits niveau 1, geyser de Jus exploité')
  })

  it('7 — chantier en cours', () => {
    expect(describeCell(libre(2, 2), { chantier: { typeId: 'mine', niveau: 3 } })).toBe(
      'C3 : chantier en cours, Mine niveau 3',
    )
  })

  it('8 — visée valide', () => {
    expect(describeCell(libre(2, 2), { sousEmpreinte: true })).toBe('C3 : libre, sous l’empreinte')
  })

  it('9 — visée refusée, débordement', () => {
    expect(
      describeCell(libre(2, 2), {
        sousEmpreinte: true,
        refus: '2 cases sortent de la parcelle par la droite',
      }),
    ).toBe('C3 : libre, sous l’empreinte, refusé : 2 cases sortent de la parcelle par la droite')
  })

  it('10 — visée refusée, obstacle', () => {
    expect(
      describeCell(libre(2, 2), {
        sousEmpreinte: true,
        refus: 'la case D3 est obstruée par un rocher',
      }),
    ).toBe('C3 : libre, sous l’empreinte, refusé : la case D3 est obstruée par un rocher')
  })

  it('11 — visée refusée, bâtiment', () => {
    expect(
      describeCell(libre(2, 2), {
        sousEmpreinte: true,
        refus: 'chevauche la Mine niveau 2 en D3',
      }),
    ).toBe('C3 : libre, sous l’empreinte, refusé : chevauche la Mine niveau 2 en D3')
  })

  it('omet chaque segment absent plutôt que d’en laisser la ponctuation', () => {
    const phrase = describeCell(libre(enC3.x, enC3.y))
    expect(phrase).not.toMatch(/,\s*,/)
    expect(phrase).not.toMatch(/,\s*$/)
    expect(phrase).not.toMatch(/:\s*$/)
  })

  it('retombe sur « occupée par un bâtiment » quand le bâtiment n’est pas résolu', () => {
    // Un second onglet peut démolir la cible : afficher un identifiant technique
    // serait pire que ne rien dire, ce serait dire quelque chose d'illisible.
    expect(
      describeCell({ ...libre(2, 2), state: 'occupied', buildingId: 'inconnu' as never }),
    ).toBe('C3 : occupée par un bâtiment')
  })
})
