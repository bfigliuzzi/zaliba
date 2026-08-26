import { BERCEAU, CATALOG_VERSION } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../src/game.js'
import { DEFAULT_CATALOGS } from '../../src/kernel/catalogs.js'
import { emptySnapshot, type PlanetSnapshot } from '../../src/kernel/snapshot.js'
import { instant } from '../../src/kernel/time.js'

/**
 * La projection : `projectPlanet(snapshot, catalogs, at)`, fonction **pure**.
 *
 * Toutes les valeurs attendues de ce fichier sont calculées **à la main** depuis
 * les règles publiées, jamais reprises d'une exécution. C'est la seule façon
 * d'éprouver la promesse d'US1 : « retrouver après trois semaines d'absence
 * exactement ce que les règles publiées devaient, à la seconde près ». Un
 * attendu recopié d'une sortie ne teste que la stabilité, pas la justesse.
 *
 * `at` est un **argument**, jamais un appel d'horloge. C'est ce qui rend un jeu
 * dont le sujet est le temps réellement testable : six mois de jeu se vérifient
 * en une milliseconde, sans attente et sans horloge simulée.
 */

const T0 = instant(1_787_750_000)
const HOUR = 3_600
const THREE_WEEKS = 21 * 86_400

/** Une planète neuve, telle que le provisionnement la crée. */
function fresh(consolidatedAt = T0): PlanetSnapshot {
  return emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt,
    catalogs: DEFAULT_CATALOGS,
  })
}

function at(seconds: number) {
  return projectPlanet(fresh(), DEFAULT_CATALOGS, instant(T0 + seconds))
}

describe('le stock de départ est celui du catalogue', () => {
  it.each([
    ['camelote', 1_440_000],
    ['jus', 0],
    ['bave-etoiles', 432_000],
  ] as const)('%s part de %i grains', (resourceId, expected) => {
    expect(BERCEAU.startingStockGrains[resourceId]).toBe(expected)
    expect(at(0).holdings[resourceId].amount).toBe(expected)
  })

  it('ne fait rien avancer quand aucun temps n’a passé', () => {
    const state = at(0)
    for (const holding of Object.values(state.holdings)) {
      expect(holding.lost).toBe(0)
    }
  })
})

describe('à t₀ + 1 h, le compte est exact', () => {
  /**
   * Une unité par heure vaut exactement un grain par seconde (R1). Vingt unités
   * par heure pendant trois mille six cents secondes font donc soixante-douze
   * mille grains — sans division, sans arrondi, sans reste.
   */
  it.each([
    ['camelote', 1_512_000],
    ['jus', 36_000],
    ['bave-etoiles', 450_000],
  ] as const)('%s vaut %i grains', (resourceId, expected) => {
    expect(at(HOUR).holdings[resourceId].amount).toBe(expected)
  })

  it('n’a encore rien perdu : le plafond est loin', () => {
    for (const holding of Object.values(at(HOUR).holdings)) {
      expect(holding.lost).toBe(0)
    }
  })
})

describe('à t₀ + 3 semaines, le plafond a mordu (FR-026)', () => {
  it.each([
    ['camelote', 18_000_000, 19_728_000],
    ['jus', 18_000_000, 144_000],
    ['bave-etoiles', 7_200_000, 2_304_000],
  ] as const)('%s est plafonnée à %i, avec %i perdus', (resourceId, amount, lost) => {
    const holding = at(THREE_WEEKS).holdings[resourceId]
    expect(holding.amount).toBe(amount)
    expect(holding.lost).toBe(lost)
  })

  /**
   * La seconde de plus est le cas qui distingue un plafonnement correct d'un
   * plafonnement approximatif : la quantité ne bouge plus, la **perte** avance
   * exactement du gain d'une seconde.
   */
  it.each([
    ['camelote', 20],
    ['jus', 10],
    ['bave-etoiles', 5],
  ] as const)('une seconde de plus ajoute %s grains à la perte de %s', (resourceId, perSecond) => {
    const before = at(THREE_WEEKS).holdings[resourceId]
    const after = at(THREE_WEEKS + 1).holdings[resourceId]

    expect(after.amount).toBe(before.amount)
    expect(after.lost).toBe(before.lost + perSecond)
  })
})

