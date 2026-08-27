import { describe, expect, it } from 'vitest'
import { planetContractV1, WORK_INTENT_NATURES_V1, WorkIntentV1 } from '../../src/v1/planet.js'

/**
 * Le **test d'absence** : la forme mécanique de FR-055 à FR-057.
 *
 * Ces trois exigences ne sont pas des validations à écrire, ce sont des champs à
 * ne pas créer. On ne vérifie pas que le coût annoncé par le client est correct :
 * le schéma **n'a pas de champ** pour l'annoncer. Un champ qu'on ne peut pas
 * envoyer est un champ qu'on ne peut pas exploiter, et une vérification qu'on ne
 * peut pas oublier dans six mois.
 *
 * Le test qui suit est donc d'une nature particulière : il ne décrit pas un
 * comportement, il **prouve une absence**. C'est ce qui le rend nécessaire — une
 * absence ne se voit pas en relisant le code, seulement en essayant d'y écrire.
 */

/** Une intention bien formée, par nature déclarée au contrat. */
const WELL_FORMED: Readonly<Record<(typeof WORK_INTENT_NATURES_V1)[number], object>> = {
  build: {
    nature: 'build',
    typeId: 'mine',
    variantId: 'square-4',
    orientation: 0,
    anchorX: 0,
    anchorY: 4,
  },
  /**
   * Une cible, et rien d'autre (FR-039). La table est indexée par le type de
   * l'union : déclarer une nature au contrat sans en donner d'exemple ici fait
   * **échouer la compilation**, ce qui est exactement ce qu'on veut d'une liste
   * qui doit rester complète.
   */
  upgrade: { nature: 'upgrade', buildingId: '88888888-8888-4888-8888-888888888888' },
  /**
   * Une case, et rien d'autre (FR-044). Ni le résultat, ni le type d'obstacle :
   * les deux sont dérivés de la disposition du catalogue moins les cases déjà
   * déblayées, et les laisser proposer ferait du contenu de la planète un champ
   * de formulaire.
   */
  clear: { nature: 'clear', x: 3, y: 2 },
}

/**
 * Tout ce que le serveur dérive, et que le client n'a donc aucun moyen
 * d'annoncer. La liste est celle de `contracts/v1-planet.md` § 4.
 */
const DERIVED_FIELDS = [
  ['cost', { camelote: 1 }],
  ['duration', 1],
  ['dueAt', 1_787_750_000],
  ['production', 999],
  ['refund', 999],
  ['result', 'bare-ground'],
  ['clientNow', 1_787_750_000],
  ['startedAt', 1_787_750_000],
  ['timestamp', 1_787_750_000],
  ['level', 30],
  ['coveredDeposits', 9],
] as const

describe('les natures déclarées sont acceptées', () => {
  it.each(WORK_INTENT_NATURES_V1)('%s, bien formée, passe le schéma', (nature) => {
    const payload = WELL_FORMED[nature]
    expect(payload, `aucune charge d’exemple pour la nature ${nature}`).toBeDefined()
    expect(WorkIntentV1.safeParse(payload).success).toBe(true)
  })

  /**
   * L'union est **fermée**, et elle s'élargit tranche par tranche : `build` en
   * US2, `upgrade` en US4, `clear` en US5, `demolish` en US6. Élargir une entrée
   * est une modification *compatible* (README § 2) — la resserrer ne l'est pas,
   * et c'est pourquoi on ne déclare une nature qu'au moment où le serveur sait
   * l'honorer. Une nature acceptée par le schéma et refusée par le code serait
   * une promesse rompue à l'exécution.
   */
  it('refuse une nature que le contrat ne déclare pas', () => {
    expect(WorkIntentV1.safeParse({ nature: 'terraform', x: 0, y: 0 }).success).toBe(false)
  })

  it('refuse une charge sans nature', () => {
    expect(WorkIntentV1.safeParse({ typeId: 'mine', variantId: 'square-4' }).success).toBe(false)
  })
})

describe('aucun champ dérivable n’a d’endroit où se glisser (FR-055, FR-056)', () => {
  it.each(DERIVED_FIELDS)('rejette une charge portant « %s »', (field, value) => {
    for (const nature of WORK_INTENT_NATURES_V1) {
      const payload = { ...WELL_FORMED[nature], [field]: value }
      expect(WorkIntentV1.safeParse(payload).success, `${nature} accepte le champ ${field}`).toBe(
        false,
      )
    }
  })

  /**
   * FR-057 mérite son cas à lui : **aucune horloge fournie par le joueur** ne
   * sert de référence. Antidater une action serait l'exploit le plus rentable
   * d'un jeu dont le sujet est le temps — et il est hors d'atteinte parce que
   * l'instant est le `now()` de la transaction, et qu'aucune entrée ne porte de
   * date.
   */
  it('rejette tout horodatage, quel que soit son nom', () => {
    for (const field of ['now', 'at', 'clientTime', 'when', 'consolidatedAt']) {
      expect(
        WorkIntentV1.safeParse({ ...WELL_FORMED.build, [field]: 1_787_750_000 }).success,
        `le champ ${field} est accepté`,
      ).toBe(false)
    }
  })

  it('rejette une clé inconnue, même vide', () => {
    expect(WorkIntentV1.safeParse({ ...WELL_FORMED.build, extra: undefined }).success).toBe(false)
  })
})

describe('aucune route ne permet d’annuler ni de remplacer un chantier (FR-037)', () => {
  /**
   * FR-037 est tenu par l'**absence de route**, et non par un refus. C'est plus
   * solide : un refus vit dans un chemin de code qu'un second chemin pourrait
   * contourner, alors qu'une route qui n'existe pas ne s'appelle pas. Le
   * garde-fou contre l'erreur de manipulation est ailleurs — la confirmation
   * explicite exigée avant lancement (FR-035).
   */
  const routes = Object.entries(planetContractV1).map(([name, route]) => ({
    name,
    method: (route as { method: string }).method,
    path: (route as { path: string }).path,
  }))

  it('ne déclare que trois routes', () => {
    expect(routes).toHaveLength(3)
  })

  it('n’emploie ni DELETE, ni PUT, ni PATCH', () => {
    for (const route of routes) {
      expect(['GET', 'POST'], `${route.name} → ${route.method}`).toContain(route.method)
    }
  })

  it('ne nomme aucune route d’annulation ni de remplacement', () => {
    for (const route of routes) {
      expect(route.name).not.toMatch(/cancel|abort|replace|annul/i)
      expect(route.path).not.toMatch(/cancel|abort|replace/i)
    }
  })

  it('ne déclare aucune nature d’annulation', () => {
    for (const nature of WORK_INTENT_NATURES_V1) {
      expect(nature).not.toMatch(/cancel|abort|replace/i)
    }
  })
})
