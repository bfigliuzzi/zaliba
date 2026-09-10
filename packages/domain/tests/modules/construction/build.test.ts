import type { BuildingTypeId } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../../src/game.js'
import { evaluateCurve } from '../../../src/kernel/curves.js'
import type { ScheduleWork } from '../../../src/kernel/effects.js'
import type { ProjectedState } from '../../../src/kernel/projection.js'
import { extractorRate } from '../../../src/kernel/rates.js'
import {
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import {
  type BuildCommand,
  buildCost,
  buildDuration,
  decideBuild,
} from '../../../src/modules/construction/build.js'
import { previewBuild } from '../../../src/modules/construction/preview.js'
import { CATALOGS } from '../../catalogs.js'

/**
 * Le module de construction : la première mécanique du jeu.
 *
 * **Un module ne mute rien** (doc de stack § 5.3). Il reçoit un état projeté et
 * retourne des *effets* que le noyau applique. Ce n'est pas une élégance : c'est
 * ce qui permet à l'aperçu et à l'arbitrage d'être **le même code** (R8). Un
 * module qui muterait ne pourrait pas être interrogé sans conséquence, donc
 * l'aperçu serait une seconde implémentation — et deux implémentations du même
 * calcul finissent toujours par arrondir différemment.
 *
 * Le partage de la responsabilité entre les deux fonctions mérite d'être dit :
 * `preview` **informe** — y compris d'un manque de ressources, que le joueur
 * doit voir avant de confirmer (FR-035, SC-007) —, `decide` **arbitre**. C'est
 * pourquoi un manque de ressources est un champ de l'aperçu et un refus de la
 * décision.
 *
 * **Le contrat de `secondsUntilAffordable` vit ailleurs**, dans
 * `affordability.test.ts` : l'exactitude du délai, le maximum sur les ressources
 * plutôt que leur somme, et les deux causes du `null`. Ce fichier n'éprouve que sa
 * remontée dans un motif de refus — ce qui est ici la seule chose qui le concerne.
 */

const T0 = instant(1_787_750_000)
const WORK_ID = '99999999-9999-4999-8999-999999999999'

function fresh(): PlanetSnapshot {
  return emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt: T0,
    catalogs: CATALOGS,
  })
}

function stateOf(snapshot: PlanetSnapshot, at = T0): ProjectedState {
  return projectPlanet(snapshot, CATALOGS, at)
}

function command(overrides: Partial<BuildCommand> = {}): BuildCommand {
  return {
    kind: 'build',
    workId: WORK_ID,
    typeId: 'mine',
    variantId: 'square-4',
    orientation: 0,
    anchor: { x: 0, y: 4 },
    ...overrides,
  }
}

/** Le coût du niveau 1, recalculé depuis la courbe — jamais recopié. */
function expectedCost(typeId: BuildingTypeId): Record<string, number> {
  return Object.fromEntries(
    Object.entries(CATALOGS.buildings[typeId].cost).map(([resourceId, curve]) => [
      resourceId,
      evaluateCurve(curve, 1),
    ]),
  )
}

