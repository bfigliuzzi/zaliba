import { createSql } from '@zaliba/db'
import { buildApi } from './app.js'
import { parseGongSeconds } from './config/gong.js'
import { createAuthenticator } from './plugins/auth.js'

/**
 * Le point d'entrée du serveur.
 *
 * Il ne fait que trois choses — lire l'environnement, assembler, écouter — et
 * c'est délibéré : tout ce qui vit ici échappe aux tests, puisqu'il n'y a ni
 * requête à injecter ni instance à inspecter. Ce qui doit être éprouvé vit dans
 * `app.ts` et dans les greffons, qu'un test monte avec ses propres dépendances.
 *
 * **La configuration est lue une fois, au démarrage, et elle est exigeante.**
 * Une variable manquante arrête le processus au lieu de démarrer un serveur qui
 * refusera toutes les requêtes ou, pire, en acceptera qu'il n'aurait pas dû. Un
 * démarrage bruyant vaut mieux qu'une panne silencieuse à la première connexion.
 */

function required(name: string): string {
  const value = process.env[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} est requis — voir .env.example.`)
  }
  return value
}

function optionalList(name: string): readonly string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export async function main(): Promise<void> {
  // Lue une fois, et jamais relue : la longueur du gong est un paramètre du
  // processus, pas un état de partie. Un serveur qui changerait de rythme en
  // cours de vie annoncerait au client une longueur qui ne correspondrait plus
  // aux échéances déjà écrites en base.
  const gong = parseGongSeconds(process.env['GONG_SECONDS'])

  const app = buildApi({
    gong,
    sql: createSql({ url: required('DATABASE_URL') }),
    authenticator: createAuthenticator({
      jwksUrl: required('SUPABASE_JWKS_URL'),
      issuer: required('SUPABASE_JWT_ISSUER'),
      audience: required('SUPABASE_JWT_AUDIENCE'),
      // Une tolérance courte : les horloges dérivent, mais accepter une minute
      // d'avance sur l'expiration reviendrait à prolonger tous les jetons.
      clockToleranceSeconds: 5,
    }),
    corsOrigins: optionalList('CORS_ALLOWED_ORIGINS'),
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
  })

  // Un serveur qui bat au mauvais rythme est indétectable de l'intérieur : le
  // journal de démarrage est la seule trace externe de ce qu'il applique.
  // Aucune donnée personnelle — c'est un paramètre public, que la page de
  // règles énonce d'ailleurs au joueur (FR-016).
  app.log.info(
    { gong: `${gong.num}/${gong.den}` },
    `Longueur du gong retenue : ${gong.num}/${gong.den} s.`,
  )

  const port = Number(process.env['PORT'] ?? 3000)
  // `127.0.0.1` et non `0.0.0.0` : en développement, un serveur qui écoute sur
  // toutes les interfaces est exposé au réseau local sans qu'on l'ait décidé.
  const host = process.env['HOST'] ?? '127.0.0.1'

  await app.listen({ port, host })
}

await main()
