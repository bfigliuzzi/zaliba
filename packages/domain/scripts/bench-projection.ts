import { GONG_CANONICAL } from '@zaliba/catalogs'
import { projectPlanet } from '../src/game.js'
import { DECLARED_CATALOGS } from '../src/kernel/catalogs.js'
import { resolveCatalogs } from '../src/kernel/gong.js'
import { grains } from '../src/kernel/resources.js'
import { emptySnapshot, type PlacedBuilding, type PlanetSnapshot } from '../src/kernel/snapshot.js'
import { instant } from '../src/kernel/time.js'

/** Le catalogue du jeu, résolu au gong canonique — la charge réelle (003). */
const CATALOGS = resolveCatalogs(DECLARED_CATALOGS, GONG_CANONICAL)

/**
 * **La mesure de l'objectif « projection d'une planète sous la milliseconde »**
 * (plan.md § Performance Goals, T159).
 *
 * Ce n'est pas une porte de CI, et c'est délibéré : un seuil de durée mesuré sur une
 * machine partagée échoue par intermittence, et une porte qui échoue au hasard finit
 * par être ignorée — donc par ne plus rien garder. La mesure est donc un **relevé**,
 * daté, consigné dans `quickstart.md` avec la machine et la charge.
 *
 * **La charge est décrite, et choisie pour être la pire** que 001 permette :
 *
 * - **vingt bâtiments**, la borne que l'objectif nomme — c'est aussi plus que ce que
 *   trente-six cases peuvent porter d'extracteurs, donc au-delà du réalisable ;
 * - **un chantier échu**, qui force la *segmentation en deux temps* (R3) : la
 *   projection accumule aux anciens taux jusqu'à l'échéance, applique les effets, puis
 *   repart aux nouveaux. C'est le chemin coûteux, et le seul qui compte ;
 * - **trois semaines d'écart**, la durée que SC-003 nomme. Le modèle de temps étant en
 *   temps fermé (R4), la durée ne change rien au coût — et le vérifier est justement
 *   l'intérêt de la mesurer.
 *
 * L'horloge employée est `performance.now()`, monotone. C'est le seul appel d'horloge
 * de ce fichier, et il est ici parce qu'un banc d'essai mesure une durée réelle : le
 * domaine, lui, reçoit toujours son instant en argument.
 */

const T0 = instant(1_787_750_000)
const THREE_WEEKS = 21 * 86_400
const ITERATIONS = 10_000
const WARMUP = 1_000

/** Les vingt bâtiments : la borne de l'objectif, au-delà du réalisable sur 6 × 6. */
function loaded(): PlanetSnapshot {
  const base = emptySnapshot({
    planetId: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    occupantId: '22222222-2222-4222-8222-222222222222',
    archetypeId: 'berceau',
    layoutId: 'berceau-v1',
    consolidatedAt: T0,
    catalogs: CATALOGS,
  })

  const types = ['mine', 'puits', 'racloir', 'centrale', 'entrepot'] as const
  const buildings: PlacedBuilding[] = []

  for (let index = 0; index < 20; index += 1) {
    const typeId = types[index % types.length] as (typeof types)[number]
    const variantId = CATALOGS.buildings[typeId].variants[0]
    if (variantId === undefined) throw new Error(`${typeId} n’a aucune variante`)

    buildings.push({
      id: `batiment-${index}`,
      typeId,
      variantId,
      orientation: index % 4,
      // Les ancres se recouvrent : la géométrie n'est pas validée à la lecture, et ce
      // qu'on mesure est le coût du calcul, pas celui d'un placement légal.
      anchor: { x: index % 6, y: Math.floor(index / 6) % 6 },
      level: 1 + (index % 12),
    })
  }

  return {
    ...base,
    buildings,
    holdings: {
      camelote: { amount: grains(1_000_000), lost: grains(0) },
      jus: { amount: grains(1_000_000), lost: grains(0) },
      'bave-etoiles': { amount: grains(1_000_000), lost: grains(0) },
    },
    // Un chantier **échu** : c'est lui qui force la segmentation en deux temps (R3),
    // et donc le chemin coûteux.
    work: {
      id: '99999999-9999-4999-8999-999999999999',
      nature: 'upgrade',
      target: { kind: 'building', buildingId: 'batiment-0' },
      startedAt: T0,
      dueAt: instant(T0 + 3_600),
    },
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  return sorted[index] ?? 0
}

const snapshot = loaded()
const at = instant(T0 + THREE_WEEKS)

// Le préchauffage n'est pas une complaisance : sans lui, on mesurerait la compilation
// juste-à-temps plutôt que le calcul, et le chiffre décrirait le moteur au lieu du code.
for (let i = 0; i < WARMUP; i += 1) projectPlanet(snapshot, CATALOGS, at)

const samples: number[] = []
for (let i = 0; i < ITERATIONS; i += 1) {
  const started = performance.now()
  projectPlanet(snapshot, CATALOGS, at)
  samples.push(performance.now() - started)
}

samples.sort((a, b) => a - b)

const lines = [
  `charge      : 20 bâtiments, 1 chantier échu, 3 semaines d’écart`,
  `itérations  : ${ITERATIONS} (après ${WARMUP} de préchauffage)`,
  `médiane     : ${percentile(samples, 0.5).toFixed(4)} ms`,
  `95ᵉ centile : ${percentile(samples, 0.95).toFixed(4)} ms`,
  `99ᵉ centile : ${percentile(samples, 0.99).toFixed(4)} ms`,
  `maximum     : ${(samples[samples.length - 1] ?? 0).toFixed(4)} ms`,
  `objectif    : < 1 ms — ${percentile(samples, 0.95) < 1 ? 'ATTEINT' : 'MANQUÉ'} au 95ᵉ centile`,
]

process.stdout.write(`${lines.join('\n')}\n`)
