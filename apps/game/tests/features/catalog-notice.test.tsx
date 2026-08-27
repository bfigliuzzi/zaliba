import { cleanup, render, screen } from '@testing-library/react'
import { CATALOG_VERSION } from '@zaliba/catalogs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogNotice } from '../../src/features/catalog/CatalogNotice.js'

/**
 * L'avertissement de divergence de catalogue (R15).
 *
 * **Ce qui est éprouvé ici n'est pas l'affichage d'un message** — c'est ce que le
 * message *remplace*. Un avertissement placé à côté de chiffres faux laisserait le
 * joueur décider s'il croit un nombre dont il n'a aucun moyen de juger ; les chiffres
 * dérivés sont donc **absents** tant que la divergence dure.
 *
 * C'est une décision inconfortable et assumée : un écran vide avec une explication
 * vaut mieux qu'un écran plein et faux. La conséquence pratique est douce — le
 * rechargement suffit, et le message le dit.
 */

afterEach(cleanup)

describe('quand les versions concordent, l’avertissement s’effface', () => {
  it('rend le contenu et rien d’autre', () => {
    render(
      <CatalogNotice fromServer={CATALOG_VERSION}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    expect(screen.getByText('Ma planète')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('quand elles divergent, le contenu dérivé disparaît', () => {
  const Divergent = '2099-01-01.1'

  it('annonce la divergence dans une région d’alerte', () => {
    render(
      <CatalogNotice fromServer={Divergent}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/recharg/i)
    // Les deux versions sont nommées : sans elles, un rapport de bogue n'apprend rien.
    expect(alert.textContent).toContain(Divergent)
    expect(alert.textContent).toContain(CATALOG_VERSION)
  })

  /**
   * **Le contenu dérivé est absent du document**, et pas seulement masqué. Un nœud
   * caché reste lisible par un lecteur d'écran mal configuré et par un outil qui
   * l'inspecte ; l'absence, elle, ne se contourne pas.
   */
  it('ne rend aucun contenu dérivé', () => {
    render(
      <CatalogNotice fromServer={Divergent}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    expect(screen.queryByText('Ma planète')).toBeNull()
  })

  /**
   * **Le rechargement est proposé, jamais imposé.** Recharger d'autorité perdrait la
   * frappe en cours, et pourrait boucler si la divergence venait d'un cache
   * intermédiaire que le rechargement ne vide pas.
   */
  it('offre un bouton de rechargement, et l’appelle sur pression', () => {
    const reload = vi.fn()
    render(
      <CatalogNotice fromServer={Divergent} onReload={reload}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    const button = screen.getByRole('button', { name: /recharger/i })
    button.click()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('traite une version absente comme une divergence', () => {
    render(
      <CatalogNotice fromServer={null}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    expect(screen.getByRole('alert').textContent).toContain('aucune version annoncée')
    expect(screen.queryByText('Ma planète')).toBeNull()
  })
})
