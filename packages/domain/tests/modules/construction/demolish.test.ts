import { BUILDINGS } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../../src/game.js'
import { DEFAULT_CATALOGS } from '../../../src/kernel/catalogs.js'
import { cumulativeCost } from '../../../src/kernel/curves.js'
import type { CreditResources, RemoveBuilding, ScheduleWork } from '../../../src/kernel/effects.js'
import type { ProjectedState } from '../../../src/kernel/projection.js'
import { grains } from '../../../src/kernel/resources.js'
import {
  applyEffects,
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import { effectsOnCompletion } from '../../../src/modules/construction/completion.js'
import {
  type DemolishCommand,
  decideDemolish,
  demolishDuration,
  grossRefund,
} from '../../../src/modules/construction/demolish.js'
import { previewDemolish } from '../../../src/modules/construction/preview.js'

/**
 * La démolition : le second antidote à la grille figée.
 *
 * **Ce que la mécanique promet, et qui n'est pas évident : une erreur de
 * placement n'est plus définitive.** Sans elle, une planète mal rangée reste mal
 * rangée pour toujours, et le jeu punit l'apprentissage — ce qui est exactement
 * l'inverse de ce qu'un jeu de rangement doit faire.
 *
 * **Le remboursement est dérivé, jamais stocké** (R9, FR-046) : il vaut
 * `fraction × Σ(k=1..N) coût(k)`, recalculé depuis la courbe du catalogue. C'est ce
 * qui garantit que la page de règles, l'aperçu du client et l'arbitrage du serveur
 * donnent le **même** nombre, puisqu'ils lisent la même courbe. Un coût cumulé figé
 * à la pose deviendrait faux au premier rééquilibrage, et faux en silence.
 *
 * Et c'est la raison pour laquelle l'amélioration n'a **pas** de courbe propre
 * (voir `upgrade.ts`) : cette somme n'est le total réellement dépensé que si monter
 * au niveau `k` a coûté exactement `coût(k)`. Le jour où l'amélioration prendrait
 * sa propre courbe, la démolition rembourserait un montant que personne n'a payé.
 *
 * **La démolition ne coûte rien** — une durée et rien d'autre. Il n'y a donc aucun
 * `debit-resources` ici, et aucun refus pour compte insuffisant : une planète
 * saturée d'erreurs doit pouvoir se corriger, sinon FR-018 — « aucun état de jeu
 * n'est définitivement bloquant » — serait démenti par la seule mécanique censée
 * le garantir.
 */

const T0 = instant(1_787_750_000)
const CATALOGS = DEFAULT_CATALOGS
const WORK_ID = '99999999-9999-4999-8999-999999999999'
const BUILDING_ID = '88888888-8888-4888-8888-888888888888'
const OTHER_ID = '77777777-7777-4777-8777-777777777777'

/** Le seul carré de quatre qui couvre la veine de Camelote de (0,4). */
const MINE: PlacedBuilding = {
  id: BUILDING_ID,
  typeId: 'mine',
  variantId: 'square-4',
  orientation: 0,
  anchor: { x: 0, y: 4 },
  level: 1,
}

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

function withMine(level = 1): PlanetSnapshot {
  return { ...fresh(), buildings: [{ ...MINE, level }] }
}

function stateOf(snapshot: PlanetSnapshot, at = T0): ProjectedState {
  return projectPlanet(snapshot, CATALOGS, at)
}

function command(buildingId = BUILDING_ID): DemolishCommand {
  return { kind: 'demolish', workId: WORK_ID, buildingId }
}

/**
 * Le remboursement attendu, **recalculé depuis la courbe** — jamais recopié.
 *
 * `fraction × Σ(k=1..N) coût(k)`, avec les valeurs *déjà tronquées* de la somme
 * (R19) et une troncature finale vers le bas : le joueur ne peut pas récupérer plus
 * qu'il n'a dépensé.
 */
function expectedRefund(typeId: keyof typeof BUILDINGS, level: number): Record<string, number> {
  const type = BUILDINGS[typeId]
  return Object.fromEntries(
    Object.entries(type.cost).map(([resourceId, curve]) => [
      resourceId,
      Math.floor((cumulativeCost(curve, level) * type.refund.num) / type.refund.den),
    ]),
  )
}

const amountsOf = (amounts: readonly { resourceId: string; grains: number }[]) =>
  Object.fromEntries(amounts.map((one) => [one.resourceId, one.grains]))

describe('le remboursement est dérivé de la courbe, et non stocké (R9, FR-046)', () => {
  it.each([1, 2, 3, 7, 30])('vaut la fraction du coût cumulé au niveau %i', (level) => {
    expect(amountsOf(grossRefund('mine', level, CATALOGS))).toEqual(expectedRefund('mine', level))
  })

  /**
   * L'énoncé qui compte, et qu'aucune recopie de valeur ne dirait : **le
   * remboursement d'un niveau 3 porte sur les trois niveaux payés**, et non sur le
   * dernier. Un joueur qui a monté sa mine trois fois a dépensé trois fois, et
   * c'est cette somme dont il récupère la moitié.
   */
  it('porte sur tous les niveaux payés, pas sur le dernier', () => {
    const three = amountsOf(grossRefund('mine', 3, CATALOGS))
    const one = amountsOf(grossRefund('mine', 1, CATALOGS))
    const two = amountsOf(grossRefund('mine', 2, CATALOGS))

    // Strictement croissant, et non proportionnel : la courbe est géométrique.
    expect(three['camelote']).toBeGreaterThan(two['camelote'] as number)
    expect(two['camelote']).toBeGreaterThan(one['camelote'] as number)

    // Et la somme des coûts des trois niveaux, à la fraction près.
    expect(three).toEqual(expectedRefund('mine', 3))
  })

  it('la fraction est appliquée en entiers, troncature vers le bas', () => {
    for (const typeId of Object.keys(BUILDINGS) as readonly (keyof typeof BUILDINGS)[]) {
      for (const amount of grossRefund(typeId, 5, CATALOGS)) {
        expect(Number.isInteger(amount.grains)).toBe(true)
      }
    }
  })

  it('la durée est lue du catalogue, et ne dépend pas du niveau', () => {
    for (const typeId of Object.keys(BUILDINGS) as readonly (keyof typeof BUILDINGS)[]) {
      expect(demolishDuration(typeId, CATALOGS)).toBe(BUILDINGS[typeId].demolitionSeconds)
    }
  })
})

describe('decide() retourne des effets, et ne mute rien', () => {
  /**
   * **Aucun débit, et c'est le sujet.** La démolition ne coûte qu'une durée : une
   * planète saturée d'erreurs doit pouvoir se corriger même sans trésorerie, sinon
   * la seule mécanique censée garantir qu'aucun état n'est bloquant serait
   * elle-même bloquée par le blocage.
   */
  it('planifie l’échéance, et ne débite rien', () => {
    const decision = decideDemolish(stateOf(withMine()), command(), CATALOGS)

    expect(decision.outcome).toBe('accepted')
    if (decision.outcome !== 'accepted') return

    expect(decision.effects.map((one) => one.kind)).toEqual(['schedule-work'])

    const scheduled = decision.effects[0] as ScheduleWork
    expect(scheduled.nature).toBe('demolish')
    expect(scheduled.target).toEqual({ kind: 'building', buildingId: BUILDING_ID })
    expect(scheduled.dueAt).toBe(T0 + BUILDINGS.mine.demolitionSeconds)
  })

  it('accepte même avec une trésorerie vide', () => {
    const broke: PlanetSnapshot = {
      ...withMine(),
      holdings: {
        camelote: { amount: grains(0), lost: grains(0) },
        jus: { amount: grains(0), lost: grains(0) },
        'bave-etoiles': { amount: grains(0), lost: grains(0) },
      },
    }
    expect(decideDemolish(stateOf(broke), command(), CATALOGS).outcome).toBe('accepted')
  })

  it('la cible ne porte **aucune** géométrie', () => {
    const decision = decideDemolish(stateOf(withMine()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const scheduled = decision.effects[0] as ScheduleWork
    expect(Object.keys(scheduled.target).toSorted()).toEqual(['buildingId', 'kind'])
  })

  it('l’instantané reçu n’est pas modifié', () => {
    const snapshot = withMine(3)
    const before = JSON.parse(JSON.stringify(snapshot))
    decideDemolish(stateOf(snapshot), command(), CATALOGS)
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(before)
  })
})

describe('à l’achèvement, les cases redeviennent libres et les gisements sont intacts (FR-047)', () => {
  /**
   * Le parcours complet, par la projection : lancer, laisser échoir, constater.
   *
   * Les gisements sont l'énoncé qui compte. Recouvrir n'efface pas un gisement
   * (FR-020), et démolir ne doit donc pas l'effacer non plus — sans quoi une erreur
   * de placement sur une veine détruirait la veine, et le jeu punirait
   * l'apprentissage au lieu de le permettre.
   */
  it('les quatre cases sont libres, la veine est toujours là', () => {
    const decision = decideDemolish(stateOf(withMine()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const launched = applyEffects(withMine(), decision.effects, T0)
    const after = projectPlanet(launched, CATALOGS, instant(T0 + BUILDINGS.mine.demolitionSeconds))

    expect(after.buildings).toHaveLength(0)
    for (const cell of [
      { x: 0, y: 4 },
      { x: 1, y: 4 },
      { x: 0, y: 5 },
      { x: 1, y: 5 },
    ]) {
      const view = after.grid.find((one) => one.x === cell.x && one.y === cell.y)
      expect(view?.state, `case (${cell.x},${cell.y})`).toBe('free')
      expect(view?.buildingId).toBeNull()
    }

    // La veine de Camelote de (0,4), intacte.
    expect(after.grid.find((one) => one.x === 0 && one.y === 4)?.depositOf).toBe('camelote')
  })

  it('les effets d’achèvement retirent le bâtiment **puis** créditent', () => {
    const snapshot = withMine(3)
    const decision = decideDemolish(stateOf(snapshot), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const launched = applyEffects(snapshot, decision.effects, T0)
    const work = launched.work
    if (work === null) throw new Error('le chantier manque')

    const effects = effectsOnCompletion(work, launched, CATALOGS)

    // L'ordre est celui qu'un lecteur de journal voit : retirer, puis rembourser.
    expect(effects.map((one) => one.kind)).toEqual(['remove-building', 'credit-resources'])
    expect((effects[0] as RemoveBuilding).buildingId).toBe(BUILDING_ID)
    expect(amountsOf((effects[1] as CreditResources).amounts)).toEqual(expectedRefund('mine', 3))
  })

  /**
   * **La production cesse à l'instant exact de l'échéance** (FR-048), et non à
   * celui de la constatation.
   *
   * L'énoncé est éprouvé par différence, ce qui le rend concluant sans arithmétique
   * fragile : projeter à `dueAt + Δ` puis à `dueAt + 2Δ` doit donner le **même**
   * gain que la production de base seule sur `Δ`. Si la mine produisait encore
   * après l'échéance, le second intervalle serait plus riche que le premier.
   */
  it('la production du bâtiment démoli cesse à l’échéance, pas au constat', () => {
    const decision = decideDemolish(stateOf(withMine()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const launched = applyEffects(withMine(), decision.effects, T0)
    const due = T0 + BUILDINGS.mine.demolitionSeconds
    const step = 3_600

    const at1 = projectPlanet(launched, CATALOGS, instant(due + step))
    const at2 = projectPlanet(launched, CATALOGS, instant(due + 2 * step))

    const gain = at2.holdings.camelote.amount - at1.holdings.camelote.amount
    // La production de base du Berceau, et elle seule : vingt unités par heure,
    // soit vingt grains par seconde (R1).
    const base = CATALOGS.layouts['berceau-v1'].baseProductionPerHour.camelote
    expect(gain).toBe(base * step)

    // Et le taux publié après l'échéance ne porte plus la mine.
    expect(at1.holdings.camelote.rate).toBe(base)
  })

  /**
   * Le remboursement est crédité **à l'échéance**, pas au lancement. Un
   * remboursement immédiat ferait de la démolition une avance de trésorerie
   * gratuite, et rendrait rentable de poser pour démolir.
   */
  it('rien n’est crédité avant l’échéance', () => {
    const decision = decideDemolish(stateOf(withMine(3)), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const launched = applyEffects(withMine(3), decision.effects, T0)
    const before = projectPlanet(
      launched,
      CATALOGS,
      instant(T0 + BUILDINGS.mine.demolitionSeconds - 1),
    )
    const after = projectPlanet(launched, CATALOGS, instant(T0 + BUILDINGS.mine.demolitionSeconds))

    const refund = expectedRefund('mine', 3)['bave-etoiles'] as number
    // La Bave d'étoiles est choisie parce que la mine n'en produit pas : la seule
    // différence entre les deux instants est donc le remboursement, à une seconde
    // de production de base près.
    const base = CATALOGS.layouts['berceau-v1'].baseProductionPerHour['bave-etoiles']
    expect(after.holdings['bave-etoiles'].amount - before.holdings['bave-etoiles'].amount).toBe(
      refund + base,
    )
  })
})

describe('les refus, en union fermée', () => {
  it('refuse `building-not-found` sur une cible absente', () => {
    const decision = decideDemolish(stateOf(withMine()), command(OTHER_ID), CATALOGS)

    expect(decision).toEqual({
      outcome: 'refused',
      refusal: { code: 'building-not-found', buildingId: OTHER_ID },
    })
  })

  /**
   * **`building-is-work-target` est plus précis que `work-in-progress`**, et c'est
   * pourquoi il existe.
   *
   * Les deux nomment la même cause — un chantier est en cours —, mais celui-ci dit
   * *pourquoi ce bâtiment-là*. Un joueur qui améliore sa mine et tente de la
   * démolir entendrait sinon « un chantier est en cours » et pourrait croire qu'un
   * autre bâtiment est concerné. C'est la leçon de la phase 6 poussée d'un cran :
   * un refus doit nommer la cause qui permet d'agir, et la plus précise des deux
   * causes vraies est celle qui permet d'agir.
   */
  it('refuse `building-is-work-target` quand la cible est celle du chantier en cours', () => {
    const busy: PlanetSnapshot = {
      ...withMine(),
      work: {
        id: WORK_ID,
        nature: 'upgrade',
        target: { kind: 'building', buildingId: BUILDING_ID },
        startedAt: T0,
        dueAt: instant(T0 + 168),
      },
    }

    expect(decideDemolish(stateOf(busy), command(), CATALOGS)).toEqual({
      outcome: 'refused',
      refusal: { code: 'building-is-work-target', workId: WORK_ID },
    })
  })

  it('refuse `work-in-progress` quand le chantier porte sur autre chose', () => {
    const busy: PlanetSnapshot = {
      ...withMine(),
      work: {
        id: WORK_ID,
        nature: 'clear',
        target: { kind: 'cell', cell: { x: 3, y: 0 } },
        startedAt: T0,
        dueAt: instant(T0 + 300),
      },
    }

    const decision = decideDemolish(stateOf(busy), command(), CATALOGS)
    expect(decision.outcome).toBe('refused')
    if (decision.outcome !== 'refused') return
    expect(decision.refusal.code).toBe('work-in-progress')
  })

  /**
   * Le chantier **en cours** l'emporte sur la cible absente, comme pour
   * l'amélioration : une pose en cours *explique* l'absence du bâtiment qu'elle
   * produira, et opposer « bâtiment introuvable » enverrait chercher un bâtiment
   * que le chantier est en train de construire.
   */
  it('un chantier en cours passe avant la cible absente', () => {
    const busy: PlanetSnapshot = {
      ...fresh(),
      work: {
        id: WORK_ID,
        nature: 'build',
        target: {
          kind: 'build',
          typeId: 'mine',
          variantId: 'square-4',
          orientation: 0,
          anchor: { x: 0, y: 4 },
        },
        startedAt: T0,
        dueAt: instant(T0 + 120),
      },
    }

    const decision = decideDemolish(stateOf(busy), command(), CATALOGS)
    expect(decision.outcome).toBe('refused')
    if (decision.outcome !== 'refused') return
    expect(decision.refusal.code).toBe('work-in-progress')
  })
})

describe('l’aperçu annonce les cinq grandeurs de la démolition (FR-046, FR-047, FR-049)', () => {
  it('remboursement, durée, cases libérées et gisements préservés', () => {
    const preview = previewDemolish(stateOf(withMine(3)), command(), CATALOGS)
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    const { effect, duration, dueAt, cost } = preview.preview

    expect(amountsOf(effect.refund)).toEqual(expectedRefund('mine', 3))
    expect(effect.clippedAmount).toEqual([])
    expect(effect.cellsFreed).toHaveLength(4)
    // Le gisement que la mine recouvre, **nommé** : c'est ce qui dit au joueur
    // qu'il ne détruit pas la veine en démolissant l'extracteur (FR-020, FR-047).
    expect(effect.depositsPreserved).toEqual([{ x: 0, y: 4, depositOf: 'camelote' }])

    expect(duration).toBe(BUILDINGS.mine.demolitionSeconds)
    expect(dueAt).toBe(T0 + BUILDINGS.mine.demolitionSeconds)
    // La démolition ne coûte rien : les termes communs le disent en toutes lettres.
    expect(cost).toEqual([])
    expect(preview.preview.shortfall).toBeNull()
  })

  /** Ce que l'aperçu annonce est ce que l'achèvement crédite (R8). */
  it('le remboursement annoncé est celui que l’achèvement crédite', () => {
    const snapshot = withMine(3)
    const preview = previewDemolish(stateOf(snapshot), command(), CATALOGS)
    const decision = decideDemolish(stateOf(snapshot), command(), CATALOGS)
    if (preview.outcome !== 'accepted' || decision.outcome !== 'accepted') {
      throw new Error('l’aperçu et la décision devaient concorder')
    }

    const launched = applyEffects(snapshot, decision.effects, T0)
    const work = launched.work
    if (work === null) throw new Error('le chantier manque')

    const credited = effectsOnCompletion(work, launched, CATALOGS).find(
      (one) => one.kind === 'credit-resources',
    ) as CreditResources

    expect(credited.amounts).toEqual(preview.preview.effect.refund)
  })

  it('refuse d’aperçu ce que la décision refuse', () => {
    const preview = previewDemolish(stateOf(withMine()), command(OTHER_ID), CATALOGS)
    expect(preview.outcome).toBe('refused')
    if (preview.outcome !== 'refused') return
    expect(preview.refusal.code).toBe('building-not-found')
  })
})
