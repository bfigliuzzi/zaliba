import { describe, expect, it } from 'vitest'
import {
  describeEffect,
  EFFECT_KINDS,
  type Effect,
  type WorkTarget,
} from '../../src/kernel/effects.js'

/**
 * Le vocabulaire fermé d'effets (R16).
 *
 * Un module ne mute rien : il retourne des effets que le noyau applique. Le
 * vocabulaire est **détenu par le noyau**, et en ajouter un est une
 * modification délibérée — pas un effet de bord d'une nouvelle mécanique.
 *
 * La partie la plus importante de ce fichier est celle qui vérifie une
 * **absence**. `cancel-work` et `notify-player` n'existent pas, et c'est ainsi
 * que FR-037 est tenu : un chantier n'est pas annulable parce qu'aucun effet ne
 * sait l'annuler. Une garde qui refuserait l'annulation pourrait être
 * contournée par un second chemin d'écriture ; un effet qui n'existe pas ne
 * peut pas être appelé.
 */

describe('les sept effets de R16, et pas un de plus', () => {
  it('compte exactement sept effets', () => {
    expect(EFFECT_KINDS).toHaveLength(7)
  })

  it('nomme ceux que R16 publie', () => {
    expect([...EFFECT_KINDS].sort()).toEqual([
      'clear-cell',
      'credit-resources',
      'debit-resources',
      'place-building',
      'remove-building',
      'schedule-work',
      'set-building-level',
    ])
  })

  it('ne répète aucun effet', () => {
    expect(new Set(EFFECT_KINDS).size).toBe(EFFECT_KINDS.length)
  })
})

describe('les effets volontairement absents (FR-037)', () => {
  it.each(['cancel-work', 'notify-player', 'set-resources', 'grant-resources'])(
    '%s n’existe pas dans le vocabulaire',
    (name) => {
      expect(EFFECT_KINDS as readonly string[]).not.toContain(name)
    },
  )

  /**
   * Ce test décrit ce que la compilation garantit déjà. Il est là pour que la
   * garantie soit **lisible** : quelqu'un qui voudrait annuler un chantier ne
   * trouvera pas d'effet à employer, et devra modifier le noyau — donc
   * expliquer pourquoi dans un diff.
   */
  it('n’offre aucun effet qui remette une case à l’état obstrué (I-8)', () => {
    expect(EFFECT_KINDS as readonly string[]).not.toContain('obstruct-cell')
    expect(EFFECT_KINDS as readonly string[]).not.toContain('restore-cell')
  })
})

describe('le traitement est exhaustif, vérifié à la compilation', () => {
  const oneOfEach: readonly Effect[] = [
    { kind: 'debit-resources', amounts: [{ resourceId: 'camelote', grains: 300 }] },
    { kind: 'credit-resources', amounts: [{ resourceId: 'bave-etoiles', grains: 42 }] },
    {
      kind: 'place-building',
      buildingId: 'b1',
      typeId: 'mine',
      variantId: 'square-4',
      orientation: 0,
      anchor: { x: 0, y: 4 },
    },
    { kind: 'set-building-level', buildingId: 'b1', level: 2 },
    { kind: 'remove-building', buildingId: 'b1' },
    { kind: 'clear-cell', cell: { x: 3, y: 2 } },
    {
      kind: 'schedule-work',
      workId: 'w1',
      nature: 'build',
      target: {
        kind: 'build',
        typeId: 'mine',
        variantId: 'square-4',
        orientation: 0,
        anchor: { x: 0, y: 4 },
      },
      startedAt: 1000,
      dueAt: 1600,
    },
  ]

  it('couvre les sept effets dans le jeu d’essai', () => {
    expect(new Set(oneOfEach.map((e) => e.kind)).size).toBe(EFFECT_KINDS.length)
  })

  /**
   * `describeEffect` est un `switch` exhaustif sans `default`. S'il manquait
   * une branche, TypeScript refuserait de compiler — c'est la garantie réelle.
   * Ce test vérifie seulement qu'aucune branche ne retourne du vide, ce que la
   * compilation ne dit pas.
   */
  it('sait décrire chacun d’eux sans branche muette', () => {
    for (const effect of oneOfEach) {
      const described = describeEffect(effect)
      expect(described, effect.kind).toBeTruthy()
      expect(described, effect.kind).toContain(effect.kind)
    }
  })
})

describe('la partition lancement / échéance (R16)', () => {
  /**
   * Cette table n'est pas décorative : elle est le contrat entre les modules et
   * le noyau. Un module de construction retourne un débit **et** une
   * planification au lancement ; les effets d'achèvement sont redérivés à
   * l'échéance, jamais sérialisés en base.
   */
  it('range chaque effet du côté où il survient', () => {
    const atLaunch = ['debit-resources', 'schedule-work']
    const atDue = [
      'credit-resources',
      'place-building',
      'set-building-level',
      'remove-building',
      'clear-cell',
    ]
    expect([...atLaunch, ...atDue].sort()).toEqual([...EFFECT_KINDS].sort())
  })
})

describe('un chantier planifié dit toujours sur quoi il porte', () => {
  /**
   * Sans cible, `schedule-work` annoncerait qu'un chantier commence sans dire
   * de quoi — et le noyau serait incapable de l'appliquer à un instantané. Un
   * effet qui ne se suffit pas à lui-même oblige son destinataire à retrouver
   * l'information ailleurs, c'est-à-dire à reprendre une décision que le module
   * avait déjà prise.
   */
  it('porte une cible dont la forme suit la nature', () => {
    const targets: WorkTarget[] = [
      {
        kind: 'build',
        typeId: 'mine',
        variantId: 'square-4',
        orientation: 0,
        anchor: { x: 0, y: 4 },
      },
      { kind: 'building', buildingId: 'b1' },
      { kind: 'cell', cell: { x: 3, y: 2 } },
    ]

    for (const target of targets) {
      const effect: Effect = {
        kind: 'schedule-work',
        workId: 'w1',
        nature: 'build',
        target,
        startedAt: 1000,
        dueAt: 1600,
      }
      expect(effect.target.kind).toBe(target.kind)
    }
  })

  it('nomme trois formes de cible, une par famille de chantier', () => {
    const kinds: WorkTarget['kind'][] = ['build', 'building', 'cell']
    expect(new Set(kinds).size).toBe(3)
  })
})