describe('l’instant de saturation est publié (FR-027)', () => {
  it.each([
    ['camelote', 828_000],
    ['jus', 1_800_000],
    ['bave-etoiles', 1_353_600],
  ] as const)('%s saturera dans %i secondes', (resourceId, seconds) => {
    expect(at(0).holdings[resourceId].saturationAt).toBe(T0 + seconds)
  })

  /**
   * `null` n'est pas une absence d'information : il dit au joueur qu'il **perd
   * déjà**. C'est précisément le moment où il devrait poser un entrepôt.
   */
  it.each(['camelote', 'jus', 'bave-etoiles'] as const)(
    '%s ne saturera plus une fois saturée',
    (resourceId) => {
      expect(at(THREE_WEEKS).holdings[resourceId].saturationAt).toBeNull()
    },
  )
})

describe('l’état projeté publie ce qui rend le calcul reproductible (FR-053)', () => {
  it.each([
    ['camelote', 20],
    ['jus', 10],
    ['bave-etoiles', 5],
  ] as const)('expose le taux de %s, soit %i unités par heure', (resourceId, rate) => {
    expect(at(HOUR).holdings[resourceId].rate).toBe(rate)
  })

  /**
   * Le taux nominal est celui d'**avant** le rapport d'énergie (FR-024). Sans
   * planète en déficit, les deux coïncident — mais les publier séparément dès
   * maintenant évite que l'interface confonde plus tard « je produis peu » et
   * « je suis bridé ».
   */
  it('distingue le taux nominal du taux effectif', () => {
    const holding = at(HOUR).holdings['camelote']
    expect(holding.nominalRate).toBe(20)
    expect(holding.rate).toBe(20)
  })

  it.each([
    ['camelote', 18_000_000],
    ['jus', 18_000_000],
    ['bave-etoiles', 7_200_000],
  ] as const)('expose le plafond de %s', (resourceId, cap) => {
    expect(at(HOUR).holdings[resourceId].cap).toBe(cap)
  })

  it('expose la version du catalogue employé (R15)', () => {
    expect(at(0).catalogVersion).toBe(CATALOG_VERSION)
  })

  it('expose l’instant de la projection', () => {
    expect(at(HOUR).at).toBe(T0 + HOUR)
  })
})

describe('la production de base est insensible au rapport d’énergie (FR-018, R5)', () => {
  it('annonce l’énergie de base du Berceau, rien de consommé', () => {
    const { energy } = at(0)
    expect(energy.produced).toBe(BERCEAU.baseEnergy)
    expect(energy.consumed).toBe(0)
  })

  /**
   * Le rapport est publié en **fraction entière** et non en flottant : c'est ce
   * qui permet au joueur de refaire le calcul à la main (SC-002), et au client
   * de retrouver exactement le chiffre du serveur.
   */
  it('publie un rapport de 1 en l’absence de déficit', () => {
    const { ratio } = at(0).energy
    expect(ratio.numerator).toBe(ratio.denominator)
    expect(ratio.numerator).toBeGreaterThan(0)
  })
})

describe('la grille est projetée telle que le catalogue la décrit', () => {
  it('rend trente-six vues de case', () => {
    expect(at(0).grid).toHaveLength(36)
  })

  it('en marque dix obstruées et vingt-six libres', () => {
    const grid = at(0).grid
    expect(grid.filter((cell) => cell.state === 'obstructed')).toHaveLength(10)
    expect(grid.filter((cell) => cell.state === 'free')).toHaveLength(26)
  })

  it('n’occupe aucune case sur une planète neuve', () => {
    expect(at(0).grid.filter((cell) => cell.state === 'occupied')).toHaveLength(0)
    expect(at(0).buildings).toHaveLength(0)
  })

  it('montre les trois gisements affleurants', () => {
    expect(at(0).grid.filter((cell) => cell.depositOf !== null)).toHaveLength(3)
  })
})

