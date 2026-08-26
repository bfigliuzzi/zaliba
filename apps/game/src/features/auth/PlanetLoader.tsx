import { useQuery } from '@tanstack/react-query'
import type { PlanetSnapshotV1 } from '@zaliba/contracts'
import type { ReactNode } from 'react'
import { isNotProvisioned, type PlanetGateway } from './gateway.js'

/**
 * Le provisionnement au premier accès (FR-001, R11).
 *
 * Le provisionnement est une **commande explicite**, pour que le `GET` reste
 * pur. La conséquence côté client est mécanique : un joueur tout neuf reçoit un
 * `404 planet-not-provisioned` à sa première lecture — et ce 404 **n'est pas une
 * erreur**, c'est le signal qu'il faut fonder la colonie.
 *
 * L'afficher comme une page d'erreur reviendrait à accueillir un nouveau joueur
 * par un échec, au premier écran qu'il voit du jeu. Tout autre échec, lui, se
 * dit : les confondre ferait provisionner en boucle sur une panne de réseau, et
 * masquerait la seule information utile — réessayer plus tard.
 */

export interface PlanetLoaderProps {
  readonly gateway: PlanetGateway
  readonly children: (snapshot: PlanetSnapshotV1) => ReactNode
}

export function PlanetLoader({ gateway, children }: PlanetLoaderProps) {
  const query = useQuery({
    queryKey: ['planet'],
    queryFn: async () => {
      try {
        return await gateway.read()
      } catch (error: unknown) {
        // Le seul cas où une lecture manquée déclenche une écriture. La
        // commande est idempotente côté serveur ; une seule tentative suffit
        // néanmoins — la réémettre en boucle serait une avalanche.
        if (isNotProvisioned(error)) return gateway.provision()
        throw error
      }
    },
    retry: false,
  })

  if (query.isPending) {
    return (
      <p role="status" aria-live="polite">
        Chargement de votre planète…
      </p>
    )
  }

  if (query.isError) {
    return <p role="alert">Votre planète n’a pas pu être chargée. Réessayez dans un instant.</p>
  }

  return <>{children(query.data)}</>
}
