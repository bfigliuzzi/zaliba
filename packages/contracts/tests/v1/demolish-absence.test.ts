import { describe, expect, it } from 'vitest'
import { WORK_INTENT_NATURES_V1, WorkIntentV1, WorkTargetV1 } from '../../src/v1/planet.js'

/**
 * **FR-046 et FR-049 rendus inviolables par le contrat lui-même.**
 *
 * Le remboursement et le montant écrêté sont **dérivés** — de la courbe de coût du
 * catalogue, du niveau atteint et de la place disponible à l'échéance (R9). Ils
 * pourraient s'écrire comme des champs que le serveur vérifierait. Ce serait plus
 * faible, et pour une raison précise : une vérification vit dans un chemin de code,
 * et un second chemin la contourne un jour. Ici l'intention de démolition **n'a pas
 * de champ** pour porter un montant. Il n'y a donc rien à valider, et rien à
 * oublier de valider — personne ne peut réclamer un remboursement.
 *
 * Ce test est d'une nature particulière : il ne décrit pas un comportement, il
 * **prouve une absence**. C'est ce qui le rend nécessaire — une absence ne se voit
 * pas en relisant le schéma, seulement en essayant d'y écrire.
 */

const BUILDING_ID = '88888888-8888-4888-8888-888888888888'

/** L'intention de démolition, bien formée : une cible, et rien d'autre. */
const WELL_FORMED = { nature: 'demolish', buildingId: BUILDING_ID } as const

/**
 * Ce que le serveur dérive, et que le client n'a donc aucun moyen d'annoncer.
 *
 * `refund` et `clippedAmount` sont les deux qui comptent ici : ils sont le sujet de
 * la tranche. Un client qui pourrait les proposer pourrait se rembourser lui-même.
 */
const DERIVED_FIELDS = [
  ['refund', { camelote: 999_999 }],
  ['clippedAmount', { camelote: 0 }],
  ['duration', 1],
  ['dueAt', 1_787_750_000],
  ['level', 3],
  ['cumulativeCost', 999_999],
  ['fraction', { num: 1, den: 1 }],
  ['cellsFreed', [{ x: 0, y: 4 }]],
] as const

/** Ce qui décrirait une géométrie. Une démolition n'en désigne aucune. */
const GEOMETRY_FIELDS = [
  ['variantId', 'square-4'],
  ['orientation', 1],
  ['anchorX', 0],
  ['anchorY', 4],
  ['x', 0],
  ['y', 4],
] as const

/** Aucun horodatage fourni par le client (FR-057). */
const CLOCK_FIELDS = [
  ['clientNow', 1_787_750_000],
  ['startedAt', 1_787_750_000],
] as const

describe('l’intention de démolition ne porte qu’une cible', () => {
  it('la nature `demolish` est honorée par le contrat', () => {
    expect(WORK_INTENT_NATURES_V1).toContain('demolish')
  })

  it('accepte une charge bien formée', () => {
    expect(WorkIntentV1.safeParse(WELL_FORMED).success).toBe(true)
  })

  it('exige un identifiant de bâtiment, et un UUID', () => {
    expect(WorkIntentV1.safeParse({ nature: 'demolish' }).success).toBe(false)
    expect(WorkIntentV1.safeParse({ nature: 'demolish', buildingId: 'la-mine' }).success).toBe(
      false,
    )
  })

  /**
   * **Les quatre natures sont maintenant déclarées, et l'union est complète.**
   *
   * C'est le moment où la règle « une nature n'entre dans cette liste que quand une
   * route sait l'exécuter » cesse d'avoir un effet visible — et c'est précisément
   * pourquoi il faut le constater : la liste ne doit plus jamais rétrécir, une
   * entrée resserrée n'étant pas une modification compatible (README § 2).
   */
  it('les quatre natures de chantier sont déclarées', () => {
    expect([...WORK_INTENT_NATURES_V1].toSorted()).toEqual([
      'build',
      'clear',
      'demolish',
      'upgrade',
    ])
  })
})

describe('aucun montant n’a d’endroit où se glisser (FR-046, FR-049, FR-055)', () => {
  it.each(DERIVED_FIELDS)('rejette une charge portant « %s »', (field, value) => {
    expect(
      WorkIntentV1.safeParse({ ...WELL_FORMED, [field]: value }).success,
      `le champ ${field} est accepté`,
    ).toBe(false)
  })

  it.each(GEOMETRY_FIELDS)('rejette une charge portant « %s »', (field, value) => {
    expect(
      WorkIntentV1.safeParse({ ...WELL_FORMED, [field]: value }).success,
      `le champ ${field} est accepté`,
    ).toBe(false)
  })

  it.each(CLOCK_FIELDS)('rejette une charge portant « %s » (FR-057)', (field, value) => {
    expect(
      WorkIntentV1.safeParse({ ...WELL_FORMED, [field]: value }).success,
      `le champ ${field} est accepté`,
    ).toBe(false)
  })
})

describe('la cible d’un chantier de démolition est soumise à la même règle', () => {
  it('accepte une cible bien formée', () => {
    expect(WorkTargetV1.safeParse({ nature: 'demolish', buildingId: BUILDING_ID }).success).toBe(
      true,
    )
  })

  it('refuse une cible de démolition qui porterait une géométrie', () => {
    expect(
      WorkTargetV1.safeParse({ nature: 'demolish', buildingId: BUILDING_ID, x: 0, y: 4 }).success,
    ).toBe(false)
  })

  /**
   * Le corollaire qui compte : un client ne peut pas lire un **remboursement** sur
   * un chantier de démolition en cours. Il le recalcule depuis le catalogue qu'il
   * détient, ce qui rend une divergence de version visible au lieu de la rendre
   * invisible (R15).
   */
  it('refuse une cible de démolition qui annoncerait son remboursement', () => {
    expect(
      WorkTargetV1.safeParse({
        nature: 'demolish',
        buildingId: BUILDING_ID,
        refund: { camelote: 1 },
      }).success,
    ).toBe(false)
  })
})
