import { describe, expect, it } from 'vitest'
import { categoryOfStatus, ErrorBodyV1, HTTP_STATUS_BY_CATEGORY } from '../src/v1/errors.js'

/**
 * Le modèle d'erreur commun (contracts/README § 7).
 *
 * **Une seule forme de corps**, pour toutes les routes et toutes les versions :
 * `{ code, message, details?, requestId }`. La contrainte a l'air modeste ; elle
 * ne l'est pas. Un client natif ancien, non forçable, circule sur les magasins
 * d'applications : s'il rencontre une forme d'erreur qu'il ne sait pas lire, il
 * affiche un écran blanc au lieu d'un refus explicable.
 *
 * Et la distinction qui gouverne tout le reste : **le 409 est la porte de
 * toutes les règles de jeu**. Un refus n'est pas une erreur technique, c'est une
 * réponse du jeu. Le confondre avec un 400 reviendrait à dire au joueur « votre
 * requête est malformée » quand la vérité est « vous n'avez pas assez de
 * Camelote ».
 */

describe('la forme unique du corps d’erreur', () => {
  const valid = {
    code: 'work-in-progress',
    message: 'Un chantier est déjà en cours sur cette planète.',
    requestId: '4f1c8a2e-0000-4000-8000-000000000000',
  }

  it('accepte code, message et requestId', () => {
    expect(ErrorBodyV1.parse(valid)).toEqual(valid)
  })

  it('accepte un details facultatif', () => {
    const withDetails = { ...valid, details: { workId: 'w-1', dueAt: 1_787_738_400 } }
    expect(ErrorBodyV1.parse(withDetails)).toEqual(withDetails)
  })

  it.each(['code', 'message', 'requestId'])('refuse un corps sans %s', (field) => {
    const incomplete: Record<string, unknown> = { ...valid }
    delete incomplete[field]
    expect(() => ErrorBodyV1.parse(incomplete)).toThrow()
  })

  /**
   * Le schéma est **fermé**. Une clé inconnue n'est pas ignorée, elle est
   * refusée. Sans cela, un champ ajouté par erreur passerait en production et
   * deviendrait une dépendance de fait pour un client — donc impossible à
   * retirer.
   */
  it('refuse une clé inconnue', () => {
    expect(() => ErrorBodyV1.parse({ ...valid, stack: 'at foo (bar.ts:1)' })).toThrow()
  })

  it('refuse un requestId qui ne serait pas une chaîne', () => {
    expect(() => ErrorBodyV1.parse({ ...valid, requestId: 42 })).toThrow()
  })

  /**
   * Le `requestId` est la corrélation entre la réponse et le journal. Un corps
   * d'erreur sans lui rend une enquête impossible : le joueur signale « ça n'a
   * pas marché », et rien ne relie son récit à une ligne de journal.
   */
  it('exige un requestId non vide', () => {
    expect(() => ErrorBodyV1.parse({ ...valid, requestId: '' })).toThrow()
  })
})

describe('la table des statuts (README § 7)', () => {
  it.each([
    ['schema-violation', 400],
    ['authentication', 401],
    ['authorization', 403],
    ['not-found', 404],
    ['game-rule-refusal', 409],
    ['server-fault', 500],
  ] as const)('%s se rend en %i', (category, status) => {
    expect(HTTP_STATUS_BY_CATEGORY[category]).toBe(status)
  })

  it('couvre exactement six catégories', () => {
    expect(Object.keys(HTTP_STATUS_BY_CATEGORY)).toHaveLength(6)
  })

  it('associe chaque statut à sa catégorie, dans les deux sens', () => {
    for (const [category, status] of Object.entries(HTTP_STATUS_BY_CATEGORY)) {
      expect(categoryOfStatus(status)).toBe(category)
    }
  })
})

describe('le 409 est la porte de toutes les règles de jeu', () => {
  /**
   * Ce test énonce une frontière qu'il est tentant de franchir. « Ressources
   * insuffisantes » ressemble à une erreur de saisie, et un 400 serait
   * défendable. Mais un 400 dit « votre requête est malformée », ce qui est
   * faux : la requête était parfaitement formée, c'est le **jeu** qui refuse.
   *
   * La conséquence pratique compte : un client qui traite les 400 comme des
   * bogues et les 409 comme des refus affichables se trompe d'écran dès que la
   * frontière bouge.
   */
  it('range un refus de règle de jeu en 409, jamais en 400', () => {
    expect(HTTP_STATUS_BY_CATEGORY['game-rule-refusal']).toBe(409)
    expect(HTTP_STATUS_BY_CATEGORY['game-rule-refusal']).not.toBe(400)
  })

  it('range une violation de schéma en 400, avant toute règle de jeu', () => {
    expect(HTTP_STATUS_BY_CATEGORY['schema-violation']).toBe(400)
  })

  it('distingue l’authentification de l’autorisation', () => {
    expect(HTTP_STATUS_BY_CATEGORY['authentication']).toBe(401)
    expect(HTTP_STATUS_BY_CATEGORY['authorization']).toBe(403)
    expect(HTTP_STATUS_BY_CATEGORY['authentication']).not.toBe(
      HTTP_STATUS_BY_CATEGORY['authorization'],
    )
  })

  it('rend un statut inconnu explicitement inconnu, plutôt que de deviner', () => {
    expect(categoryOfStatus(418)).toBeNull()
  })
})
