import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BarreDActions } from '../../../src/features/regie/BarreDActions.js'

/**
 * La barre d'actions (FR-020, FR-025, FR-031).
 *
 * **FR-020 exige les trois commandes de pose au clavier *et* par un bouton
 * visible.** 001 avait le clavier — `R` pour pivoter, `Entrée` pour poser — et
 * aucun bouton ; il n'avait aucune annulation du tout. Un joueur au pointeur ne
 * pouvait donc ni pivoter ni annuler, et un joueur au clavier devait choisir un
 * autre type de bâtiment pour se défaire d'une pose armée par erreur.
 *
 * **FR-025 : tout élément interactif produit un effet réel.** Le bouton
 * « Réclamer (sans espoir) » de la maquette large est supprimé — la fiction de la
 * Régie vit dans les textes et le décor, jamais dans une commande qui ne fait rien.
 * Ce fichier vérifie l'inverse de la fiction : chaque bouton **appelle** ce qu'il
 * annonce.
 *
 * **FR-031 : 48 px de hauteur effective.** jsdom ne dispose rien — la mesure de la
 * boîte rendue est au parcours (T053, T081). Ce qui est vérifié ici est la
 * *déclaration* : la classe qui porte le plancher, et l'absence de style en ligne
 * qui la contredirait.
 */

afterEach(cleanup)

function rendre(patch: Partial<Parameters<typeof BarreDActions>[0]> = {}) {
  const props = {
    poseArmee: true,
    onPoser: vi.fn(),
    onPivoter: vi.fn(),
    onAnnuler: vi.fn(),
    ...patch,
  }
  return { ...render(<BarreDActions {...props} />), props }
}

const COMMANDES = [
  ['JE POSE ÇA', 'onPoser'],
  ['Pivoter', 'onPivoter'],
  ['Annuler', 'onAnnuler'],
] as const

describe('les trois commandes de pose existent et portent les libellés du contrat', () => {
  it.each(COMMANDES)('rend le bouton « %s »', (libelle) => {
    rendre()
    expect(screen.getByRole('button', { name: libelle })).toBeDefined()
  })

  it('n’en rend aucun autre', () => {
    rendre()
    expect(screen.getAllByRole('button')).toHaveLength(COMMANDES.length)
  })

  /** Le bouton supprimé de la maquette large : FR-025 interdit l'effet nul. */
  it('ne rend pas « Réclamer (sans espoir) »', () => {
    const { container } = rendre()
    expect(container.textContent ?? '').not.toMatch(/réclamer/i)
  })
})

describe('chaque bouton produit un effet réel (FR-025)', () => {
  it.each(COMMANDES)('« %s » appelle %s', async (libelle, rappel) => {
    const utilisateur = userEvent.setup()
    const { props } = rendre()

    await utilisateur.click(screen.getByRole('button', { name: libelle }))
    expect(props[rappel]).toHaveBeenCalledTimes(1)
  })

  it('les appelle au clavier comme au pointeur', async () => {
    const utilisateur = userEvent.setup()
    const { props } = rendre()

    screen.getByRole('button', { name: 'Pivoter' }).focus()
    await utilisateur.keyboard('{Enter}')
    expect(props.onPivoter).toHaveBeenCalled()
  })
})

/**
 * **Sans pose armée, pivoter et annuler n'ont rien à faire.**
 *
 * Ils sont donc désactivés, et non masqués : un bouton qui disparaît fait sauter la
 * mise en page et déplace les autres sous le doigt du joueur au moment précis où il
 * visait. Désactivé, il garde sa place et dit pourquoi il ne répond pas.
 *
 * `disabled` plutôt que `aria-disabled` : la commande n'a réellement aucun effet à
 * produire, et un bouton que la tabulation atteint pour ne rien faire est une
 * commande sans effet — ce que FR-025 refuse.
 */
