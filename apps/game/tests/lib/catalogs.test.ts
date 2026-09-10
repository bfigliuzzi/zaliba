import { describe, expect, it } from 'vitest'
import { resolvedCatalogs } from '../../src/lib/catalogs.js'

/**
 * **Le seul endroit du client qui résout un catalogue** (G11).
 *
 * Quinze points d'appel du client ont besoin d'un catalogue résolu ; une seule
 * décision le produit. Le motif n'est pas l'économie de lignes : c'est qu'une
 * seconde résolution, ailleurs, pourrait employer une autre longueur — et deux
 * chiffres justes séparément seraient incohérents ensemble, sur le même écran,
 * sans que le joueur puisse savoir lequel croire.
 */

const CANONICAL = { num: 10, den: 1 } as const

describe('une longueur reçue donne un catalogue résolu', () => {
  it('résout aux durées et aux taux du serveur', () => {
    const resolved = resolvedCatalogs(CANONICAL)
    expect(resolved).not.toBeNull()
    expect(resolved?.buildings.mine.buildDuration.base).toBe(120)
    expect(resolved?.buildings.mine.production?.base).toBe(15)
    expect(resolved?.gong).toEqual(CANONICAL)
  })

  it('suit la longueur, quelle qu’elle soit', () => {
    const fast = resolvedCatalogs({ num: 1, den: 6 })
    expect(fast?.buildings.mine.buildDuration.base).toBe(2)
    expect(fast?.buildings.mine.production?.base).toBe(900)
  })
})

/**
 * **Une longueur absente ne donne aucun chiffre dérivé** (FR-013, G9).
 *
 * Et surtout : **pas de repli sur le gong canonique**. Le repli afficherait des
 * chiffres d'apparence exacte pour un monde peut-être différent — la faute que
 * la vérification de version a déjà nommée : croire à l'accord sur la foi d'une
 * absence fait afficher des chiffres faux précisément quand on ne sait rien.
 */
describe('une longueur absente ne donne rien', () => {
  it.each([
    ['absente', undefined],
    ['nulle', null],
  ])('rend null pour une longueur %s', (_label, gong) => {
    expect(resolvedCatalogs(gong)).toBeNull()
  })

  it('ne se replie pas sur le gong canonique', () => {
    // Si le repli existait, ce test rendrait un catalogue de 120 secondes.
    expect(resolvedCatalogs(undefined)).toBeNull()
  })
})

/**
 * **La résolution est mémoïsée sur la longueur.**
 *
 * Un catalogue résolu à chaque rendu rendrait les aperçus quadratiques en
 * nombre de cases — trente-six cases, chacune demandant un aperçu, chacun
 * reconstruisant les cinq types et les cinq obstacles — sans qu'aucun test de
 * correction ne s'en aperçoive. C'est le genre de coût qui ne se voit qu'au
 * profilage, et seulement une fois la grille pleine.
 */
describe('la résolution est mémoïsée sur { num, den }', () => {
  it('rend la même instance pour la même longueur', () => {
    expect(resolvedCatalogs(CANONICAL)).toBe(resolvedCatalogs(CANONICAL))
  })

  it('la rend aussi pour une longueur égale mais distincte en mémoire', () => {
    // Le client reçoit un objet neuf à chaque réponse : mémoïser sur l'identité
    // ne mémoïserait rien du tout.
    expect(resolvedCatalogs({ num: 10, den: 1 })).toBe(resolvedCatalogs({ num: 10, den: 1 }))
  })

  it('rend une instance différente pour une longueur différente', () => {
    expect(resolvedCatalogs({ num: 1, den: 2 })).not.toBe(resolvedCatalogs(CANONICAL))
  })
})

/**
 * **Le changement se propage en une requête** (SC-004).
 *
 * C'est la promesse d'origine de la tranche, celle qui a fait préférer le
 * transport à la configuration : changer `GONG_SECONDS` et redémarrer le
 * **serveur seul** suffit, sans rechargement ni recompilation du client. Le
 * critère n'avait jusqu'ici de preuve qu'en manipulation manuelle.
 */
describe('un changement de longueur se propage en une requête (SC-004)', () => {
  it('emploie la nouvelle longueur dès l’instantané suivant', () => {
    // Deux réponses successives, sans rien remonter entre les deux.
    const first = resolvedCatalogs({ num: 10, den: 1 })
    const second = resolvedCatalogs({ num: 1, den: 2 })

    expect(first?.buildings.mine.buildDuration.base).toBe(120)
    expect(second?.buildings.mine.buildDuration.base).toBe(6)
    expect(second?.gong).toEqual({ num: 1, den: 2 })
  })

  it('revient à l’ancienne longueur si le serveur y revient', () => {
    resolvedCatalogs({ num: 1, den: 2 })
    expect(resolvedCatalogs({ num: 10, den: 1 })?.buildings.mine.buildDuration.base).toBe(120)
  })

  /**
   * Une longueur que le serveur ne saurait pas appliquer ne doit pas faire
   * tomber le client : il n'affiche alors aucun chiffre dérivé, comme pour une
   * absence. Le serveur, lui, refuse de démarrer sur une telle longueur — mais
   * le client ne peut pas s'appuyer là-dessus pour lever.
   */
  it('rend null plutôt que de lever sur une longueur inutilisable', () => {
    expect(resolvedCatalogs({ num: 7, den: 1 })).toBeNull()
  })
})
