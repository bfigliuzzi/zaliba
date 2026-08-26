import { describe, expect, it } from 'vitest'
import { REDACTED } from '../src/plugins/logging.js'
import { buildServer } from '../src/server.js'

/**
 * La liste noire de journalisation.
 *
 * Le journal est la seule chose qu'on garde longtemps, qu'on recopie sur un
 * agrégateur tiers et qu'on ouvre en réunion. Un jeton qui y entre est un jeton
 * réutilisable par quiconque lit l'écran ; une adresse de courriel qui y entre
 * est une donnée personnelle qu'on ne sait plus effacer.
 *
 * Ces cas sont écrits **par la négative** : ils n'énoncent pas ce que le
 * journal contient, mais ce qu'il ne peut pas contenir « quelle que soit la
 * requête ». Une liste noire dont on ne teste que les chemins connus ne protège
 * que des fuites qu'on avait déjà imaginées ; les cas d'imbrication profonde et
 * de message libre sont là pour les autres.
 */

/** Un jeton d'apparence réaliste — trois segments, préfixe `eyJ`. */
const TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqb3VldXItMSJ9.c2lnbmF0dXJlLWZhY3RpY2U'
const EMAIL = 'joueuse@exemple.test'
const SERVICE_KEY = 'sb-service-role-cle-tres-secrete-0123456789'

function captureLog(): { readonly stream: { write(line: string): void }; text(): string } {
  const raw: string[] = []
  return {
    stream: {
      write(line: string) {
        raw.push(line)
      },
    },
    text: () => raw.join('\n'),
  }
}

/**
 * Une assertion négative passe à vide si rien n'a été journalisé. Exiger la
 * **marque** d'expurgation en plus de l'absence du secret ferme cette porte :
 * le journal a bien vu la valeur, et l'a bien remplacée.
 */
function expectExpurge(journal: string, secret: string): void {
  expect(journal).not.toContain(secret)
  expect(journal).toContain(REDACTED)
}

function serverUnderTest() {
  const log = captureLog()
  const app = buildServer({ logStream: log.stream, logLevel: 'debug', secrets: [SERVICE_KEY] })

  app.get('/probe/ok', async () => ({ ok: true }))

  /** Une route zélée : elle journalise tout ce qu'elle a sous la main. */
  app.post('/probe/zele', async (request) => {
    request.log.info({ headers: request.headers, body: request.body }, 'requête reçue')
    return { ok: true }
  })

  /** Le secret enfoui à une profondeur qu'aucune liste de chemins n'atteint. */
  app.get('/probe/profond', async (request) => {
    request.log.info(
      { contexte: { appel: { entete: { authorization: `Bearer ${TOKEN}` } } } },
      'appel sortant',
    )
    return { ok: true }
  })

  /** Le secret dans le message libre, là où aucune clé ne le désigne. */
  app.get('/probe/message', async (request) => {
    request.log.warn(`échec d’authentification de ${EMAIL} avec ${TOKEN}`)
    return { ok: true }
  })

  /** Le secret dans une exception — le chemin le plus fréquent en vrai. */
  app.get('/probe/exception', async () => {
    throw new Error(`la clé de service ${SERVICE_KEY} a été refusée pour ${EMAIL}`)
  })

  return { app, log }
}

describe('aucun jeton ne rejoint le journal', () => {
  it('n’écrit pas le jeton porté par l’en-tête Authorization', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({
      method: 'POST',
      url: '/probe/zele',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { rien: 'a-signaler' },
    })

    expectExpurge(log.text(), TOKEN)
  })

  it('n’écrit pas le jeton posé dans un cookie', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({
      method: 'POST',
      url: '/probe/zele',
      headers: { cookie: `sb-access-token=${TOKEN}` },
      payload: {},
    })

    expectExpurge(log.text(), TOKEN)
  })

  it('n’écrit pas le jeton glissé dans la chaîne de requête', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: `/probe/ok?access_token=${TOKEN}` })

    expectExpurge(log.text(), TOKEN)
  })

  /**
   * Une liste de chemins ne connaît que les chemins qu'on lui a donnés. Ce cas
   * exige davantage : que la valeur soit reconnue **où qu'elle se trouve**.
   */
  it('n’écrit pas le jeton enfoui dans un objet imbriqué', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: '/probe/profond' })

    expectExpurge(log.text(), TOKEN)
  })

  it('n’écrit pas le jeton cité dans un message libre', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: '/probe/message' })

    expectExpurge(log.text(), TOKEN)
  })
})

describe('aucune adresse de courriel ne rejoint le journal', () => {
  it('n’écrit pas l’adresse envoyée dans le corps de la requête', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'POST', url: '/probe/zele', payload: { email: EMAIL } })

    expectExpurge(log.text(), EMAIL)
  })

  it('n’écrit pas l’adresse citée dans un message libre', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: '/probe/message' })

    expectExpurge(log.text(), EMAIL)
  })

  it('n’écrit pas l’adresse citée par une exception', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: '/probe/exception' })

    expectExpurge(log.text(), EMAIL)
  })
})

describe('aucune clé de service ne rejoint le journal', () => {
  /**
   * La clé de service n'a aucune forme reconnaissable : c'est une chaîne
   * quelconque. Elle ne peut donc être expurgée que si on la déclare — d'où
   * l'option `secrets`, et d'où le fait que le serveur la lise de son
   * environnement à la construction, une fois, plutôt que jamais.
   */
  it('n’écrit pas la clé déclarée, même citée par une exception', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: '/probe/exception' })

    expectExpurge(log.text(), SERVICE_KEY)
  })

  it('n’écrit pas la clé déclarée, même passée en en-tête', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({
      method: 'POST',
      url: '/probe/zele',
      headers: { 'x-service-key': SERVICE_KEY },
      payload: {},
    })

    expectExpurge(log.text(), SERVICE_KEY)
  })
})

describe('l’expurgation n’aveugle pas le journal', () => {
  /**
   * Une liste noire trop gourmande produit un journal illisible, donc inutile,
   * donc désactivé. Ces cas fixent ce qui doit **rester**.
   */
  it('laisse l’identifiant de corrélation intact', async () => {
    const { app, log } = serverUnderTest()
    const response = await app.inject({
      method: 'GET',
      url: '/probe/ok',
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(log.text()).toContain(response.headers['x-request-id'])
  })

  it('laisse la méthode et le chemin de la requête', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: '/probe/ok' })

    expect(log.text()).toContain('/probe/ok')
  })

  it('laisse le reste du message autour de la valeur expurgée', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: '/probe/message' })

    expect(log.text()).toContain('échec d’authentification')
    expect(log.text()).toContain(REDACTED)
  })

  it('laisse la trace d’une exception, message expurgé mais présent', async () => {
    const { app, log } = serverUnderTest()
    await app.inject({ method: 'GET', url: '/probe/exception' })

    expect(log.text()).toContain('la clé de service')
    expect(log.text()).toContain('défaut serveur non rattrapé')
  })
})
