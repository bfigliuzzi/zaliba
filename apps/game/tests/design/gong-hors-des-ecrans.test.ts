import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **Le gong ne sort pas de la page de règles** (FR-018).
 *
 * L'unité de déclaration est faite pour être publiée à **un** endroit et à un
 * seul : la page de règles, où le joueur vient pour refaire les calculs. Partout
 * ailleurs — aperçus, panneaux de travaux, chantier en cours, comptes à rebours
 * —, une durée s'affiche en **temps réel**, parce que c'est ce que le joueur
 * vit. « Ce chantier finit dans douze gongs » ne dit rien à personne.
 *
 * **Pourquoi une porte plutôt qu'une relecture.** Rien n'empêche
 * mécaniquement une durée en gongs de fuir dans un aperçu : les deux faisceaux
 * de catalogue sont accessibles au client, et la page de règles vient d'être
 * rendue consciente des gongs. C'est le risque direct du travail qui précède,
 * et il est de ceux qu'on ne voit pas en relisant un diff — un mot ajouté dans
 * un libellé, six mois plus tard, à côté d'un compteur.
 *
 * **Le test échoue s'il a parcouru zéro fichier.** Une porte qui sort en succès
 * sans rien avoir lu est pire qu'une porte absente : elle rassure.
 */

const FEATURES = new URL('../../src/features/', import.meta.url).pathname

/**
 * Les quatre familles d'écran où une durée s'affiche, et où le gong n'a rien à
 * faire. `rules/` en est **exclu** : c'est le seul endroit où le gong se publie.
 */
const WATCHED = ['work', 'grid', 'resources', 'regie'] as const

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

describe('le gong reste dans la page de règles (FR-018)', () => {
  it('ne laisse aucun écran rendre le mot « gong »', async () => {
    const files: string[] = []
    for (const family of WATCHED) {
      files.push(...(await sourceFiles(join(FEATURES, family))))
    }

    expect(files.length, 'la porte n’a parcouru aucun fichier').toBeGreaterThan(10)

    const faults: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')

      /*
        Le mot dans le rendu, et non dans un commentaire : un fichier a le droit
        d'**expliquer** pourquoi il n'affiche pas de gongs, et l'interdire
        pousserait à supprimer les commentaires plutôt qu'à respecter la règle.

        Les lignes de commentaire sont donc retirées avant l'examen. C'est une
        approximation — un `//` dans une chaîne survivrait —, et elle est du bon
        côté : elle ne peut que rendre la porte plus stricte, jamais plus laxiste.
      */
      const code = content
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n')

      if (/gong/i.test(code)) {
        faults.push(`${file.slice(FEATURES.length)} nomme le gong hors de la page de règles`)
      }
    }

    expect(faults, faults.join('\n')).toEqual([])
  })
})
