import { describe, expect, it } from 'vitest'
import { buildServer } from '../src/server.js'

/**
 * Le partage de ressources entre origines.
 *
 * CORS n'est pas une protection du serveur — un client non navigateur l'ignore.
 * C'est une protection du **joueur** : sans lui, une page quelconque ouverte
 * dans un autre onglet pourrait faire émettre au navigateur des commandes
 * portant la session en cours. D'où deux exigences qui se lisent dans ces cas :
 * une liste d'origines close, et pas de jeton implicite.
 *
 * Et une exigence moins évidente : les en-têtes de réponse qu'un navigateur
 * laisse lire au script sont **ceux qu'on expose**, aucun autre. Un
 * `x-request-id` non exposé est un identifiant de corrélation que le client ne
 * peut pas afficher au joueur, donc une enquête qui commence par « avez-vous un
 * numéro ? » sans que personne n'ait pu en donner un.
 */

const ORIGIN = 'https://jeu.zaliba.test'

function serverUnderTest() {
  const app = buildServer({ logLevel: 'silent', corsOrigins: [ORIGIN] })
  app.get('/probe/ok', async () => ({ ok: true }))
  app.post('/probe/commande', async () => ({ ok: true }))
  return app
}

describe('la liste des origines est close', () => {
  it('autorise l’origine du client', async () => {
    const response = await serverUnderTest().inject({
      method: 'OPTIONS',
      url: '/probe/commande',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,idempotency-key,content-type',
      },
    })

    expect(response.statusCode).toBeLessThan(300)
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN)
  })

  it('n’autorise pas une origine étrangère', async () => {
    const response = await serverUnderTest().inject({
      method: 'OPTIONS',
      url: '/probe/commande',
      headers: {
        origin: 'https://site-malveillant.test',
        'access-control-request-method': 'POST',
      },
    })

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  /**
   * `*` est tentant et faux : il n'autorise de toute façon pas les requêtes
   * porteuses d'identifiants, et il masque la question de savoir qui appelle.
   */
  it('ne répond jamais par un joker', async () => {
    const response = await serverUnderTest().inject({
      method: 'GET',
      url: '/probe/ok',
      headers: { origin: ORIGIN },
    })

    expect(response.headers['access-control-allow-origin']).not.toBe('*')
  })
})

describe('les en-têtes de la commande passent', () => {
  async function preflight() {
    return serverUnderTest().inject({
      method: 'OPTIONS',
      url: '/probe/commande',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,idempotency-key,content-type',
      },
    })
  }

  it.each(['authorization', 'idempotency-key', 'content-type'])(
    'accepte l’en-tête %s',
    async (header) => {
      const allowed = (await preflight()).headers['access-control-allow-headers']
      expect(String(allowed).toLowerCase()).toContain(header)
    },
  )

  it('accepte la méthode POST', async () => {
    const allowed = (await preflight()).headers['access-control-allow-methods']
    expect(String(allowed)).toContain('POST')
  })
})

describe('les en-têtes de réponse utiles sont lisibles par le client', () => {
  it.each(['x-request-id', 'idempotency-replayed'])('expose %s', async (header) => {
    const response = await serverUnderTest().inject({
      method: 'GET',
      url: '/probe/ok',
      headers: { origin: ORIGIN },
    })

    const exposed = response.headers['access-control-expose-headers']
    expect(String(exposed).toLowerCase()).toContain(header)
  })
})
