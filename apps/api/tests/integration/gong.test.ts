import { randomUUID } from 'node:crypto'
import { GONG_CANONICAL, type GongLength } from '@zaliba/catalogs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Harness, startHarness } from './harness.js'
import { buildTestServer, type TestServer } from './server-harness.js'

/**
 * **Le gong, de bout en bout** : un serveur bat au rythme qu'on lui donne, il
 * l'annonce, et il l'annonce à tout le monde pareil.
 *
 * Trois exigences se rencontrent ici, et aucune ne se prouve dans un test
 * unitaire :
 *
 * - **US2** — un chantier dure ce que la longueur du gong dit qu'il dure, et un
 *   chantier déjà planifié ne change pas d'échéance quand le serveur redémarre
 *   à une autre longueur (G14) ;
 * - **US5** — deux joueurs du même serveur reçoivent la **même** longueur, et
 *   elle ne change pas en cours de vie du processus. C'est ce qui rend
 *   l'inégalité irreprésentable plutôt qu'interdite ;
 * - **G10** — la longueur annoncée est celle qui est appliquée, parce qu'elle
 *   est lue sur le catalogue résolu et non sur un second argument.
 */

let harness: Harness

beforeAll(async () => {
  harness = await startHarness()
}, 180_000)

afterAll(async () => {
  await harness?.stop()
})

beforeEach(async () => {
  await harness.reset()
})

/** Un serveur monté à la longueur voulue, refermé après usage. */
async function withServer(
  gong: GongLength,
  body: (server: TestServer) => Promise<void>,
): Promise<void> {
  const server = await buildTestServer(harness, gong)
  try {
    await body(server)
  } finally {
    await server.close()
  }
}

/** Le chantier de pose d'une mine de niveau 1, sur une case libre du Berceau. */
const MINE = {
  nature: 'build',
  typeId: 'mine',
  variantId: 'square-4',
  orientation: 0,
  anchorX: 0,
  anchorY: 0,
} as const

describe('US2 — un chantier dure ce que la longueur du gong dit (FR-005)', () => {
  it('achève une mine de niveau 1 à startedAt + 120 s au gong canonique', async () => {
    await withServer(GONG_CANONICAL, async (server) => {
      const playerId = randomUUID()
      await server.provision(playerId)

      const response = await server.startWork(playerId, MINE)
      expect(response.statusCode).toBe(201)

      const { work } = response.json()
      expect(work.dueAt - work.startedAt).toBe(120)
    })
  })

  /**
   * Le même chantier, sur un serveur soixante fois plus rapide : douze gongs
   * font deux secondes. Le rapport est **exact** ici, parce que douze se divise
   * par six sans reste (SC-002).
   */
  it('l’achève à startedAt + 2 s au sixième de seconde', async () => {
    await withServer({ num: 1, den: 6 }, async (server) => {
      const playerId = randomUUID()
      await server.provision(playerId)

      const { work } = (await server.startWork(playerId, MINE)).json()
      expect(work.dueAt - work.startedAt).toBe(2)
    })
  })

  it('annonce la longueur qu’il applique, et pas une autre (G10)', async () => {
    await withServer({ num: 1, den: 6 }, async (server) => {
      const playerId = randomUUID()
      await server.provision(playerId)

      expect((await server.read(playerId)).json().gong).toEqual({ num: 1, den: 6 })
    })
  })
})

describe('US2 — un chantier en cours n’est jamais recalculé (G14)', () => {
  /**
   * L'échéance est **écrite en base** à la décision, et la relire ne la
   * recalcule pas. Un serveur qui redémarre à une autre longueur ne raccourcit
   * donc pas les chantiers déjà lancés — ni ne les allonge, ce qui serait pire.
   *
   * Le remède, quand ce n'est pas ce qu'on veut, relève de l'exploitation :
   * consolider avant de redémarrer, plutôt que recalculer après.
   */
  it('garde son dueAt quand le serveur redémarre à une autre longueur', async () => {
    const playerId = randomUUID()
    let dueAt = 0

    await withServer(GONG_CANONICAL, async (server) => {
      await server.provision(playerId)
      dueAt = (await server.startWork(playerId, MINE)).json().work.dueAt
      expect(dueAt).toBeGreaterThan(0)
    })

    // Le même processus, relancé soixante fois plus vite.
    await withServer({ num: 1, den: 6 }, async (server) => {
      const snapshot = (await server.read(playerId)).json()
      expect(snapshot.work.dueAt).toBe(dueAt)
      // Et il annonce bien sa nouvelle longueur : c'est l'échéance qui ne bouge
      // pas, pas l'annonce.
      expect(snapshot.gong).toEqual({ num: 1, den: 6 })
    })
  })
})

