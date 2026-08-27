import { describe, expect, it } from 'vitest'
import { BUILDING_TYPE_IDS, BUILDINGS } from '../../src/buildings.js'
import type { Curve } from '../../src/curves.js'
import { OBSTACLE_IDS, OBSTACLES } from '../../src/obstacles.js'
import { RESOURCE_IDS } from '../../src/resources.js'
import { GRAINS_PER_UNIT } from '../../src/units.js'

/**
 * **L'instantané d'équilibrage : le jeu ne sera jamais rééquilibré par accident.**
 *
 * Ce fichier n'éprouve **aucune règle**. C'est ce qui le distingue de
 * `balance.test.ts`, qui garde les cinq exigences dont la violation rend le jeu
 * injouable : ici, les valeurs sont libres de bouger. Ce qui n'est pas libre, c'est
 * de les faire bouger **sans le voir**.
 *
 * Un diff d'instantané se **lit et s'approuve**. Il ne se contourne pas : le
 * relancer avec `-u` est un geste explicite, et le diff qu'il produit apparaît dans
 * la revue à côté du changement de catalogue qui l'a causé. C'est le mécanisme que
 * le document de stack § 5.1 décrit — le rééquilibrage est une modification de
 * données visible en diff — appliqué à la seule chose qui compte : les nombres que
 * le joueur subit.
 *
 * **Trente niveaux, et pas dix.** Les tables de la page de règles s'arrêtent à dix
 * parce qu'un lecteur humain n'en lit pas plus ; l'instantané va jusqu'au plafond du
 * catalogue, parce qu'une courbe géométrique se trompe surtout dans sa queue. C'est
 * là qu'un dépassement d'entier sûr, une troncature mal placée ou un plafond de
 * niveau oublié se manifesteraient — chez le seul joueur assez patient pour y
 * arriver, et donc trop tard.
 *
 * **Le format est du texte, aligné et lisible.** Un JSON produirait un diff où
 * chaque valeur change de ligne dès qu'un type est ajouté ; un tableau à largeur
 * fixe fait tenir le changement là où il a lieu.
 *
 * **Ce que l'instantané ne contient pas** : aucune valeur dérivée d'un état de jeu —
 * ni production effective, ni temps avant saturation, ni remboursement. Ce sont des
 * fonctions du catalogue *et* d'une planète, et les figer ici ferait échouer
 * l'instantané pour des raisons qui ne sont pas de l'équilibrage.
 */

/** Le niveau jusqu'où l'instantané descend. Au-delà du plafond de chaque type. */
const LEVELS = 30

/** `⌊base × (num ÷ den)^(niveau − 1)⌋` — la formule publiée (R19). */
function evaluate(curve: Curve, level: number): number {
  switch (curve.kind) {
    case 'geometric': {
      const exponent = BigInt(level - 1)
      return Number(
        (BigInt(curve.base) * BigInt(curve.num) ** exponent) / BigInt(curve.den) ** exponent,
      )
    }
    case 'linear':
      return curve.base + curve.step * (level - 1)
    case 'steps':
      return curve.values[level - 1] ?? Number.NaN
  }
}

/**
 * Une valeur, alignée à droite sur une largeur fixe.
 *
 * L'alignement n'est pas de la coquetterie : c'est ce qui fait qu'un diff montre la
 * colonne qui a changé plutôt que la ligne entière décalée.
 */
function cell(value: number | string, width = 14): string {
  return String(value).padStart(width)
}

/** Une quantité en grains, rendue en unités — l'échelle que le joueur lit. */
function units(grains: number): string {
  const whole = grains / GRAINS_PER_UNIT
  return Number.isInteger(whole) ? String(whole) : whole.toFixed(4)
}

/** Une valeur de courbe, ou « — » quand le niveau dépasse le plafond du type. */
function atLevel(curve: Curve | null | undefined, level: number, beyond: boolean): string {
  // Au-delà du plafond du type, la cellule dit « — » plutôt qu'une valeur : un niveau
  // que le jeu refuse n'a pas de coût, et en publier un ferait croire qu'il est
  // atteignable.
  if (beyond || curve === null || curve === undefined) return '—'
  return String(evaluate(curve, level))
}

