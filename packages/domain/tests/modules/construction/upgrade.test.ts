import type { BuildingTypeId } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../../src/game.js'
import { cumulativeCost, evaluateCurve } from '../../../src/kernel/curves.js'
import type { ScheduleWork } from '../../../src/kernel/effects.js'
import { energyConsumption, energyProduction } from '../../../src/kernel/energy.js'
import type { ProjectedState } from '../../../src/kernel/projection.js'
import { extractorRate } from '../../../src/kernel/rates.js'
import { grains } from '../../../src/kernel/resources.js'
import {
  applyEffects,
  emptySnapshot,
  type PlacedBuilding,
  type PlanetSnapshot,
} from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import { previewUpgrade } from '../../../src/modules/construction/preview.js'
import {
  decideUpgrade,
  maxLevelOf,
  type UpgradeCommand,
  upgradeCost,
  upgradeDuration,
} from '../../../src/modules/construction/upgrade.js'
import { CATALOGS } from '../../catalogs.js'

/**
 * L'amélioration : la voie de progression qui ne consomme **pas** de surface.
 *
 * C'est ce qui la rend distincte de la pose, et c'est aussi ce qui la rend
 * disponible quand la grille est saturée. Trois choses s'y jouent, et chacune est
 * éprouvée ici :
 *
 * - **le coût et la durée suivent la courbe du niveau visé** (FR-040). Pas une
 *   seconde courbe « d'amélioration » : la même, évaluée à `N+1`. C'est cette
 *   identité qui rend le remboursement de la démolition dérivable — `refund =
 *   fraction × Σ(k=1..N) coût(k)` (R9) n'est vrai que si monter au niveau `k` a
 *   coûté exactement `coût(k)` ;
 * - **l'aperçu annonce le gain exact avant paiement** (FR-041). Coût, durée,
 *   production actuelle, production résultante, et leur différence ;
 * - **le refus porte son motif chiffré** (US4-3) : le manque par ressource, et le
 *   temps qu'il faudra au rythme courant.
 *
 * Ce que ce fichier **n'éprouve pas** : l'identité des cases occupées. Elle est
 * l'invariant I-7, et un invariant se dit sur toutes les formes à la fois — voir
 * `upgrade-invariants.test.ts`.
 */

const T0 = instant(1_787_750_000)
const WORK_ID = '99999999-9999-4999-8999-999999999999'
const BUILDING_ID = '88888888-8888-4888-8888-888888888888'

/** La mine de référence : carré de quatre sur la veine de Camelote. */
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

/** Une planète portant la mine, au niveau demandé. */
function withMine(level = 1, overrides: Partial<PlanetSnapshot> = {}): PlanetSnapshot {
  return { ...fresh(), buildings: [{ ...MINE, level }], ...overrides }
}

function stateOf(snapshot: PlanetSnapshot, at = T0): ProjectedState {
  return projectPlanet(snapshot, CATALOGS, at)
}

function command(overrides: Partial<UpgradeCommand> = {}): UpgradeCommand {
  return { kind: 'upgrade', workId: WORK_ID, buildingId: BUILDING_ID, ...overrides }
}

/** Le coût du niveau visé, recalculé depuis la courbe — jamais recopié. */
function expectedCost(typeId: BuildingTypeId, level: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(CATALOGS.buildings[typeId].cost).map(([resourceId, curve]) => [
      resourceId,
      evaluateCurve(curve, level),
    ]),
  )
}