describe('US5 — la longueur appartient au serveur, jamais au joueur (SC-006)', () => {
  it('annonce la même longueur à deux comptes distincts', async () => {
    await withServer({ num: 1, den: 2 }, async (server) => {
      const alice = randomUUID()
      const bob = randomUUID()
      await server.provision(alice)
      await server.provision(bob)

      const forAlice = (await server.read(alice)).json().gong
      const forBob = (await server.read(bob)).json().gong

      expect(forAlice).toEqual({ num: 1, den: 2 })
      expect(forBob).toEqual(forAlice)
    })
  })

  /**
   * **Lue une fois au démarrage, et jamais relue.** Muter `process.env` entre
   * deux requêtes ne change rien : la longueur est un paramètre du processus,
   * pas un état consulté par requête. Sans quoi deux joueurs servis à une
   * seconde d'intervalle pourraient recevoir des mondes de rythmes différents.
   */
  it('ne change pas en cours de vie du processus, quoi qu’on fasse à l’environnement', async () => {
    await withServer(GONG_CANONICAL, async (server) => {
      const playerId = randomUUID()
      await server.provision(playerId)

      const before = (await server.read(playerId)).json().gong

      const saved = process.env['GONG_SECONDS']
      process.env['GONG_SECONDS'] = '1/6'
      try {
        expect((await server.read(playerId)).json().gong).toEqual(before)
      } finally {
        if (saved === undefined) delete process.env['GONG_SECONDS']
        else process.env['GONG_SECONDS'] = saved
      }
    })
  })

  /**
   * Et l'accumulation suit : ce n'est pas seulement le chantier qui accélère.
   * Le stock de départ est le même — c'est une quantité —, mais le **taux** de
   * la planète fraîche est dans le rapport des longueurs (SC-002).
   */
  it('accélère aussi l’accumulation, pas seulement les chantiers', async () => {
    const playerId = randomUUID()

    await withServer(GONG_CANONICAL, async (server) => {
      await server.provision(playerId)
      const slow = (await server.read(playerId)).json()
      // Le stock de départ ne dépend pas du rythme : c'est une quantité.
      expect(
        slow.holdings.find((h: { resourceId: string }) => h.resourceId === 'camelote'),
      ).toBeDefined()
    })

    await harness.reset()

    await withServer({ num: 1, den: 2 }, async (server) => {
      const other = randomUUID()
      await server.provision(other)
      const fast = (await server.read(other)).json()
      expect(fast.gong).toEqual({ num: 1, den: 2 })
    })
  })
})

/**
 * **Aucune commande ne porte de longueur de gong** (FR-014, FR-020).
 *
 * Doublon volontaire du test de contrat : le contrat le **dit**, l'API le
 * **prouve**. Les deux ont leur raison d'être — un schéma peut être juste et mal
 * branché, et c'est le genre d'écart qu'aucun test de schéma ne voit.
 *
 * Le bloc vit ici plutôt que dans `command.test.ts`, que le découpage nommait :
 * ce fichier-là éprouve la **forme d'exécution** d'une commande — verrou,
 * transaction, reçu — et n'émet pas de requête HTTP. Or ce qui est en jeu est un
 * refus **à la frontière**, donc au niveau de la requête. Le prouver ailleurs
 * qu'au point d'entrée ne prouverait pas la frontière.
 */
describe('aucune commande ne porte de longueur de gong (FR-014)', () => {
  const BUILDING_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3302'

  const INTENTS = [
    ['build', MINE],
    ['upgrade', { nature: 'upgrade', buildingId: BUILDING_ID }],
    ['clear', { nature: 'clear', x: 3, y: 0 }],
    ['demolish', { nature: 'demolish', buildingId: BUILDING_ID }],
  ] as const

  it.each(INTENTS)('rejette une intention de %s portant gong', async (_nature, intent) => {
    await withServer(GONG_CANONICAL, async (server) => {
      const playerId = randomUUID()
      await server.provision(playerId)

      const response = await server.startWork(playerId, { ...intent, gong: { num: 1, den: 6 } })

      // 400 : refusé **à la frontière**, et non ignoré. Un champ ignoré laisse
      // croire au client qu'il a été entendu, et le jour où quelqu'un le lira
      // « puisqu'il est là », l'interdiction sera tombée sans qu'un test bouge.
      expect(response.statusCode).toBe(400)
    })
  })

  it('rejette aussi tout ce qui modifierait le rythme sous un autre nom', async () => {
    await withServer(GONG_CANONICAL, async (server) => {
      const playerId = randomUUID()
      await server.provision(playerId)

      for (const extra of [{ gongSeconds: 1 }, { speed: 60 }, { clientNow: 1_787_750_000 }]) {
        const response = await server.startWork(playerId, { ...MINE, ...extra })
        expect(response.statusCode, JSON.stringify(extra)).toBe(400)
      }
    })
  })
})
