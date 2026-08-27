import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthScreen } from '../../../src/features/auth/AuthScreen.js'
import { SessionGate } from '../../../src/features/auth/SessionGate.js'
import type { AuthAttempt, Session, SessionInfo } from '../../../src/lib/session.js'

/**
 * L'écran de connexion.
 *
 * Trois exigences, et aucune n'est cosmétique :
 *
 * - **FR-058, intégralement au clavier.** Un joueur qui n'emploie pas de souris
 *   ne doit pas être arrêté à la porte. C'est aussi le premier écran, donc
 *   celui où un défaut d'accessibilité exclut le plus complètement ;
 * - **FR-060, sans dépendre de la couleur seule.** Un cadre rouge n'existe pas
 *   pour qui ne distingue pas le rouge, ni pour qui écoute la page. L'erreur
 *   doit être un **texte**, rattaché au field, et annoncée ;
 * - **FR-061, WCAG 2.1 AA.** Chaque field porte un nom accessible par son
 *   étiquette — pas par un texte d'invite, qui disparaît à la saisie et laisse
 *   un field anonyme au moment précis où l'on vérifie ce qu'on a tapé.
 */

afterEach(cleanup)

function fakeSession(overrides: Partial<Session> = {}): Session {
  return {
    current: async () => null,
    freshAccessToken: async () => null,
    signIn: async () => ({ session: null, error: null }),
    signUp: async () => ({ session: null, error: null }),
    signOut: async () => {},
    onChange: () => () => {},
    ...overrides,
  }
}

const INFO: SessionInfo = { playerId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', expiresAt: 0 }

describe('les deux champs portent un nom accessible', () => {
  it('expose un field de courriel étiqueté', () => {
    render(<AuthScreen session={fakeSession()} />)
    expect(screen.getByLabelText(/courriel/i)).toBeDefined()
  })

  it('expose un field de mot de passe étiqueté', () => {
    render(<AuthScreen session={fakeSession()} />)
    expect(screen.getByLabelText(/mot de passe/i)).toBeDefined()
  })

  /**
   * Le texte d'invite disparaît dès la première frappe. S'en servir comme nom
   * accessible laisse un field anonyme au moment exact où l'on relit sa saisie.
   */
  it('ne se repose pas sur un texte d’invite pour nommer les champs', () => {
    render(<AuthScreen session={fakeSession()} />)
    for (const field of [/courriel/i, /mot de passe/i]) {
      expect(screen.getByLabelText(field).getAttribute('placeholder')).toBeNull()
    }
  })
})

describe('tout se fait au clavier (FR-058)', () => {
  it('atteint les deux champs et le bouton par tabulation', async () => {
    const user = userEvent.setup()
    render(<AuthScreen session={fakeSession()} />)

    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText(/courriel/i))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText(/mot de passe/i))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /se connecter/i }))
  })

  it('soumet par la touche Entrée, sans atteindre le bouton', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(async (): Promise<AuthAttempt> => ({ session: null, error: null }))
    render(<AuthScreen session={fakeSession({ signIn })} />)

    await user.click(screen.getByLabelText(/courriel/i))
    await user.keyboard('joueuse@exemple.test')
    await user.tab()
    await user.keyboard('un-mot-de-passe-solide{Enter}')

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1))
  })

  it('bascule vers l’inscription au clavier', async () => {
    const user = userEvent.setup()
    render(<AuthScreen session={fakeSession()} />)

    await user.click(screen.getByRole('button', { name: /créer un compte/i }))
    expect(screen.getByRole('button', { name: /^s’inscrire$/i })).toBeDefined()
  })
})

