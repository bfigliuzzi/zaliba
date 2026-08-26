import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlanetGateway } from '../src/features/auth/gateway.js'
import type { Session, SessionInfo } from '../src/lib/session.js'
import { createAppRouter } from '../src/router.js'
import rawFresh from './fixtures/planet-fresh.json' with { type: 'json' }

/**
 * Le squelette de navigation.
 *
 * Deux routes en 001, et la seconde n'est pas un accessoire : la page de règles
 * est ce qui tient la promesse faite à P4 — « a besoin de tout savoir » — et
 * l'engagement du projet à n'avoir **aucune formule cachée**. Une route qui
 * n'existe pas est une promesse qu'on remet à plus tard.
 *
 * Les cas emploient un historique en mémoire : une navigation éprouvée par
 * l'URL réelle du navigateur dépendrait d'un état global partagé entre les
 * cas, et l'ordre d'exécution deviendrait significatif.
 */

afterEach(cleanup)

const INFO: SessionInfo = { playerId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', expiresAt: 0 }

function fakeSession(info: SessionInfo | null): Session {
  return {
    current: async () => info,
    freshAccessToken: async () => (info === null ? null : 'jeton-fictif'),
    signIn: async () => ({ session: null, error: null }),
    signUp: async () => ({ session: null, error: null }),
    signOut: async () => {},
    onChange: () => () => {},
  }
}

const payload = PlanetSnapshotV1.parse(rawFresh)

/** Une passerelle en dur : la navigation s'éprouve sans serveur. */
const fakeGateway: PlanetGateway = {
  read: async () => payload,
  provision: async () => payload,
}

function renderAt(path: string, info: SessionInfo | null = INFO) {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    session: fakeSession(info),
    gateway: fakeGateway,
  })
  return render(<RouterProvider router={router} />)
}

describe('les deux routes de 001 existent', () => {
  it('rend la planète sur /planet', async () => {
    renderAt('/planet')
    expect(await screen.findByRole('heading', { name: /planète/i })).toBeDefined()
  })

  it('rend les règles sur /rules', async () => {
    renderAt('/rules')
    expect(await screen.findByRole('heading', { name: /règles/i })).toBeDefined()
  })

  /**
   * La racine mène à la planète : c'est là que le joueur veut être, et une page
   * d'accueil intermédiaire ne serait qu'un clic de plus avant le jeu.
   */
  it('mène à la planète depuis la racine', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: /planète/i })).toBeDefined()
  })
})

describe('une adresse inconnue ne laisse pas l’écran vide', () => {
  /**
   * L'écran blanc est le pire des refus : il ne dit pas ce qui s'est passé, et
   * ne propose rien. Une adresse périmée — un signet, un lien partagé — doit
   * annoncer l'absence et rendre le chemin du retour cliquable.
   */
  it('annonce l’absence et offre un retour', async () => {
    renderAt('/une-adresse-qui-n-existe-pas')
    expect(await screen.findByRole('heading', { name: /introuvable/i })).toBeDefined()

    // Cadré sur le contenu mainRegion : le lien de la navigation mène lui aussi
    // à la planète, et le cas porte sur ce que **la page d'absence** propose.
    const mainRegion = within(screen.getByRole('main'))
    expect(mainRegion.getByRole('link', { name: /planète/i })).toBeDefined()
  })
})

describe('la navigation est annoncée aux technologies d’assistance', () => {
  /**
   * WCAG 2.1 AA (FR-061) : une application d'une seule page change de contenu
   * sans changer de document, et un lecteur d'écran n'a alors rien à annoncer.
   * Les points de repère sont ce qui lui redonne la structure.
   */
  it('expose une navigation et un contenu mainRegion', async () => {
    renderAt('/planet')
    await screen.findByRole('heading', { name: /planète/i })

    expect(screen.getByRole('navigation')).toBeDefined()
    expect(screen.getByRole('main')).toBeDefined()
  })

  it('donne accès aux deux routes depuis la navigation', async () => {
    renderAt('/planet')
    await screen.findByRole('heading', { name: /planète/i })

    const navigation = screen.getByRole('navigation')
    expect(navigation.querySelectorAll('a')).toHaveLength(2)
  })
})

describe('la planète est derrière la session, les règles ne le sont pas', () => {
  /**
   * Le point de contrôle de la phase 2 : « un joueur peut s'inscrire et se
   * connecter ; il n'a encore aucune planète ». Sans ce branchement, l'écran de
   * connexion existerait sans qu'aucun chemin n'y mène — une porte posée à côté
   * du mur.
   */
  it('affiche l’écran de connexion sur /planet sans session', async () => {
    renderAt('/planet', null)
    expect(await screen.findByLabelText(/courriel/i)).toBeDefined()
  })

  it('affiche la planète une fois la session établie', async () => {
    renderAt('/planet')
    expect(await screen.findByRole('heading', { name: /ma planète/i })).toBeDefined()
  })

  /**
   * Les règles restent lisibles sans compte. C'est la promesse faite à P4 —
   * « a besoin de tout savoir » — et l'engagement à n'avoir aucune formule
   * cachée : exiger un compte pour lire les règles serait les cacher à moitié.
   */
  it('laisse les règles accessibles sans session', async () => {
    renderAt('/rules', null)
    expect(await screen.findByRole('heading', { name: /règles/i })).toBeDefined()
  })
})