/** Idem, mais en unités : pour les grandeurs libellées en grains. */
function atLevelInUnits(curve: Curve | null | undefined, level: number, beyond: boolean): string {
  if (beyond || curve === null || curve === undefined) return '—'
  return units(evaluate(curve, level))
}

/** L'en-tête d'un type, colonnes de coût comprises. */
function headerOf(costKeys: readonly (typeof RESOURCE_IDS)[number][]): string {
  return [
    cell('niveau', 7),
    ...costKeys.map((id) => cell(`coût ${id}`, 18)),
    cell('durée (s)'),
    cell('production'),
    cell('capacité'),
    cell('énergie −'),
    cell('énergie +'),
  ].join(' |')
}

/** Une ligne de niveau, pour un type. */
function rowOf(
  type: (typeof BUILDINGS)[(typeof BUILDING_TYPE_IDS)[number]],
  costKeys: readonly (typeof RESOURCE_IDS)[number][],
  level: number,
): string {
  const beyond = level > type.maxLevel

  return [
    cell(level, 7),
    ...costKeys.map((id) => cell(atLevelInUnits(type.cost[id], level, beyond), 18)),
    cell(atLevel(type.buildDuration, level, beyond)),
    cell(atLevel(type.production, level, beyond)),
    cell(atLevelInUnits(type.capacity, level, beyond)),
    cell(atLevel(type.energyConsumption, level, beyond)),
    cell(atLevel(type.energyProduction, level, beyond)),
  ].join(' |')
}

function buildingTable(): string {
  const lines: string[] = []

  for (const typeId of BUILDING_TYPE_IDS) {
    const type = BUILDINGS[typeId]
    const costKeys = RESOURCE_IDS.filter((id) => type.cost[id] !== undefined)

    lines.push('')
    lines.push(`## ${typeId} — plafond de niveau ${type.maxLevel}`)
    lines.push('')
    lines.push(headerOf(costKeys))

    for (let level = 1; level <= LEVELS; level += 1) {
      lines.push(rowOf(type, costKeys, level))
    }

    lines.push('')
    lines.push(`démolition : ${type.demolitionSeconds} s`)
    lines.push(`remboursement : ${type.refund.num}/${type.refund.den}`)
    lines.push(`empreintes : ${type.variants.join(', ')}`)
    lines.push(`extrait : ${type.extracts ?? '—'}`)
  }

  return lines.join('\n')
}

function obstacleTable(): string {
  const lines = ['', '## obstacles', '']
  lines.push([cell('type', 20), cell('durée (s)'), cell('révèle', 20), cell('coût', 40)].join(' |'))

  for (const obstacleId of OBSTACLE_IDS) {
    const obstacle = OBSTACLES[obstacleId]
    const cost = RESOURCE_IDS.filter((id) => obstacle.cost[id] !== undefined)
      .map((id) => `${units(obstacle.cost[id] ?? 0)} ${id}`)
      .join(', ')

    lines.push(
      [
        cell(obstacleId, 20),
        cell(obstacle.durationSeconds),
        cell(
          obstacle.reveals.kind === 'deposit' ? `dépôt ${obstacle.reveals.resourceId}` : 'nu',
          20,
        ),
        cell(cost, 40),
      ].join(' |'),
    )
  }

  return lines.join('\n')
}

describe('l’instantané d’équilibrage est figé', () => {
  /**
   * Un diff ici veut dire **une** chose : le jeu a changé pour tous les joueurs. Le
   * lire, c'est vérifier que le changement est celui qu'on voulait — et le
   * `CATALOG_VERSION` a dû bouger avec, sans quoi les clients en cache calculeront des
   * chiffres faux en croyant être à jour (R15).
   */
  it('correspond au relevé de référence, des niveaux 1 à 30', async () => {
    const content = [
      '# Instantané d’équilibrage — niveaux 1 à 30',
      '',
      'Engendré depuis `packages/catalogs`. Un diff se lit et s’approuve.',
      'Les coûts et les capacités sont en **unités**, les durées en **secondes**,',
      'la production en **unités par heure et par gisement recouvert**.',
      buildingTable(),
      obstacleTable(),
      '',
    ].join('\n')

    await expect(content).toMatchFileSnapshot('./balance.snap')
  })
})
