import { BERCEAU, BUILDINGS } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { projectPlanet } from '../../../src/game.js'
import { DEFAULT_CATALOGS } from '../../../src/kernel/catalogs.js'
import { evaluateCurve } from '../../../src/kernel/curves.js'
import { grains } from '../../../src/kernel/resources.js'
import { applyEffects, emptySnapshot, type PlanetSnapshot } from '../../../src/kernel/snapshot.js'
import { instant } from '../../../src/kernel/time.js'
import { type BuildCommand, decideBuild } from '../../../src/modules/construction/build.js'
import { previewBuild } from '../../../src/modules/construction/preview.js'

/**
 * **L'effet d'un entrepôt, annoncé avant la pose** (US7-1, FR-050, FR-051).
 *
 * C'est la promesse d'US7 vue de l'aperçu : le plafond augmente **exactement** du
 * montant annoncé, et le temps avant saturation s'allonge d'exactement autant que le
 * calcul le dit. Rien ne doit être découvert après paiement.
 *
 * **Ce que l'entrepôt a de particulier parmi les cinq types.** Les quatre autres
 * s'annoncent par leur production ou par leur consommation ; celui-ci n'annonce rien
 * de tel — il ne produit pas, et sa seule vertu est un plafond. Un aperçu qui
 * n'aurait su parler que de production aurait présenté l'entrepôt comme un bâtiment
 * inutile qui consomme de l'énergie, ce qui est vrai et trompeur à la fois.
 *
 * **La prédiction est exacte, et pour une raison structurelle** : entre le lancement
 * d'un chantier et son échéance, aucune autre transition ne peut survenir (FR-033,
 * R3, R4). L'état à l'échéance est donc calculable dès le lancement, plafond compris.
 */

const T0 = instant(1_787_750_000)
const CATALOGS = DEFAULT_CATALOGS
const RESOURCES = CATALOGS.resourceIds
const WORK_ID = '99999999-9999-4999-8999-999999999999'

/** (5,5) est libre dans la disposition du Berceau, et l'entrepôt tient sur une case. */
const AT = { x: 5, y: 5 }

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

function command(overrides: Partial<BuildCommand> = {}): BuildCommand {
  return {
    kind: 'build',
    workId: WORK_ID,
    typeId: 'entrepot',
    variantId: 'single',
    orientation: 0,
    anchor: AT,
    ...overrides,
  }
}

/** La capacité du niveau 1, **recalculée depuis la courbe** du catalogue. */
function capacityAtLevelOne(): number {
  const curve = BUILDINGS.entrepot.capacity
  if (curve === null) throw new Error('l’entrepôt n’a pas de courbe de capacité')
  return evaluateCurve(curve, 1)
}

const previewOf = (snapshot: PlanetSnapshot) =>
  previewBuild(projectPlanet(snapshot, CATALOGS, T0), command(), CATALOGS)

describe('l’aperçu annonce l’effet sur les trois plafonds (US7-1)', () => {
  it('publie la capacité ajoutée, par ressource', () => {
    const preview = previewOf(fresh())
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    const added = Object.fromEntries(
      preview.preview.effect.capacityAdded.map((one) => [one.resourceId, one.grains]),
    )

    for (const resourceId of RESOURCES) {
      expect(added[resourceId], resourceId).toBe(capacityAtLevelOne())
    }
  })

  it('publie le plafond **résultant**, et non seulement l’ajout', () => {
    const preview = previewOf(fresh())
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    const after = Object.fromEntries(
      preview.preview.effect.capAfter.map((one) => [one.resourceId, one.grains]),
    )

    for (const resourceId of RESOURCES) {
      // Les deux, et pas seulement l'ajout : un joueur qui ne verrait que « +2 000 »
      // devrait connaître son plafond de tête pour savoir ce qu'il achète.
      expect(after[resourceId], resourceId).toBe(
        BERCEAU.baseCapacityGrains[resourceId] + capacityAtLevelOne(),
      )
    }
  })

  /**
   * **Un bâtiment qui ne stocke rien n'annonce aucune capacité**, et la liste est
   * vide plutôt que remplie de zéros. Une ligne « +0 Camelote » sur l'aperçu d'une
   * mine ferait chercher au joueur un effet qui n'existe pas.
   */
  it('les autres types n’annoncent aucune capacité', () => {
    for (const typeId of ['mine', 'centrale', 'racloir', 'puits'] as const) {
      const variantId = BUILDINGS[typeId].variants[0]
      if (variantId === undefined) throw new Error(`${typeId} n’a aucune variante`)

      const preview = previewBuild(
        projectPlanet(fresh(), CATALOGS, T0),
        command({ typeId, variantId, anchor: { x: 3, y: 4 } }),
        CATALOGS,
      )
      if (preview.outcome !== 'accepted') continue

      expect(preview.preview.effect.capacityAdded, typeId).toEqual([])
      expect(preview.preview.effect.capAfter, typeId).toEqual([])
    }
  })
})

