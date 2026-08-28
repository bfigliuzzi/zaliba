import { cleanup, render, screen, within } from '@testing-library/react'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { DEFAULT_CATALOGS, instant, projectPlanet } from '@zaliba/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import { ResourcePanel } from '../../../src/features/resources/ResourcePanel.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * Le panneau de ressources.
 *
 * Quatre grandeurs par ressource, et aucune n'est décorative :
 *
 * - la **quantité** détenue ;
 * - le **plafond**, sans lequel la saturation est une surprise ;
 * - le **temps restant avant saturation** au rythme courant (FR-027), qui est
 *   la seule information disant *quand* agir ;
 * - la **quantité perdue cumulée** (FR-026), qui dit combien a déjà coûté le
 *   fait de ne pas avoir agi. C'est elle qui rend un entrepôt désirable pour une
 *   raison chiffrée plutôt que par intuition.
 */

afterEach(cleanup)

const CATALOGS = DEFAULT_CATALOGS
const payload = PlanetSnapshotV1.parse(rawFresh)

function renderPanel(elapsed = 0) {
  const snapshot = snapshotFromContract(payload, CATALOGS)
  const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt + elapsed))
  return render(<ResourcePanel holdings={state.holdings} at={state.at} />)
}

function group(name: RegExp) {
  return within(screen.getByRole('group', { name }))
}

describe('chaque ressource a son bloc', () => {
  it.each([/camelote/i, /jus/i, /bave d’étoiles/i])('expose un bloc pour %s', (name) => {
    renderPanel()
    expect(screen.getByRole('group', { name })).toBeDefined()
  })

  it('n’expose que les trois ressources du jeu', () => {
    renderPanel()
    expect(screen.getAllByRole('group')).toHaveLength(3)
  })
})

describe('les quatre grandeurs sont affichées', () => {
  it('affiche la quantité détenue en unités', () => {
    renderPanel()
    // 1 440 000 grains = 400,00 unités exactement.
    expect(group(/camelote/i).getByText('400,00')).toBeDefined()
  })

  it('affiche le plafond en unités', () => {
    renderPanel()
    expect(group(/camelote/i).getByText(/5[\s ]?000/)).toBeDefined()
  })

  it('affiche le temps restant avant saturation (FR-027)', () => {
    renderPanel()
    expect(group(/camelote/i).getByText(/saturation/i)).toBeDefined()
  })

  it('affiche la perte cumulée (FR-026)', () => {
    renderPanel()
    expect(group(/camelote/i).getByText(/perdu/i)).toBeDefined()
  })
})

describe('la saturation est annoncée pour ce qu’elle est', () => {
  /**
   * `null` n'est pas une absence d'information : il dit au joueur qu'il **perd
   * déjà**. L'afficher comme un tiret muet gaspillerait le seul moment où
   * l'interface a quelque chose d'utile à dire.
   */
  it('dit que la ressource sature déjà quand c’est le cas', () => {
    renderPanel(21 * 86_400)
    expect(group(/camelote/i).getByText(/saturée/i)).toBeDefined()
  })

  it('affiche la perte accumulée après trois semaines', () => {
    renderPanel(21 * 86_400)
    // 19 728 000 grains perdus = 5 480 unités.
    expect(group(/camelote/i).getByText(/5[\s ]?480/)).toBeDefined()
  })
})

/**
 * **Depuis combien de temps la saturation dure** (US1/AC5).
 *
 * L'exigence demande les deux moitiés : *combien* s'est perdu — c'était déjà là —
 * et *depuis quand*. La seconde manquait, et elle n'est pas dérivable de la
 * première : `perdu ÷ taux` serait faux dès que le taux a changé depuis. C'est
 * l'instant que le domaine projette ; l'écran n'en fait qu'une durée.
 *
 * La Camelote part de 400 unités, plafonne à 5 000 et croît de 20 par heure : elle
 * sature au bout de 230 heures exactement. Toutes les durées ci-dessous se
 * comptent depuis cet instant-là.
 */