describe('sans pose armée, les commandes qui n’ont rien à faire sont désactivées', () => {
  /**
   * La propriété native plutôt qu'un matcher de bibliothèque : `jest-dom` n'est pas
   * installé, et 002 n'ajoute aucune dépendance qu'aucune exigence ne réclame
   * (principe V). `HTMLButtonElement.disabled` dit exactement la même chose.
   */
  const bouton = (nom: string): HTMLButtonElement =>
    screen.getByRole('button', { name: nom }) as HTMLButtonElement

  it('désactive Pivoter et Annuler', () => {
    rendre({ poseArmee: false })
    expect(bouton('Pivoter').disabled).toBe(true)
    expect(bouton('Annuler').disabled).toBe(true)
  })

  it('laisse Poser actif — il reste la commande principale', () => {
    rendre({ poseArmee: false })
    expect(bouton('JE POSE ÇA').disabled).toBe(false)
  })

  it('garde les trois boutons en place', () => {
    rendre({ poseArmee: false })
    expect(screen.getAllByRole('button')).toHaveLength(COMMANDES.length)
  })

  it('n’appelle rien quand elles sont désactivées', async () => {
    const utilisateur = userEvent.setup()
    const { props } = rendre({ poseArmee: false })

    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(props.onAnnuler).not.toHaveBeenCalled()
  })
})

/**
 * FR-031 — la cible. Ce qui est vérifiable **sans navigateur** est la déclaration :
 * chaque bouton porte la classe qui applique le plancher de 48 px, et aucun style
 * en ligne ne vient la contredire. La boîte **rendue** est mesurée par le parcours.
 */
describe('les cibles portent le plancher déclaré (FR-031)', () => {
  it('donne à chaque bouton la classe de commande', () => {
    rendre()
    for (const [libelle] of COMMANDES) {
      expect(
        screen.getByRole('button', { name: libelle }).classList.contains('commande'),
        `le bouton « ${libelle} »`,
      ).toBe(true)
    }
  })

  it('ne contredit le plancher par aucun style en ligne', () => {
    rendre()
    for (const bouton of screen.getAllByRole('button')) {
      expect(bouton.getAttribute('style')).toBeNull()
    }
  })
})

/**
 * FR-005 — **aucun mouvement au survol ni à la prise de focus**.
 *
 * La règle est tenue par l'**absence** de `transform` dans les feuilles de la
 * Régie, et mesurée sur la boîte rendue par le parcours (T053a). Ce qui est
 * vérifiable ici est qu'aucune rotation n'est appliquée à ces boutons : ils portent
 * du texte de commande, et FR-032 interdit la rotation d'un texte porteur
 * d'information autant que celle déclenchée par le focus.
 */
describe('les commandes ne tournent pas (FR-005, FR-032)', () => {
  it('ne porte aucune classe de rotation', () => {
    rendre()
    for (const bouton of screen.getAllByRole('button')) {
      expect(bouton.className).not.toMatch(/rotation|penche|tampon|etiquette/)
    }
  })
})

/**
 * **La commande de pose, pendant qu'elle voyage** (T057, § 6 du contrat).
 *
 * Ces trois attentes viennent de `build-panel.test.tsx` : le bouton de confirmation
 * a quitté le panneau de construction pour venir ici, parce que le § 6 du contrat
 * nomme **une** commande de pose et conclut « aucune autre commande n'existe ».
 *
 * Ce qu'elles portent ne change pas d'un fichier à l'autre : la commande est
 * explicite, elle ne part qu'une fois, et son état est annoncé à qui écoute la page.
 */
describe('la commande de pose annonce qu’elle est en vol', () => {
  const bouton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: /je pose ça|ça part/i }) as HTMLButtonElement

  it('rapporte la confirmation une seule fois', async () => {
    const utilisateur = userEvent.setup()
    const { props } = rendre()

    await utilisateur.click(bouton())
    expect(props.onPoser).toHaveBeenCalledTimes(1)
  })

  /**
   * Pendant que la commande est en vol, le bouton est désactivé **et** annoncé
   * occupé. Le désactiver seul suffirait à la souris ; `aria-busy` est ce qui le dit
   * à qui écoute la page.
   */
  it('se désactive et s’annonce occupé pendant l’envoi', () => {
    rendre({ enVol: true })
    expect(bouton().disabled).toBe(true)
    expect(bouton().getAttribute('aria-busy')).toBe('true')
  })

  it('change de libellé pendant l’envoi', () => {
    rendre({ enVol: true })
    expect(bouton().textContent).toBe('ÇA PART…')
  })

  it('n’envoie rien quand une commande est déjà en vol', async () => {
    const utilisateur = userEvent.setup()
    const { props } = rendre({ enVol: true })

    await utilisateur.click(bouton())
    expect(props.onPoser).not.toHaveBeenCalled()
  })

  it('n’annonce rien d’occupé au repos', () => {
    rendre()
    expect(bouton().getAttribute('aria-busy')).toBe('false')
    expect(bouton().disabled).toBe(false)
  })
})
