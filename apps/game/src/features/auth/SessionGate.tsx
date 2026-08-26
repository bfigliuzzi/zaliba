import { type ReactNode, useCallback, useEffect, useState } from 'react'
import type { Session, SessionInfo } from '../../lib/session.js'
import { AuthScreen } from './AuthScreen.js'

/**
 * La porte : rien de protégé n'est monté sans session.
 *
 * « Sans session, aucune requête n'est émise » se tient par le **montage**, pas
 * par une annulation après coup. Un contenu monté puis débranché a déjà lancé
 * ses requêtes ; celles-ci partent sans jeton, reviennent en 401, et le joueur
 * voit passer des erreurs pour une situation parfaitement normale — il n'est
 * simplement pas connecté.
 */

type Status =
  | { readonly state: 'loading' }
  | { readonly state: 'settled'; readonly info: SessionInfo | null }

export interface SessionGateProps {
  readonly session: Session
  readonly children: ReactNode
}

export function SessionGate({ session, children }: SessionGateProps) {
  const [status, setStatus] = useState<Status>({ state: 'loading' })

  const reload = useCallback(async () => {
    setStatus({ state: 'settled', info: await session.current() })
  }, [session])

  useEffect(() => {
    let alive = true

    session.current().then((info) => {
      if (alive) setStatus({ state: 'settled', info })
    })

    // La session peut changer sans que cet écran l'ait demandé : un
    // renouvellement dans un autre onglet, une déconnexion, un jeton révoqué.
    const unsubscribe = session.onChange((info) => {
      if (alive) setStatus({ state: 'settled', info })
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [session])

  if (status.state === 'loading') {
    // Annoncé, et non silencieux : un écran vide pendant la vérification laisse
    // croire à une panne.
    return <p aria-live="polite">Vérification de votre session…</p>
  }

  if (status.info === null) {
    return <AuthScreen session={session} onAuthenticated={reload} />
  }

  return <>{children}</>
}