describe('depuis combien de temps la saturation dure (US1/AC5)', () => {
  /** (5 000 − 400) ÷ 20 = 230 heures. */
  const saturationDelay = 230 * 3_600

  it('ne dit rien tant que la ressource n’est pas saturée', () => {
    renderPanel(saturationDelay - 3_600)
    const dd = group(/camelote/i)
      .getByText(/dans /i)
      .closest('dd')
    expect(dd?.getAttribute('data-saturated-for')).toBeNull()
  })

  it('annonce la durée en clair dès la saturation acquise', () => {
    renderPanel(saturationDelay + 3 * 86_400)
    expect(group(/camelote/i).getByText(/saturée depuis 3 j/i)).toBeDefined()
  })

  it('publie la durée en secondes, pour qui la mesure', () => {
    renderPanel(saturationDelay + 5 * 3_600)
    const dd = group(/camelote/i)
      .getByText(/saturée depuis/i)
      .closest('dd')
    expect(dd?.getAttribute('data-saturated-for')).toBe(String(5 * 3_600))
    expect(dd?.getAttribute('data-resource')).toBe('camelote')
  })

  /**
   * **La troncature va vers le bas**, à l'inverse du temps *restant*. Une durée
   * écoulée arrondie au-dessus surestimerait le dégât : « saturée depuis 4 j »
   * quand il y en a trois et demi accuse le joueur d'une négligence qu'il n'a pas
   * eue. Le temps restant, lui, s'arrondit vers le haut — annoncer « dans 0 heure »
   * quand il reste cinquante minutes serait faux dans le sens qui coûte cher.
   */
  it('tronque la durée écoulée vers le bas', () => {
    renderPanel(saturationDelay + 3 * 86_400 + 43_200)
    expect(group(/camelote/i).getByText(/saturée depuis 3 j/i)).toBeDefined()
  })

  it('dit « moins d’une minute » à la seconde même de la saturation', () => {
    renderPanel(saturationDelay)
    expect(group(/camelote/i).getByText(/saturée depuis moins d’une minute/i)).toBeDefined()
  })

  /**
   * Une ressource à taux nul ne saturera jamais, et l'écran doit le dire ainsi —
   * pas par une durée écoulée qui n'existe pas.
   */
  it('distingue « jamais » d’une saturation acquise', () => {
    renderPanel()
    expect(group(/jus/i).getByText(/dans /i)).toBeDefined()
  })
})

describe('l’affichage est perceptible sans la couleur (FR-060)', () => {
  it('nomme chaque grandeur en toutes lettres', () => {
    renderPanel()
    const camelote = group(/camelote/i)
    for (const label of [/détenu/i, /plafond/i, /perdu/i, /saturation/i]) {
      expect(camelote.getByText(label)).toBeDefined()
    }
  })

  /**
   * Les compteurs bougent en continu. Une région `polite` les annoncerait à
   * chaque image et rendrait la page inutilisable au lecteur d'écran : les
   * valeurs sont donc lisibles à la demande, et **non** annoncées d'office.
   */
  it('n’annonce pas les compteurs en continu', () => {
    renderPanel()
    const panel = screen.getAllByRole('group')[0]
    expect(panel?.getAttribute('aria-live')).toBeNull()
  })
})

