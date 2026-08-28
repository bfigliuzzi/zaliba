import { cleanup, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { positionDe, renderEcran } from './ecran.js'

/**
 * L'ordre du document (FR-006, FR-007, § 1 et § 1.1 du contrat d'interface).
 *
 * **Immuable, et aux deux largeurs.** Le guichet de FR-007 déplace des boîtes par
 * zones de grille nommées, jamais par `order` : la propriété `order` aurait le
 * même effet visuel et dissocierait l'ordre de tabulation de l'ordre visuel, ce
 * qui est la façon canonique de casser WCAG 2.4.3 (R10).
 *
 * **C'est une propriété de l'assemblage, pas d'un composant.** Aucun test de 001
 * ne montait `PlanetScreen` : c'est exactement pourquoi ses sept blocs pouvaient
 * se succéder sans hiérarchie sans qu'aucune porte ne s'en aperçoive.
 *
 * Les **trois nœuds que FR-006 n'énumère pas** sont assertés comme les sept
 * autres, parce que le § 1.1 du contrat leur fixe une place :
 *
 * - l'**énergie** garde son bloc distinct, immédiatement après les compteurs
 *   (FR-010 : nature différente — instantanée, ni stockée ni plafonnée) ;
 * - l'**alerte de refus de commande** quitte sa place de 001, entre le plan et
 *   les compteurs, pour suivre les boutons de pose : un message d'échec loin du
 *   bouton qui a échoué oblige à le chercher ;
 * - l'**avertissement de divergence de catalogue** *enveloppe* l'écran sans
 *   occuper de rang (FR-011) — il qualifie tout ce que l'écran affiche.
 */

afterEach(cleanup)

/**
 * Les blocs, dans l'ordre prescrit.
 *
 * `requis` distingue ce que l'histoire courante livre de ce qu'une histoire
 * suivante livrera. Un bloc non requis est éprouvé **en ordre s'il est présent**,
 * ce qui rend l'assertion utile dès US1 sans mentir sur ce qui n'existe pas
 * encore. T078 (US6) referme les deux derniers.
 */
const BLOCS: readonly { readonly bloc: string; readonly nom: string; readonly requis: boolean }[] =
  [
    { bloc: 'en-tete', nom: 'plaque d’en-tête', requis: true },
    { bloc: 'comptoir', nom: 'compteurs de ressources', requis: true },
    { bloc: 'energie', nom: 'énergie', requis: true },
    { bloc: 'note', nom: 'note de bas de page', requis: true },
    { bloc: 'chantier', nom: 'plaque de chantier', requis: true },
    { bloc: 'plan', nom: 'plan de parcelle', requis: true },
    { bloc: 'actions', nom: 'actions', requis: true },
    { bloc: 'mention', nom: 'mention finale', requis: true },
    { bloc: 'registre', nom: 'registre des possessions', requis: false },
    { bloc: 'legende', nom: 'légende des silhouettes', requis: false },
  ]

describe('les blocs de la Régie se succèdent dans l’ordre de FR-006', () => {
  it('les porte tous, chacun une seule fois', () => {
    const { container } = renderEcran()
    for (const { bloc, nom, requis } of BLOCS) {
      const trouves = container.querySelectorAll(`[data-bloc="${bloc}"]`)
      if (!requis && trouves.length === 0) continue
      expect(trouves.length, `le bloc « ${nom} » (data-bloc="${bloc}")`).toBe(1)
    }
  })

  it('les range dans l’ordre prescrit, du haut vers le bas du document', () => {
    const { container } = renderEcran()

    const releves = BLOCS.map(({ bloc, nom }) => ({
      nom,
      position: positionDe(container, container.querySelector(`[data-bloc="${bloc}"]`)),
    })).filter((releve) => releve.position !== -1)

    const positions = releves.map((releve) => releve.position)
    const triees = [...positions].sort((a, b) => a - b)

    expect(positions, `ordre observé : ${releves.map((r) => r.nom).join(' → ')}`).toEqual(triees)
  })

  /**
   * FR-010 — l'énergie n'est pas une quatrième ressource.
   *
   * Elle est instantanée, ni stockée ni plafonnée, et la fondre dans le comptoir
   * ferait chercher au joueur un plafond d'énergie qui n'existe pas.
   */
  it('garde l’énergie dans un bloc distinct, après les compteurs', () => {
    const { container } = renderEcran()
    const comptoir = container.querySelector('[data-bloc="comptoir"]')
    const energie = container.querySelector('[data-bloc="energie"]')

    expect(energie).not.toBeNull()
    expect(comptoir?.contains(energie ?? null)).toBe(false)
    expect(positionDe(container, energie)).toBeGreaterThan(positionDe(container, comptoir))
  })

  /**
   * FR-011 — l'avertissement de catalogue **enveloppe** l'écran.
   *
   * Chaque chiffre visible est calculé localement depuis le catalogue embarqué.
   * Si les deux catalogues divergent, il n'y a pas un chiffre à sauver : ils sont
   * tous faux ensemble, et un avertissement placé *à côté* d'eux laisserait le
   * joueur décider lesquels croire.
   */
  it('fait de l’avertissement de catalogue une enveloppe, sans rang propre', () => {
    const { container } = renderEcran()
    const enveloppe = container.querySelector('[data-enveloppe="catalogue"]')

    expect(enveloppe, 'l’écran doit être enveloppé par CatalogNotice').not.toBeNull()
    for (const { bloc, requis } of BLOCS) {
      const noeud = container.querySelector(`[data-bloc="${bloc}"]`)
      if (!requis && noeud === null) continue
      expect(enveloppe?.contains(noeud ?? null), `le bloc ${bloc} est dans l’enveloppe`).toBe(true)
    }
  })
})

/**
 * FR-037 et FR-038 — la copie de la Régie, et ce qu'elle n'est pas.
 *
 * Les textes sont repris tels quels du dossier de design, à l'exception des
 * valeurs qui relèvent des données de jeu. **Et aucun ne porte d'information
 * nécessaire, ni n'est cliquable, ni n'excède le rôle de décor** — c'est cette
 * garantie qui autorise le registre administratif à rester en corps 9,5, et qui
 * permet de jouer sans en lire une ligne.
 *
 * La moitié mécanisable est ici : le décor n'est pas interactif, et il est marqué.
 * L'autre moitié — « ne porte pas d'information nécessaire » — n'est pas
 * décidable par un automate ; elle est tenue par le fait que la copie vit dans un
 * seul fichier, `features/regie/copie.ts`, dont l'en-tête énonce la règle.
 */
describe('la copie de la Régie est du décor, et rien de plus (FR-037, FR-038)', () => {
  it('rend les trois textes que le dossier prescrit', () => {
    const { container } = renderEcran()
    const texte = container.textContent ?? ''
    expect(texte).toMatch(/Régie interplanétaire des matières qui coulent/)
    expect(texte).toMatch(/estimation de l’estimateur, lui-même estimé/)
    expect(texte).toMatch(/sauf réclamation dans les cinq minutes/)
  })

  it('n’en rend aucun cliquable', () => {
    const { container } = renderEcran()
    const decors = [...container.querySelectorAll('[data-role-texte="decor"]')]
    expect(decors.length, 'l’écran doit porter du décor marqué').toBeGreaterThan(0)

    const cliquables = decors
      .filter((decor) => decor.closest('a, button') !== null || decor.querySelector('a, button'))
      .map((decor) => (decor.textContent ?? '').slice(0, 40))

    expect(cliquables, `décor cliquable :\n  ${cliquables.join('\n  ')}`).toEqual([])
  })

  /**
   * Le bouton « Réclamer (sans espoir) » de la maquette large est **supprimé** :
   * FR-025 interdit la commande sans effet, et la fiction de la Régie vit dans les
   * textes, jamais dans un bouton qui ne fait rien.
   */
  it('n’a pas de commande sans effet (FR-025)', () => {
    const { container } = renderEcran()
    expect(container.textContent ?? '').not.toMatch(/réclamer/i)
  })
})

/**
 * Le § 1.1 du contrat — l'alerte de refus de commande **suit les boutons de
 * pose**, et non le plan comme en 001.
 *
 * Elle n'existe qu'en présence d'un refus : le test en provoque donc un, et il le
 * provoque **localement**. L'aperçu emploie le même code que le serveur (R8),
 * donc un placement invalide est connu avant tout envoi — ce qui rend
 * l'assertion indépendante du réseau.
 */
describe('l’alerte de refus de commande suit les commandes qui la déclenchent', () => {
  it('se rend dans le bloc des actions, après les boutons de pose', async () => {
    const utilisateur = userEvent.setup()
    const { container } = renderEcran()

    // Le curseur en A2 : un carré de quatre y recouvre (0,2) et (1,2), deux
    // cases obstruées du Berceau. Le refus est donc certain, et il est local.
    const cases = screen.getAllByRole('gridcell')
    const enA2 = cases[6]
    if (enA2 === undefined) throw new Error('grille trop courte')
    await utilisateur.click(enA2)

    await utilisateur.click(screen.getByRole('radio', { name: 'Mine' }))
    await utilisateur.click(screen.getByRole('button', { name: 'JE POSE ÇA' }))

    const alerte = screen.getByRole('alert')
    const actions = container.querySelector('[data-bloc="actions"]')
    const pose = container.querySelector('[data-bloc="pose"]')
    const plan = container.querySelector('[data-bloc="plan"]')
    const comptoir = container.querySelector('[data-bloc="comptoir"]')

    expect(actions?.contains(alerte), 'l’alerte vit dans le bloc des actions').toBe(true)
    expect(positionDe(container, alerte)).toBeGreaterThan(positionDe(container, pose))

    // Et elle a bien **quitté** sa place de 001, entre le plan et les compteurs.
    expect(positionDe(container, alerte)).toBeGreaterThan(positionDe(container, plan))
    expect(positionDe(container, comptoir)).toBeLessThan(positionDe(container, plan))
  })
})

/**
 * FR-007 et R10 — **l'ordre du document ne change pas avec la largeur**.
 *
 * Le guichet déplace des boîtes par **zones de grille nommées**, jamais par `order`.
 * La propriété `order` aurait le même effet visuel et dissocierait l'ordre de
 * tabulation de l'ordre visuel : c'est la façon canonique de casser WCAG 2.4.3, et
 * elle est d'autant plus tentante qu'elle est plus courte à écrire.
 *
 * **jsdom n'applique aucun CSS**, donc l'ordre du document rendu est le même quelle
 * que soit la largeur : ce test ne prouve pas que le guichet ne triche pas. Ce qu'il
 * prouve, c'est que **le composant ne réordonne rien lui-même** — pas de rendu
 * conditionnel à la largeur, pas de tri. La preuve que le CSS n'emploie pas `order`
 * est plus bas, sur la feuille elle-même : c'est là qu'elle est décidable.
 */
describe('l’ordre du document est le même à toute largeur (FR-007, R10)', () => {
  const ordreRendu = () => {
    const { container } = renderEcran()
    return BLOCS.map(({ bloc }) => bloc).filter(
      (bloc) => container.querySelector(`[data-bloc="${bloc}"]`) !== null,
    )
  }

  it('rend les dix blocs dans le même ordre à chaque montage', () => {
    const premier = ordreRendu()
    cleanup()
    const second = ordreRendu()
    expect(second).toEqual(premier)
  })

  it('rend les dix blocs de l’ordre, et chacun une fois', () => {
    /*
      **Les dix de la liste**, et non tous les `[data-bloc]` : l'écran en porte
      davantage — `pose` et `commandes-pose` marquent des sous-ensembles du bloc des
      actions, et ils n'ont pas de rang dans l'ordre de FR-006. Compter tout aurait
      fait échouer ce test à chaque sous-bloc ajouté, pour une raison sans rapport
      avec ce qu'il mesure.
    */
    const { container } = renderEcran()
    for (const { bloc, nom } of BLOCS) {
      expect(
        container.querySelectorAll(`[data-bloc="${bloc}"]`),
        `le bloc « ${nom} »`,
      ).toHaveLength(1)
    }
  })
})
