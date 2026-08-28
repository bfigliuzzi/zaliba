import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Rature } from '../../../src/features/regie/Rature.js'

/**
 * Le balisage de la rature (§ 5 du contrat d'interface, INV-R1 à INV-R5).
 *
 * **C'est la moitié mécanisable de SC-007**, et l'assertion centrale est celle-ci :
 * le nom accessible calculé du bloc ne doit **jamais** contenir les deux valeurs
 * collées. L'autre moitié — ce qu'une synthèse vocale prononce réellement — est la
 * recette du quickstart § 7, conduite à la main, et son verdict se consigne.
 *
 * **Ce qui est mesuré : le texte atteignable**, c'est-à-dire le contenu du bloc
 * privé de tout ce qui vit sous un `aria-hidden="true"`. C'est ce qu'un lecteur
 * d'écran énonce en parcourant un paragraphe, et c'est exactement là que
 * « niveau 2 3 » apparaîtrait si le masquage était incomplet.
 *
 * **Et non le nom accessible calculé par une bibliothèque.** L'obtenir demanderait
 * `dom-accessibility-api`, qui n'est pas une dépendance déclarée du client :
 * l'importer reposerait sur le hissage de pnpm, et 002 n'ajoute aucune dépendance
 * qu'aucune exigence ne réclame (principe V). Le bloc de rature n'a d'ailleurs
 * **aucun rôle** — c'est R13 —, donc il n'a pas de nom accessible au sens strict : ce
 * qui le concerne est son contenu lu, et c'est ce qu'on mesure.
 *
 * **Ce qui reste hors de portée d'un automate**, et qui est dit plutôt que maquillé :
 * ce qu'une synthèse vocale prononce réellement. C'est la recette du quickstart § 7,
 * conduite à VoiceOver puis NVDA, et son verdict se consigne (T105a).
 */

afterEach(cleanup)

const rendre = (ancienne: number | null = 2) =>
  render(<Rature etiquette="niveau" courante={3} ancienne={ancienne} />)

/**
 * Le texte que les technologies d'assistance atteignent réellement.
 *
 * Les **nœuds de texte**, et non les éléments : parcourir les éléments compterait
 * chaque texte autant de fois qu'il a d'ancêtres, et l'assertion « jamais 2 puis 3 »
 * porterait alors sur une chaîne où tout voisine tout.
 */
function texteAtteignable(): string {
  const bloc = document.querySelector('[data-rature]')
  if (bloc === null) throw new Error('aucun bloc de rature rendu')

  const morceaux: string[] = []
  const parcours = document.createTreeWalker(bloc, NodeFilter.SHOW_TEXT, {
    acceptNode: (noeud) =>
      noeud.parentElement?.closest('[aria-hidden="true"]') === null
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  })

  let noeud = parcours.nextNode()
  while (noeud !== null) {
    morceaux.push(noeud.textContent ?? '')
    noeud = parcours.nextNode()
  }
  return morceaux.join('')
}

describe('le visuel rayé est absent de l’arbre d’accessibilité (INV-R1)', () => {
  it('masque **entièrement** le visuel, non le seul texte rayé', () => {
    const { container } = rendre()
    const rature = container.querySelector('.rature')
    expect(rature, 'le visuel rayé').not.toBeNull()
    expect(
      rature?.closest('[aria-hidden="true"]'),
      'le visuel rayé doit vivre dans un arbre masqué',
    ).not.toBeNull()
  })

  it('masque aussi l’étiquette et la valeur courante du visuel', () => {
    const { container } = rendre()
    const masque = container.querySelector('[aria-hidden="true"]')
    expect(masque?.textContent).toMatch(/niveau/)
    expect(masque?.textContent).toMatch(/2/)
    expect(masque?.textContent).toMatch(/3/)
  })
})

/**
 * **L'assertion qui porte SC-007.** Les deux valeurs ne doivent jamais se retrouver
 * collées dans ce qui est lu — « niveau 2 3 » est une valeur *fausse*, pas une gêne.
 */
describe('rien de ce qui est lu ne colle les deux valeurs (SC-007)', () => {
  it('n’énonce jamais « 2 3 »', () => {
    rendre()
    expect(texteAtteignable()).not.toMatch(/2\s+3/)
    // Et le bloc entier, texte masqué compris, **contient** bien les deux valeurs :
    // ce qui les sépare est le masquage, non leur absence. Sans cette seconde
    // assertion, un composant qui n'afficherait rien passerait la première.
    expect(document.querySelector('[data-rature]')?.textContent).toMatch(/2/)
    expect(document.querySelector('[data-rature]')?.textContent).toMatch(/3/)
  })

  it('énonce une phrase explicite qui porte les deux valeurs (INV-R2)', () => {
    rendre()
    expect(screen.getByText('Niveau 3, anciennement niveau 2.')).toBeDefined()
  })

  it('capitalise l’étiquette de la phrase — c’en est le début', () => {
    rendre()
    expect(texteAtteignable()).toMatch(/Niveau 3, anciennement niveau 2\./)
  })

  it('n’énonce la phrase qu’une fois', () => {
    rendre()
    expect(screen.getAllByText('Niveau 3, anciennement niveau 2.')).toHaveLength(1)
  })
})