describe('une erreur est annoncée, et jamais par la couleur seule (FR-060)', () => {
  async function submitWith(error: string) {
    const user = userEvent.setup()
    const signIn = vi.fn(async (): Promise<AuthAttempt> => ({ session: null, error }))
    render(<AuthScreen session={fakeSession({ signIn })} />)

    await user.type(screen.getByLabelText(/courriel/i), 'joueuse@exemple.test')
    await user.type(screen.getByLabelText(/mot de passe/i), 'mauvais-mot-de-passe')
    await user.click(screen.getByRole('button', { name: /se connecter/i }))
    return user
  }

  it('rend le motif sous forme de texte', async () => {
    await submitWith('Identifiants invalides.')
    expect(await screen.findByText(/identifiants invalides/i)).toBeDefined()
  })

  /**
   * Une région dédiée aux messages, annoncée par le lecteur d'écran. Sans elle,
   * l'erreur apparaît visuellement et **rien** n'est dit à qui écoute la page :
   * le formulaire semble simplement n'avoir rien fait.
   */
  it('l’annonce dans une région d’alertRegion', async () => {
    await submitWith('Identifiants invalides.')
    const alertRegion = await screen.findByRole('alert')
    expect(alertRegion.textContent).toMatch(/identifiants invalides/i)
  })

  it('marque le formulaire en erreur autrement que par le style', async () => {
    await submitWith('Identifiants invalides.')
    await screen.findByRole('alert')
    expect(screen.getByLabelText(/courriel/i).getAttribute('aria-invalid')).toBe('true')
  })

  it('rattache le message au field concerné', async () => {
    await submitWith('Identifiants invalides.')
    const alertRegion = await screen.findByRole('alert')
    const describedBy = screen.getByLabelText(/courriel/i).getAttribute('aria-describedby')
    expect(describedBy).toBe(alertRegion.id)
  })

  it('efface le message dès que la saisie reprend', async () => {
    const user = await submitWith('Identifiants invalides.')
    await screen.findByRole('alert')

    await user.type(screen.getByLabelText(/courriel/i), 'x')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('la soumission est annoncée pendant qu’elle dure', () => {
  it('désactive le bouton et dit qu’elle est en cours', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(
      async (): Promise<AuthAttempt> =>
        new Promise((resolve) => setTimeout(() => resolve({ session: null, error: null }), 30)),
    )
    render(<AuthScreen session={fakeSession({ signIn })} />)

    await user.type(screen.getByLabelText(/courriel/i), 'joueuse@exemple.test')
    await user.type(screen.getByLabelText(/mot de passe/i), 'un-mot-de-passe-solide')
    await user.click(screen.getByRole('button', { name: /se connecter/i }))

    const submitButton = screen.getByRole('button', { name: /connexion/i })
    expect(submitButton.hasAttribute('disabled')).toBe(true)
    expect(submitButton.getAttribute('aria-busy')).toBe('true')
  })

  /**
   * Un double clic ne doit pas produire deux inscriptions. Le submitButton désactivé
   * suffit à la souris ; la garde dans le gestionnaire couvre le clavier, qui
   * peut déclencher deux soumissions avant le premier rendu.
   */
  it('ne soumet pas deux fois sur un double déclenchement', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(
      async (): Promise<AuthAttempt> =>
        new Promise((resolve) => setTimeout(() => resolve({ session: null, error: null }), 30)),
    )
    render(<AuthScreen session={fakeSession({ signIn })} />)

    await user.type(screen.getByLabelText(/courriel/i), 'joueuse@exemple.test')
    await user.type(screen.getByLabelText(/mot de passe/i), 'un-mot-de-passe-solide')
    const submitButton = screen.getByRole('button', { name: /se connecter/i })
    await user.click(submitButton)
    await user.click(submitButton)

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1))
  })
})

describe('sans session, l’écran de connexion s’affiche', () => {
  /**
   * La moitié de FR-058 qui n'est pas dans le formulaire : c'est la **porte**
   * qui garantit qu'un joueur non connecté voit de quoi se connecter, plutôt
   * qu'un écran de jeu vide et une requête refusée.
   */
  it('rend l’écran de connexion à la place du contenu protégé', async () => {
    render(
      <SessionGate session={fakeSession()}>
        <p>Contenu de jeu</p>
      </SessionGate>,
    )

    expect(await screen.findByLabelText(/courriel/i)).toBeDefined()
    expect(screen.queryByText('Contenu de jeu')).toBeNull()
  })

  it('rend le contenu protégé une fois la session établie', async () => {
    render(
      <SessionGate session={fakeSession({ current: async () => INFO })}>
        <p>Contenu de jeu</p>
      </SessionGate>,
    )

    expect(await screen.findByText('Contenu de jeu')).toBeDefined()
  })

  /**
   * Sans session, **aucune requête n'est émise**. Le contenu protégé n'est pas
   * mounted, donc ses requêtes ne partent pas — c'est le montage qu'il faut
   * empêcher, pas la requête qu'il faut annuler après coup.
   */
  it('ne monte pas le contenu protégé, donc n’émet rien', async () => {
    const mounted = vi.fn()
    function Guarded() {
      mounted()
      return <p>Contenu de jeu</p>
    }

    render(
      <SessionGate session={fakeSession()}>
        <Guarded />
      </SessionGate>,
    )

    await screen.findByLabelText(/courriel/i)
    expect(mounted).not.toHaveBeenCalled()
  })
})