describe('decide() retourne des effets, et ne mute rien', () => {
  it('accepte un placement valide et payable', () => {
    const decision = decideBuild(stateOf(fresh()), command(), CATALOGS)
    expect(decision.outcome).toBe('accepted')
  })

  it('émet le débit du coût et la planification, dans cet ordre', () => {
    const decision = decideBuild(stateOf(fresh()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    expect(decision.effects.map((effect) => effect.kind)).toEqual([
      'debit-resources',
      'schedule-work',
    ])
  })

  /**
   * Le coût est débité **au lancement** (FR-036) et vaut la courbe du niveau 1,
   * sans arrondi intermédiaire. Le recalculer ici depuis le catalogue plutôt que
   * de le recopier fait de ce test un contrôle de la *règle*, et non de la
   * valeur d'équilibrage du jour.
   */
  it('débite exactement la courbe de coût du niveau 1', () => {
    const decision = decideBuild(stateOf(fresh()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const debit = decision.effects[0]
    if (debit?.kind !== 'debit-resources') throw new Error('premier effet inattendu')

    const expected = expectedCost('mine')
    expect(Object.fromEntries(debit.amounts.map((a) => [a.resourceId, a.grains]))).toEqual(expected)
    // Aucun coût en Jus : il n'a aucun débouché en 001 (FR-062, R22).
    expect(debit.amounts.some((a) => a.resourceId === 'jus')).toBe(false)
  })

  it('planifie le chantier à l’échéance dictée par la courbe de durée', () => {
    const decision = decideBuild(stateOf(fresh()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const scheduled = decision.effects.find(
      (effect): effect is ScheduleWork => effect.kind === 'schedule-work',
    )
    const duration = evaluateCurve(CATALOGS.buildings.mine.buildDuration, 1)

    expect(scheduled?.nature).toBe('build')
    expect(scheduled?.startedAt).toBe(T0)
    expect(scheduled?.dueAt).toBe(T0 + duration)
    expect(scheduled?.workId).toBe(WORK_ID)
  })

  /**
   * L'effet porte **sa cible**. Un effet qui ne se suffit pas à lui-même
   * obligerait son destinataire à retrouver ailleurs ce que le module savait
   * déjà — c'est-à-dire à reprendre une décision déjà prise.
   */
  it('fait porter au chantier planifié le type, la variante, l’orientation et l’ancre', () => {
    const decision = decideBuild(
      stateOf(fresh()),
      command({ variantId: 'l-4', orientation: 2, anchor: { x: 3, y: 3 } }),
      CATALOGS,
    )
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const scheduled = decision.effects.find(
      (effect): effect is ScheduleWork => effect.kind === 'schedule-work',
    )
    expect(scheduled?.target).toEqual({
      kind: 'build',
      typeId: 'mine',
      variantId: 'l-4',
      orientation: 2,
      anchor: { x: 3, y: 3 },
    })
  })

  it('ne touche ni l’instantané ni l’état projeté', () => {
    const snapshot = fresh()
    const before = JSON.parse(JSON.stringify(snapshot))
    const state = stateOf(snapshot)
    const stateBefore = JSON.parse(JSON.stringify(state))

    decideBuild(state, command(), CATALOGS)

    expect(snapshot).toEqual(before)
    expect(state).toEqual(stateBefore)
  })
})

describe('plusieurs bâtiments du même type sont permis (FR-014)', () => {
  /**
   * Seule la surface disponible contraint leur nombre. Le catalogue n'impose
   * aucune limite d'exemplaires, et c'est une exigence, pas un oubli : une
   * limite chiffrée serait une règle cachée de plus à publier.
   */
  it('accepte une seconde mine quand la première est posée', () => {
    const first: PlacedBuilding = {
      id: 'b-1',
      typeId: 'mine',
      variantId: 'square-4',
      orientation: 0,
      anchor: { x: 0, y: 4 },
      level: 1,
    }
    const snapshot = { ...fresh(), buildings: [first] }

    const decision = decideBuild(stateOf(snapshot), command({ anchor: { x: 3, y: 3 } }), CATALOGS)
    expect(decision.outcome).toBe('accepted')
  })

  it('refuse en revanche de la poser sur les cases de la première', () => {
    const first: PlacedBuilding = {
      id: 'b-1',
      typeId: 'mine',
      variantId: 'square-4',
      orientation: 0,
      anchor: { x: 3, y: 3 },
      level: 1,
    }
    // Le carré de quatre ancré en (4,4) chevauche celui de (3,3) par une case,
    // sans sortir de la grille ni toucher un obstacle : le seul motif possible
    // est donc l'occupation, et c'est ce qu'on veut isoler.
    const decision = decideBuild(
      stateOf({ ...fresh(), buildings: [first] }),
      command({ anchor: { x: 4, y: 4 } }),
      CATALOGS,
    )

    expect(decision.outcome).toBe('refused')
    if (decision.outcome !== 'refused') return
    expect(decision.refusal.code).toBe('placement-on-occupied-cell')
    expect(
      decision.refusal.code === 'placement-on-occupied-cell' && decision.refusal.cells,
    ).toEqual([{ x: 4, y: 4 }])
  })
})

describe('un chantier en cours refuse tout autre chantier (FR-033, FR-034)', () => {
  function withWork(dueAt: number): PlanetSnapshot {
    return {
      ...fresh(),
      work: {
        id: '77777777-7777-4777-8777-777777777777',
        nature: 'build',
        target: {
          kind: 'build',
          typeId: 'centrale',
          variantId: 'line-2',
          orientation: 0,
          anchor: { x: 3, y: 3 },
        },
        startedAt: T0,
        dueAt: instant(dueAt),
      },
    }
  }

  /**
   * SC-006 exige le motif **et** l'échéance. « Occupé » n'apprend rien ; « la
   * centrale est finie dans quatre minutes » dit au joueur quand revenir. C'est
   * la même exigence que FR-013 sur le placement : un refus est une réponse du
   * jeu, donc il doit être exploitable.
   */
  it('refuse avec le motif, l’identifiant, la nature et l’échéance du chantier en cours', () => {
    const decision = decideBuild(stateOf(withWork(T0 + 600)), command(), CATALOGS)

    expect(decision.outcome).toBe('refused')
    if (decision.outcome !== 'refused') return
    expect(decision.refusal).toEqual({
      code: 'work-in-progress',
      workId: '77777777-7777-4777-8777-777777777777',
      nature: 'build',
      dueAt: T0 + 600,
    })
  })

  /**
   * Un chantier **échu** ne bloque rien : la projection l'a déjà résolu à son
   * échéance, et l'état projeté ne le porte plus. C'est le cas du joueur qui
   * revient après trois semaines — le refuser serait lui opposer un chantier
   * terminé depuis vingt jours.
   */
  it('n’oppose pas un chantier échu, que la projection a déjà résolu', () => {
    const snapshot = withWork(T0 + 600)
    const decision = decideBuild(
      stateOf(snapshot, instant(T0 + 5_000)),
      command({ anchor: { x: 0, y: 4 } }),
      CATALOGS,
    )
    expect(decision.outcome).toBe('accepted')
  })

  it('refuse avant même de regarder le placement — la cause la plus générale d’abord', () => {
    const decision = decideBuild(
      stateOf(withWork(T0 + 600)),
      command({ anchor: { x: 5, y: 5 } }),
      CATALOGS,
    )
    expect(decision.outcome).toBe('refused')
    if (decision.outcome !== 'refused') return
    expect(decision.refusal.code).toBe('work-in-progress')
  })
})

describe('une variante étrangère au type est refusée (FR-009)', () => {
  it('refuse une empreinte que le type ne propose pas, et nomme les deux', () => {
    const decision = decideBuild(
      stateOf(fresh()),
      command({ typeId: 'centrale', variantId: 'square-9', anchor: { x: 3, y: 3 } }),
      CATALOGS,
    )

    expect(decision.outcome).toBe('refused')
    if (decision.outcome !== 'refused') return
    expect(decision.refusal).toEqual({
      code: 'variant-not-available-for-type',
      typeId: 'centrale',
      variantId: 'square-9',
    })
  })

  it('accepte chacune des trois variantes de la mine', () => {
    for (const variantId of CATALOGS.buildings.mine.variants) {
      const decision = decideBuild(
        stateOf(fresh()),
        command({ variantId, anchor: { x: 3, y: 3 } }),
        CATALOGS,
      )
      expect(decision.outcome, `${variantId} refusée`).toBe('accepted')
    }
  })
})

describe('les ressources insuffisantes sont un refus, et un manque chiffré', () => {
  /** Une planète sans le sou : le stock de départ ramené à rien. */
  function broke(): PlanetSnapshot {
    const snapshot = fresh()
    return {
      ...snapshot,
      holdings: Object.fromEntries(
        Object.keys(snapshot.holdings).map((resourceId) => [resourceId, { amount: 0, lost: 0 }]),
      ) as PlanetSnapshot['holdings'],
    }
  }

  it('refuse, en énonçant le manque par ressource (SC-007)', () => {
    const decision = decideBuild(stateOf(broke()), command(), CATALOGS)

    expect(decision.outcome).toBe('refused')
    if (decision.outcome !== 'refused') return
    expect(decision.refusal.code).toBe('insufficient-resources')
    if (decision.refusal.code !== 'insufficient-resources') return

    const shortfall = Object.fromEntries(
      decision.refusal.shortfall.map((a) => [a.resourceId, a.grains]),
    )
    expect(shortfall).toEqual(expectedCost('mine'))
  })

  /**
   * Le temps restant pour payer, au rythme courant. Ce n'est pas une politesse :
   * c'est ce qui distingue « reviens dans huit minutes » de « tu es bloqué »,
   * et le second est faux tant que la planète produit (FR-018).
   */
  it('annonce le temps restant avant de pouvoir payer', () => {
    const decision = decideBuild(stateOf(broke()), command(), CATALOGS)
    if (decision.outcome !== 'refused') throw new Error('acceptation inattendue')
    if (decision.refusal.code !== 'insufficient-resources') throw new Error('motif inattendu')

    expect(decision.refusal.secondsUntilAffordable).toBeGreaterThan(0)
  })
})

describe('preview() annonce tout ce que FR-050 exige, avant la décision', () => {
  it('donne le coût, la durée et l’échéance', () => {
    const result = previewBuild(stateOf(fresh()), command(), CATALOGS)
    expect(result.outcome).toBe('accepted')
    if (result.outcome !== 'accepted') return

    const duration = evaluateCurve(CATALOGS.buildings.mine.buildDuration, 1)
    expect(Object.fromEntries(result.preview.cost.map((a) => [a.resourceId, a.grains]))).toEqual(
      expectedCost('mine'),
    )
    expect(result.preview.duration).toBe(duration)
    expect(result.preview.dueAt).toBe(T0 + duration)
  })

  it('donne les gisements recouverts et le taux qui en résulte', () => {
    const result = previewBuild(stateOf(fresh()), command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    const curve = CATALOGS.buildings.mine.production
    expect(curve).not.toBeNull()
    if (curve === null) return

    expect(result.preview.effect.coveredDeposits).toBe(1)
    expect(result.preview.effect.nominalRate).toBe(evaluateCurve(curve, 1))
    expect(result.preview.effect.effectiveRate).toBe(evaluateCurve(curve, 1))
  })

  /**
   * Le scénario 4 d'US2 : une mine posée sur zéro gisement produit zéro, **et
   * cette valeur était annoncée avant la pose**. La seconde moitié de la phrase
   * est ce qui compte : c'est FR-051, aucune valeur découverte après l'action.
   */
  it('annonce zéro pour un placement qui ne recouvre aucun gisement', () => {
    const result = previewBuild(stateOf(fresh()), command({ anchor: { x: 3, y: 3 } }), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    expect(result.preview.effect.coveredDeposits).toBe(0)
    expect(result.preview.effect.nominalRate).toBe(0)
  })

  /**
   * Le scénario 3 d'US2 : deux veines donnent exactement le double d'une, tous
   * autres facteurs égaux — et l'aperçu le dit avant paiement.
   */
  it('double la production annoncée quand l’empreinte recouvre deux veines', () => {
    const one = previewBuild(stateOf(fresh()), command(), CATALOGS)
    const two = previewBuild(
      stateOf({ ...fresh(), clearedCells: [{ x: 0, y: 2 }] }),
      command({ variantId: 'l-4', anchor: { x: 0, y: 2 } }),
      CATALOGS,
    )
    if (one.outcome !== 'accepted' || two.outcome !== 'accepted') {
      throw new Error('refus inattendu')
    }

    expect(two.preview.effect.coveredDeposits).toBe(2)
    expect(two.preview.effect.nominalRate).toBe(2 * one.preview.effect.nominalRate)
  })

  /**
   * L'aperçu **informe** du manque au lieu de refuser : le joueur doit voir le
   * coût et le manque avant de confirmer (FR-035). C'est `decide` qui arbitre.
   */
  it('reste un aperçu quand les ressources manquent, et chiffre le manque', () => {
    const snapshot = fresh()
    const poor: PlanetSnapshot = {
      ...snapshot,
      holdings: Object.fromEntries(
        Object.keys(snapshot.holdings).map((resourceId) => [resourceId, { amount: 0, lost: 0 }]),
      ) as PlanetSnapshot['holdings'],
    }

    const result = previewBuild(stateOf(poor), command(), CATALOGS)
    expect(result.outcome).toBe('accepted')
    if (result.outcome !== 'accepted') return

    expect(result.preview.shortfall).not.toBeNull()
    expect(result.preview.secondsUntilAffordable).toBeGreaterThan(0)
  })

  it('ne signale aucun manque quand le stock de départ suffit (FR-019)', () => {
    const result = previewBuild(stateOf(fresh()), command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')
    expect(result.preview.shortfall).toBeNull()
    expect(result.preview.secondsUntilAffordable).toBeNull()
  })

  it('refuse en revanche un placement invalide — il n’y a rien à prévisualiser', () => {
    const result = previewBuild(stateOf(fresh()), command({ anchor: { x: 5, y: 5 } }), CATALOGS)
    expect(result.outcome).toBe('refused')
    if (result.outcome !== 'refused') return
    expect(result.refusal.code).toBe('placement-out-of-grid')
  })
})

describe('l’aperçu refuse ce qu’il ne peut pas prévisualiser', () => {
  /**
   * Un chantier en cours et une variante étrangère au type sont des refus de
   * l'aperçu, alors qu'un manque de ressources n'en est pas un. La ligne de
   * partage est simple : y a-t-il quelque chose à montrer ? Pour un chantier
   * impossible, non. Pour un chantier trop cher, oui — et c'est même
   * l'information qui décide le joueur à attendre (FR-035).
   */
  it('refuse une variante étrangère au type, en la nommant', () => {
    const result = previewBuild(
      stateOf(fresh()),
      command({ typeId: 'centrale', variantId: 'square-9', anchor: { x: 3, y: 3 } }),
      CATALOGS,
    )

    expect(result.outcome).toBe('refused')
    if (result.outcome !== 'refused') return
    expect(result.refusal).toEqual({
      code: 'variant-not-available-for-type',
      typeId: 'centrale',
      variantId: 'square-9',
    })
  })

  it('refuse quand un chantier est en cours, avec son échéance', () => {
    const snapshot: PlanetSnapshot = {
      ...fresh(),
      work: {
        id: '77777777-7777-4777-8777-777777777777',
        nature: 'build',
        target: {
          kind: 'build',
          typeId: 'centrale',
          variantId: 'line-2',
          orientation: 0,
          anchor: { x: 3, y: 3 },
        },
        startedAt: T0,
        dueAt: instant(T0 + 600),
      },
    }

    const result = previewBuild(stateOf(snapshot), command(), CATALOGS)
    expect(result.outcome).toBe('refused')
    if (result.outcome !== 'refused') return
    expect(result.refusal.code).toBe('work-in-progress')
    expect(result.refusal.code === 'work-in-progress' && result.refusal.dueAt).toBe(T0 + 600)
  })

  it('refuse un placement sur une case obstruée, cases fautives comprises', () => {
    const result = previewBuild(stateOf(fresh()), command({ anchor: { x: 0, y: 2 } }), CATALOGS)
    expect(result.outcome).toBe('refused')
    if (result.outcome !== 'refused') return
    expect(result.refusal.code).toBe('placement-on-obstructed-cell')
  })

  it('refuse un placement sur une case occupée', () => {
    const snapshot: PlanetSnapshot = {
      ...fresh(),
      buildings: [
        {
          id: 'b-1',
          typeId: 'mine',
          variantId: 'square-4',
          orientation: 0,
          anchor: { x: 3, y: 3 },
          level: 1,
        },
      ],
    }
    const result = previewBuild(stateOf(snapshot), command({ anchor: { x: 4, y: 4 } }), CATALOGS)
    expect(result.outcome).toBe('refused')
    if (result.outcome !== 'refused') return
    expect(result.refusal.code).toBe('placement-on-occupied-cell')
  })
})

describe('un type inconnu est une faute de programmation, pas un refus', () => {
  /**
   * Le contrat n'accepte que les identifiants de son union littérale : un type
   * inconnu ne peut donc pas venir d'un joueur. Le rendre en refus de règle de
   * jeu le ferait passer pour une réponse normale du jeu, et la faute
   * d'assemblage qui l'a produit resterait invisible.
   */
  it('lève depuis decide()', () => {
    expect(() =>
      decideBuild(stateOf(fresh()), command({ typeId: 'usine' as 'mine' }), CATALOGS),
    ).toThrow(RangeError)
  })

  it('lève depuis preview()', () => {
    expect(() =>
      previewBuild(stateOf(fresh()), command({ typeId: 'usine' as 'mine' }), CATALOGS),
    ).toThrow(RangeError)
  })
})

describe('les coûts et durées se lisent du catalogue, niveau par niveau', () => {
  it('rend le coût du niveau demandé', () => {
    const level = 3
    const expected = Object.fromEntries(
      Object.entries(CATALOGS.buildings.mine.cost).map(([resourceId, curve]) => [
        resourceId,
        evaluateCurve(curve, level),
      ]),
    )
    expect(
      Object.fromEntries(
        buildCost('mine', level, CATALOGS).map((amount) => [amount.resourceId, amount.grains]),
      ),
    ).toEqual(expected)
  })

  it('rend la durée du niveau demandé', () => {
    expect(buildDuration('mine', 4, CATALOGS)).toBe(
      evaluateCurve(CATALOGS.buildings.mine.buildDuration, 4),
    )
  })

  /**
   * Un type qui n'extrait rien a un taux de **zéro**, quel que soit le nombre de
   * gisements sous son empreinte. La centrale posée sur une veine ne la mine pas.
   */
  it('donne un taux nul à un type qui n’extrait rien', () => {
    expect(extractorRate('centrale', 1, 3, CATALOGS)).toBe(0)
    expect(extractorRate('entrepot', 10, 2, CATALOGS)).toBe(0)
  })
})
