import { describe, expect, it } from 'vitest'
import { buildApi } from '../src/app.js'

/**
 * **Le serveur refuse de démarrer sur une longueur inutilisable** (FR-006,
 * SC-007).
 *
 * Le refus vit dans `buildApi` et non dans `main.ts`, et c'est la décision qui
 * porte cette exigence : `main.ts` n'est monté par aucun test, donc un refus qui
 * n'y vivrait que là ne serait éprouvé nulle part. Le repli
 * `gong ?? GONG_CANONICAL` d'abord envisagé est écarté pour la même raison — il
 * placerait un défaut silencieux au cœur exact du composant dont FR-007 exige
 * qu'il refuse.
 *
 * Le message **nomme la ressource et le type fautifs**. Un message générique
 * laisserait l'exploitant deviner quelle longueur essayer ensuite.
 */

/** Des dépendances minimales : le refus doit tomber avant tout usage. */
const STUB = {
  sql: {} as never,
  authenticator: {} as never,
}

describe('buildApi refuse une longueur dont un taux ne se résout pas en entier', () => {
  it('lève plutôt que de démarrer', () => {
    // Sept secondes ne divisent ni 150, ni 80, ni 40 grains par gong.
    expect(() => buildApi({ ...STUB, gong: { num: 7, den: 1 } })).toThrow(RangeError)
  })

  it('nomme la ressource et le type fautifs', () => {
    let message = ''
    try {
      buildApi({ ...STUB, gong: { num: 7, den: 1 } })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('mine')
    expect(message).toContain('camelote')
  })

  it('refuse une longueur qui n’est pas une fraction d’entiers positifs', () => {
    expect(() => buildApi({ ...STUB, gong: { num: 0, den: 1 } })).toThrow(RangeError)
    expect(() => buildApi({ ...STUB, gong: { num: 1, den: 0 } })).toThrow(RangeError)
    expect(() => buildApi({ ...STUB, gong: { num: -1, den: 2 } })).toThrow(RangeError)
  })

  it('démarre sur une longueur utilisable', () => {
    expect(() => buildApi({ ...STUB, gong: { num: 10, den: 1 } })).not.toThrow()
    expect(() => buildApi({ ...STUB, gong: { num: 1, den: 2 } })).not.toThrow()
  })

  /**
   * **La longueur est obligatoire, sans valeur par défaut.** C'est ce qui fait
   * que l'oubli est un refus de démarrage plutôt qu'un serveur qui bat au
   * rythme canonique sans que personne l'ait décidé.
   */
  it('exige une longueur — le type ne laisse pas l’omettre', () => {
    // @ts-expect-error — `gong` est obligatoire dans ApiDependencies.
    expect(() => buildApi({ ...STUB })).toThrow()
  })
})
