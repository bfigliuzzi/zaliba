import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La porte de contraste (INV-V4, FR-030 amendé).
 *
 * Elle **recalcule** les couples du § 3 de `contracts/jeu-de-valeurs.md` par la
 * formule WCAG 2.1, depuis les hexadécimaux de `tokens.json`, et les compare au
 * seuil de leur **rôle**. Elle ne relit pas les champs `contraste_*` du dossier :
 * FR-001a en fait de la documentation, jamais une autorisation — un ratio annoncé
 * faux de quatre centièmes se lirait comme la permission d'y poser du texte.
 *
 * **Le rôle `silhouette` n'est pas une redite du texte.** Sans lui, la porte
 * n'aurait rien à quoi comparer une **forme**, et la silhouette est le seul
 * élément dont l'illisibilité **perdrait** l'information : elle porte à elle
 * seule le canal non chromatique de FR-012.
 */

const DOSSIER_DESIGN = join(
  import.meta.dirname,
  '../../../../docs/design/2026-08-27-regie-approximative',
)

interface Teinte {
  readonly valeur: string
}

const tokens = JSON.parse(readFileSync(join(DOSSIER_DESIGN, 'tokens.json'), 'utf8')) as {
  readonly couleur: Readonly<Record<string, Teinte>>
}

type Canal = readonly [number, number, number]

function canaux(nom: string): Canal {
  const teinte = tokens.couleur[nom]
  if (teinte === undefined) throw new Error(`tokens.json ne porte aucune couleur « ${nom} »`)
  const hex = teinte.valeur
  return [1, 3, 5].map((decalage) =>
    Number.parseInt(hex.slice(decalage, decalage + 2), 16),
  ) as unknown as Canal
}

/** La composante linéarisée, telle que WCAG 2.1 la définit. */
function lineaire(octet: number): number {
  const proportion = octet / 255
  return proportion <= 0.04045 ? proportion / 12.92 : ((proportion + 0.055) / 1.055) ** 2.4
}

function luminance([rouge, vert, bleu]: Canal): number {
  return 0.2126 * lineaire(rouge) + 0.7152 * lineaire(vert) + 0.0722 * lineaire(bleu)
}

function contraste(avant: Canal, fond: Canal): number {
  const [clair, sombre] = [luminance(avant), luminance(fond)].sort((a, b) => b - a) as [
    number,
    number,
  ]
  return (clair + 0.05) / (sombre + 0.05)
}

/**
 * La composition d'une couleur opaque sur son fond.
 *
 * **Sans arrondi intermédiaire**, et c'est un choix : un arrondi à l'octet
 * imiterait la précision interne d'un navigateur donné, alors qu'une porte doit
 * rendre le même verdict sur toutes les machines. L'écart entre les deux
 * conventions est de deux centièmes sur la rature, et il est consigné en
 * `specs/002-la-regie-approximative/verdicts.md`.
 */
function surFond(avant: Canal, fond: Canal, opacite: number): Canal {
  return avant.map((composante, index) => {
    const dessous = fond[index] as number
    return opacite * composante + (1 - opacite) * dessous
  }) as unknown as Canal
}

type Role = 'texte-normal' | 'texte-large' | 'bordure' | 'silhouette'

/** Les seuils de FR-030, amendé le 2026-08-28 pour couvrir les silhouettes. */
const SEUIL: Readonly<Record<Role, number>> = {
  'texte-normal': 4.5,
  'texte-large': 3,
  bordure: 3,
  silhouette: 3,
}

interface Couple {
  readonly avant: string
  readonly fond: string
  readonly role: Role
  /** L'opacité de l'avant-plan, quand il en porte une. */
  readonly opacite?: number
}