/**
 * INV-R3 — **`aria-label` n'est jamais employé pour porter la phrase.**
 *
 * La spécification ARIA l'interdit sur les rôles `paragraph` et `generic` ; les
 * technologies d'assistance l'ignorent, et le texte rayé redevient du contenu lu.
 * La porte de non-régression le vérifie sur toute la source ; ici, sur ce composant.
 */
describe('aucun aria-label sur un élément sans rôle (INV-R3)', () => {
  it('n’en porte aucun', () => {
    const { container } = rendre()
    expect(container.querySelectorAll('[aria-label]')).toHaveLength(0)
  })

  it('ne porte pas non plus d’aria-labelledby de substitution', () => {
    const { container } = rendre()
    expect(container.querySelectorAll('[aria-labelledby]')).toHaveLength(0)
  })
})

describe('sans changement, aucune rature n’apparaît (US5-AC2)', () => {
  it('ne rend ni le visuel rayé ni la phrase explicite', () => {
    const { container } = rendre(null)
    expect(container.querySelector('.rature')).toBeNull()
    expect(container.querySelector('.sr-only')).toBeNull()
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('rend la valeur normalement, donc lisible normalement', () => {
    const { container } = rendre(null)
    expect(container.textContent).toBe('niveau 3')
  })

  it('n’énonce aucune ancienne valeur', () => {
    rendre(null)
    expect(texteAtteignable()).not.toMatch(/anciennement/)
  })
})

/**
 * FR-026a — **aucune minuterie ne retire une rature**.
 *
 * L'horloge de test est avancée bien au-delà de toute durée d'affichage plausible :
 * dix minutes, là où le dossier suggérait « quelques secondes ». La rature est
 * toujours là. Les deux seules sorties sont le changement suivant de la même valeur
 * et le démontage de l'écran.
 *
 * Une correction qui s'efface d'elle-même **se manque** — le joueur qui regardait
 * ailleurs n'apprend jamais ce qui a bougé —, et une disparition programmée serait un
 * second mouvement là où FR-005 n'en admet qu'un.
 */
describe('aucune minuterie ne l’efface (FR-026a)', () => {
  it('subsiste après dix minutes d’horloge', () => {
    vi.useFakeTimers()
    try {
      rendre()
      act(() => {
        vi.advanceTimersByTime(600_000)
      })
      expect(screen.getByText('Niveau 3, anciennement niveau 2.')).toBeDefined()
      expect(document.querySelector('.rature')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ne pose aucune minuterie du tout', () => {
    vi.useFakeTimers()
    try {
      rendre()
      expect(vi.getTimerCount(), 'une minuterie posée ici serait une disparition programmée').toBe(
        0,
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * INV-R5 — **deux ratures simultanées portent chacune leur phrase**, dans l'ordre du
 * document.
 *
 * Aucune agrégation : une phrase qui énoncerait deux corrections ensemble obligerait
 * à les ordonner, et l'ordre du document est déjà cet ordre.
 */
describe('deux ratures simultanées (INV-R5)', () => {
  function deux() {
    return render(
      <>
        <Rature etiquette="niveau" courante={3} ancienne={2} />
        <Rature etiquette="débit" courante={540} ancienne={480} />
      </>,
    )
  }

  it('rend deux blocs, chacun actif', () => {
    const { container } = deux()
    expect(container.querySelectorAll('[data-rature="active"]')).toHaveLength(2)
  })

  it('porte deux phrases distinctes', () => {
    deux()
    expect(screen.getByText('Niveau 3, anciennement niveau 2.')).toBeDefined()
    expect(screen.getByText('Débit 540, anciennement débit 480.')).toBeDefined()
  })

  it('n’agrège pas les deux corrections en une phrase', () => {
    const { container } = deux()
    const phrases = [...container.querySelectorAll('.sr-only')].map((une) => une.textContent ?? '')
    expect(phrases).toHaveLength(2)
    for (const phrase of phrases) {
      expect(phrase.match(/anciennement/g)?.length, 'une correction par phrase').toBe(1)
    }
  })

  it('les restitue dans l’ordre du document', () => {
    const { container } = deux()
    const phrases = [...container.querySelectorAll('.sr-only')].map((une) => une.textContent ?? '')
    expect(phrases[0]).toMatch(/^Niveau/)
    expect(phrases[1]).toMatch(/^Débit/)
  })
})
