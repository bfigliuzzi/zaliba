import { OBSTACLE_IDS, type ObstacleId } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../../src/game.js'
import type { DebitResources, ScheduleWork } from '../../../src/kernel/effects.js'
import type { ProjectedState } from '../../../src/kernel/projection.js'
import { grains } from '../../../src/kernel/resources.js'
import { emptySnapshot, type PlanetSnapshot } from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import {
  type ClearCommand,
  clearCost,
  clearDuration,
  decideClear,
} from '../../../src/modules/construction/clear.js'
import { previewClear } from '../../../src/modules/construction/preview.js'
import { CATALOGS } from '../../catalogs.js'

/**
 * Le déblaiement : libérer du terrain contre des ressources et du temps.
 *
 * **Ce que cette mécanique a de particulier, et que les trois autres n'ont pas :
 * elle produit un résultat qualitatif.** Une pose donne un bâtiment, une
 * amélioration un niveau, une démolition un remboursement — trois choses que le
 * joueur connaît d'avance. Un déblaiement, lui, laisse derrière lui soit du
 * terrain nu, soit un gisement nommé, et c'est ce qui décide si l'opération valait
 * son prix. D'où l'exigence centrale d'US5 : le résultat est **annoncé avant
 * paiement** (FR-042, FR-043), et il est **déterminé**, jamais tiré au sort
 * (FR-044).
 *
 * Le déterminisme n'est pas éprouvé par répétition — répéter un tirage au sort
 * peut donner deux fois le même résultat. Il est éprouvé par sa **cause** : le
 * résultat est lu du type d'obstacle, donc du catalogue, donc identique pour deux
 * cases du même type et pour deux joueurs. C'est la forme de la donnée qui le
 * tient, et le test la nomme.
 *
 * **Rien ici n'est libellé en grains de Jus** : les coûts de déblaiement n'en
 * portent pas (FR-062), et le catalogue le garantit par un test de cohérence.
 */

const T0 = instant(1_787_750_000)
const WORK_ID = '99999999-9999-4999-8999-999999999999'

/** L'éboulis de (3,0) : le moins cher, et il rend du terrain nu. */
const EBOULIS = { cell: { x: 3, y: 0 }, obstacleId: 'eboulis' as ObstacleId }

/** La poche scellée de (3,2) : coûteuse, et elle rend une veine de Jus. */
const POCHE = { cell: { x: 3, y: 2 }, obstacleId: 'poche-scellee' as ObstacleId }

/** (5,5) : libre dans la disposition du Berceau. */
const LIBRE = { x: 5, y: 5 }

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

function command(cell = EBOULIS.cell): ClearCommand {
  return { kind: 'clear', workId: WORK_ID, cell }
}

/** Le coût attendu, relu du catalogue — jamais recopié. */
function expectedCost(obstacleId: ObstacleId): Record<string, number> {
  return { ...CATALOGS.obstacles[obstacleId].cost } as Record<string, number>
}

describe('le coût, la durée et le résultat sont lus du type d’obstacle (FR-042, FR-043)', () => {
  it('le coût est celui du catalogue, pour chacun des cinq types', () => {
    for (const obstacleId of OBSTACLE_IDS) {
      const cost = clearCost(obstacleId, CATALOGS)
      expect(Object.fromEntries(cost.map((one) => [one.resourceId, one.grains]))).toEqual(
        expectedCost(obstacleId),
      )
    }
  })

  it('la durée est celle du catalogue, pour chacun des cinq types', () => {
    for (const obstacleId of OBSTACLE_IDS) {
      expect(clearDuration(obstacleId, CATALOGS)).toBe(
        CATALOGS.obstacles[obstacleId].durationSeconds,
      )
    }
  })

  it('aucun coût de déblaiement n’est libellé en Jus (FR-062)', () => {
    for (const obstacleId of OBSTACLE_IDS) {
      expect(clearCost(obstacleId, CATALOGS).map((one) => one.resourceId)).not.toContain('jus')
    }
  })
})

