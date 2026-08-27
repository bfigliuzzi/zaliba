import { createClient } from '@supabase/supabase-js'
import { createSession, createSupabaseAuthPort, type Session } from './session.js'

/**
 * Le client Supabase, employé **exclusivement** pour authentifier.
 *
 * La clé `anon` n'est pas un secret : elle est distribuée à tout navigateur qui
 * charge la page, et c'est voulu. Elle n'ouvre que ce que RLS autorise à un
 * anonyme — c'est-à-dire rien du schéma `game`, qui n'est pas exposé à
 * PostgREST. La traiter comme un secret donnerait une fausse assurance ; la
 * traiter comme publique oblige à ce que la sécurité repose sur RLS et sur
 * l'API, où elle doit être.
 */
export function createGameSession(): Session {
  const url = import.meta.env['VITE_SUPABASE_URL']
  const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY']

  if (typeof url !== 'string' || typeof anonKey !== 'string') {
    throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont requis — voir .env.example.')
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Le jeton ne transite **jamais** par l'URL : le laisser détecter dans le
      // fragment le ferait apparaître dans l'historique du navigateur.
      detectSessionInUrl: false,
    },
  })

  return createSession(createSupabaseAuthPort(client))
}
