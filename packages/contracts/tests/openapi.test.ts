import { describe, expect, it } from 'vitest'
import { openApiDocumentV1 } from '../scripts/openapi.js'

/**
 * **L'export OpenAPI : la transparence promise à P4, rendue mécanique** (T158).
 *
 * Le document n'est pas une commodité d'outillage : c'est le contrat publié, dans le
 * format que tout le monde sait lire. Un joueur qui « a besoin de tout savoir » peut
 * y vérifier ce que le serveur accepte — et surtout **ce qu'il n'accepte pas**, ce qui
 * est le sujet de FR-055 à FR-057.
 *
 * **Il est engendré, jamais rédigé** (R15 appliqué au contrat). Une description
 * écrite à la main divergerait du schéma à la première modification, et divergerait en
 * silence : personne ne relit un fichier de documentation pour vérifier qu'il décrit
 * encore le code.
 *
 * **Le générateur vit dans `scripts/`, hors du graphe de production**, et la porte de
 * frontières l'a exigé : `@ts-rest/open-api` est une dépendance de développement, et
 * l'importer depuis `src/` la ferait entrer dans le graphe que le client embarque.
 *
 * Ce que ce fichier éprouve n'est donc pas « le document existe », mais **qu'il porte
 * les absences**. Un OpenAPI qui déclarerait un champ `cost` en entrée serait une
 * invitation publique à l'exploiter, alors même que le code le refuse — et la
 * documentation ferait ce que le contrat s'interdit.
 */

describe('le document décrit les trois routes de la version 1', () => {
  it.each([
    ['/v1/me/planet', 'get'],
    ['/v1/me/planet', 'post'],
    ['/v1/me/planet/works', 'post'],
  ])('déclare %s %s', (path, method) => {
    const operations = openApiDocumentV1().paths?.[path]
    expect(operations, `${path} manque`).toBeDefined()
    expect(operations?.[method as 'get' | 'post'], `${path} ${method} manque`).toBeDefined()
  })

  it('n’en déclare pas une quatrième', () => {
    // Ni aperçu (R8), ni catalogue (R15) : les deux sont calculés côté client depuis
    // le code et le paquet qu'il embarque. Une route de plus ici serait une surface
    // de contrat à versionner pour dupliquer une donnée déjà présente.
    expect(Object.keys(openApiDocumentV1().paths ?? {})).toEqual([
      '/v1/me/planet',
      '/v1/me/planet/works',
    ])
  })

  it('nomme sa version et son titre', () => {
    const document = openApiDocumentV1()
    expect(document.info.title).toMatch(/zaliba/i)
    expect(document.info.version).toBe('1')
  })
})

describe('les absences du contrat sont publiées comme telles (FR-055 à FR-057)', () => {
  /**
   * L'énoncé qui donne son sens à cet export. Le corps de `startWork` est une union
   * fermée de quatre natures, et **aucune** ne porte de valeur dérivable. Le document
   * doit le montrer, sinon il documente un contrat plus permissif que le vrai.
   */
  it.each([
    'cost',
    'duration',
    'dueAt',
    'production',
    'refund',
    'clippedAmount',
    'reveals',
    'result',
    'clientNow',
    'timestamp',
  ])('le corps de startWork n’admet aucun champ « %s »', (field) => {
    const body = JSON.stringify(
      openApiDocumentV1().paths?.['/v1/me/planet/works']?.post?.requestBody,
    )
    expect(body).not.toContain(`"${field}"`)
  })

  /**
   * **Et l'union est fermée dans le document, pas seulement dans le code.** Un schéma
   * qui accepterait une nature inconnue laisserait croire qu'une cinquième mécanique
   * existe.
   */
  it('publie les quatre natures de chantier, et rien d’autre', () => {
    const body = JSON.stringify(
      openApiDocumentV1().paths?.['/v1/me/planet/works']?.post?.requestBody,
    )
    for (const nature of ['build', 'upgrade', 'clear', 'demolish']) {
      expect(body).toContain(nature)
    }
    expect(body).not.toContain('cancel')
    expect(body).not.toContain('replace')
  })

  /**
   * Le corps de `provisionPlanet` est **vide et fermé** : tout ce que le serveur peut
   * dériver — la disposition, le stock de départ, l'archétype — est absent du contrat,
   * pas seulement validé.
   */
  it('le corps de provisionPlanet n’admet aucune propriété', () => {
    const body = JSON.stringify(openApiDocumentV1().paths?.['/v1/me/planet']?.post?.requestBody)
    expect(body).toContain('additionalProperties')
    expect(body).not.toContain('archetype')
    expect(body).not.toContain('layout')
  })
})

describe('les réponses d’erreur sont documentées route par route', () => {
  /**
   * Le 409 est **la porte de toutes les règles de jeu**, et le document doit le dire :
   * un client qui traiterait les 409 comme des bogues afficherait le mauvais écran là
   * où le jeu répond simplement non.
   */
  it('déclare le 409 sur startWork', () => {
    const responses = openApiDocumentV1().paths?.['/v1/me/planet/works']?.post?.responses
    expect(responses?.['409']).toBeDefined()
    expect(responses?.['201']).toBeDefined()
  })

  it('déclare le 404 sur la lecture, et pas sur le provisionnement', () => {
    const paths = openApiDocumentV1().paths?.['/v1/me/planet']
    expect(paths?.get?.responses?.['404']).toBeDefined()
    // Le provisionnement est **idempotent** : il crée ou rend l'existante, donc il n'a
    // aucune raison de ne rien trouver (R11).
    expect(paths?.post?.responses?.['404']).toBeUndefined()
  })
})

describe('la forme du document est figée', () => {
  /**
   * L'instantané n'éprouve aucune règle : il rend **visible en revue** tout
   * changement de la surface publiée. Un diff se lit et s'approuve — c'est la même
   * discipline que l'instantané de JSON Schema et que celui d'équilibrage.
   *
   * Le suffixe `.contract.json` n'est pas décoratif : c'est lui qui place le fichier
   * hors du formateur, par le motif d'exclusion de `biome.json`. Un instantané
   * reformaté ne correspond plus à ce que le test produit, et la porte échoue alors
   * pour une raison qui n'a rien à voir avec le contrat.
   */
  it('correspond à l’instantané de référence', async () => {
    const serialized = `${JSON.stringify(openApiDocumentV1(), null, 2)}\n`
    await expect(serialized).toMatchFileSnapshot('./snapshots/v1-openapi.contract.json')
  })
})
