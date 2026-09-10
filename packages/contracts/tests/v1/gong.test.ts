import { describe, expect, it } from 'vitest'
import { PlanetSnapshotV1, WorkIntentV1 } from '../../src/v1/planet.js'
import fresh from '../fixtures/v1/planet-fresh.json' with { type: 'json' }

/**
 * **Les cinq propriétés du delta de contrat** (`contracts/v1-gong.md` § 5).
 *
 * Un seul champ change de main, et le principe IV exige qu'un test échoue si sa
 * forme change. Les cinq propriétés sont : la forme du champ, le refus des
 * valeurs impossibles, son caractère facultatif, l'interdiction faite au client
 * d'en émettre, et — celle qu'on oublie — la rigueur conservée du schéma.
 */

/** L'instantané de référence, auquel chaque cas ajoute ou retire une clé. */
const SNAPSHOT = fresh as Record<string, unknown>

describe('1 — le champ, et sa forme', () => {
  it('accepte un instantané portant gong: { num, den }', () => {
    const parsed = PlanetSnapshotV1.parse({ ...SNAPSHOT, gong: { num: 10, den: 1 } })
    expect(parsed.gong).toEqual({ num: 10, den: 1 })
  })

  it('accepte une fraction, pas seulement un entier de secondes', () => {
    expect(PlanetSnapshotV1.parse({ ...SNAPSHOT, gong: { num: 1, den: 6 } }).gong).toEqual({
      num: 1,
      den: 6,
    })
  })

  /**
   * **Aucune borne supérieure**, et c'est délibéré : la règle qui rend une
   * longueur utilisable — que tous les taux du catalogue s'y résolvent en
   * entiers — ne s'exprime pas dans un schéma. C'est la validation de démarrage
   * du serveur qui la porte (FR-006).
   */
  it('n’impose aucune borne supérieure arbitraire', () => {
    expect(() =>
      PlanetSnapshotV1.parse({ ...SNAPSHOT, gong: { num: 86_400, den: 1 } }),
    ).not.toThrow()
  })
})

describe('2 — les valeurs impossibles sont rejetées', () => {
  it.each([
    ['numérateur nul', { num: 0, den: 1 }],
    ['dénominateur nul', { num: 1, den: 0 }],
    ['numérateur négatif', { num: -10, den: 1 }],
    ['dénominateur négatif', { num: 1, den: -2 }],
    ['numérateur non entier', { num: 1.5, den: 1 }],
    ['dénominateur non entier', { num: 1, den: 2.5 }],
  ])('rejette un %s', (_label, gong) => {
    expect(() => PlanetSnapshotV1.parse({ ...SNAPSHOT, gong })).toThrow()
  })

  it('rejette une longueur qui n’est pas une paire d’entiers', () => {
    expect(() => PlanetSnapshotV1.parse({ ...SNAPSHOT, gong: 10 })).toThrow()
    expect(() => PlanetSnapshotV1.parse({ ...SNAPSHOT, gong: '10' })).toThrow()
    expect(() => PlanetSnapshotV1.parse({ ...SNAPSHOT, gong: { num: 10 } })).toThrow()
    expect(() => PlanetSnapshotV1.parse({ ...SNAPSHOT, gong: null })).toThrow()
  })
})

describe('3 — le champ est facultatif, et son absence n’est pas un accord', () => {
  /**
   * L'absence reste **valide au sens du schéma** et **insuffisante au sens du
   * client** : celui-ci n'affiche alors aucun chiffre dérivé, au lieu de se
   * replier sur le gong canonique (G9). Le repli afficherait des chiffres
   * d'apparence exacte pour un monde peut-être différent.
   */
  it('accepte un instantané sans gong', () => {
    const { gong: _absent, ...without } = { ...SNAPSHOT, gong: undefined }
    const parsed = PlanetSnapshotV1.parse(without)
    expect(parsed.gong).toBeUndefined()
  })
})

describe('4 — aucune commande ne porte de longueur de gong (FR-014)', () => {
  /**
   * Refusé **à la frontière**, et non ignoré. La nuance compte : un champ
   * ignoré laisse croire au client qu'il a été entendu, et le jour où un
   * développeur le lira « puisqu'il est là », l'interdiction sera tombée sans
   * qu'aucun test ne bouge.
   */
  const BuildingId = '3f2504e0-4f89-11d3-9a0c-0305e82c3302'

  it.each([
    [
      'build',
      {
        nature: 'build',
        typeId: 'mine',
        variantId: 'square-4',
        orientation: 0,
        anchorX: 0,
        anchorY: 0,
      },
    ],
    ['upgrade', { nature: 'upgrade', buildingId: BuildingId }],
    ['clear', { nature: 'clear', x: 3, y: 0 }],
    ['demolish', { nature: 'demolish', buildingId: BuildingId }],
  ])('rejette une intention de %s portant gong', (_nature, body) => {
    expect(() => WorkIntentV1.parse(body), 'le corps sans gong doit rester valide').not.toThrow()
    expect(() => WorkIntentV1.parse({ ...body, gong: { num: 1, den: 6 } })).toThrow()
  })

  /**
   * Et rien qui la modifie non plus : ni un nombre de secondes, ni un facteur
   * d'accélération sous un autre nom. C'est FR-020 — un univers rapide reste
   * possible, un **joueur** rapide reste impossible.
   */
  it.each([
    ['gongSeconds', { gongSeconds: 1 }],
    ['speed', { speed: 60 }],
    ['clientNow', { clientNow: 1_787_750_000 }],
  ])('rejette une intention portant %s', (_label, extra) => {
    expect(() =>
      WorkIntentV1.parse({ nature: 'upgrade', buildingId: BuildingId, ...extra }),
    ).toThrow()
  })
})

describe('5 — la rigueur du schéma n’a pas été relâchée', () => {
  /**
   * **Celui qu'on oublie.** Ajouter un champ à un schéma strict est l'occasion
   * classique d'assouplir le schéma « en passant » — un `.passthrough()` posé
   * pour faire passer un test, et toute clé inconnue devient acceptable pour
   * toujours.
   */
  it('rejette toujours une clé inconnue', () => {
    expect(() => PlanetSnapshotV1.parse({ ...SNAPSHOT, gongue: { num: 10, den: 1 } })).toThrow()
    expect(() => PlanetSnapshotV1.parse({ ...SNAPSHOT, gongSeconds: 10 })).toThrow()
    expect(() => PlanetSnapshotV1.parse({ ...SNAPSHOT, inconnu: true })).toThrow()
  })

  it('rejette une clé inconnue même en présence du nouveau champ', () => {
    expect(() =>
      PlanetSnapshotV1.parse({ ...SNAPSHOT, gong: { num: 10, den: 1 }, inconnu: true }),
    ).toThrow()
  })
})