/** Le § 3.1 — le texte, opacités comprises. */
const TEXTE: readonly Couple[] = [
  { avant: 'encre', fond: 'papier', role: 'texte-normal' },
  { avant: 'encre', fond: 'pupitre', role: 'texte-normal' },
  { avant: 'encre', fond: 'carton', role: 'texte-normal' },
  { avant: 'encre', fond: 'jus', role: 'texte-normal' },
  { avant: 'papier', fond: 'encre', role: 'texte-normal' },
  { avant: 'mine', fond: 'encre', role: 'texte-normal' },
  { avant: 'ardoise', fond: 'papier', role: 'texte-normal' },
  { avant: 'encre', fond: 'papier', role: 'texte-normal', opacite: 0.8 },
  { avant: 'encre', fond: 'papier', role: 'texte-normal', opacite: 0.72 },
  { avant: 'encre', fond: 'pupitre', role: 'texte-normal', opacite: 0.72 },
  /*
    **Le tampon**, ajouté le 2026-08-28 sur constat de l'audit d'accessibilité.

    Il portait la Camelote — 3,54:1 sur papier, sous les 4,5 du texte normal. Il est
    décoratif et `aria-hidden`, et WCAG 1.4.3 exempte la décoration pure ; mais il
    reste **visible**, et un joueur malvoyant le voit sans le lire. La teinte est donc
    passée à `camelote-brique`, qui rend 5,94:1.

    Le couple est ici pour être **tenu** et non seulement corrigé : sans cette ligne,
    revenir à la Camelote ne ferait rougir que l'audit de bout en bout, c'est-à-dire
    la porte la plus lente et la plus tardive.
  */
  { avant: 'camelote-brique', fond: 'papier', role: 'texte-normal' },
]

/** Le § 3.2 — les aplats, liserés et objets graphiques. */
const GRAPHIQUE: readonly Couple[] = [
  { avant: 'trait', fond: 'papier', role: 'bordure' },
  { avant: 'trait', fond: 'pupitre', role: 'bordure' },
  { avant: 'camelote', fond: 'papier', role: 'bordure' },
  { avant: 'camelote-brique', fond: 'papier', role: 'bordure' },
  { avant: 'camelote', fond: 'encre', role: 'bordure' },
  { avant: 'bave', fond: 'papier', role: 'bordure' },
  // La silhouette hérite toujours de la couleur de texte courante (INV-S1),
  // donc de l'encre. Le jour où elle cesse d'hériter, le seuil la mesure au lieu
  // de la laisser passer parce que « c'est du dessin ».
  { avant: 'encre', fond: 'papier', role: 'silhouette' },
  { avant: 'encre', fond: 'pupitre', role: 'silhouette' },
  { avant: 'encre', fond: 'carton', role: 'silhouette' },
  { avant: 'encre', fond: 'jus', role: 'silhouette' },
]

/** Le § 3.3 — les couples interdits **par une règle**, non par la vigilance. */
const INTERDITS: readonly Couple[] = [
  { avant: 'jus', fond: 'papier', role: 'texte-normal' },
  { avant: 'jus', fond: 'pupitre', role: 'texte-normal' },
  { avant: 'bave', fond: 'papier', role: 'texte-normal' },
]

/** Les trois aplats de ressource : aucun chiffre ne s'y pose (FR-003). */
const APLATS_DE_RESSOURCE = ['camelote', 'jus', 'bave']

/** Les huit fonds de l'écran, contre lesquels l'indicateur de focus est vérifié. */
const FONDS = [
  'papier',
  'pupitre',
  'carton',
  'jus',
  'camelote',
  'bave',
  'encre',
  'encre-douce',
] as const

function ratio(couple: Couple): number {
  const avant = canaux(couple.avant)
  const fond = canaux(couple.fond)
  const compose = couple.opacite === undefined ? avant : surFond(avant, fond, couple.opacite)
  return contraste(compose, fond)
}

const nommer = (couple: Couple): string =>
  `${couple.avant}${couple.opacite === undefined ? '' : ` à ${couple.opacite}`} sur ${couple.fond}`

describe('les couples de contraste atteignent le seuil de leur rôle (INV-V4)', () => {
  it('a lu un nombre non nul de couleurs — sans quoi la porte est inerte', () => {
    expect(Object.keys(tokens.couleur).length).toBeGreaterThan(0)
    expect(TEXTE.length + GRAPHIQUE.length).toBeGreaterThan(0)
  })

  it.each([...TEXTE, ...GRAPHIQUE])('$avant sur $fond, rôle $role', (couple) => {
    const mesure = ratio(couple)
    expect(
      mesure,
      `${nommer(couple)} : ${mesure.toFixed(2)}:1, seuil ${SEUIL[couple.role]} du rôle ${couple.role}`,
    ).toBeGreaterThanOrEqual(SEUIL[couple.role])
  })
})