describe('l’aperçu annonce l’allongement du temps avant saturation (US7-2)', () => {
  /**
   * **Le temps gagné, en secondes** — pas seulement le nouveau plafond.
   *
   * C'est la grandeur qui décide : « votre Camelote saturera dans quatre jours au
   * lieu de deux » est une raison de payer, « votre plafond passera de 5 000 à
   * 7 000 » demande au joueur de faire lui-même la division.
   */
  it('publie les secondes gagnées, par ressource', () => {
    const preview = previewOf(fresh())
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    const state = projectPlanet(fresh(), CATALOGS, T0)
    const gained = Object.fromEntries(
      preview.preview.effect.saturationDelayed.map((one) => [one.resourceId, one.seconds]),
    )

    for (const resourceId of RESOURCES) {
      const rate = state.holdings[resourceId].rate
      // `capacité ajoutée ÷ taux`, arrondi vers le haut comme l'instant de
      // saturation lui-même : elle survient à la seconde où elle est atteinte.
      expect(gained[resourceId], resourceId).toBe(Math.ceil(capacityAtLevelOne() / rate))
    }
  })

  /**
   * Une ressource qui ne progresse pas ne gagne **aucun** temps, et l'entrée est
   * absente plutôt que nulle ou infinie. Le cas est réel : une planète en déficit
   * total, ou une ressource dont rien ne remplit le stock.
   */
  it('une ressource à taux nul n’apparaît pas dans le délai gagné', () => {
    // Un catalogue synthétique dont la production de base est nulle : c'est ce que
    // permet le catalogue **en argument** — éprouver une règle contre le monde dont
    // elle a besoin, sans toucher au contenu du jeu.
    const still = {
      ...CATALOGS,
      layouts: {
        'berceau-v1': {
          ...BERCEAU,
          baseProductionPerHour: { camelote: 20, jus: 0, 'bave-etoiles': 5 },
        },
      },
    }

    const preview = previewBuild(projectPlanet(fresh(), still, T0), command(), still)
    if (preview.outcome !== 'accepted') throw new Error('refus inattendu')

    const gained = preview.preview.effect.saturationDelayed.map((one) => one.resourceId)
    expect(gained).not.toContain('jus')
    expect(gained).toContain('camelote')
  })
})

describe('ce que l’aperçu annonce est ce que la pose produit (R8, FR-051)', () => {
  /**
   * L'énoncé qui ferme la tranche : le plafond annoncé **est** celui que le joueur
   * lira après achèvement. Le parcours complet, par la projection — un raccourci
   * recopierait la segmentation et la mettrait hors de portée du test.
   */
  it('le plafond après achèvement vaut celui annoncé, au grain près', () => {
    const snapshot = fresh()
    const preview = previewOf(snapshot)
    const decision = decideBuild(projectPlanet(snapshot, CATALOGS, T0), command(), CATALOGS)
    if (preview.outcome !== 'accepted' || decision.outcome !== 'accepted') {
      throw new Error('l’aperçu et la décision devaient concorder')
    }

    const launched = applyEffects(snapshot, decision.effects, T0)
    const after = projectPlanet(launched, CATALOGS, instant(preview.preview.dueAt))

    const announced = Object.fromEntries(
      preview.preview.effect.capAfter.map((one) => [one.resourceId, one.grains]),
    )
    for (const resourceId of RESOURCES) {
      expect(after.holdings[resourceId].cap, resourceId).toBe(announced[resourceId])
    }
  })

  /**
   * **Et le délai gagné est constaté**, pas seulement annoncé : sur une planète dont
   * une ressource est proche de son plafond, la saturation recule d'exactement les
   * secondes publiées.
   */
  it('la saturation recule des secondes annoncées', () => {
    const snapshot: PlanetSnapshot = {
      ...fresh(),
      holdings: {
        camelote: {
          amount: grains(BERCEAU.baseCapacityGrains.camelote - 720_000),
          lost: grains(0),
          saturatedSince: null,
        },
        jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
        // De quoi payer l'entrepôt : l'aperçu informe d'un manque, la décision le
        // refuse (FR-035), et c'est la décision qu'on éprouve ici.
        'bave-etoiles': {
          amount: grains(BERCEAU.startingStockGrains['bave-etoiles']),
          lost: grains(0),
          saturatedSince: null,
        },
      },
    }

    const preview = previewOf(snapshot)
    const decision = decideBuild(projectPlanet(snapshot, CATALOGS, T0), command(), CATALOGS)
    if (preview.outcome !== 'accepted' || decision.outcome !== 'accepted') {
      throw new Error('l’aperçu et la décision devaient concorder')
    }

    const gained = preview.preview.effect.saturationDelayed.find(
      (one) => one.resourceId === 'camelote',
    )?.seconds
    if (gained === undefined) throw new Error('la Camelote devait gagner du temps')
    expect(gained).toBeGreaterThan(0)

    const before = projectPlanet(snapshot, CATALOGS, T0).holdings.camelote.saturationAt
    const after = projectPlanet(
      applyEffects(snapshot, decision.effects, T0),
      CATALOGS,
      instant(preview.preview.dueAt),
    ).holdings.camelote.saturationAt

    if (before === null || after === null) throw new Error('les deux devaient saturer')

    /**
     * **L'entrepôt repousse la saturation deux fois, et le test le dit.**
     *
     * Le délai annoncé — `capacité ÷ taux` — n'est que la première moitié. La
     * seconde est le **coût débité au lancement** (FR-036) : dépenser deux cent
     * quatre-vingt-huit mille grains de Camelote vide d'autant le stock, ce qui
     * recule la saturation de `coût ÷ taux` de plus.
     *
     * Le premier essai de ce test attendait le seul délai annoncé et échouait de
     * quatorze mille quatre cents secondes — exactement le coût divisé par le taux.
     * L'écart n'était pas un défaut : c'était une moitié du calcul qu'on avait
     * oubliée. L'aperçu ne l'annonce pas au titre de la saturation, et c'est juste —
     * `saturationDelayed` répond à « qu'est-ce que ce plafond m'achète », pas à
     * « qu'est-ce que cette dépense me laisse ». Le coût, lui, est annoncé à sa
     * place, dans les termes.
     */
    const debited = preview.preview.cost.find((one) => one.resourceId === 'camelote')?.grains ?? 0
    const rate = projectPlanet(snapshot, CATALOGS, T0).holdings.camelote.rate

    expect(after - before).toBe(gained + debited / rate)
  })
})