describe('decideUpgrade() retourne des effets, et ne mute rien', () => {
  it('accepte l’amélioration d’un bâtiment posé et payable', () => {
    expect(decideUpgrade(stateOf(withMine()), command(), CATALOGS).outcome).toBe('accepted')
  })

  it('émet le débit du coût et la planification, dans cet ordre', () => {
    const decision = decideUpgrade(stateOf(withMine()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    expect(decision.effects.map((effect) => effect.kind)).toEqual([
      'debit-resources',
      'schedule-work',
    ])
  })

  /**
   * Le coût est celui du **niveau visé**, et non celui du niveau courant.
   * L'inverse rendrait la première amélioration gratuite au prix du niveau 1, et
   * la dernière payée au prix de l'avant-dernière : le joueur ne pourrait plus
   * refaire le calcul, et SC-002 tomberait.
   */
  it('débite la courbe de coût du niveau visé (FR-040)', () => {
    const decision = decideUpgrade(stateOf(withMine(1)), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const debit = decision.effects[0]
    if (debit?.kind !== 'debit-resources') throw new Error('premier effet inattendu')

    expect(Object.fromEntries(debit.amounts.map((a) => [a.resourceId, a.grains]))).toEqual(
      expectedCost('mine', 2),
    )
    // Aucun coût en Jus : il n'a aucun débouché en 001 (FR-062, R22).
    expect(debit.amounts.some((a) => a.resourceId === 'jus')).toBe(false)
  })

  it('planifie l’échéance à la durée du niveau visé', () => {
    const decision = decideUpgrade(stateOf(withMine(1)), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const scheduled = decision.effects[1] as ScheduleWork
    expect(scheduled.kind).toBe('schedule-work')
    expect(scheduled.dueAt - scheduled.startedAt).toBe(
      evaluateCurve(CATALOGS.buildings.mine.buildDuration, 2),
    )
  })

  /**
   * La nature et la cible sont **cohérentes**, et la base l'exige : la contrainte
   * `works_target_matches_nature` refuse une ligne dont la nature contredit sa
   * cible. Une amélioration ciblant une case ne serait pas seulement absurde,
   * elle serait un état que le domaine ne sait pas relire.
   */
  it('planifie une amélioration ciblant le bâtiment, sans géométrie (FR-039)', () => {
    const decision = decideUpgrade(stateOf(withMine()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const scheduled = decision.effects[1] as ScheduleWork
    expect(scheduled.nature).toBe('upgrade')
    expect(scheduled.target).toEqual({ kind: 'building', buildingId: BUILDING_ID })
  })

  it('n’émet aucun effet qui touche la grille', () => {
    const decision = decideUpgrade(stateOf(withMine()), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    for (const effect of decision.effects) {
      expect(['place-building', 'remove-building', 'clear-cell']).not.toContain(effect.kind)
    }
  })
})

describe('la courbe est la même que celle de la pose, évaluée au niveau visé (R9)', () => {
  /**
   * L'énoncé a une conséquence qui n'est pas décorative : le remboursement d'une
   * démolition vaut `fraction × Σ(k=1..N) coût(k)` et il est **dérivé** de la
   * courbe, jamais stocké. Cette somme n'est le total réellement dépensé que si
   * chaque montée au niveau `k` a coûté exactement `coût(k)`. Le jour où
   * l'amélioration prendrait sa propre courbe, la démolition rembourserait un
   * montant qui n'a jamais été payé — et elle le ferait en silence.
   */
  it('la somme des améliorations jusqu’à N vaut le coût cumulé de la courbe', () => {
    for (const [typeId, type] of Object.entries(CATALOGS.buildings)) {
      for (const [resourceId, curve] of Object.entries(type.cost)) {
        let paid = evaluateCurve(curve, 1)
        for (let level = 2; level <= 5; level += 1) {
          const step = upgradeCost(typeId as BuildingTypeId, level, CATALOGS).find(
            (amount) => amount.resourceId === resourceId,
          )
          paid += step?.grains ?? 0
          expect(paid, `${typeId}/${resourceId} au niveau ${level}`).toBe(
            cumulativeCost(curve, level),
          )
        }
      }
    }
  })

  it('la durée d’une amélioration est la courbe de durée au niveau visé', () => {
    expect(upgradeDuration('mine', 3, CATALOGS)).toBe(
      evaluateCurve(CATALOGS.buildings.mine.buildDuration, 3),
    )
  })
})

describe('l’aperçu annonce le gain exact avant paiement (FR-041, US4-2)', () => {
  it('porte le coût et la durée du niveau visé', () => {
    const result = previewUpgrade(stateOf(withMine(1)), command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    expect(Object.fromEntries(result.preview.cost.map((a) => [a.resourceId, a.grains]))).toEqual(
      expectedCost('mine', 2),
    )
    expect(result.preview.duration).toBe(evaluateCurve(CATALOGS.buildings.mine.buildDuration, 2))
  })

  /**
   * `rateBefore`, `rateAfter` et `delta` — les trois grandeurs de FR-041.
   *
   * La mine de référence recouvre **un** gisement de Camelote, et la règle
   * publiée est `courbeProduction(niveau) × gisements` (R5). Le gain n'est donc
   * pas un pourcentage annoncé : c'est une différence de deux valeurs que le
   * joueur peut refaire à la main.
   */
  it('porte la production actuelle, la production résultante et leur différence', () => {
    const result = previewUpgrade(stateOf(withMine(1)), command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    const { effect } = result.preview
    expect(effect.kind).toBe('upgrade')
    expect(effect.nominalBefore).toBe(extractorRate('mine', 1, 1, CATALOGS))
    expect(effect.nominalAfter).toBe(extractorRate('mine', 2, 1, CATALOGS))
    expect(effect.delta).toBe(effect.rateAfter - effect.rateBefore)
    expect(effect.delta).toBeGreaterThan(0)
  })

  /** I-7, annoncé : l'aperçu **dit** que rien ne bouge sur la grille (FR-039). */
  it('annonce que les cases occupées ne changent pas', () => {
    const result = previewUpgrade(stateOf(withMine(1)), command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    expect(result.preview.effect.cellsUnchanged).toBe(true)
    expect(result.preview.effect.level).toBe(1)
    expect(result.preview.effect.levelAfter).toBe(2)
  })

  /**
   * L'énergie **après** l'amélioration, comme pour la pose (US3-3).
   *
   * Un niveau de plus consomme davantage, et c'est le rapport résultant qui
   * décide de la production réelle. Annoncer le gain sous le rapport *courant*
   * promettrait un chiffre que l'amélioration rendrait faux à l'instant même où
   * elle l'atteint.
   */
  it('porte le rapport d’énergie résultant, consommation du niveau visé comprise', () => {
    const result = previewUpgrade(stateOf(withMine(1)), command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    const { energyAfter } = result.preview.effect
    expect(energyAfter.consumed).toBe(energyConsumption('mine', 2, CATALOGS))
    // Le bâtiment amélioré figure **une seule fois** : le remplacer, et non
    // l'ajouter, est la différence entre un rapport juste et un rapport doublé.
    expect(energyAfter.consumers).toHaveLength(1)
    expect(energyAfter.consumers[0]?.level).toBe(2)
  })

  /**
   * L'aperçu **informe** d'un manque, il ne refuse pas.
   *
   * C'est la même asymétrie que pour la pose : un aperçu qui refuserait faute de
   * fonds n'afficherait plus le coût, c'est-à-dire précisément l'information dont
   * le joueur a besoin pour décider d'attendre (FR-035, SC-007).
   */
  it('affiche le coût même quand le compte n’y est pas', () => {
    const poor = withMine(1, {
      holdings: {
        camelote: { amount: grains(0), lost: grains(0), saturatedSince: null },
        jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
        'bave-etoiles': { amount: grains(0), lost: grains(0), saturatedSince: null },
      },
    })

    const result = previewUpgrade(stateOf(poor), command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    expect(result.preview.shortfall).not.toBeNull()
    expect(result.preview.cost.length).toBeGreaterThan(0)
  })
})

describe('l’énergie résultante suit le type amélioré', () => {
  /**
   * La **centrale** est le seul type qui produit et ne consomme pas (R20), donc le
   * seul dont l'amélioration déplace le *numérateur* du rapport.
   *
   * Le cas mérite son test : le détail de consommation ne doit gagner aucune ligne
   * — une « centrale, 0 » ferait chercher au joueur ce qu'elle consomme, alors
   * qu'elle est justement le type qui n'en consomme pas — et `fromPlants` doit
   * croître du pas de la courbe, pas du niveau.
   */
  const Plant = {
    id: BUILDING_ID,
    typeId: 'centrale' as const,
    variantId: 'line-2' as const,
    orientation: 0,
    anchor: { x: 4, y: 5 },
    level: 1,
  }

  it('améliorer une centrale augmente la production, sans rien consommer', () => {
    const snapshot = { ...fresh(), buildings: [Plant] }
    const result = previewUpgrade(stateOf(snapshot), command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    const { energyAfter } = result.preview.effect
    expect(energyAfter.fromPlants).toBe(energyProduction('centrale', 2, CATALOGS))
    expect(energyAfter.consumers).toHaveLength(0)
    expect(energyAfter.consumed).toBe(0)
    expect(energyAfter.deficit).toBe(false)
  })

  /**
   * Une centrale ne produit **aucune** ressource : son gain propre est nul, et
   * l'annoncer nul est honnête. Ce que son amélioration change est ailleurs — le
   * rapport de toute la planète —, et c'est le panneau d'énergie qui le montre.
   */
  it('le gain propre d’une centrale est nul, et annoncé tel quel', () => {
    const snapshot = { ...fresh(), buildings: [Plant] }
    const result = previewUpgrade(stateOf(snapshot), command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    expect(result.preview.effect.nominalAfter).toBe(0)
    expect(result.preview.effect.delta).toBe(0)
  })

  /**
   * **Le gain peut être négatif**, et c'est l'information qui compte le plus.
   *
   * Sur une planète déjà en déficit, un niveau de plus consomme davantage : le
   * rapport se dégrade plus vite que la courbe de production ne monte, et la
   * production *constatée* baisse. L'écrêter à zéro, ou n'annoncer que la
   * production résultante, cacherait précisément l'information qui doit faire
   * poser une centrale d'abord.
   *
   * Le chiffre se refait à la main (SC-002) : `⌊15 × 20 ÷ 22⌋ = 13` avant,
   * `⌊16 × 20 ÷ 26⌋ = 12` après.
   */
  const Racloir = {
    id: '55555555-5555-4555-8555-555555555555',
    typeId: 'racloir' as const,
    variantId: 'square-9' as const,
    orientation: 0,
    anchor: { x: 3, y: 3 },
    level: 1,
  }

  it('annonce un gain négatif quand le niveau de plus creuse le déficit', () => {
    const snapshot = { ...fresh(), buildings: [{ ...MINE, level: 1 }, Racloir] }
    const state = stateOf(snapshot)
    expect(state.energy.deficit).toBe(true)

    const result = previewUpgrade(state, command(), CATALOGS)
    if (result.outcome !== 'accepted') throw new Error('refus inattendu')

    const { effect } = result.preview
    expect(effect.nominalAfter).toBeGreaterThan(effect.nominalBefore)
    expect(effect.rateAfter).toBeLessThan(effect.rateBefore)
    expect(effect.delta).toBeLessThan(0)
    expect(effect.delta).toBe(effect.rateAfter - effect.rateBefore)
  })
})

describe('les refus portent leur motif exact', () => {
  /**
   * `building-not-found` plutôt qu'un défaut serveur.
   *
   * Le contrat accepte n'importe quel UUID : rien dans le schéma ne peut dire
   * qu'une planète porte ce bâtiment. C'est donc un refus de règle de jeu — 409 —
   * et non une requête malformée.
   */
  it('refuse une cible qui n’existe pas, avec son identifiant', () => {
    const decision = decideUpgrade(
      stateOf(withMine()),
      command({ buildingId: '77777777-7777-4777-8777-777777777777' }),
      CATALOGS,
    )
    if (decision.outcome !== 'refused') throw new Error('acceptation inattendue')

    expect(decision.refusal).toEqual({
      code: 'building-not-found',
      buildingId: '77777777-7777-4777-8777-777777777777',
    })
  })

  it('refuse au niveau maximal du catalogue, en nommant le plafond', () => {
    const decision = decideUpgrade(
      stateOf(withMine(CATALOGS.buildings.mine.maxLevel)),
      command(),
      CATALOGS,
    )
    if (decision.outcome !== 'refused') throw new Error('acceptation inattendue')

    expect(decision.refusal).toEqual({
      code: 'max-level-reached',
      buildingId: BUILDING_ID,
      maxLevel: CATALOGS.buildings.mine.maxLevel,
    })
  })

  /**
   * US4-3 : le manque **par ressource**, et le temps pour le combler.
   *
   * « Ressources insuffisantes » n'apprend rien. « Il manque 150 Camelote,
   * payable dans quatre minutes » dit à la fois quoi faire et quand revenir.
   */
  it('refuse un compte insuffisant, avec le manque par ressource et le délai', () => {
    const poor = withMine(1, {
      holdings: {
        camelote: { amount: grains(0), lost: grains(0), saturatedSince: null },
        jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
        'bave-etoiles': { amount: grains(0), lost: grains(0), saturatedSince: null },
      },
    })

    const decision = decideUpgrade(stateOf(poor), command(), CATALOGS)
    if (decision.outcome !== 'refused') throw new Error('acceptation inattendue')
    if (decision.refusal.code !== 'insufficient-resources') {
      throw new Error(`motif inattendu : ${decision.refusal.code}`)
    }

    const missing = Object.fromEntries(
      decision.refusal.shortfall.map((a) => [a.resourceId, a.grains]),
    )
    expect(missing).toEqual(expectedCost('mine', 2))
    expect(decision.refusal.secondsUntilAffordable).toBeGreaterThan(0)
  })

  /**
   * **« Chantier en cours » passe avant « bâtiment introuvable »**, et le cas qui
   * le prouve est celui d'un joueur qui lance une pose puis tente d'améliorer le
   * bâtiment qu'elle produira.
   *
   * Le bâtiment n'existe pas encore — « introuvable » serait vrai. Et inutile : la
   * cause est le chantier, et le chantier *explique* l'absence. Un refus doit
   * nommer la cause qui permet d'agir, pas la conséquence la plus proche. C'est le
   * parcours d'intégration qui l'a trouvé ; aucun ordre n'échouait à compiler.
   */
  it('oppose le chantier en cours, et non l’absence d’un bâtiment à naître', () => {
    const building = '44444444-4444-4444-8444-444444444444'
    const launching = applyEffects(
      fresh(),
      [
        {
          kind: 'schedule-work',
          workId: building,
          nature: 'build',
          target: {
            kind: 'build',
            typeId: 'mine',
            variantId: 'square-4',
            orientation: 0,
            anchor: { x: 0, y: 4 },
          },
          startedAt: T0,
          dueAt: T0 + 120,
        },
      ],
      T0,
    )

    const decision = decideUpgrade(stateOf(launching), command({ buildingId: building }), CATALOGS)
    if (decision.outcome !== 'refused') throw new Error('acceptation inattendue')
    expect(decision.refusal.code).toBe('work-in-progress')
  })

  it('refuse quand un chantier est déjà en cours (FR-033)', () => {
    const busy = applyEffects(
      withMine(),
      [
        {
          kind: 'schedule-work',
          workId: '66666666-6666-4666-8666-666666666666',
          nature: 'upgrade',
          target: { kind: 'building', buildingId: BUILDING_ID },
          startedAt: T0,
          dueAt: T0 + 300,
        },
      ],
      T0,
    )

    const decision = decideUpgrade(stateOf(busy), command(), CATALOGS)
    if (decision.outcome !== 'refused') throw new Error('acceptation inattendue')
    expect(decision.refusal.code).toBe('work-in-progress')
  })

  /**
   * L'aperçu refuse pour les **mêmes** motifs, sauf le manque de ressources.
   *
   * Il n'y a rien à prévisualiser d'une cible qui n'existe pas ou d'un niveau
   * maximal atteint, alors qu'il y a tout à dire d'une amélioration qu'on ne peut
   * pas encore payer.
   */
  it('l’aperçu refuse une cible absente et un niveau maximal', () => {
    const absent = previewUpgrade(
      stateOf(withMine()),
      command({ buildingId: '77777777-7777-4777-8777-777777777777' }),
      CATALOGS,
    )
    expect(absent.outcome).toBe('refused')

    const capped = previewUpgrade(
      stateOf(withMine(CATALOGS.buildings.mine.maxLevel)),
      command(),
      CATALOGS,
    )
    expect(capped.outcome).toBe('refused')
  })
})

describe('l’achèvement porte le bâtiment au niveau suivant, et rien d’autre', () => {
  /**
   * Le parcours complet, par la projection : lancer, laisser courir, constater.
   *
   * Ce n'est pas un doublon des tests d'effets. Ce qui est éprouvé ici est que
   * l'effet d'achèvement est **redérivé à l'échéance** depuis l'instantané tel
   * qu'il est alors (R3, FR-032) — donc qu'un chantier lancé au niveau 1
   * s'achève au niveau 2 même s'il est constaté trois semaines plus tard.
   */
  it('le niveau passe à N+1 à l’échéance, constatée bien après', () => {
    const decision = decideUpgrade(stateOf(withMine(1)), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const launched = applyEffects(withMine(1), decision.effects, T0)
    const seconds = evaluateCurve(CATALOGS.buildings.mine.buildDuration, 2)

    // Une seconde avant l'échéance : rien n'a changé, et le chantier est visible.
    const before = stateOf(launched, instant(T0 + seconds - 1))
    expect(before.buildings[0]?.level).toBe(1)
    expect(before.work).not.toBeNull()

    // Trois semaines après : le niveau est 2, et le chantier a disparu.
    const after = stateOf(launched, instant(T0 + seconds + 1_814_400))
    expect(after.buildings[0]?.level).toBe(2)
    expect(after.work).toBeNull()
  })

  it('la production constatée vaut exactement celle qui était annoncée', () => {
    const state = stateOf(withMine(1))
    const preview = previewUpgrade(state, command(), CATALOGS)
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    const decision = decideUpgrade(state, command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const launched = applyEffects(withMine(1), decision.effects, T0)
    const seconds = evaluateCurve(CATALOGS.buildings.mine.buildDuration, 2)
    const after = stateOf(launched, instant(T0 + seconds))

    // Le gain annoncé et le gain constaté, à l'unité près. C'est l'« Independent
    // Test » d'US4, et il ne tient que parce que l'aperçu et l'arbitrage sont le
    // même code (R8).
    expect(after.buildings[0]?.effectiveRate).toBe(preview.preview.effect.rateAfter)
    expect(after.buildings[0]?.nominalRate).toBe(preview.preview.effect.nominalAfter)
  })
})

describe('un type inconnu est une faute de programmation, pas un refus', () => {
  /**
   * Le contrat n'accepte que les identifiants de l'union littérale : un type
   * inconnu ne peut pas venir d'un joueur. Lever bruyamment le rend corrélable par
   * `requestId` ; le refuser en silence l'aurait rangé parmi les réponses du jeu.
   */
  it('lève depuis maxLevelOf()', () => {
    expect(() => maxLevelOf('usine' as 'mine', CATALOGS)).toThrow(RangeError)
  })
})
