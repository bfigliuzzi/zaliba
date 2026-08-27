import { describe, expect, it } from 'vitest'
import { WorkIntentV1, WorkTargetV1 } from '../../src/v1/planet.js'

/**
 * **FR-039 rendu inviolable par le contrat lui-même.**
 *
 * « Une amélioration ne change ni la variante d'empreinte, ni l'orientation, ni
 * les cases occupées » pourrait s'écrire comme une vérification dans le module de
 * construction. Ce serait plus faible, et pour une raison précise : une
 * vérification vit dans un chemin de code, et un second chemin la contourne un
 * jour — une route nouvelle, une commande par lot, un import de sauvegarde. Ici
 * l'intention d'amélioration **n'a pas de champ** pour porter une géométrie. Il
 * n'y a donc rien à valider, et rien à oublier de valider.
 *
 * Ce test est d'une nature particulière : il ne décrit pas un comportement, il
 * **prouve une absence**. C'est ce qui le rend nécessaire — une absence ne se voit
 * pas en relisant le schéma, seulement en essayant d'y écrire.
 *
 * Le corollaire vaut d'être dit : ce fichier doit passer **sans que le contrat
 * change**, une fois la nature `upgrade` déclarée. Si l'ajout d'un champ était
 * nécessaire pour le faire passer, c'est que la garantie était ailleurs.
 */

const BUILDING_ID = '88888888-8888-4888-8888-888888888888'

/** L'intention d'amélioration, bien formée : une cible, et rien d'autre. */
const WELL_FORMED = { nature: 'upgrade', buildingId: BUILDING_ID } as const

/**
 * Tout ce qui décrirait une géométrie. Aucun de ces champs n'a d'endroit où se
 * glisser, et c'est exactement la forme mécanique de FR-039.
 */
const GEOMETRY_FIELDS = [
  ['variantId', 'square-4'],
  ['orientation', 1],
  ['anchorX', 0],
  ['anchorY', 4],
  ['x', 0],
  ['y', 4],
  ['cells', [{ x: 0, y: 4 }]],
  ['footprint', 'l-4'],
] as const

/** Ce que le serveur dérive, et que le client n'a donc aucun moyen d'annoncer. */
const DERIVED_FIELDS = [
  ['level', 2],
  ['cost', { camelote: 1 }],
  ['duration', 1],
  ['dueAt', 1_787_750_000],
  ['production', 999],
  ['rateAfter', 999],
  ['delta', 999],
  ['typeId', 'mine'],
] as const

describe('l’intention d’amélioration ne porte qu’une cible', () => {
  it('accepte une charge bien formée', () => {
    expect(WorkIntentV1.safeParse(WELL_FORMED).success).toBe(true)
  })

  it('exige un identifiant de bâtiment, et un UUID', () => {
    expect(WorkIntentV1.safeParse({ nature: 'upgrade' }).success).toBe(false)
    expect(WorkIntentV1.safeParse({ nature: 'upgrade', buildingId: 'la-mine' }).success).toBe(false)
  })
})

describe('aucune géométrie n’a d’endroit où se glisser (FR-039)', () => {
  it.each(GEOMETRY_FIELDS)('rejette une charge portant « %s »', (field, value) => {
    expect(
      WorkIntentV1.safeParse({ ...WELL_FORMED, [field]: value }).success,
      `le champ ${field} est accepté`,
    ).toBe(false)
  })

  /**
   * La cible d'un chantier **déjà planifié** est soumise à la même règle.
   *
   * L'instantané expose `WorkTargetV1`, et sa variante `upgrade` ne porte pas
   * davantage de géométrie. C'est ce qui empêche un client de lire une empreinte
   * sur un chantier d'amélioration — donc d'en afficher une qui n'existe pas.
   */
  it.each(GEOMETRY_FIELDS)('la cible planifiée rejette aussi « %s »', (field, value) => {
    expect(
      WorkTargetV1.safeParse({ nature: 'upgrade', buildingId: BUILDING_ID, [field]: value })
        .success,
      `la cible accepte le champ ${field}`,
    ).toBe(false)
  })
})

describe('aucun champ dérivable n’a d’endroit où se glisser (FR-055, FR-056)', () => {
  it.each(DERIVED_FIELDS)('rejette une charge portant « %s »', (field, value) => {
    expect(
      WorkIntentV1.safeParse({ ...WELL_FORMED, [field]: value }).success,
      `le champ ${field} est accepté`,
    ).toBe(false)
  })

  /**
   * FR-057 mérite son cas à lui : **aucune horloge fournie par le joueur** ne
   * sert de référence. Antidater une amélioration serait l'exploit le plus
   * rentable d'un jeu dont le sujet est le temps.
   */
  it('rejette tout horodatage, quel que soit son nom', () => {
    for (const field of ['now', 'at', 'clientNow', 'startedAt', 'when', 'consolidatedAt']) {
      expect(
        WorkIntentV1.safeParse({ ...WELL_FORMED, [field]: 1_787_750_000 }).success,
        `le champ ${field} est accepté`,
      ).toBe(false)
    }
  })

  it('rejette une clé inconnue, même vide', () => {
    expect(WorkIntentV1.safeParse({ ...WELL_FORMED, extra: undefined }).success).toBe(false)
  })
})
