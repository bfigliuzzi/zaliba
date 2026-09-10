import type { BuildingTypeId } from '@zaliba/catalogs'
import { GONG_CANONICAL } from '@zaliba/catalogs'
import { REFUSAL_CODES_V1, RefusalDetailsV1 } from '@zaliba/contracts'
import type { PlanetSnapshot, ProjectedState } from '@zaliba/domain'
import {
  applyEffects,
  DECLARED_CATALOGS,
  decideBuild,
  decideClear,
  decideDemolish,
  decideUpgrade,
  emptySnapshot,
  grains,
  instant,
  projectPlanet,
  resolveCatalogs,
} from '@zaliba/domain'
import { describe, expect, it } from 'vitest'
import { REFUSAL_MESSAGES, refusalToError } from '../src/routes/v1/works.js'

/**
 * **Les deux vocabulaires de refus sont le même vocabulaire.**
 *
 * Le domaine nomme ses motifs, le contrat les publie, et la traduction entre les
 * deux est *structurelle* : le `code` du domaine **est** celui du contrat, et
 * `details` reprend le reste du motif tel quel. C'est la décision de conception
 * qui évite un dictionnaire de correspondance — donc un endroit de plus où oublier
 * une entrée, l'oubli donnant un 500 là où le jeu voulait dire non.
 *
 * Une décision comme celle-là ne se vérifie pas en relisant deux fichiers : ils ne
 * s'importent pas l'un l'autre, et c'est voulu (`contracts` n'importe pas
 * `domain`, doc de stack § 3). Elle se vérifie **ici**, dans le seul paquet qui
 * voit les deux. Sans ce test, ajouter un motif au domaine sans le déclarer au
 * contrat compile, passe toutes les portes, et échoue en production sur la
 * validation de la réponse d'erreur.
 *
 * Les refus éprouvés ne sont pas fabriqués à la main : ils sont **produits par le
 * domaine** sur des états construits pour les provoquer. Un échantillon écrit à la
 * main prouverait que le schéma accepte ce que le test croit que le domaine
 * produit ; celui-ci prouve qu'il accepte ce que le domaine produit vraiment.
 */

/** Le catalogue du jeu, résolu au gong canonique — le vocabulaire de refus ne
 * dépend d'aucune longueur, mais il faut bien un catalogue résolu pour décider. */
const CATALOGS = resolveCatalogs(DECLARED_CATALOGS, GONG_CANONICAL)
const T0 = instant(1_787_750_000)
const WORK_ID = '99999999-9999-4999-8999-999999999999'
const BUILDING_ID = '88888888-8888-4888-8888-888888888888'
const ABSENT_ID = '77777777-7777-4777-8777-777777777777'

function fresh(): PlanetSnapshot {
  return emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt: T0,
    catalogs: CATALOGS,
  })
}

const MINE = {
  id: BUILDING_ID,
  typeId: 'mine' as BuildingTypeId,
  variantId: 'square-4' as const,
  orientation: 0,
  anchor: { x: 0, y: 4 },
  level: 1,
}

function penniless(snapshot: PlanetSnapshot): PlanetSnapshot {
  return {
    ...snapshot,
    holdings: {
      camelote: { amount: grains(0), lost: grains(0), saturatedSince: null },
      jus: { amount: grains(0), lost: grains(0), saturatedSince: null },
      'bave-etoiles': { amount: grains(0), lost: grains(0), saturatedSince: null },
    },
  }
}

function busy(snapshot: PlanetSnapshot): PlanetSnapshot {
  return applyEffects(
    snapshot,
    [
      {
        kind: 'schedule-work',
        workId: '66666666-6666-4666-8666-666666666666',
        nature: 'build',
        target: {
          kind: 'build',
          typeId: 'centrale',
          variantId: 'line-2',
          orientation: 0,
          anchor: { x: 4, y: 5 },
        },
        startedAt: T0,
        dueAt: T0 + 300,
      },
    ],
    T0,
  )
}

const state = (snapshot: PlanetSnapshot): ProjectedState => projectPlanet(snapshot, CATALOGS, T0)

const build = (snapshot: PlanetSnapshot, overrides: Record<string, unknown> = {}) =>
  decideBuild(
    state(snapshot),
    {
      kind: 'build',
      workId: WORK_ID,
      typeId: 'mine',
      variantId: 'square-4',
      orientation: 0,
      anchor: { x: 0, y: 4 },
      ...overrides,
    } as Parameters<typeof decideBuild>[1],
    CATALOGS,
  )

const upgrade = (snapshot: PlanetSnapshot, buildingId = BUILDING_ID) =>
  decideUpgrade(state(snapshot), { kind: 'upgrade', workId: WORK_ID, buildingId }, CATALOGS)