describe('les couples interdits le restent', () => {
  it.each(INTERDITS)(
    '$avant en texte sur $fond n’atteint pas 4,5:1, et c’est la règle qui le refuse',
    (couple) => {
      const mesure = ratio(couple)
      expect(
        mesure,
        `${nommer(couple)} mesure ${mesure.toFixed(2)}:1 — s’il atteint désormais 4,5, ` +
          'ce n’est plus un couple interdit et la table du contrat doit être amendée',
      ).toBeLessThan(SEUIL['texte-normal'])
    },
  )

  /**
   * Le quatrième interdit du § 3.3 — « tout chiffre, sur un aplat de ressource ».
   *
   * **Il n'a pas de ratio, et il ne porte pas sur tout texte.** Le § 3.1 autorise
   * `encre` sur `jus` à 8,34:1 : c'est le libellé du bouton `JE POSE ÇA`, qui est
   * en `bg-jus`. Ce que FR-003 interdit est un **chiffre**, et la raison n'est pas
   * un seuil franchi de justesse : c'est que le papier tient 12,8:1 **à toute
   * taille**, là où un aplat de ressource dépend de sa teinte.
   *
   * Ce que la palette peut prouver, et que la porte tient donc ici : pour chacun
   * des trois aplats, l'étiquette de papier **améliore strictement** le ratio.
   * C'est l'énoncé palette du motif de FR-003. La moitié structurelle — le
   * chiffre est rendu sur l'étiquette, constaté par le crochet de l'étiquette et
   * non par une couleur — est éprouvée par `comptoir.test.tsx` (T023).
   */
  it.each(APLATS_DE_RESSOURCE)(
    'l’étiquette de papier améliore strictement le ratio d’un chiffre sur %s (FR-003)',
    (aplat) => {
      const surPapier = contraste(canaux('encre'), canaux('papier'))
      const surAplat = contraste(canaux('encre'), canaux(aplat))
      expect(
        surPapier,
        `encre sur papier ${surPapier.toFixed(2)}:1 contre encre sur ${aplat} ` +
          `${surAplat.toFixed(2)}:1 — si l’aplat devenait aussi bon, le motif de ` +
          'FR-003 devrait être rejoué plutôt que supposé',
      ).toBeGreaterThan(surAplat)
    },
  )
})

/**
 * L'indicateur de focus composite (FR-024, écart n° 3 du contrat).
 *
 * L'anneau Camelote unique du dossier échoue sur quatre des huit fonds, dont
 * trois sont focalisables — la case de gisement de Jus, celle de Bave, et le
 * bouton `JE POSE ÇA`. Le couple encre/papier tient sur les huit, et c'est la
 * solution **minimale** : aucune teinte de la palette n'y parvient seule.
 */
describe('l’indicateur de focus composite tient les huit fonds (FR-024)', () => {
  it.each(FONDS)('sur %s, au moins un des deux anneaux atteint 3:1', (fond) => {
    const encre = contraste(canaux('encre'), canaux(fond))
    const papier = contraste(canaux('papier'), canaux(fond))
    expect(
      Math.max(encre, papier),
      `fond ${fond} : encre ${encre.toFixed(2)}:1, papier ${papier.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(SEUIL.bordure)
  })

  it('garde les deux anneaux distincts l’un de l’autre', () => {
    expect(contraste(canaux('encre'), canaux('papier'))).toBeGreaterThanOrEqual(SEUIL.bordure)
  })

  it('constate que l’anneau Camelote unique du dossier échouerait', () => {
    const echecs = FONDS.filter(
      (fond) => contraste(canaux('camelote'), canaux(fond)) < SEUIL.bordure,
    )
    expect(
      echecs.length,
      'si l’anneau Camelote tient désormais les huit fonds, l’écart n° 3 du contrat ' +
        'a disparu et la décision de l’indicateur composite doit être rejouée',
    ).toBeGreaterThan(0)
  })
})
