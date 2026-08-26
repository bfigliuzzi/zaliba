import { cleanup, render, screen } from '@testing-library/react'
import { instant } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { RefusalNotice } from '../../../src/features/work/RefusalNotice.js'
import { PlanetRefusal } from '../../../src/lib/planetGateway.js'

/**
 * Le refus tel que le joueur le lit (FR-013, FR-060, SC-006, SC-007).
 *
 * Ces exigences ne demandent pas qu'un refus soit *affiché* — n'importe quel
 * code le fait. Elles demandent le **motif exact**, et, selon le motif, un
 * chiffre : l'échéance du chantier en cours, les cases fautives, le manque par
 * ressource. C'est cette moitié-là qui distingue un refus exploitable d'une
 * impasse, et c'est elle que ce fichier éprouve.
 *
 * Le second point, moins visible : l'affichage dérive du **code**, jamais du
 * message. Le message est un libellé que le serveur peut reformuler sans préavis
 * (contrats § 5), et un client qui l'analyserait casserait en silence.
 */

afterEach(cleanup)

const NOW = instant(1_787_750_000)

function refusal(code: string, details?: Record<string, unknown>) {
  return new PlanetRefusal(409, code, 'Message du serveur, qui n’est pas la vérité.', details)
}

function show(code: string, details?: Record<string, unknown>) {
  render(<RefusalNotice refusal={refusal(code, details)} at={NOW} />)
  return screen.getByRole('alert')
}

describe('le refus est une alerte, portant son code', () => {
  it('n’affiche rien en l’absence de refus', () => {
    render(<RefusalNotice refusal={null} at={NOW} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * Le code est dans le document, pas seulement dans la phrase : c'est ce qui
   * permet à un parcours de bout en bout de vérifier le **motif** et non sa
   * formulation.
   */
  it('porte le code en attribut', () => {
    expect(show('placement-out-of-grid', { cells: [{ x: 6, y: 5 }] })).toHaveProperty(
      'dataset.refusal',
      'placement-out-of-grid',
    )
  })
})

describe('un chantier en cours dit **quand** il s’achève (SC-006)', () => {
  it('annonce le temps restant, et non l’instant brut', () => {
    const alert = show('work-in-progress', {
      workId: '77777777-7777-4777-8777-777777777777',
      nature: 'build',
      dueAt: NOW + 600,
    })
    expect(alert.textContent).toMatch(/10 min/)
  })

  /**
   * « Occupé » n'apprend rien. Le test le dit à l'envers : la phrase doit
   * contenir un chiffre, sans quoi le joueur ne sait pas quand revenir.
   */
  it('contient un chiffre', () => {
    const alert = show('work-in-progress', { dueAt: NOW + 90 })
    expect(alert.textContent).toMatch(/\d/)
  })

  it('reste lisible si l’échéance manque', () => {
    const alert = show('work-in-progress', {})
    expect(alert.textContent).toMatch(/chantier/i)
  })
})

describe('un refus de placement nomme les cases fautives (FR-013)', () => {
  it.each([
    ['placement-out-of-grid', /sortirait de la grille/i],
    ['placement-on-obstructed-cell', /obstruée/i],
    ['placement-on-occupied-cell', /occupée/i],
  ] as const)('%s énonce son motif', (code, expected) => {
    const alert = show(code, { cells: [{ x: 0, y: 2 }] })
    expect(alert.textContent).toMatch(expected)
  })

  it('énumère les cases, en base 1', () => {
    const alert = show('placement-on-obstructed-cell', {
      cells: [
        { x: 0, y: 2 },
        { x: 1, y: 2 },
      ],
    })
    expect(alert.textContent).toContain('Colonne 1, rangée 3')
    expect(alert.textContent).toContain('Colonne 2, rangée 3')
  })

  it('reste lisible sans case fournie', () => {
    expect(show('placement-out-of-grid', {}).textContent).toMatch(/grille/i)
  })
})

describe('un manque de ressources se chiffre par ressource (SC-007)', () => {
  it('nomme la ressource et la quantité manquante', () => {
    const alert = show('insufficient-resources', {
      shortfall: [{ resourceId: 'camelote', grains: 36_000 }],
      secondsUntilAffordable: 1_800,
    })
    expect(alert.textContent).toMatch(/Camelote/)
    expect(alert.textContent).toMatch(/10/)
    expect(alert.textContent).toMatch(/30 min/)
  })

  /**
   * `null` n'est pas un cas d'erreur : il dit que le rythme courant n'y suffira
   * jamais parce que la ressource sature avant. L'écrire « jamais » sans le
   * pourquoi laisserait le joueur attendre pour rien.
   */
  it('dit qu’un entrepôt est nécessaire quand attendre ne suffira pas', () => {
    const alert = show('insufficient-resources', {
      shortfall: [{ resourceId: 'bave-etoiles', grains: 3_600 }],
      secondsUntilAffordable: null,
    })
    expect(alert.textContent).toMatch(/entrepôt/i)
  })
})

describe('les refus d’amélioration disent quoi faire (US4)', () => {
  /**
   * `building-not-found` arrive quand la cible a disparu entre l'aperçu et
   * l'envoi — démolie depuis un second onglet, le plus souvent. Dire seulement
   * « introuvable » laisserait le joueur réessayer sur une case que son écran
   * montre encore occupée.
   */
  it('dit de recharger quand la cible n’est plus là', () => {
    const alert = show('building-not-found', {
      buildingId: '88888888-8888-4888-8888-888888888888',
    })
    expect(alert.textContent).toMatch(/n’est plus sur la planète/i)
    expect(alert.textContent).toMatch(/recharg/i)
  })

  /**
   * Le plafond **chiffré**. « Niveau maximal atteint » laisserait chercher
   * lequel, alors que le refus le porte dans son détail.
   */
  it('nomme le plafond atteint', () => {
    const alert = show('max-level-reached', {
      buildingId: '88888888-8888-4888-8888-888888888888',
      maxLevel: 30,
    })
    expect(alert.textContent).toMatch(/niveau maximal/i)
    expect(alert.textContent).toMatch(/30/)
  })

  /** Un détail incomplet reste lisible : le repli ne montre pas d'`undefined`. */
  it('reste lisible sans plafond fourni', () => {
    const alert = show('max-level-reached', {})
    expect(alert.textContent).toMatch(/niveau maximal/i)
    expect(alert.textContent).not.toMatch(/undefined|NaN/)
  })

  /**
   * L'identifiant du bâtiment n'est **jamais** affiché, ici comme ailleurs : il
   * sert au client à retirer un repère périmé de sa vue, pas au joueur à le lire.
   */
  it('n’affiche aucun identifiant technique', () => {
    const alert = show('building-not-found', {
      buildingId: '88888888-8888-4888-8888-888888888888',
    })
    expect(alert.textContent).not.toContain('88888888')
  })
})

describe('un code inconnu retombe sur le message du serveur', () => {
  /**
   * Le serveur peut élargir l'union de refus avant le client — c'est même le
   * sens du versionnement : ajouter un code est compatible. Un client ancien qui
   * rencontre un motif inédit doit donc dire quelque chose de vrai, et non rien.
   */
  it('affiche le message plutôt qu’un écran muet', () => {
    expect(show('motif-de-demain').textContent).toMatch(/Message du serveur/)
  })

  it('affiche quand même le code en attribut', () => {
    expect(show('motif-de-demain')).toHaveProperty('dataset.refusal', 'motif-de-demain')
  })
})
