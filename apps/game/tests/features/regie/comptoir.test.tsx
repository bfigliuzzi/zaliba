import { cleanup, render, screen, within } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { DEFAULT_CATALOGS, instant, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { ResourcePanel } from '../../../src/features/resources/ResourcePanel.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * Le comptoir des ressources (FR-003, FR-010, FR-002).
 *
 * **La règle non négociable du dossier de design est ici** : aucun chiffre ne se
 * pose sur un aplat de couleur de ressource. L'étiquette de papier collée existe
 * pour que les chiffres soient à 12,8:1 **à toute taille**, et c'est ce détail qui
 * donne au passage la meilleure matière du système.
 *
 * **Et il est constaté par le crochet de l'étiquette, jamais par une couleur.**
 * Un test qui lirait la teinte calculée d'un fond mesurerait le CSS chargé par
 * jsdom — c'est-à-dire rien. Ce qu'on mesure est la **structure** : tout nœud
 * portant un chiffre a un ancêtre `[data-etiquette]`. La palette, elle, est tenue
 * par `tests/design/contrastes.test.ts`.
 */

afterEach(cleanup)

const CATALOGS = DEFAULT_CATALOGS
const payload = PlanetSnapshotV1.parse(rawFresh)

function rendre(elapsed = 0) {
  const snapshot = snapshotFromContract(payload, CATALOGS)
  const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt + elapsed))
  return render(<ResourcePanel holdings={state.holdings} at={state.at} />)
}

const RESSOURCES = [
  ['camelote', /camelote/i],
  ['jus', /jus/i],
  ['bave-etoiles', /bave d’étoiles/i],
] as const

describe('chaque ressource porte son nom, sa quantité et son débit horaire (FR-010)', () => {
  it.each(RESSOURCES)('%s a son bloc nommé', (id, nom) => {
    const { container } = rendre()
    expect(screen.getByRole('group', { name: nom })).toBeDefined()
    expect(container.querySelector(`[data-ressource="${id}"]`)).not.toBeNull()
  })

  it.each(RESSOURCES)('%s affiche sa quantité détenue', (id) => {
    const { container } = rendre()
    const carte = container.querySelector(`[data-ressource="${id}"]`)
    expect(carte?.querySelector('[data-chiffre="quantite"]')?.textContent ?? '').toMatch(/\d/)
  })

  /**
   * Le **débit horaire** est un chiffre, et FR-002 range tout chiffre dans la
   * famille tabulaire. Le dossier le laissait en corps 9,5 non tabulaire, sous
   * tous les planchers : le pas `chiffre-xs` (14 px) le range où il appartient.
   */
  it.each(RESSOURCES)('%s affiche son débit horaire', (id) => {
    const { container } = rendre()
    const carte = container.querySelector(`[data-ressource="${id}"]`)
    const debit = carte?.querySelector('[data-chiffre="debit"]')
    expect(debit, `le débit horaire de ${id}`).not.toBeNull()
    expect(debit?.textContent ?? '').toMatch(/\/\s*h/)
  })
})

describe('aucun chiffre ne repose sur un aplat de ressource (FR-003)', () => {
  /**
   * L'assertion centrale de la tranche côté comptoir, et elle porte sur **tous**
   * les chiffres — pas seulement sur la quantité. Le plafond, le remplissage, la
   * perte et le temps avant saturation sont des chiffres aussi, et les laisser
   * sur l'aplat aurait respecté la lettre de la règle en manquant son objet.
   */
  it('tout nœud portant un chiffre a un ancêtre étiquette de papier', () => {
    const { container } = rendre()
    const chiffres = [...container.querySelectorAll('[data-chiffre], dd')]
    expect(chiffres.length, 'le comptoir doit porter des chiffres').toBeGreaterThan(0)

    const horsPapier = chiffres
      .filter((noeud) => /\d/.test(noeud.textContent ?? ''))
      .filter((noeud) => noeud.closest('[data-etiquette]') === null)
      .map((noeud) => (noeud.textContent ?? '').slice(0, 40))

    expect(
      horsPapier,
      `chiffres posés hors de l’étiquette de papier :\n  ${horsPapier.join('\n  ')}`,
    ).toEqual([])
  })

  it('l’aplat de la ressource ne contient aucun chiffre', () => {
    const { container } = rendre()
    for (const aplat of container.querySelectorAll('[data-aplat]')) {
      expect(
        /\d/.test(aplat.textContent ?? ''),
        `l’aplat ${aplat.getAttribute('data-aplat')} porte un chiffre`,
      ).toBe(false)
    }
  })

  /**
   * L'aplat porte la teinte **et** la silhouette : la teinte seule ne distingue
   * rien pour qui ne la voit pas (FR-012). La silhouette est masquée aux
   * technologies d'assistance, le nom de la ressource étant déjà le nom
   * accessible du bloc.
   */
  it('l’aplat porte la silhouette de la ressource, masquée', () => {
    const { container } = rendre()
    for (const [id] of RESSOURCES) {
      const aplat = container.querySelector(`[data-ressource="${id}"] [data-aplat]`)
      const silhouette = aplat?.querySelector('svg[data-silhouette]')
      expect(silhouette, `la silhouette de ${id}`).not.toBeNull()
      expect(silhouette?.getAttribute('aria-hidden')).toBe('true')
    }
  })
})

