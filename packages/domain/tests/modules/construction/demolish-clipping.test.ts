import { BUILDINGS } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../../src/game.js'
import { DEFAULT_CATALOGS } from '../../../src/kernel/catalogs.js'
import type { CreditResources } from '../../../src/kernel/effects.js'
import { storageCaps } from '../../../src/kernel/rates.js'
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
  grossRefund,
} from '../../../src/modules/construction/demolish.js'
import { previewDemolish } from '../../../src/modules/construction/preview.js'

/**
 * **L'écrêtement du remboursement, annoncé avant confirmation** (FR-049).
 *
 * Un remboursement qui ferait dépasser le plafond est écrêté. La règle est banale ;
 * ce qui ne l'est pas, c'est qu'elle doit être **annoncée avant paiement**, donc
 * *prédite au lancement pour un crédit qui aura lieu à l'échéance*.
 *
 * Cette prédiction n'est possible que grâce à une règle de jeu apparemment sans
 * rapport : **au plus un chantier par planète** (FR-033). Comme aucune autre
 * transition ne peut survenir entre le lancement et l'échéance (R3, R4), l'état à
 * l'échéance est calculable exactement au lancement — quantité détenue comprise,
 * production de la durée comprise. L'unicité du chantier n'est donc pas seulement
 * une contrainte d'équilibrage : c'est ce qui rend la promesse de FR-049 tenable.
 * Le jour où deux chantiers coexisteraient, ce fichier tomberait, et il tomberait
 * pour la bonne raison.
 *
 * **Le montant écrêté ne rejoint pas la perte cumulée**, et c'est une décision.
 * `lost` mesure la production perdue par saturation (FR-026) — le chiffre qui doit
 * faire désirer un entrepôt (US7-3). Y verser un remboursement écrêté mêlerait deux
 * grandeurs de natures différentes : l'une est une conséquence du temps qui passe,
 * l'autre d'une décision ponctuelle que le joueur a vue venir. Et il l'a vue venir
 * précisément parce que FR-049 l'exige : l'annonce *avant* confirmation vaut mieux
 * qu'un compteur constaté après.
 */

const T0 = instant(1_787_750_000)
const CATALOGS = DEFAULT_CATALOGS
const WORK_ID = '99999999-9999-4999-8999-999999999999'
const BUILDING_ID = '88888888-8888-4888-8888-888888888888'
const LAYOUT = CATALOGS.layouts['berceau-v1']

const MINE: PlacedBuilding = {
  id: BUILDING_ID,
  typeId: 'mine',
  variantId: 'square-4',
  orientation: 0,
  anchor: { x: 0, y: 4 },
  level: 3,
}

const command = (): DemolishCommand => ({
  kind: 'demolish',
  workId: WORK_ID,
  buildingId: BUILDING_ID,
})

/**
 * Une planète dont les trois ressources sont à une quantité choisie.
 *
 * L'écrêtement s'éprouve en approchant le plafond, et l'approcher par le jeu
 * demanderait des heures : le plafond de base est de cinq mille unités, la
 * production de vingt à l'heure. L'état est donc **posé**, ce qui est légitime — un
 * instantané est une donnée, et la règle éprouvée porte sur le calcul, pas sur le
 * chemin qui y mène.
 */
function planetAt(amounts: Readonly<Record<string, number>>, level = 3): PlanetSnapshot {
  const base = emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt: T0,
    catalogs: CATALOGS,
  })

  return {
    ...base,
    buildings: [{ ...MINE, level }],
    holdings: {
      camelote: { amount: grains(amounts['camelote'] ?? 0), lost: grains(0), saturatedSince: null },
      jus: { amount: grains(amounts['jus'] ?? 0), lost: grains(0), saturatedSince: null },
      'bave-etoiles': {
        amount: grains(amounts['bave-etoiles'] ?? 0),
        lost: grains(0),
        saturatedSince: null,
      },
    },
  }
}

const CAP = LAYOUT.baseCapacityGrains
const DEMOLITION = BUILDINGS.mine.demolitionSeconds

