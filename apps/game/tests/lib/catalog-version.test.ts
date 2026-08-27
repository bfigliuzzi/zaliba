import { CATALOG_VERSION } from '@zaliba/catalogs'
import { describe, expect, it } from 'vitest'
import { catalogDivergence, isCatalogInSync } from '../../src/lib/catalogVersion.js'

/**
 * **La divergence de catalogue est détectée, pas subie** (R15).
 *
 * Le client calcule ses aperçus avec le **même code** que le serveur (R8), ce qui
 * suppose le même catalogue. Un client resté en cache après un rééquilibrage
 * afficherait alors des coûts exacts pour un monde qui n'existe plus — et le serveur
 * refuserait des commandes que l'interface annonçait comme valides, sans que rien
 * n'explique pourquoi.
 *
 * **Ce qui est éprouvé ici n'est pas la comparaison de deux chaînes** — elle est
 * triviale — mais ce que le client fait de son résultat : il **propose le
 * rechargement** et **n'affiche aucun chiffre calculé localement** en attendant. La
 * seconde moitié est la plus importante : un avertissement affiché *à côté* de
 * chiffres faux est pire que pas d'avertissement, parce qu'il laisse le joueur
 * décider s'il croit un nombre dont il n'a aucun moyen de juger.
 */

describe('la comparaison des versions', () => {
  it('reconnaît le catalogue embarqué', () => {
    expect(isCatalogInSync(CATALOG_VERSION)).toBe(true)
    expect(catalogDivergence(CATALOG_VERSION)).toBeNull()
  })

  it('détecte une version plus récente côté serveur', () => {
    const divergence = catalogDivergence('2099-01-01.1')
    expect(divergence).not.toBeNull()
    expect(divergence?.embedded).toBe(CATALOG_VERSION)
    expect(divergence?.fromServer).toBe('2099-01-01.1')
  })

  /**
   * **Une version plus ancienne côté serveur diverge aussi.** Le cas n'est pas
   * théorique : un déploiement annulé remet le serveur en arrière, et le client resté
   * en avance calculerait alors des chiffres que le serveur refuse. La comparaison est
   * donc une **égalité**, jamais un ordre — et l'ordre serait de surcroît impossible
   * à établir, la version étant un identifiant et non un numéro.
   */
  it('détecte une version plus ancienne côté serveur', () => {
    expect(catalogDivergence('2020-01-01.1')).not.toBeNull()
    expect(isCatalogInSync('2020-01-01.1')).toBe(false)
  })

  /**
   * Une version absente ou vide est traitée comme une divergence, et non comme un
   * accord. Le sens prudent est le seul défendable : croire à l'accord sur la foi
   * d'une absence ferait afficher des chiffres faux précisément quand on ne sait
   * rien.
   */
  it.each(['', '   ', null, undefined])('traite « %s » comme une divergence', (value) => {
    expect(isCatalogInSync(value)).toBe(false)
  })

  /**
   * **Et l'absence est nommée comme telle**, pas rendue par une chaîne vide.
   *
   * Le premier essai de ce test se contentait de constater la divergence, et il
   * survivait à une mutation qui supprimait la normalisation : une version vide
   * diverge de toute façon, puisqu'elle n'égale pas celle du catalogue. Le test ne
   * disait donc rien de ce qu'il croyait dire.
   *
   * Ce que la normalisation apporte vraiment est le **message** : « le serveur
   * applique  » — avec un blanc — n'aide personne, alors que « aucune version
   * annoncée » désigne une cause réelle, celle d'un intermédiaire qui a mangé le
   * champ.
   */
  it.each(['', '   ', null, undefined])('nomme l’absence de version pour « %s »', (value) => {
    const divergence = catalogDivergence(value)
    expect(divergence?.fromServer).toBe('aucune version annoncée')
    expect(divergence?.message).toContain('aucune version annoncée')
  })

  it('ignore les espaces autour de la version', () => {
    expect(isCatalogInSync(` ${CATALOG_VERSION} `)).toBe(true)
  })
})

describe('ce que le client doit faire de la divergence (R15)', () => {
  /**
   * **Le rechargement est proposé, jamais imposé.** Recharger d'autorité perdrait la
   * frappe en cours et pourrait boucler si la version divergeait à cause d'un cache
   * intermédiaire que le rechargement ne vide pas. Le joueur décide, et le message le
   * lui dit en clair.
   */
  it('propose le rechargement, et le dit', () => {
    const divergence = catalogDivergence('2099-01-01.1')
    expect(divergence?.action).toBe('offer-reload')
    expect(divergence?.message).toMatch(/recharg/i)
  })

  /**
   * **Aucun chiffre calculé localement n'est affiché en attendant.** C'est la moitié
   * qui compte : un avertissement affiché *à côté* de chiffres faux laisserait le
   * joueur décider s'il croit un nombre dont il n'a aucun moyen de juger.
   */
  it('interdit l’affichage des valeurs dérivées', () => {
    expect(catalogDivergence('2099-01-01.1')?.derivedValuesUsable).toBe(false)
  })

  it('les valeurs dérivées sont utilisables quand les versions concordent', () => {
    expect(catalogDivergence(CATALOG_VERSION)).toBeNull()
    expect(isCatalogInSync(CATALOG_VERSION)).toBe(true)
  })

  /**
   * Le message **nomme les deux versions**. Sans elles, un rapport de bogue ne dit
   * rien : « les versions diffèrent » n'apprend ni laquelle est en cache, ni ce que
   * le serveur attendait, et l'enquête recommence à zéro.
   */
  it('nomme les deux versions dans son message', () => {
    const divergence = catalogDivergence('2099-01-01.1')
    expect(divergence?.message).toContain('2099-01-01.1')
    expect(divergence?.message).toContain(CATALOG_VERSION)
  })
})