describe('decide() retourne des effets, et ne mute rien', () => {
  it('débite au lancement et planifie l’échéance', () => {
    const decision = decideClear(stateOf(fresh()), command(), CATALOGS)

    expect(decision.outcome).toBe('accepted')
    if (decision.outcome !== 'accepted') return

    const debit = decision.effects.find((one) => one.kind === 'debit-resources') as DebitResources
    expect(Object.fromEntries(debit.amounts.map((one) => [one.resourceId, one.grains]))).toEqual(
      expectedCost(EBOULIS.obstacleId),
    )

    const scheduled = decision.effects.find((one) => one.kind === 'schedule-work') as ScheduleWork
    expect(scheduled.nature).toBe('clear')
    expect(scheduled.target).toEqual({ kind: 'cell', cell: EBOULIS.cell })
    expect(scheduled.startedAt).toBe(T0)
    expect(scheduled.dueAt).toBe(T0 + CATALOGS.obstacles[EBOULIS.obstacleId].durationSeconds)
  })

  it('la cible ne porte **aucune** géométrie de bâtiment', () => {
    const decision = decideClear(stateOf(fresh()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('Le déblaiement devait être accepté.')

    const scheduled = decision.effects.find((one) => one.kind === 'schedule-work') as ScheduleWork
    // Un déblaiement ne pose rien : sa cible est une case, et la contrainte
    // `works_target_matches_nature` refuse en base une autre forme.
    expect(Object.keys(scheduled.target).toSorted()).toEqual(['cell', 'kind'])
  })

  it('l’instantané reçu n’est pas modifié', () => {
    const snapshot = fresh()
    // Une copie par sérialisation, et non `structuredClone` : ce paquet se
    // compile sans les types du navigateur ni ceux de Node, et c'est ce qui rend
    // le domaine éprouvable sans serveur. L'instantané n'est fait que de nombres,
    // de chaînes et d'objets plats — la sérialisation le rend fidèlement.
    const before = JSON.parse(JSON.stringify(snapshot))
    decideClear(stateOf(snapshot), command(), CATALOGS)
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(before)
  })
})

describe('le résultat est déterminé, et jamais tiré au sort (FR-044, US5-3)', () => {
  it('deux déblaiements de la même case dans le même état donnent le même résultat', () => {
    const state = stateOf(fresh())

    const first = previewClear(state, command(POCHE.cell), CATALOGS)
    const second = previewClear(state, command(POCHE.cell), CATALOGS)

    expect(first).toEqual(second)
  })

  it('le résultat annoncé est celui du type d’obstacle, pas celui de la case', () => {
    const state = stateOf(fresh())

    // (0,2) et (2,3) portent le **même** type — `filon-enfoui` — à deux endroits
    // différents de la planète. Le résultat annoncé doit être identique : c'est
    // ce qui rend la planète lisible, et ce qu'un bonus caché sous une case
    // détruirait.
    const first = previewClear(state, command({ x: 0, y: 2 }), CATALOGS)
    const second = previewClear(state, command({ x: 2, y: 3 }), CATALOGS)

    if (first.outcome !== 'accepted' || second.outcome !== 'accepted') {
      throw new Error('Les deux filons enfouis devaient être prévisualisables.')
    }
    expect(first.preview.effect.reveals).toEqual(second.preview.effect.reveals)
    expect(first.preview.cost).toEqual(second.preview.cost)
    expect(first.preview.duration).toEqual(second.preview.duration)
  })

  it('l’aperçu annonce le terrain nu d’un éboulis', () => {
    const preview = previewClear(stateOf(fresh()), command(EBOULIS.cell), CATALOGS)
    if (preview.outcome !== 'accepted') throw new Error('L’éboulis devait être prévisualisable.')

    expect(preview.preview.effect.reveals).toBe('bare-ground')
  })

  it('l’aperçu annonce le gisement de Jus d’une poche scellée', () => {
    const preview = previewClear(stateOf(fresh()), command(POCHE.cell), CATALOGS)
    if (preview.outcome !== 'accepted') throw new Error('La poche devait être prévisualisable.')

    expect(preview.preview.effect.reveals).toEqual({ depositOf: 'jus' })
  })

  it('l’aperçu annonce l’obstacle, le coût et la durée avant tout paiement (FR-043)', () => {
    const preview = previewClear(stateOf(fresh()), command(POCHE.cell), CATALOGS)
    if (preview.outcome !== 'accepted') throw new Error('La poche devait être prévisualisable.')

    expect(preview.preview.effect.obstacleId).toBe(POCHE.obstacleId)
    expect(Object.fromEntries(preview.preview.cost.map((o) => [o.resourceId, o.grains]))).toEqual(
      expectedCost(POCHE.obstacleId),
    )
    expect(preview.preview.duration).toBe(CATALOGS.obstacles[POCHE.obstacleId].durationSeconds)
    expect(preview.preview.dueAt).toBe(T0 + CATALOGS.obstacles[POCHE.obstacleId].durationSeconds)
  })

  it('ce que l’aperçu annonce est ce que la décision engage', () => {
    const state = stateOf(fresh())
    const preview = previewClear(state, command(POCHE.cell), CATALOGS)
    const decision = decideClear(state, command(POCHE.cell), CATALOGS)

    if (preview.outcome !== 'accepted' || decision.outcome !== 'accepted') {
      throw new Error('L’aperçu et la décision devaient concorder.')
    }
    const debit = decision.effects.find((one) => one.kind === 'debit-resources') as DebitResources
    const scheduled = decision.effects.find((one) => one.kind === 'schedule-work') as ScheduleWork

    expect(debit.amounts).toEqual(preview.preview.cost)
    expect(scheduled.dueAt).toBe(preview.preview.dueAt)
  })
})

describe('les refus, en union fermée', () => {
  it('refuse `cell-not-obstructed` sur une case libre', () => {
    const decision = decideClear(stateOf(fresh()), command(LIBRE), CATALOGS)

    expect(decision).toEqual({
      outcome: 'refused',
      refusal: { code: 'cell-not-obstructed', x: LIBRE.x, y: LIBRE.y },
    })
  })

  it('refuse `cell-not-obstructed` sur une case déjà déblayée (I-8)', () => {
    const snapshot: PlanetSnapshot = { ...fresh(), clearedCells: [EBOULIS.cell] }
    const decision = decideClear(stateOf(snapshot), command(EBOULIS.cell), CATALOGS)

    expect(decision).toEqual({
      outcome: 'refused',
      refusal: { code: 'cell-not-obstructed', x: EBOULIS.cell.x, y: EBOULIS.cell.y },
    })
  })

  it('refuse `placement-out-of-grid` sur une case hors de la planète', () => {
    const decision = decideClear(stateOf(fresh()), command({ x: 9, y: 9 }), CATALOGS)

    expect(decision).toEqual({
      outcome: 'refused',
      refusal: { code: 'placement-out-of-grid', cells: [{ x: 9, y: 9 }] },
    })
  })

  it('refuse `work-in-progress` quand un chantier est en cours, **avant** de regarder la case', () => {
    const snapshot: PlanetSnapshot = {
      ...fresh(),
      work: {
        id: '33333333-3333-4333-8333-333333333333',
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

    // La case visée est **libre** : si l'ordre des contrôles était inverse, le
    // joueur entendrait « cette case n'est pas obstruée » alors que la cause est
    // le chantier. Un refus doit nommer la cause qui permet d'agir.
    const decision = decideClear(stateOf(snapshot), command(LIBRE), CATALOGS)

    expect(decision.outcome).toBe('refused')
    if (decision.outcome !== 'refused') return
    expect(decision.refusal.code).toBe('work-in-progress')
  })

  it('refuse `insufficient-resources`, manque et délai compris', () => {
    const snapshot: PlanetSnapshot = {
      ...fresh(),
      holdings: {
        camelote: { amount: grains(0), lost: grains(0), saturatedSince: null },
        jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
        'bave-etoiles': { amount: grains(0), lost: grains(0), saturatedSince: null },
      },
    }

    const decision = decideClear(stateOf(snapshot), command(POCHE.cell), CATALOGS)

    expect(decision.outcome).toBe('refused')
    if (decision.outcome !== 'refused') return
    if (decision.refusal.code !== 'insufficient-resources') {
      throw new Error(`Motif inattendu : ${decision.refusal.code}.`)
    }
    expect(decision.refusal.shortfall.map((one) => one.resourceId).toSorted()).toEqual([
      'bave-etoiles',
      'camelote',
    ])
    // Le délai est une information utile : il dit quand revenir (SC-007).
    expect(decision.refusal.secondsUntilAffordable).toBeGreaterThan(0)
  })

  it('l’aperçu informe du manque au lieu de refuser (FR-035, SC-007)', () => {
    const snapshot: PlanetSnapshot = {
      ...fresh(),
      holdings: {
        camelote: { amount: grains(0), lost: grains(0), saturatedSince: null },
        jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
        'bave-etoiles': { amount: grains(0), lost: grains(0), saturatedSince: null },
      },
    }

    const preview = previewClear(stateOf(snapshot), command(POCHE.cell), CATALOGS)

    // Un aperçu qui refuserait faute de fonds n'afficherait plus le coût, c'est-à-dire
    // précisément l'information dont le joueur a besoin pour décider d'attendre.
    expect(preview.outcome).toBe('accepted')
    if (preview.outcome !== 'accepted') return
    expect(preview.preview.shortfall).not.toBeNull()
    expect(preview.preview.effect.reveals).toEqual({ depositOf: 'jus' })
  })
})