const amountsOf = (amounts: readonly { resourceId: string; grains: number }[]) =>
  Object.fromEntries(amounts.map((one) => [one.resourceId, one.grains]))

/** Le remboursement brut de la mine de niveau 3, relu de la courbe. */
const GROSS = amountsOf(grossRefund('mine', 3, CATALOGS))

/**
 * La quantité qu'une ressource atteindra à l'échéance, plafond compris.
 *
 * C'est le calcul que l'aperçu doit faire, et il n'a rien de mystérieux : la
 * production court au taux courant jusqu'à l'échéance, puisque le bâtiment démoli
 * produit encore jusqu'à son dernier instant (FR-048).
 */
function atDue(resourceId: 'camelote' | 'jus' | 'bave-etoiles', snapshot: PlanetSnapshot): number {
  const state = projectPlanet(snapshot, CATALOGS, T0)
  const holding = state.holdings[resourceId]
  return Math.min(holding.cap, holding.amount + holding.rate * DEMOLITION)
}

describe('un remboursement qui dépasserait le plafond est écrêté (FR-049)', () => {
  it('sur une ressource saturée, l’aperçu annonce un remboursement nul et l’écrêtement entier', () => {
    // Les deux ressources du coût de la mine sont **au plafond** : rien ne peut
    // être rendu, et tout est écrêté.
    const snapshot = planetAt({
      camelote: CAP.camelote,
      'bave-etoiles': CAP['bave-etoiles'],
    })

    const preview = previewDemolish(projectPlanet(snapshot, CATALOGS, T0), command(), CATALOGS)
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    expect(amountsOf(preview.preview.effect.refund)).toEqual({})
    expect(amountsOf(preview.preview.effect.clippedAmount)).toEqual(GROSS)
  })

  it('sur une ressource partiellement remplie, l’écrêtement est le surplus exact', () => {
    // Il reste de la place pour **la moitié** du remboursement de Camelote.
    const room = Math.floor((GROSS['camelote'] as number) / 2)
    const snapshot = planetAt({
      camelote: CAP.camelote - room,
      'bave-etoiles': 0,
    })

    // La production de Camelote court aussi pendant la démolition : la place
    // restante à l'échéance est moindre que celle du lancement, et c'est cela que
    // l'aperçu doit annoncer — pas la place d'aujourd'hui.
    const expectedRoom = CAP.camelote - atDue('camelote', snapshot)

    const preview = previewDemolish(projectPlanet(snapshot, CATALOGS, T0), command(), CATALOGS)
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    const refund = amountsOf(preview.preview.effect.refund)
    const clipped = amountsOf(preview.preview.effect.clippedAmount)

    expect(refund['camelote']).toBe(expectedRoom)
    expect(clipped['camelote']).toBe((GROSS['camelote'] as number) - expectedRoom)
    // La Bave d'étoiles, elle, a toute la place : elle n'est pas écrêtée.
    expect(refund['bave-etoiles']).toBe(GROSS['bave-etoiles'])
    expect(clipped['bave-etoiles']).toBeUndefined()

    // Et les deux moitiés se recomposent : rien ne se perd dans le calcul.
    expect((refund['camelote'] as number) + (clipped['camelote'] as number)).toBe(GROSS['camelote'])
  })

  it('sans écrêtement, le montant écrêté est une liste vide et non un zéro', () => {
    const preview = previewDemolish(
      projectPlanet(planetAt({ camelote: 0, 'bave-etoiles': 0 }), CATALOGS, T0),
      command(),
      CATALOGS,
    )
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    // Une entrée « 0 Camelote écrêtée » ferait chercher au joueur une perte qui
    // n'existe pas. L'absence se dit par l'absence.
    expect(preview.preview.effect.clippedAmount).toEqual([])
    expect(amountsOf(preview.preview.effect.refund)).toEqual(GROSS)
  })
})

