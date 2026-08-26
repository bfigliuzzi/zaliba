import { type FormEvent, useId, useState } from 'react'
import type { Session } from '../../lib/session.js'

/**
 * Inscription et connexion par courriel.
 *
 * C'est le **premier** écran, donc celui où un défaut d'accessibilité exclut le
 * plus complètement : un joueur arrêté ici ne voit jamais le jeu. Trois
 * exigences le gouvernent, et aucune n'est cosmétique.
 *
 * **FR-058 — intégralement au clavier.** Champs et boutons natifs, dans l'ordre
 * du document, à l'intérieur d'un `form` : la touche Entrée soumet, et l'ordre
 * de tabulation est celui qu'on lit. Rien de tout cela ne demande d'attribut
 * particulier — c'est en s'en écartant qu'on le perd.
 *
 * **FR-060 — jamais la couleur seule.** Un cadre rouge n'existe pas pour qui ne
 * distingue pas le rouge, ni pour qui écoute la page. L'erreur est un **texte**,
 * dans une région d'alerte, rattachée aux champs par `aria-describedby`, et
 * doublée de `aria-invalid` pour que l'état soit lisible par la machine.
 *
 * **FR-061 — WCAG 2.1 AA.** Chaque champ porte son nom par une étiquette, et
 * non par un texte d'invite : celui-ci disparaît à la première frappe et
 * laisserait le champ anonyme au moment précis où l'on relit sa saisie.
 */

type Mode = 'sign-in' | 'sign-up'

export interface AuthScreenProps {
  readonly session: Session
  /** Appelé lorsque l'authentification aboutit. */
  readonly onAuthenticated?: () => void
}

export function AuthScreen({ session, onAuthenticated }: AuthScreenProps) {
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()

  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Le bouton désactivé suffit à la souris ; cette garde couvre le clavier,
    // qui peut déclencher deux soumissions avant le premier rendu.
    if (submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const attempt =
        mode === 'sign-in'
          ? await session.signIn({ email, password })
          : await session.signUp({ email, password })

      if (attempt.error !== null) {
        setError(attempt.error)
        return
      }
      onAuthenticated?.()
    } finally {
      setSubmitting(false)
    }
  }

  /** Toute frappe efface le message : il décrivait une tentative révolue. */
  function edit(setter: (value: string) => void) {
    return (value: string) => {
      setter(value)
      setError(null)
    }
  }

  const submitLabel = mode === 'sign-in' ? 'Se connecter' : 'S’inscrire'
  const busyLabel = mode === 'sign-in' ? 'Connexion en cours…' : 'Inscription en cours…'
  const describedBy = error === null ? undefined : errorId

  return (
    <section aria-labelledby={`${emailId}-titre`}>
      <h1 id={`${emailId}-titre`}>{mode === 'sign-in' ? 'Se connecter' : 'Créer un compte'}</h1>

      <form onSubmit={submit} noValidate>
        <div>
          <label htmlFor={emailId}>Adresse de courriel</label>
          <input
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            aria-invalid={error === null ? undefined : true}
            aria-describedby={describedBy}
            onChange={(event) => edit(setEmail)(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor={passwordId}>Mot de passe</label>
          <input
            id={passwordId}
            type="password"
            name="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            required
            value={password}
            aria-invalid={error === null ? undefined : true}
            aria-describedby={describedBy}
            onChange={(event) => edit(setPassword)(event.target.value)}
          />
        </div>

        <button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? busyLabel : submitLabel}
        </button>
      </form>

      {/*
        La région n'est rendue qu'en présence d'un message : un conteneur vide
        et permanent n'est pas annoncé de façon fiable par tous les lecteurs
        d'écran, alors qu'un élément `alert` qui apparaît l'est toujours.
      */}
      {error !== null && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}

      <button type="button" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
        {mode === 'sign-in' ? 'Créer un compte' : 'J’ai déjà un compte'}
      </button>
    </section>
  )
}
