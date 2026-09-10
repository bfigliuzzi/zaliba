import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **La porte lexicale : le client n'atteint pas le gong canonique** (FR-012,
 * SC-005, G17).
 *
 * La longueur du gong appartient au serveur. Le client la **reçoit** dans
 * l'instantané ; il ne la configure pas, ne la devine pas, et n'a nulle part où
 * la coder en dur. Sans quoi le serveur cesserait d'être la source unique de
 * vérité — et un client resté en cache après un changement de rythme afficherait
 * des durées exactes pour un monde qui bat autrement.
 *
 * **C'est la seule porte de FR-012, et non une défense en profondeur.** Une
 * règle de frontières qui devait la doubler — sur le modèle de
 * `game-n-importe-pas-db` — s'est révélée irréalisable : `apps/game/src` importe
 * légitimement `@zaliba/catalogs` dans quatorze fichiers, dont `RulesContent`
 * qui en tire `GRAINS_PER_UNIT` ; et les paquets se résolvant par leur tonneau
 * `index.ts`, aucune arête d'import ne désigne `gong.ts`. La règle aurait été
 * **verte sans rien interdire**, ce qui est la forme de panne que le dépôt a
 * déjà nommée.
 *
 * **Le test échoue s'il a parcouru zéro fichier.** Une porte qui sort en succès
 * sans rien avoir lu est pire qu'une porte absente : elle rassure. C'est le
 * motif que `valeurs-en-dur.test.ts` emploie déjà.
 */

const SOURCE = new URL('../../src/', import.meta.url).pathname

/** Ce qu'aucun fichier de `src/` ne doit nommer. */
const FORBIDDEN: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  {
    pattern: /\bGONG_CANONICAL\b/,
    why: 'la constante du gong canonique — le client reçoit la longueur, il ne la connaît pas',
  },
  {
    pattern: /\bGONG_SECONDS\b/,
    why: 'la variable de configuration du serveur — elle ne se lit pas depuis un navigateur',
  },
  {
    /*
      Une longueur littérale, sous la forme que prend une fraction de gong :
      `{ num: 10, den: 1 }`. C'est la forme qu'aurait un repli codé en dur, et
      c'est celle qu'on écrirait sans y penser « juste pour que ça marche ».

      L'expression ne peut pas être plus large sans mordre à faux : `{ num, den }`
      est aussi la forme d'une fraction de remboursement, que l'écran de
      démolition manipule légitimement. Elle vise donc une paire dont les **deux**
      membres sont des littéraux numériques, ce qu'un remboursement lu du
      catalogue n'est jamais.
    */
    pattern: /\{\s*num:\s*\d+\s*,\s*den:\s*\d+\s*\}/,
    why: 'une longueur de gong littérale — la longueur vient du serveur, jamais du bundle',
  },
]

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const found: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await sourceFiles(path)))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

describe('le gong canonique est hors de portée du client (FR-012, SC-005)', () => {
  it('ne laisse aucun fichier de src/ nommer une longueur de gong', async () => {
    const files = await sourceFiles(SOURCE)

    /*
      **La garde qui rend cette porte réelle.** Sans elle, un chemin devenu faux
      — un dossier renommé, une arborescence déplacée — ferait passer le test en
      vert sans avoir rien lu. Le nombre est une borne basse et non un compte
      exact : il ne doit pas se transformer en tâche d'entretien à chaque fichier
      ajouté.
    */
    expect(files.length, 'la porte n’a parcouru aucun fichier').toBeGreaterThan(20)

    const faults: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(content)) {
          faults.push(`${file.slice(SOURCE.length)} nomme ${why}`)
        }
      }
    }

    expect(faults, faults.join('\n')).toEqual([])
  })
})
