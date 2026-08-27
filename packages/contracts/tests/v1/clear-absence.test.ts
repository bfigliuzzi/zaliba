import { describe, expect, it } from 'vitest'
import { WORK_INTENT_NATURES_V1, WorkIntentV1, WorkTargetV1 } from '../../src/v1/planet.js'

/**
 * **FR-044 rendu inviolable par le contrat lui-même.**
 *
 * « Le résultat d'un déblaiement est déterminé par le type d'obstacle, et jamais
 * tiré au sort » pourrait s'écrire comme une vérification côté serveur. Ce serait
 * plus faible, et pour une raison précise : une vérification vit dans un chemin de
 * code, et un second chemin la contourne un jour. Ici l'intention de déblaiement
 * **n'a pas de champ** pour porter un résultat. Il n'y a donc rien à valider, et
 * rien à oublier de valider — personne ne peut réclamer un geyser sous un éboulis.
 *
 * Ce test est d'une nature particulière : il ne décrit pas un comportement, il
 * **prouve une absence**. C'est ce qui le rend nécessaire — une absence ne se voit
 * pas en relisant le schéma, seulement en essayant d'y écrire.
 */

/** L'intention de déblaiement, bien formée : une case, et rien d'autre. */
const WELL_FORMED = { nature: 'clear', x: 3, y: 2 } as const

/**
 * Ce que le serveur dérive, et que le client n'a donc aucun moyen d'annoncer.
 *
 * `reveals` et `depositOf` sont les deux qui comptent ici : ils sont le sujet de
 * la tranche. Les autres valent pour toute mécanique de chantier (FR-055, FR-056).
 */
const DERIVED_FIELDS = [
  ['reveals', 'deposit'],
  ['depositOf', 'jus'],
  ['obstacleId', 'poche-scellee'],
  ['cost', { camelote: 1 }],
  ['duration', 1],
  ['dueAt', 1_787_750_000],
  ['result', 'bare-ground'],
] as const

/** Ce qui décrirait un bâtiment. Un déblaiement n'en pose aucun. */
const BUILDING_FIELDS = [
  ['typeId', 'mine'],
  ['variantId', 'square-4'],
  ['orientation', 1],
  ['buildingId', '88888888-8888-4888-8888-888888888888'],
  ['level', 2],
] as const

/** Aucun horodatage fourni par le client (FR-057). */
const CLOCK_FIELDS = [
  ['clientNow', 1_787_750_000],
  ['startedAt', 1_787_750_000],
] as const

describe('l’intention de déblaiement ne porte qu’une case', () => {
  it('la nature `clear` est honorée par le contrat', () => {
    expect(WORK_INTENT_NATURES_V1).toContain('clear')
  })

  it('accepte une charge bien formée', () => {
    expect(WorkIntentV1.safeParse(WELL_FORMED).success).toBe(true)
  })

  it('exige les deux coordonnées', () => {
    expect(WorkIntentV1.safeParse({ nature: 'clear', x: 3 }).success).toBe(false)
    expect(WorkIntentV1.safeParse({ nature: 'clear', y: 2 }).success).toBe(false)
  })

  /**
   * La borne est celle du **protocole**, pas du contenu : plus large que la
   * grille 6×6 de 001, pour qu'un archétype futur plus grand n'impose pas une
   * version de contrat nouvelle. Une valeur absurde, elle, ne doit pas atteindre
   * le domaine.
   */
  it('borne les coordonnées et refuse le non-entier', () => {
    expect(WorkIntentV1.safeParse({ nature: 'clear', x: -1, y: 2 }).success).toBe(false)
    expect(WorkIntentV1.safeParse({ nature: 'clear', x: 16, y: 2 }).success).toBe(false)
    expect(WorkIntentV1.safeParse({ nature: 'clear', x: 1.5, y: 2 }).success).toBe(false)
  })
})

describe('le résultat n’a aucun endroit où se glisser (FR-044, FR-055)', () => {
  it.each(DERIVED_FIELDS)('rejette une charge portant « %s »', (field, value) => {
    expect(
      WorkIntentV1.safeParse({ ...WELL_FORMED, [field]: value }).success,
      `le champ ${field} est accepté`,
    ).toBe(false)
  })

  it.each(BUILDING_FIELDS)('rejette une charge portant « %s »', (field, value) => {
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

describe('la cible d’un chantier de déblaiement est soumise à la même règle', () => {
  it('accepte une cible bien formée', () => {
    expect(WorkTargetV1.safeParse({ nature: 'clear', x: 3, y: 2 }).success).toBe(true)
  })

  it('refuse une cible de déblaiement qui porterait un bâtiment', () => {
    expect(
      WorkTargetV1.safeParse({
        nature: 'clear',
        x: 3,
        y: 2,
        buildingId: '88888888-8888-4888-8888-888888888888',
      }).success,
    ).toBe(false)
  })

  /**
   * Le corollaire qui compte : un client ne peut pas lire un **résultat** sur un
   * chantier de déblaiement en cours. Il le recalcule depuis le catalogue qu'il
   * détient, ce qui rend une divergence de version visible au lieu de la rendre
   * invisible (R15).
   */
  it('refuse une cible de déblaiement qui annoncerait son résultat', () => {
    expect(
      WorkTargetV1.safeParse({ nature: 'clear', x: 3, y: 2, reveals: 'deposit' }).success,
    ).toBe(false)
  })
})
