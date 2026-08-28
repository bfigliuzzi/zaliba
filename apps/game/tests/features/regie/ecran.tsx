import { render } from '@testing-library/react'
import { PlanetSnapshotV1, type PlanetSnapshotV1 as Snapshot } from '@zaliba/contracts'
import type { PlanetGateway } from '../../../src/features/auth/gateway.js'
import { PlanetScreen } from '../../../src/routes/planet.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }
import rawWithMine from '../../fixtures/planet-with-mine.json' with { type: 'json' }

/**
 * Le harnais de l'écran de parcelle **entier**.
 *
 * Il existe parce que l'ordre du document (FR-006, FR-007), l'unicité de la
 * région d'annonce (FR-022) et le placement de l'alerte de refus (§ 1.1 du
 * contrat) ne s'éprouvent sur aucun composant pris isolément : ce sont des
 * propriétés de l'**assemblage**. Jusqu'à 002, aucun test ne montait
 * `PlanetScreen`, et c'est exactement pourquoi ses sept blocs pouvaient se
 * succéder sans hiérarchie sans qu'aucune porte ne s'en aperçoive.
 *
 * `PlanetScreen` est directement montable : c'est `PlanetRoute` qui lit le
 * contexte de routage, pas lui. Le port `PlanetGateway` est un simulacre inerte —
 * ces tests éprouvent le rendu, pas le réseau, et un simulacre qui répondrait
 * ferait passer des rendus déclenchés par une promesse.
 */

export const FRESH: Snapshot = PlanetSnapshotV1.parse(rawFresh)
export const WITH_MINE: Snapshot = PlanetSnapshotV1.parse(rawWithMine)

/**
 * Un port qui ne répond jamais.
 *
 * Une promesse jamais résolue plutôt qu'un rejet : un rejet ferait apparaître une
 * alerte de refus que le test n'a pas demandée, et un rendu qu'on n'a pas voulu
 * est un test qui décrit autre chose que ce qu'il annonce.
 */
export function gatewayInerte(): PlanetGateway {
  const jamais = () => new Promise<Snapshot>(() => {})
  return { read: jamais, provision: jamais, startWork: jamais }
}

export interface OptionsEcran {
  readonly snapshot?: Snapshot
  readonly gateway?: PlanetGateway
}

export function renderEcran(options: OptionsEcran = {}) {
  return render(
    <PlanetScreen
      snapshot={options.snapshot ?? FRESH}
      gateway={options.gateway ?? gatewayInerte()}
    />,
  )
}

/**
 * Les nœuds d'un sélecteur, **dans l'ordre du document**.
 *
 * `querySelectorAll` rend déjà cet ordre ; le dire ici évite qu'un test ne le
 * suppose sans l'écrire, alors que c'est précisément la propriété mesurée.
 */
export function dansLOrdre(racine: HTMLElement, selecteur: string): readonly Element[] {
  return [...racine.querySelectorAll(selecteur)]
}

/**
 * La position d'un nœud dans le document, ou `-1` s'il est absent.
 *
 * Comparer des positions plutôt que des index de liste est ce qui permet
 * d'asserter un ordre **partiel** : les blocs qu'une histoire n'a pas encore
 * livrés sont absents, et l'ordre de ceux qui existent reste vérifiable.
 */
export function positionDe(racine: HTMLElement, noeud: Element | null): number {
  if (noeud === null) return -1
  return dansLOrdre(racine, '*').indexOf(noeud)
}
