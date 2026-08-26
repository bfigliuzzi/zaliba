import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlanetGateway } from '../../../src/features/auth/gateway.js'
import { PlanetLoader } from '../../../src/features/auth/PlanetLoader.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * Le provisionnement au premier accès (FR-001, R11).
 *
 * Le provisionnement est une **commande explicite**, pour que le `GET` reste
 * pur. La conséquence côté client est qu'un joueur tout neuf reçoit forcément un
 * `404 planet-not-provisioned` à sa première lecture — et que ce 404 **n'est pas
 * une erreur** : c'est le signal qu'il faut fonder la colonie.
 *
 * L'afficher comme une page d'erreur serait accueillir un nouveau joueur par un
 * échec. Le traiter comme un déclencheur est ce que FR-001 demande.
 */

afterEach(cleanup)

const payload = PlanetSnapshotV1.parse(rawFresh)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

class NotProvisioned extends Error {
  readonly code = 'planet-not-provisioned'
}

function gateway(overrides: Partial<PlanetGateway> = {}): PlanetGateway {
  return {
    read: async () => payload,
    provision: async () => payload,
    ...overrides,
  }
}

function renderLoader(planet: PlanetGateway) {
  return render(
    <PlanetLoader gateway={planet}>
      {(snapshot) => <p>Planète {snapshot.planet.id}</p>}
    </PlanetLoader>,
    { wrapper },
  )
}

describe('avec une planète, on la lit et on l’affiche', () => {
  it('rend le contenu une fois l’instantané reçu', async () => {
    renderLoader(gateway())
    expect(await screen.findByText(`Planète ${payload.planet.id}`)).toBeDefined()
  })

  it('ne provisionne pas une planète qui existe déjà', async () => {
    const provision = vi.fn(async () => payload)
    renderLoader(gateway({ provision }))

    await screen.findByText(`Planète ${payload.planet.id}`)
    expect(provision).not.toHaveBeenCalled()
  })

  it('annonce l’attente plutôt que de laisser l’écran vide', async () => {
    // Une promesse **résolue à la fin du cas**, jamais une promesse qui ne se
    // règle pas : celle-ci laisserait une requête en vol après le démontage, et
    // le processus de test ne pourrait plus s'arrêter.
    let release: (value: typeof payload) => void = () => {}
    const pending = new Promise<typeof payload>((resolve) => {
      release = resolve
    })

    renderLoader(gateway({ read: () => pending }))
    expect(screen.getByRole('status')).toBeDefined()

    release(payload)
    await pending
  })
})

describe('sans planète, le 404 déclenche le provisionnement (FR-001)', () => {
  it('appelle le provisionnement', async () => {
    const provision = vi.fn(async () => payload)
    renderLoader(
      gateway({
        read: async () => {
          throw new NotProvisioned('planète absente')
        },
        provision,
      }),
    )

    await waitFor(() => expect(provision).toHaveBeenCalledTimes(1))
  })

  it('affiche la planète ainsi fondée', async () => {
    renderLoader(
      gateway({
        read: async () => {
          throw new NotProvisioned('planète absente')
        },
      }),
    )

    expect(await screen.findByText(`Planète ${payload.planet.id}`)).toBeDefined()
  })

  /**
   * Le point de FR-001 : **jamais** une page d'erreur. Un joueur qui vient de
   * créer son compte ne doit pas rencontrer un échec au premier écran.
   */
  it('n’affiche aucune erreur au passage', async () => {
    renderLoader(
      gateway({
        read: async () => {
          throw new NotProvisioned('planète absente')
        },
      }),
    )

    await screen.findByText(`Planète ${payload.planet.id}`)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * Le provisionnement est idempotent côté serveur (R11) — mais l'émettre en
   * boucle depuis le client resterait une avalanche de requêtes. Une fois suffit.
   */
  it('ne provisionne qu’une seule fois', async () => {
    const provision = vi.fn(async () => payload)
    renderLoader(
      gateway({
        read: async () => {
          throw new NotProvisioned('planète absente')
        },
        provision,
      }),
    )

    await screen.findByText(`Planète ${payload.planet.id}`)
    expect(provision).toHaveBeenCalledTimes(1)
  })
})

describe('une vraie panne, elle, se dit', () => {
  /**
   * Un 404 est un déclencheur ; tout le reste est une erreur. Les confondre
   * ferait provisionner en boucle sur une panne de réseau, et masquerait la
   * seule information utile au joueur : réessayer plus tard.
   */
  it('affiche une alerte sur une panne du serveur', async () => {
    renderLoader(
      gateway({
        read: async () => {
          throw new Error('502')
        },
      }),
    )

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('ne provisionne pas sur une panne', async () => {
    const provision = vi.fn(async () => payload)
    renderLoader(
      gateway({
        read: async () => {
          throw new Error('502')
        },
        provision,
      }),
    )

    await screen.findByRole('alert')
    expect(provision).not.toHaveBeenCalled()
  })
})