const clear = (snapshot: PlanetSnapshot, cell: { x: number; y: number }) =>
  decideClear(state(snapshot), { kind: 'clear', workId: WORK_ID, cell }, CATALOGS)

const demolish = (snapshot: PlanetSnapshot, buildingId = BUILDING_ID) =>
  decideDemolish(state(snapshot), { kind: 'demolish', workId: WORK_ID, buildingId }, CATALOGS)

/**
 * Un refus **réel** par code publié.
 *
 * Chaque entrée est un état minimal qui provoque son motif. Le `satisfies` garantit
 * qu'on ne nomme que des codes existants ; le test d'exhaustivité ci-dessous
 * garantit qu'on les nomme **tous**.
 */
const PROVOCATIONS = {
  'work-in-progress': () => build(busy(fresh())),
  'insufficient-resources': () => build(penniless(fresh())),
  'placement-out-of-grid': () => build(fresh(), { anchor: { x: 5, y: 5 } }),
  'placement-on-obstructed-cell': () => build(fresh(), { anchor: { x: 1, y: 2 } }),
  'placement-on-occupied-cell': () => build({ ...fresh(), buildings: [MINE] }),
  'variant-not-available-for-type': () => build(fresh(), { variantId: 'single' }),
  'building-not-found': () => upgrade({ ...fresh(), buildings: [MINE] }, ABSENT_ID),
  'max-level-reached': () =>
    upgrade({ ...fresh(), buildings: [{ ...MINE, level: CATALOGS.buildings.mine.maxLevel }] }),
  /** (5,5) est libre dans la disposition du Berceau : rien à déblayer. */
  'cell-not-obstructed': () => clear(fresh(), { x: 5, y: 5 }),
  /**
   * Le chantier en cours porte **sur la mine elle-même** : c'est ce qui distingue
   * ce motif de `work-in-progress`, qui n'aurait pas dit lequel.
   */
  'building-is-work-target': () =>
    demolish({
      ...fresh(),
      buildings: [MINE],
      work: {
        id: WORK_ID,
        nature: 'upgrade',
        target: { kind: 'building', buildingId: BUILDING_ID },
        startedAt: T0,
        dueAt: instant(T0 + 168),
      },
    }),
} as const satisfies Record<(typeof REFUSAL_CODES_V1)[number], () => unknown>

describe('le domaine et le contrat nomment les mêmes motifs', () => {
  /**
   * L'égalité, dans les **deux** sens. Un code déclaré au contrat que le serveur
   * ne sait pas produire est une promesse vide ; un code produit par le domaine
   * que le contrat ignore est un 500 en production. Les deux sont des fautes, et
   * une inclusion simple n'en attraperait qu'une.
   */
  it('la table de libellés couvre exactement l’union du contrat', () => {
    expect(Object.keys(REFUSAL_MESSAGES).toSorted()).toEqual([...REFUSAL_CODES_V1].toSorted())
  })

  it('chaque motif publié a une forme de détail déclarée', () => {
    expect(Object.keys(RefusalDetailsV1).toSorted()).toEqual([...REFUSAL_CODES_V1].toSorted())
  })

  /**
   * Un libellé vide passerait la compilation et laisserait le joueur devant une
   * phrase absente. Ce n'est pas la source de vérité — le client dérive son
   * affichage de `code` et de `details` (contrats § 5) — mais c'est ce qu'un
   * journal montre, et ce qu'un client ancien affiche faute de mieux.
   */
  it('aucun libellé n’est vide', () => {
    for (const [code, message] of Object.entries(REFUSAL_MESSAGES)) {
      expect(message.length, `libellé vide pour ${code}`).toBeGreaterThan(0)
    }
  })
})

describe('le détail que le domaine produit passe le schéma qui le publie', () => {
  it.each(REFUSAL_CODES_V1)('%s se rend en 409 avec un détail conforme', (code) => {
    const provoke = PROVOCATIONS[code]
    expect(provoke, `aucun état ne provoque ${code}`).toBeDefined()

    const decision = provoke() as
      | { outcome: 'accepted' }
      | { outcome: 'refused'; refusal: { code: string } }
    if (decision.outcome !== 'refused') throw new Error(`${code} n’a pas été refusé`)
    expect(decision.refusal.code, 'le motif provoqué n’est pas celui attendu').toBe(code)

    const error = refusalToError(decision.refusal as never)
    // La porte de toutes les règles de jeu : 409, jamais 400. Une requête
    // parfaitement formée à laquelle le jeu répond non n'est pas un bogue client.
    expect(error.statusCode).toBe(409)
    expect(error.code).toBe(code)

    // Le détail tel quel, sans traduction : c'est ce que la décision de
    // conception promet, et c'est ce qui est vérifié ici plutôt que relu.
    expect(() => RefusalDetailsV1[code].parse(error.details)).not.toThrow()
  })
})
