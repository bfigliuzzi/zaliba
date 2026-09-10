import { cleanup, render, screen } from '@testing-library/react'
import { CATALOG_VERSION, GONG_CANONICAL } from '@zaliba/catalogs'
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
      <CatalogNotice fromServer={CATALOG_VERSION} gong={GONG_CANONICAL}>
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
      <CatalogNotice fromServer={Divergent} gong={GONG_CANONICAL}>
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
      <CatalogNotice fromServer={Divergent} gong={GONG_CANONICAL}>
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
      <CatalogNotice fromServer={Divergent} gong={GONG_CANONICAL} onReload={reload}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    const button = screen.getByRole('button', { name: /recharger/i })
    button.click()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('traite une version absente comme une divergence', () => {
    render(
      <CatalogNotice fromServer={null} gong={GONG_CANONICAL}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    expect(screen.getByRole('alert').textContent).toContain('aucune version annoncée')
    expect(screen.queryByText('Ma planète')).toBeNull()
  })
})

/**
 * **Une réponse sans longueur de gong enveloppe l'écran** (FR-013, G9).
 *
 * Le client ne sait alors pas à quel rythme le serveur bat : il ne peut
 * convertir aucune durée ni aucun taux, et tout l'écran de planète en est fait.
 * Les deux états — divergence de version et rythme inconnu — convergent
 * volontairement sur le même geste, parce que ne rien savoir et se savoir en
 * désaccord appellent la même prudence.
 *
 * Le **message**, lui, est distinct : ce ne sont pas les mêmes causes ni les
 * mêmes remèdes, et parler de rééquilibrage là où le serveur n'a simplement pas
 * annoncé son rythme enverrait le lecteur enquêter au mauvais endroit.
 */
describe('sans longueur de gong, l’écran est enveloppé comme en divergence (FR-013)', () => {
  it.each([
    ['absente', undefined],
    ['nulle', null],
  ])('masque le contenu quand la longueur est %s', (_label, gong) => {
    render(
      <CatalogNotice fromServer={CATALOG_VERSION} gong={gong}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    expect(screen.queryByText('Ma planète')).toBeNull()
    expect(screen.getByRole('alert')).not.toBeNull()
  })

  it('dit que c’est le rythme qui manque, et non que les règles ont changé', () => {
    render(
      <CatalogNotice fromServer={CATALOG_VERSION} gong={undefined}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/gong|rythme/i)
    // Le message de divergence de version parlerait de règles changées : le
    // confondre enverrait chercher un rééquilibrage qui n'a pas eu lieu.
    expect(alert.textContent).not.toMatch(/les règles du jeu ont changé/i)
  })

  it('propose un rechargement, comme la divergence', () => {
    const onReload = vi.fn()
    render(
      <CatalogNotice fromServer={CATALOG_VERSION} gong={null} onReload={onReload}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    screen.getByRole('button', { name: /recharger/i }).click()
    expect(onReload).toHaveBeenCalledOnce()
  })

  /**
   * **Et la divergence de version l'emporte quand les deux se présentent.** Un
   * serveur qui n'annonce pas son rythme est probablement antérieur à 003, donc
   * sa version diverge aussi ; c'est la cause la plus explicative qui doit être
   * dite.
   */
  it('annonce la divergence de version plutôt que le rythme quand les deux manquent', () => {
    render(
      <CatalogNotice fromServer="2020-01-01.1" gong={undefined}>
        <p>Ma planète</p>
      </CatalogNotice>,
    )

    expect(screen.getByRole('alert').textContent).toMatch(/les règles ont changé|règles du jeu/i)
  })
})