describe('remonter le temps est une erreur de programmation, pas un cas de jeu', () => {
  /**
   * `at < consolidatedAt` ne peut pas venir d'un joueur : l'instant vient du
   * `now()` de la transaction, et l'instantané a été écrit avant. Y répondre par
   * un résultat plausible masquerait un défaut de la couche appelante — et le
   * résultat serait faux, puisque la projection ne sait pas défaire une perte.
   */
  it('refuse une projection antérieure à la consolidation', () => {
    expect(() => projectPlanet(fresh(), DEFAULT_CATALOGS, instant(T0 - 1))).toThrow(RangeError)
  })

  it('accepte une projection exactement à l’instant de consolidation', () => {
    expect(() => projectPlanet(fresh(), DEFAULT_CATALOGS, T0)).not.toThrow()
  })
})

describe('I-11 — la projection ne dépend d’aucune horloge', () => {
  it('rend deux résultats égaux pour le même instant', () => {
    expect(at(HOUR)).toEqual(at(HOUR))
  })

  it('rend le même résultat quel que soit le moment de l’appel', () => {
    const snapshot = fresh()
    const target = instant(T0 + THREE_WEEKS)
    const first = projectPlanet(snapshot, DEFAULT_CATALOGS, target)
    const second = projectPlanet(snapshot, DEFAULT_CATALOGS, target)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('ne mute pas l’instantané qu’on lui donne', () => {
    const snapshot = fresh()
    const before = JSON.stringify(snapshot)
    projectPlanet(snapshot, DEFAULT_CATALOGS, instant(T0 + THREE_WEEKS))
    expect(JSON.stringify(snapshot)).toBe(before)
  })
})

describe('segmentation autour de l’échéance d’un chantier (R3, FR-032)', () => {
  /**
   * Un déblaiement échu depuis une semaine. La projection doit calculer en
   * **deux segments** : aux anciens taux jusqu'à l'échéance, aux nouveaux
   * ensuite — et appliquer les effets d'achèvement **à l'instant de
   * l'échéance**, non à celui où on les constate.
   */
  function withDueClearing(dueAfter: number): PlanetSnapshot {
    return {
      ...fresh(),
      work: {
        id: '33333333-3333-4333-8333-333333333333',
        nature: 'clear',
        target: { kind: 'cell', cell: { x: 3, y: 0 } },
        startedAt: T0,
        dueAt: instant(T0 + dueAfter),
      },
    }
  }

  it('laisse le chantier en cours tant qu’il n’est pas échu', () => {
    const state = projectPlanet(withDueClearing(HOUR), DEFAULT_CATALOGS, instant(T0 + 60))
    expect(state.work).not.toBeNull()
    expect(state.work?.remaining).toBe(HOUR - 60)
  })

  it('libère la case à l’échéance, et pas avant', () => {
    const before = projectPlanet(withDueClearing(HOUR), DEFAULT_CATALOGS, instant(T0 + HOUR - 1))
    const after = projectPlanet(withDueClearing(HOUR), DEFAULT_CATALOGS, instant(T0 + HOUR))

    expect(before.grid.find((c) => c.x === 3 && c.y === 0)?.state).toBe('obstructed')
    expect(after.grid.find((c) => c.x === 3 && c.y === 0)?.state).toBe('free')
  })

  it('n’a plus de chantier une fois l’échéance passée', () => {
    const state = projectPlanet(withDueClearing(HOUR), DEFAULT_CATALOGS, instant(T0 + HOUR + 1))
    expect(state.work).toBeNull()
  })

  /**
   * Un seul chantier peut être actif (FR-033), donc il n'y a **jamais plus de
   * deux segments**. C'est cette unicité qui rend l'aperçu d'une action
   * exactement prédictible : entre le lancement et l'échéance, aucune autre
   * transition ne peut survenir.
   */
  it('donne le même total qu’un calcul en un seul temps, plafond compris', () => {
    const segmented = projectPlanet(withDueClearing(HOUR), DEFAULT_CATALOGS, instant(T0 + 2 * HOUR))
    const plain = at(2 * HOUR)

    // Le déblaiement d'une case ne change aucun taux : les deux doivent
    // coïncider exactement, ce qui vérifie que la segmentation ne perd rien.
    for (const resourceId of ['camelote', 'jus', 'bave-etoiles'] as const) {
      expect(segmented.holdings[resourceId].amount).toBe(plain.holdings[resourceId].amount)
      expect(segmented.holdings[resourceId].lost).toBe(plain.holdings[resourceId].lost)
    }
  })
})