/**
 * FR-029a et § 5.2 de `data-model` — **la quantité détenue n'est jamais suivie**.
 *
 * Seules les valeurs qui changent **par saut** le sont : le niveau d'un bâtiment, le
 * débit horaire, le plafond de stockage. Une quantité détenue progresse à la
 * seconde : une rature par seconde **clignoterait** au lieu de corriger, et le
 * clignotement est précisément ce que FR-005 refuse.
 *
 * C'est la borne la plus facile à franchir de la tranche — la quantité est la valeur
 * la plus visible de l'écran, et la raturer paraîtrait cohérent.
 */
describe('la quantité détenue n’est jamais raturée (FR-029a)', () => {
  it('ne porte aucune rature sur la quantité', () => {
    const { container } = rendre()
    for (const carte of container.querySelectorAll('[data-ressource]')) {
      const quantite = carte.querySelector('[data-chiffre="quantite"]')
      expect(
        quantite?.closest('[data-rature]'),
        `${carte.getAttribute('data-ressource')} : la quantité est dans une rature`,
      ).toBeNull()
    }
  })

  it('n’en porte pas non plus après que la quantité a progressé', () => {
    // Une heure d'écoulement : la quantité a changé plusieurs fois de valeur
    // affichée, et aucune rature n'a dû apparaître pour autant.
    const { container } = rendre(3600)
    const avant = container.querySelector('[data-chiffre="quantite"]')?.textContent
    cleanup()

    const apres = rendre(7200)
    expect(
      apres.container.querySelector('[data-chiffre="quantite"]')?.textContent,
      'la quantité doit bien avoir changé, sinon le cas ne prouve rien',
    ).not.toBe(avant)
    expect(apres.container.querySelectorAll('[data-rature="active"]')).toHaveLength(0)
  })

  /**
   * Les trois valeurs qui **sont** suivies portent, elles, un bloc de rature — même
   * inactif. C'est ce qui distingue « pas encore changé » de « pas suivi », et sans
   * cette assertion le test précédent passerait sur un écran où rien n'est suivi.
   */
  it.each([
    ['debit', '[data-chiffre="debit"]'],
    ['plafond', '[data-cap]'],
  ])('suit le %s', (_quoi, selecteur) => {
    const { container } = rendre()
    const valeur = container.querySelector(selecteur)
    expect(valeur, `le sélecteur ${selecteur}`).not.toBeNull()
    // Le bloc de rature est **dans** la cellule, non au-dessus d'elle : c'est la
    // valeur qui est enveloppée, pas la ligne de la liste.
    expect(
      valeur?.querySelector('[data-rature]'),
      'cette valeur change par saut : elle doit être suivie',
    ).not.toBeNull()
  })
})

describe('les calculs de 001 sont intacts', () => {
  /**
   * T031 réécrit le **rendu**, pas la dérivation. Les cinq grandeurs de 001 — dont
   * trois n'apparaissent nulle part dans la maquette — restent publiées avec leurs
   * crochets, parce que trois parcours de bout en bout les lisent et parce
   * qu'aucune exigence de 002 ne demande de les retirer.
   */
  it.each(['data-cap', 'data-fill', 'data-lost'])('publie toujours %s', (crochet) => {
    const { container } = rendre()
    expect(container.querySelectorAll(`[${crochet}]`).length).toBe(RESSOURCES.length)
  })

  it('garde les cinq grandeurs par ressource', () => {
    rendre()
    const bloc = within(screen.getByRole('group', { name: /camelote/i }))
    for (const terme of [/détenu/i, /plafond/i, /remplissage/i, /saturation/i, /perdu/i]) {
      expect(bloc.getByText(terme), `le terme ${terme}`).toBeDefined()
    }
  })
})
