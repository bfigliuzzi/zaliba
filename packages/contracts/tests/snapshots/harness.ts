import type { AppRouter } from '@ts-rest/core'
import { generateOpenApi } from '@ts-rest/open-api'
import { expect } from 'vitest'

/**
 * Le harnais d'instantané de JSON Schema (contracts/README § 8).
 *
 * Le principe IV rendu mécanique. Le schéma dérivé de chaque route est figé en
 * fichier de référence : **toute modification de forme fait échouer la porte**.
 * Il faut alors assumer le diff ou créer une version. Aucune rupture
 * silencieuse.
 *
 * Ce que ce harnais attrape et qu'aucune relecture n'attrape : un champ renommé
 * dans une refactorisation, une contrainte de bornes relâchée par mégarde, un
 * `optional()` ajouté « en attendant ». Chacune de ces trois choses casse un
 * client natif ancien, et aucune ne fait échouer une compilation.
 *
 * **Il n'y a pas d'échappatoire prévue.** Pas d'option « mettre à jour tous les
 * instantanés » : chaque diff se lit. C'est le prix de la promesse faite aux
 * clients qu'on ne peut pas forcer à se mettre à jour.
 */

/**
 * Le JSON Schema dérivé d'un routeur `ts-rest`, réduit à ce qui est un contrat.
 *
 * Titre, description et exemples sont écartés : ce sont de la documentation,
 * pas une forme transmise. Les figer ferait échouer la porte sur une
 * reformulation de commentaire, ce qui apprendrait aux relecteurs à approuver
 * les diffs d'instantané sans les lire — exactement l'inverse du but.
 */
export function contractShape(router: AppRouter, title: string): unknown {
  const document = generateOpenApi(router, {
    info: { title, version: '1' },
  })
  return stripDocumentation(document as unknown)
}

const DOCUMENTATION_KEYS = new Set(['summary', 'description', 'example', 'examples', 'title'])

/**
 * Les tableaux dont l'ordre ne porte **aucun sens** en JSON Schema, et qu'on
 * peut donc trier sans rien perdre.
 *
 * La liste est volontairement courte. Trier tous les tableaux serait plus
 * simple et faux : l'ordre d'un `enum`, celui des paramètres de chemin ou celui
 * d'un `allOf` peuvent être significatifs. Un instantané qui masquerait leur
 * réorganisation cesserait de protéger.
 */
const ORDER_INSENSITIVE_ARRAYS = new Set(['required'])

function stripDocumentation(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map((item) => stripDocumentation(item))
    return key !== undefined && ORDER_INSENSITIVE_ARRAYS.has(key)
      ? [...mapped].sort((a, b) => String(a).localeCompare(String(b)))
      : mapped
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !DOCUMENTATION_KEYS.has(k))
      .map(([k, nested]) => [k, stripDocumentation(nested, k)] as const)
      // L'ordre des clés d'un objet JavaScript dépend de l'ordre d'insertion.
      // Le trier rend l'instantané insensible à une réorganisation du code
      // source — un diff d'instantané ne doit signaler qu'un vrai changement.
      .sort(([a], [b]) => a.localeCompare(b))
    return Object.fromEntries(entries)
  }
  return value
}

/**
 * Fige la forme d'un routeur dans un fichier de référence.
 *
 * @param router le routeur `ts-rest` à figer
 * @param name le nom du fichier d'instantané, sans extension
 */
export async function expectStableContract(router: AppRouter, name: string): Promise<void> {
  // Sérialisé plutôt que comparé objet à objet : un fichier JSON se lit en
  // revue, et c'est bien la lecture du diff qui est le mécanisme.
  const serialized = `${JSON.stringify(contractShape(router, name), null, 2)}\n`
  await expect(serialized).toMatchFileSnapshot(`./${name}.contract.json`)
}
