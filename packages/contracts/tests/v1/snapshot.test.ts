import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PlanetSnapshotV1, planetContractV1 } from '../../src/v1/planet.js'
import { expectStableContract } from '../snapshots/harness.js'

/**
 * `PlanetSnapshotV1` : la forme figée de la réponse commune aux trois routes.
 *
 * Deux mécaniques, et elles ne protègent pas de la même chose :
 *
 * - **l'instantané de JSON Schema** attrape ce qu'aucune compilation n'attrape —
 *   un champ renommé, une borne relâchée, un `optional()` ajouté « en
 *   attendant ». Chacun de ces trois casse un client natif ancien qu'on ne peut
 *   pas forcer à se mettre à jour ;
 * - **l'échantillon enregistré** rend la fenêtre de compatibilité *testable* :
 *   une charge réelle de la version 1, gardée en fixture, doit continuer à
 *   passer le schéma tant que la version 1 est supportée.
 *
 * Et un troisième contrôle, celui qui compte le plus ici : le **test
 * d'absence**. La réponse ne porte aucune valeur dérivable — ni quantité
 * courante, ni plafond, ni taux, ni rapport d'énergie, ni temps restant. Les
 * envoyer dupliquerait un calcul que le client fait déjà, et créerait deux
 * vérités là où le monorepo n'en veut qu'une.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'v1')

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'))
}

describe('la forme du contrat est figée', () => {
  it('correspond à l’instantané de référence', async () => {
    await expectStableContract(planetContractV1, 'v1-planet')
  })
})

describe('l’échantillon enregistré de la version 1 reste valide', () => {
  it('accepte une planète neuve', () => {
    expect(() => PlanetSnapshotV1.parse(fixture('planet-fresh.json'))).not.toThrow()
  })

  it('accepte une planète en cours de partie, avec chantier', () => {
    expect(() => PlanetSnapshotV1.parse(fixture('planet-in-progress.json'))).not.toThrow()
  })

  /**
   * L'échantillon n'est pas décoratif : s'il cessait de contenir ce qu'il
   * prétend, il validerait un schéma vide sans qu'on s'en aperçoive.
   */
  it('porte bien ce qu’il prétend porter', () => {
    const parsed = PlanetSnapshotV1.parse(fixture('planet-in-progress.json'))
    expect(parsed.holdings).toHaveLength(3)
    expect(parsed.buildings.length).toBeGreaterThan(0)
    expect(parsed.work).not.toBeNull()
  })
})

describe('les valeurs dérivables sont absentes, et le schéma les refuse', () => {
  const base = () => structuredClone(fixture('planet-fresh.json')) as Record<string, unknown>

  /**
   * Le schéma est **fermé**. Ces champs ne sont pas « ignorés » : ils sont
   * refusés. La différence compte — un champ ignoré aujourd'hui deviendrait un
   * champ lu demain, et une dépendance de fait pour un client.
   */
  it.each([
    'rates',
    'caps',
    'energy',
    'saturationAt',
    'remaining',
    'coveredDeposits',
    'cumulativeCost',
    'grid',
  ])('refuse un champ %s à la racine', (field) => {
    expect(() => PlanetSnapshotV1.parse({ ...base(), [field]: 1 })).toThrow()
  })

  it.each(['cap', 'rate', 'nominalRate', 'saturationAt'])(
    'refuse un champ %s dans une possession',
    (field) => {
      const payload = base()
      const holdings = payload['holdings'] as Record<string, unknown>[]
      holdings[0] = { ...holdings[0], [field]: 1 }
      expect(() => PlanetSnapshotV1.parse(payload)).toThrow()
    },
  )

  /**
   * **L'exception qui confirme la règle** (US1/AC5). L'instant d'entrée en
   * saturation *est* transmis, et ce n'est pas une dérogation au test d'absence
   * : ce n'est pas une valeur dérivable. Une consolidation efface tout ce qui
   * précède, et ni la quantité — au plafond, elle ne dit plus depuis quand — ni
   * la perte — `perdu ÷ taux` est faux dès que le taux a changé — ne permettent
   * de le retrouver. Le client ne peut donc pas le calculer : il faut le lui
   * dire.
   *
   * Ce qui reste absent, c'est la **durée** : elle vaut `maintenant − instant`,
   * et le client la recalcule à chaque image.
   */
  it('refuse une durée de saturation dans une possession', () => {
    for (const field of ['saturatedForSeconds', 'saturatedSeconds', 'saturationDuration']) {
      const payload = base()
      const holdings = payload['holdings'] as Record<string, unknown>[]
      holdings[0] = { ...holdings[0], [field]: 1 }
      expect(() => PlanetSnapshotV1.parse(payload), field).toThrow()
    }
  })

  it('n’expose ni cases occupées ni gisements par bâtiment', () => {
    const payload = fixture('planet-in-progress.json') as Record<string, unknown>
    const buildings = payload['buildings'] as Record<string, unknown>[]
    expect(Object.keys(buildings[0] ?? {})).toEqual([
      'id',
      'typeId',
      'variantId',
      'orientation',
      'anchorX',
      'anchorY',
      'level',
    ])
  })

  /**
   * Un chantier échu et non consolidé **apparaît toujours** dans `work`, et
   * n'annonce pas son temps restant : c'est la projection locale qui l'applique,
   * à `dueAt`. Le `GET` n'écrit rien, y compris après trois semaines.
   */
  it('n’expose pas le temps restant d’un chantier', () => {
    const payload = fixture('planet-in-progress.json') as Record<string, unknown>
    const work = payload['work'] as Record<string, unknown>
    expect(Object.keys(work)).not.toContain('remaining')
  })
})