describe('la quantité détenue progresse de façon continue (US1, critère 3)', () => {
  /**
   * Le critère 3 demande une progression **continue**. En unités entières, le
   * chiffre de la Camelote change une fois toutes les trois minutes à vingt
   * unités par heure, celui de la Bave d'étoiles toutes les douze : rien ne
   * bouge sous les yeux du joueur, et le parcours de bout en bout l'a montré en
   * expirant.
   *
   * Deux décimales suffisent — la seconde change environ toutes les 1,8 s à
   * vingt unités par heure. **R1 n'est pas touché** : le grain reste l'unité
   * canonique, et c'est seulement la résolution d'affichage qui augmente.
   */
  it('montre deux décimales sur la quantité détenue', () => {
    renderPanel()
    expect(group(/camelote/i).getByText('400,00')).toBeDefined()
  })

  it('bouge après quelques secondes seulement', () => {
    // La quantité détenue est la seule à porter des décimales : c'est ce qui la
    // désigne sans ambiguïté parmi les quatre grandeurs.
    const held = /^[\d {2}]+,\d{2}$/

    const { unmount } = renderPanel(0)
    const before = group(/camelote/i).getByText(held).textContent
    unmount()

    // Deux secondes : 20 u/h × 2 s = 40 grains, soit 0,011 unité.
    renderPanel(2)
    expect(group(/camelote/i).getByText(held).textContent).not.toBe(before)
  })

  it('garde le plafond et la perte en unités entières', () => {
    renderPanel(21 * 86_400)
    const camelote = group(/camelote/i)
    // Le plafond ne bouge jamais et la perte se compte en milliers : les
    // décimales n'y apporteraient que du bruit.
    expect(camelote.getByText('5 000')).toBeDefined()
    // La perte porte depuis US7 une phrase qui la **situe** : le nombre n'est donc
    // plus le texte entier de sa cellule, et c'est un progrès — un chiffre nu ne
    // disait pas ce qu'il valait.
    expect(camelote.getByText(/^5[\s ]480 —/)).toBeDefined()
  })

  it('reste exact au grain près', () => {
    // 1 440 040 grains = 400,0111… → tronqué à 400,01, jamais arrondi au-dessus :
    // annoncer une ressource qu'on n'a pas ferait refuser une commande que
    // l'écran présentait comme payable.
    renderPanel(2)
    expect(group(/camelote/i).getByText('400,01')).toBeDefined()
  })
})

/**
 * Le plafond, lisible **en grains** dans un attribut.
 *
 * Le texte affiché est formaté pour être lu — séparateurs de milliers compris —
 * et le relire à l'envers pour retrouver un nombre serait fragile autant
 * qu'inutile. Le parcours de bout en bout d'US3 a besoin de comparer deux
 * plafonds pour établir que le déficit d'énergie ne les dégrade pas (FR-023b) :
 * il lui faut le chiffre, pas son apparence.
 */
describe('le plafond est comparable, pas seulement lisible', () => {
  /**
   * *Réécrit par 002.* L'assertion passait par `getByText(…, { selector })`, qui ne
   * compare que les **nœuds de texte directs** d'un élément. Depuis T077, le plafond
   * est enveloppé dans un bloc de rature — il change par saut, un entrepôt le relève
   * d'un coup (FR-029a) —, donc la cellule n'a plus de texte direct et le matcher ne
   * la trouvait plus.
   *
   * L'assertion porte désormais sur la cellule elle-même : son attribut donne les
   * grains, son contenu donne la forme lisible. C'est ce que le test voulait dire.
   */
  it.each(['camelote', 'jus', 'bave-etoiles'])('porte le plafond de %s en grains', (resourceId) => {
    renderPanel()
    const cellule = document.querySelector(`[data-cap][data-resource="${resourceId}"]`)

    expect(cellule, `la cellule du plafond de ${resourceId}`).not.toBeNull()
    expect(cellule?.getAttribute('data-cap')).toMatch(/^\d+$/)
    expect(cellule?.textContent ?? '', 'et sa forme lisible').toMatch(/^\d[\d   ]*$/)
  })

  it('donne exactement le plafond de la projection', () => {
    const snapshot = snapshotFromContract(payload, CATALOGS)
    const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt))
    renderPanel()

    for (const [resourceId, holding] of Object.entries(state.holdings)) {
      const row = document.querySelector(`[data-cap][data-resource="${resourceId}"]`)
      expect(row, `${resourceId} n’expose pas son plafond`).not.toBeNull()
      expect(row?.getAttribute('data-cap')).toBe(String(holding.cap))
    }
  })
})

