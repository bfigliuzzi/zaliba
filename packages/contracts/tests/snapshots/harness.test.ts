import { initContract } from '@ts-rest/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { contractShape } from './harness.js'

/**
 * Le harnais d'instantané, éprouvé sur lui-même.
 *
 * Un harnais de non-régression qu'on n'aurait jamais vu détecter une régression
 * ne prouve rien — c'est exactement la leçon tirée de dependency-cruiser en
 * phase 1, où une porte se déclarait franchie sans rien parcourir. On lui donne
 * donc ici deux contrats qui diffèrent d'une seule contrainte, et on vérifie
 * qu'il les distingue.
 */

const c = initContract()

const routerWith = (orientation: z.ZodTypeAny, extra: Record<string, z.ZodTypeAny> = {}) =>
  c.router({
    probe: {
      method: 'POST',
      path: '/v1/probe',
      body: z.object({ orientation, ...extra }).strict(),
      responses: { 201: z.object({ ok: z.boolean() }).strict() },
    },
  })

describe('le harnais distingue ce qui est un contrat', () => {
  it('produit une forme non vide — sans quoi il ne prouverait rien', () => {
    const shape = contractShape(routerWith(z.number().int().min(0).max(3)), 'probe')
    expect(JSON.stringify(shape)).toContain('orientation')
    expect(JSON.stringify(shape).length).toBeGreaterThan(100)
  })

  it('détecte une borne relâchée', () => {
    const strict = contractShape(routerWith(z.number().int().min(0).max(3)), 'probe')
    const loose = contractShape(routerWith(z.number().int().min(0).max(7)), 'probe')
    expect(strict).not.toEqual(loose)
  })

  it('détecte un champ ajouté', () => {
    const before = contractShape(routerWith(z.number().int()), 'probe')
    const after = contractShape(routerWith(z.number().int(), { cost: z.number() }), 'probe')
    expect(before).not.toEqual(after)
  })

  it('détecte un champ rendu facultatif', () => {
    const required = contractShape(routerWith(z.number().int()), 'probe')
    const optional = contractShape(routerWith(z.number().int().optional()), 'probe')
    expect(required).not.toEqual(optional)
  })
})

describe('le harnais ignore ce qui n’est pas un contrat', () => {
  /**
   * Si une reformulation de commentaire faisait échouer la porte, les
   * relecteurs apprendraient à approuver les diffs d'instantané sans les lire —
   * et la porte cesserait de protéger quoi que ce soit.
   */
  it('ignore une description ajoutée', () => {
    const plain = c.router({
      probe: {
        method: 'GET',
        path: '/v1/probe',
        responses: { 200: z.object({ ok: z.boolean() }).strict() },
      },
    })
    const documented = c.router({
      probe: {
        method: 'GET',
        path: '/v1/probe',
        summary: 'Une sonde',
        description: 'Sert à éprouver le harnais.',
        responses: { 200: z.object({ ok: z.boolean() }).strict() },
      },
    })
    expect(contractShape(plain, 'probe')).toEqual(contractShape(documented, 'probe'))
  })

  it('est insensible à l’ordre de déclaration des champs', () => {
    const ab = c.router({
      probe: {
        method: 'POST',
        path: '/v1/probe',
        body: z.object({ a: z.string(), b: z.string() }).strict(),
        responses: { 201: z.object({ ok: z.boolean() }).strict() },
      },
    })
    const ba = c.router({
      probe: {
        method: 'POST',
        path: '/v1/probe',
        body: z.object({ b: z.string(), a: z.string() }).strict(),
        responses: { 201: z.object({ ok: z.boolean() }).strict() },
      },
    })
    expect(contractShape(ab, 'probe')).toEqual(contractShape(ba, 'probe'))
  })
})