describe('ce que l’aperçu annonce est exactement ce que l’achèvement crédite', () => {
  /**
   * L'énoncé central de la tranche, et la raison d'être de ce fichier : la
   * prédiction faite au lancement vaut à l'échéance, **à l'unité de grain près**.
   */
  it.each([
    ['saturée', { camelote: CAP.camelote, 'bave-etoiles': CAP['bave-etoiles'] }],
    ['presque pleine', { camelote: CAP.camelote - 100_000, 'bave-etoiles': 0 }],
    ['vide', { camelote: 0, 'bave-etoiles': 0 }],
  ])('planète %s : l’annonce vaut le crédit', (_label, amounts) => {
    const snapshot = planetAt(amounts)

    const preview = previewDemolish(projectPlanet(snapshot, CATALOGS, T0), command(), CATALOGS)
    const decision = decideDemolish(projectPlanet(snapshot, CATALOGS, T0), command(), CATALOGS)
    if (preview.outcome !== 'accepted' || decision.outcome !== 'accepted') {
      throw new Error('l’aperçu et la décision devaient concorder')
    }

    const launched = applyEffects(snapshot, decision.effects, T0)

    // L'instantané **tel qu'il est à l'échéance** : c'est celui que la projection
    // passe à `effectsOnCompletion`, production de la durée comprise.
    const atDueSnapshot = {
      ...launched,
      holdings: Object.fromEntries(
        Object.entries(launched.holdings).map(([resourceId, holding]) => {
          const state = projectPlanet(snapshot, CATALOGS, T0)
          const view = state.holdings[resourceId as keyof typeof state.holdings]
          return [
            resourceId,
            {
              amount: grains(Math.min(view.cap, holding.amount + view.rate * DEMOLITION)),
              lost: holding.lost,
            },
          ]
        }),
      ) as PlanetSnapshot['holdings'],
      consolidatedAt: instant(T0 + DEMOLITION),
    }

    const work = launched.work
    if (work === null) throw new Error('le chantier manque')

    const credited = effectsOnCompletion(work, atDueSnapshot, CATALOGS).find(
      (one) => one.kind === 'credit-resources',
    ) as CreditResources | undefined

    expect(amountsOf(credited?.amounts ?? [])).toEqual(amountsOf(preview.preview.effect.refund))
  })

  /**
   * **Le même énoncé, sur une planète qui porte un entrepôt.**
   *
   * Il passe aujourd'hui pour une raison qui ne durera pas : en 001, le plafond ne
   * dépend d'aucun bâtiment — la courbe de capacité de l'entrepôt arrive avec US7.
   * L'aperçu peut donc prendre le plafond de l'état projeté tel quel, et
   * `effectsOnCompletion` le recalculer sans le bâtiment retiré : les deux donnent
   * la même valeur.
   *
   * Le jour où US7 câblera la capacité, cette égalité cessera de tenir d'elle-même,
   * et **ce test tombera** — parce que démolir un entrepôt réduira le plafond à
   * l'instant même où il rembourse, et que l'aperçu devra en tenir compte pour
   * annoncer le bon montant écrêté. C'est la porte, écrite maintenant, qui mordra
   * plus tard : la faire écrire par la tranche qui en a besoin serait la faire
   * écrire par celle qui n'y pensera pas.
   */
  it('l’annonce vaut le crédit, même en démolissant un entrepôt', () => {
    const Warehouse = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const Level = 4
    const base = emptySnapshot({
      planetId: '11111111-1111-4111-8111-111111111111',
      ownerId: '22222222-2222-4222-8222-222222222222',
      occupantId: '22222222-2222-4222-8222-222222222222',
      archetypeId: 'berceau',
      layoutId: 'berceau-v1',
      consolidatedAt: T0,
      catalogs: CATALOGS,
    })

    const store: PlacedBuilding = {
      id: Warehouse,
      typeId: 'entrepot',
      variantId: 'single',
      orientation: 0,
      anchor: { x: 5, y: 5 },
      level: Level,
    }

    // La planète est **presque pleine pour son plafond courant**, entrepôt compris.
    // C'est le seul état qui éprouve quelque chose : avec la seule base, l'entrepôt
    // laisse tant de place que ni l'aperçu ni l'achèvement n'écrêtent, et l'égalité
    // serait vraie sans rien dire.
    const capWith = storageCaps({ ...base, buildings: [store] }, CATALOGS)

    const snapshot: PlanetSnapshot = {
      ...base,
      buildings: [store],
      holdings: {
        camelote: {
          amount: grains(capWith.camelote - 200_000),
          lost: grains(0),
          saturatedSince: null,
        },
        jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
        'bave-etoiles': {
          amount: grains(capWith['bave-etoiles'] - 50_000),
          lost: grains(0),
          saturatedSince: null,
        },
      },
    }

    const target: DemolishCommand = { kind: 'demolish', workId: WORK_ID, buildingId: Warehouse }

    const state = projectPlanet(snapshot, CATALOGS, T0)
    const preview = previewDemolish(state, target, CATALOGS)
    const decision = decideDemolish(state, target, CATALOGS)
    if (preview.outcome !== 'accepted' || decision.outcome !== 'accepted') {
      throw new Error('l’aperçu et la décision devaient concorder')
    }

    const launched = applyEffects(snapshot, decision.effects, T0)
    const work = launched.work
    if (work === null) throw new Error('le chantier manque')

    const seconds = BUILDINGS.entrepot.demolitionSeconds

    // L'instantané **tel que la projection le construit à l'échéance**, puis les
    // effets d'achèvement tels qu'elle les demande.
    const atDue = projectPlanet(launched, CATALOGS, instant(T0 + seconds - 1))
    const snapshotAtDue: PlanetSnapshot = {
      ...launched,
      consolidatedAt: instant(T0 + seconds),
      holdings: Object.fromEntries(
        Object.entries(launched.holdings).map(([resourceId, holding]) => {
          const view = atDue.holdings[resourceId as keyof typeof atDue.holdings]
          return [
            resourceId,
            {
              amount: grains(Math.min(view.cap, holding.amount + view.rate * seconds)),
              lost: holding.lost,
            },
          ]
        }),
      ) as PlanetSnapshot['holdings'],
    }

    const credited = effectsOnCompletion(work, snapshotAtDue, CATALOGS).find(
      (one) => one.kind === 'credit-resources',
    ) as CreditResources | undefined

    // **L'égalité, sans correctif.** Un `Math.min` appliqué ici masquerait
    // exactement la divergence qu'on cherche : l'aperçu doit annoncer le montant que
    // l'achèvement crédite, plafond d'après retrait compris.
    expect(amountsOf(credited?.amounts ?? [])).toEqual(amountsOf(preview.preview.effect.refund))
  })

  /**
   * **Démolir un entrepôt plein fait perdre le surplus, et cela doit être annoncé.**
   *
   * Le plafond baisse à l'instant du retrait, et la quantité détenue peut se
   * retrouver au-dessus : le noyau l'écrête au segment suivant et compte la
   * différence en perte (R4). C'est le comportement le moins mauvais — l'alternative
   * serait de tolérer un état que l'invariant I-1 interdit —, mais il serait
   * intolérable qu'il soit **découvert après l'action** (FR-051). L'aperçu publie donc
   * la baisse de plafond et le surplus qui sera perdu.
   */
  it('annonce la baisse de plafond et le surplus perdu d’un entrepôt plein', () => {
    const Warehouse = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const base = emptySnapshot({
      planetId: '11111111-1111-4111-8111-111111111111',
      ownerId: '22222222-2222-4222-8222-222222222222',
      occupantId: '22222222-2222-4222-8222-222222222222',
      archetypeId: 'berceau',
      layoutId: 'berceau-v1',
      consolidatedAt: T0,
      catalogs: CATALOGS,
    })

    const store: PlacedBuilding = {
      id: Warehouse,
      typeId: 'entrepot',
      variantId: 'single',
      orientation: 0,
      anchor: { x: 5, y: 5 },
      level: 4,
    }

    const capWith = storageCaps({ ...base, buildings: [store] }, CATALOGS)
    const capWithout = storageCaps({ ...base, buildings: [] }, CATALOGS)

    const snapshot: PlanetSnapshot = {
      ...base,
      buildings: [store],
      holdings: {
        // Saturée : tout ce qui dépasse le plafond d'après retrait sera perdu.
        camelote: { amount: grains(capWith.camelote), lost: grains(0), saturatedSince: null },
        jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
        'bave-etoiles': { amount: grains(0), lost: grains(0), saturatedSince: null },
      },
    }

    const target: DemolishCommand = { kind: 'demolish', workId: WORK_ID, buildingId: Warehouse }
    const state = projectPlanet(snapshot, CATALOGS, T0)
    const preview = previewDemolish(state, target, CATALOGS)
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    const effect = preview.preview.effect

    // La baisse de plafond, par ressource.
    expect(amountsOf(effect.capacityLost)).toEqual({
      camelote: capWith.camelote - capWithout.camelote,
      jus: capWith.jus - capWithout.jus,
      'bave-etoiles': capWith['bave-etoiles'] - capWithout['bave-etoiles'],
    })

    // Le surplus qui sera perdu : la Camelote est saturée, donc tout l'écart.
    expect(amountsOf(effect.overflowLost)['camelote']).toBe(capWith.camelote - capWithout.camelote)
    // Les deux autres sont vides : rien à perdre quand rien n'est stocké.
    expect(amountsOf(effect.overflowLost)['jus']).toBeUndefined()

    // Et le constat après achèvement le confirme, au grain près.
    const decision = decideDemolish(state, target, CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const after = projectPlanet(
      applyEffects(snapshot, decision.effects, T0),
      CATALOGS,
      instant(T0 + BUILDINGS.entrepot.demolitionSeconds),
    )
    expect(after.holdings.camelote.amount).toBe(capWithout.camelote)
    expect(after.holdings.camelote.lost).toBeGreaterThanOrEqual(
      capWith.camelote - capWithout.camelote,
    )
  })

  /**
   * **I-1 tient**, y compris à travers un remboursement écrêté : `0 ≤ amount ≤ cap`
   * pour toute suite de commandes légales. Sans écrêtement, le crédit ferait
   * dépasser le plafond, et l'invariant tomberait à l'instant même de l'échéance.
   */
  it('la quantité ne dépasse jamais le plafond, par le parcours complet', () => {
    const snapshot = planetAt({
      camelote: CAP.camelote - 1_000,
      'bave-etoiles': CAP['bave-etoiles'] - 1_000,
    })
    const decision = decideDemolish(projectPlanet(snapshot, CATALOGS, T0), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const launched = applyEffects(snapshot, decision.effects, T0)

    for (const extra of [0, 1, 60, 86_400]) {
      const after = projectPlanet(launched, CATALOGS, instant(T0 + DEMOLITION + extra))
      for (const [resourceId, holding] of Object.entries(after.holdings)) {
        expect(holding.amount, `${resourceId} à +${extra}s`).toBeLessThanOrEqual(holding.cap)
        expect(holding.amount).toBeGreaterThanOrEqual(0)
      }
    }
  })

  /**
   * **Aucune ressource n'est créée à partir de rien** (I-4), et le remboursement
   * écrêté ne fait pas exception : la quantité finale d'une planète saturée reste
   * son plafond, jamais au-delà, et le bâtiment a bien disparu.
   */
  it('démolir sur une planète saturée ne crée rien et retire le bâtiment', () => {
    const snapshot = planetAt({
      camelote: CAP.camelote,
      'bave-etoiles': CAP['bave-etoiles'],
    })
    const decision = decideDemolish(projectPlanet(snapshot, CATALOGS, T0), command(), CATALOGS)
    if (decision.outcome !== 'accepted') throw new Error('refus inattendu')

    const after = projectPlanet(
      applyEffects(snapshot, decision.effects, T0),
      CATALOGS,
      instant(T0 + DEMOLITION),
    )

    expect(after.holdings.camelote.amount).toBe(CAP.camelote)
    expect(after.holdings['bave-etoiles'].amount).toBe(CAP['bave-etoiles'])
    expect(after.buildings).toHaveLength(0)
  })
})