/**
 * L'instant d'entrée en saturation, dans le contrat (US1/AC5).
 *
 * Il est **obligatoire et annulable** : obligatoire, parce qu'un champ facultatif
 * laisserait un client ancien croire que la grandeur n'existe pas plutôt que
 * qu'elle ne s'applique pas ; annulable, parce que « pas saturée » est l'état
 * courant d'une ressource, pas un cas d'erreur.
 */
describe('l’instant d’entrée en saturation est porté par chaque possession', () => {
  const base = () => structuredClone(fixture('planet-fresh.json')) as Record<string, unknown>

  function withHolding(patch: Record<string, unknown>): unknown {
    const payload = base()
    const holdings = payload['holdings'] as Record<string, unknown>[]
    holdings[0] = { ...holdings[0], ...patch }
    return payload
  }

  it('accepte un instant', () => {
    expect(() =>
      PlanetSnapshotV1.parse(withHolding({ saturatedSince: 1_787_750_000 })),
    ).not.toThrow()
  })

  it('accepte null — la ressource n’est pas saturée', () => {
    expect(() => PlanetSnapshotV1.parse(withHolding({ saturatedSince: null }))).not.toThrow()
  })

  it('refuse son absence', () => {
    const payload = base()
    const holdings = payload['holdings'] as Record<string, unknown>[]
    const { saturatedSince: _omis, ...sans } = holdings[0] as Record<string, unknown>
    holdings[0] = sans
    expect(() => PlanetSnapshotV1.parse(payload)).toThrow()
  })

  it.each([-1, 1.5, 'maintenant'])('refuse %s', (value) => {
    expect(() => PlanetSnapshotV1.parse(withHolding({ saturatedSince: value }))).toThrow()
  })
})

describe('les nombres sont entiers et bornés (contrats § 4)', () => {
  const base = () => structuredClone(fixture('planet-fresh.json')) as Record<string, unknown>

  function withHolding(patch: Record<string, unknown>) {
    const payload = base()
    const holdings = payload['holdings'] as Record<string, unknown>[]
    holdings[0] = { ...holdings[0], ...patch }
    return payload
  }

  /**
   * Les quantités négatives et les débordements sont les deux exploits les plus
   * fréquents des jeux de gestion. La borne appartient au **schéma**, pas au
   * métier : une validation métier peut s'oublier dans un nouveau chemin, un
   * schéma fermé non.
   */
  it('refuse une quantité négative', () => {
    expect(() => PlanetSnapshotV1.parse(withHolding({ amountGrains: -1 }))).toThrow()
  })

  it('refuse une quantité non entière', () => {
    expect(() => PlanetSnapshotV1.parse(withHolding({ amountGrains: 1.5 }))).toThrow()
  })

  it('refuse une quantité au-delà de la sûreté des entiers', () => {
    expect(() => PlanetSnapshotV1.parse(withHolding({ amountGrains: 2 ** 53 }))).toThrow()
  })

  it('refuse un NaN', () => {
    expect(() => PlanetSnapshotV1.parse(withHolding({ amountGrains: Number.NaN }))).toThrow()
  })

  it('refuse un instant serveur négatif', () => {
    expect(() => PlanetSnapshotV1.parse({ ...base(), serverInstant: -1 })).toThrow()
  })

  it('refuse une orientation hors de 0..3', () => {
    const payload = fixture('planet-in-progress.json') as Record<string, unknown>
    const buildings = structuredClone(payload['buildings']) as Record<string, unknown>[]
    buildings[0] = { ...buildings[0], orientation: 4 }
    expect(() => PlanetSnapshotV1.parse({ ...payload, buildings })).toThrow()
  })

  it('refuse un niveau nul', () => {
    const payload = fixture('planet-in-progress.json') as Record<string, unknown>
    const buildings = structuredClone(payload['buildings']) as Record<string, unknown>[]
    buildings[0] = { ...buildings[0], level: 0 }
    expect(() => PlanetSnapshotV1.parse({ ...payload, buildings })).toThrow()
  })
})

describe('les unions sont fermées', () => {
  const base = () => structuredClone(fixture('planet-fresh.json')) as Record<string, unknown>

  it('refuse une ressource inconnue', () => {
    const payload = base()
    const holdings = payload['holdings'] as Record<string, unknown>[]
    holdings[0] = { ...holdings[0], resourceId: 'antimatiere' }
    expect(() => PlanetSnapshotV1.parse(payload)).toThrow()
  })

  it('refuse un archétype inconnu', () => {
    const payload = base()
    const planet = payload['planet'] as Record<string, unknown>
    expect(() =>
      PlanetSnapshotV1.parse({ ...payload, planet: { ...planet, archetypeId: 'geante' } }),
    ).toThrow()
  })

  it('exige exactement une entrée par ressource', () => {
    const payload = base()
    const holdings = payload['holdings'] as Record<string, unknown>[]
    expect(() => PlanetSnapshotV1.parse({ ...payload, holdings: holdings.slice(0, 2) })).toThrow()
  })

  it('refuse une ressource en double', () => {
    const payload = base()
    const holdings = payload['holdings'] as Record<string, unknown>[]
    expect(() =>
      PlanetSnapshotV1.parse({ ...payload, holdings: [holdings[0], holdings[0], holdings[1]] }),
    ).toThrow()
  })
})
