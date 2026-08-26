import { ErrorBodyV1, HTTP_STATUS_BY_CATEGORY } from '@zaliba/contracts'
import { describe, expect, it } from 'vitest'
import { AppError } from '../src/plugins/errors.js'
import { buildServer } from '../src/server.js'

/**
 * Le squelette du serveur autoritaire : la corrélation et le mapping d'erreurs.
 *
 * Ces deux greffons ne rendent aucun service au joueur, et c'est précisément
 * pourquoi ils s'écrivent en premier. Le jour où une commande échoue en
 * production, la seule chose qui relie « ça n'a pas marché » à une ligne de
 * journal est le `requestId` ; et la seule chose qui empêche une trace
 * d'exécution de partir dans le corps d'une réponse est le mapping.
 *
 * Un journal de capture par cas : deux serveurs qui écriraient dans le même
 * tampon rendraient les assertions dépendantes de l'ordre d'exécution.
 */

/** Recueille les lignes de journal pour les relire après coup. */
function captureLog(): { readonly stream: { write(line: string): void }; lines(): unknown[] } {
  const raw: string[] = []
  return {
    stream: {
      write(line: string) {
        raw.push(line)
      },
    },
    lines: () => raw.map((line) => JSON.parse(line) as unknown),
  }
}

/** Un serveur muni des routes minimales que ces cas éprouvent. */
function serverUnderTest(log = captureLog()) {
  const app = buildServer({ logStream: log.stream, logLevel: 'info' })

  app.get('/probe/ok', async () => ({ ok: true }))

  app.get('/probe/refusal', async () => {
    throw new AppError({
      category: 'game-rule-refusal',
      code: 'work-in-progress',
      message: 'Un chantier est déjà en cours sur cette planète.',
      details: { workId: 'w-1' },
    })
  })

  app.get('/probe/boom', async () => {
    throw new Error('connexion refusée par postgres://user:s3cr3t@db.interne:5432')
  })

  return { app, log }
}

describe('le greffon de corrélation', () => {
  it('renvoie un identifiant de requête dans l’en-tête de chaque réponse', async () => {
    const { app } = serverUnderTest()
    const response = await app.inject({ method: 'GET', url: '/probe/ok' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['x-request-id']).toEqual(expect.any(String))
    expect(response.headers['x-request-id']).not.toBe('')
  })

  it('donne un identifiant distinct à deux requêtes', async () => {
    const { app } = serverUnderTest()
    const first = await app.inject({ method: 'GET', url: '/probe/ok' })
    const second = await app.inject({ method: 'GET', url: '/probe/ok' })

    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id'])
  })

  /**
   * L'identifiant est **émis par le serveur**, jamais accepté du client. Le
   * reprendre d'un en-tête entrant offrirait à n'importe qui d'écrire dans le
   * journal la valeur de son choix — y compris celle d'une autre requête, ce
   * qui rendrait toute enquête douteuse au moment où elle compte.
   */
  it('ignore un identifiant proposé par le client', async () => {
    const { app } = serverUnderTest()
    const forged = 'forge-par-le-client'
    const response = await app.inject({
      method: 'GET',
      url: '/probe/ok',
      headers: { 'x-request-id': forged, 'request-id': forged },
    })

    expect(response.headers['x-request-id']).not.toBe(forged)
  })

  it('porte le même identifiant dans la réponse et dans le journal', async () => {
    const { app, log } = serverUnderTest()
    const response = await app.inject({ method: 'GET', url: '/probe/ok' })
    const requestId = response.headers['x-request-id']

    const correlated = log
      .lines()
      .filter(
        (line): line is { reqId: string } => (line as { reqId?: unknown }).reqId !== undefined,
      )

    expect(correlated.length).toBeGreaterThan(0)
    expect(correlated.every((line) => line.reqId === requestId)).toBe(true)
  })
})

describe('le greffon de mapping d’erreurs', () => {
  it('rend un refus de règle de jeu en 409, avec son motif exact', async () => {
    const { app } = serverUnderTest()
    const response = await app.inject({ method: 'GET', url: '/probe/refusal' })

    expect(response.statusCode).toBe(HTTP_STATUS_BY_CATEGORY['game-rule-refusal'])
    expect(response.json()).toMatchObject({
      code: 'work-in-progress',
      message: 'Un chantier est déjà en cours sur cette planète.',
      details: { workId: 'w-1' },
    })
  })

  it('rend une route inconnue en 404, dans la même forme de corps', async () => {
    const { app } = serverUnderTest()
    const response = await app.inject({ method: 'GET', url: '/probe/inexistant' })

    expect(response.statusCode).toBe(HTTP_STATUS_BY_CATEGORY['not-found'])
    expect(response.json()).toMatchObject({ code: 'not-found' })
  })

  /**
   * Ce cas est le seul qui protège d'une fuite. Le message jeté porte ici une
   * chaîne de connexion avec son mot de passe : la réponse ne doit en garder
   * aucune trace, et le `requestId` est ce qui permet malgré tout de retrouver
   * l'incident dans le journal.
   */
  it('rend une exception inattendue en 500, sans rien divulguer', async () => {
    const { app } = serverUnderTest()
    const response = await app.inject({ method: 'GET', url: '/probe/boom' })
    const body = response.json()

    expect(response.statusCode).toBe(HTTP_STATUS_BY_CATEGORY['server-fault'])
    expect(body.code).toBe('server-fault')
    expect(body.details).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('s3cr3t')
    expect(JSON.stringify(body)).not.toContain('postgres://')
  })

  /**
   * Le journal garde l'incident, la réponse n'en garde rien — mais « garder
   * l'incident » ne veut pas dire « garder le mot de passe ». La liste noire de
   * `plugins/logging.ts` s'applique au journal comme au reste : ce qui doit
   * survivre, c'est la substance de l'erreur, pas les identifiants qu'elle cite.
   */
  it('journalise la substance de l’exception, sans ses identifiants', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: '/probe/boom' })

    const journal = JSON.stringify(log.lines())
    expect(journal).toContain('connexion refusée par')
    expect(journal).toContain('défaut serveur non rattrapé')
    expect(journal).not.toContain('s3cr3t')
  })

  it.each([
    ['/probe/refusal', 409],
    ['/probe/inexistant', 404],
    ['/probe/boom', 500],
  ])('corrèle le corps de %s avec son en-tête', async (url, status) => {
    const { app } = serverUnderTest()
    const response = await app.inject({ method: 'GET', url })

    expect(response.statusCode).toBe(status)
    expect(response.json().requestId).toBe(response.headers['x-request-id'])
  })

  /**
   * La forme est validée par le schéma **fermé** des contrats, et non par une
   * liste de clés recopiée ici : une divergence entre l'API et le contrat doit
   * faire échouer ce test, pas passer inaperçue.
   */
  it.each(['/probe/refusal', '/probe/inexistant', '/probe/boom'])(
    'produit pour %s un corps conforme au contrat, sans clé surnuméraire',
    async (url) => {
      const { app } = serverUnderTest()
      const response = await app.inject({ method: 'GET', url })

      expect(() => ErrorBodyV1.parse(response.json())).not.toThrow()
    },
  )
})