/**
 * **Le remplissage** — la cinquième grandeur, arrivée avec US7 (T148).
 *
 * La quantité et le plafond sont là depuis US1, et pourtant le joueur devait faire
 * la division lui-même pour répondre à la seule question qui compte : *suis-je
 * près de perdre ?* Un pourcentage y répond d'un coup d'œil, et il le fait pour les
 * trois ressources à la fois — ce qu'aucune paire de nombres à échelles différentes
 * ne permet de comparer.
 */
describe('le remplissage est publié, et non laissé à calculer', () => {
  it.each([/camelote/i, /jus/i, /bave d’étoiles/i])('affiche le remplissage de %s', (name) => {
    renderPanel()
    expect(group(name).getByText(/remplissage/i)).toBeDefined()
  })

  it('donne le pourcentage exact, tronqué vers le bas', () => {
    renderPanel()
    // 1 440 000 sur 18 000 000 grains = 8 % exactement.
    expect(group(/camelote/i).getByText(/8[\s ]*%/)).toBeDefined()
  })

  /**
   * La troncature va vers le bas, comme partout ailleurs : annoncer « 100 % » à
   * 99,7 % dirait au joueur qu'il perd déjà alors qu'il lui reste du temps — et le
   * ferait dépenser dans un entrepôt une seconde trop tôt plutôt qu'une trop tard.
   */
  it('n’annonce 100 % qu’à la saturation réelle', () => {
    renderPanel(21 * 86_400)
    expect(group(/camelote/i).getByText(/100[\s ]*%/)).toBeDefined()
  })

  /**
   * La valeur exacte dans un attribut, comme le plafond : le parcours de bout en
   * bout d'US7 compare deux remplissages pour établir qu'un entrepôt les fait
   * baisser sans rien retirer au stock.
   */
  it('porte le remplissage en millièmes, comparable', () => {
    renderPanel()
    const node = document.querySelector('[data-fill][data-resource="camelote"]')
    expect(node?.getAttribute('data-fill')).toBe('80')
  })
})

/**
 * **La perte cumulée, consultable et située** (FR-026, US7-3).
 *
 * Le nombre nu ne disait pas ce qu'il valait : cinq mille quatre cent quatre-vingts
 * unités perdues sont-elles beaucoup ? La réponse est dans la comparaison avec le
 * plafond — c'est *plus d'une planète pleine* —, et c'est cette phrase qui rend un
 * entrepôt désirable pour une raison chiffrée plutôt que par intuition.
 */
describe('la perte cumulée est située, pas seulement affichée', () => {
  it('reste à zéro tant que rien n’a débordé', () => {
    renderPanel()
    const node = document.querySelector('[data-lost][data-resource="camelote"]')
    expect(node?.getAttribute('data-lost')).toBe('0')
  })

  it('porte la perte en grains, comparable', () => {
    renderPanel(21 * 86_400)
    const node = document.querySelector('[data-lost][data-resource="camelote"]')
    // 19 728 000 grains : le parcours en a besoin en valeur, pas en apparence.
    expect(node?.getAttribute('data-lost')).toBe('19728000')
  })

  it('dit ce que la perte représente une fois qu’il y en a une', () => {
    renderPanel(21 * 86_400)
    // « l'équivalent de N fois votre plafond » : la seule formulation qui donne
    // l'échelle sans demander au joueur de diviser. Le localisateur nomme la phrase
    // en entier — `/plafond/i` seul trouverait aussi l'étiquette « Plafond », et un
    // localisateur qui accepte deux repères n'éprouve ni l'un ni l'autre.
    expect(group(/camelote/i).getByText(/fois votre plafond/i)).toBeDefined()
  })
})
