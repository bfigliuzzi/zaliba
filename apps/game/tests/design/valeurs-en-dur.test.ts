import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La porte de non-régression des valeurs en dur (INV-V2, INV-V3, FR-039a, R13).
 *
 * FR-001 est une règle sur la **provenance** des valeurs, et une règle de
 * provenance qui repose sur la relecture dérive au troisième écran. Cette porte
 * la rend mécanique : elle parcourt `apps/game/src/**` et refuse toute valeur
 * visuelle littérale hors de `tokens.css`.
 *
 * **Elle doit constater qu'elle a lu quelque chose.** Un parcours de zéro
 * fichier qui sort en succès est une porte inerte, et l'inertie prend
 * l'apparence d'un succès (amendement 2.1.0 de la constitution).
 *
 * **Les commentaires sont retirés avant analyse.** Un commentaire qui écrit
 * « 44 px » explique une règle, il n'en est pas une — et les documenter est
 * précisément ce que ce dépôt demande.
 */

const SRC = join(import.meta.dirname, '../../src')

/** La source unique : elle porte les valeurs, c'est sa raison d'être. */
const SOURCE_DES_VALEURS = 'design/tokens.css'

/**
 * Les exceptions, **énumérées et datées**. La liste est vide.
 *
 * Une exception dans une porte devient invisible en six mois. Chacune portait donc
 * ici la tâche qui la referme, de sorte que sa disparition soit un travail identifié
 * et non un oubli.
 *
 * Il y en a eu **une**, et elle est refermée : `styles.css` portait la géométrie de
 * 001, que 002 a reprise bloc par bloc. **T099 l'a réduit** à ce que la Régie ne
 * remaquette pas — les deux écrans que le dossier de design ne couvre pas —, et ses
 * longueurs viennent désormais de `tokens.css` comme partout ailleurs.
 *
 * La liste reste écrite, vide, plutôt que supprimée : c'est le mécanisme qui dit
 * comment une exception s'ajoute, et le test juste en dessous refuse une exception
 * portant sur un fichier absent.
 */
const EXCEPTIONS: readonly { readonly fichier: string; readonly motif: string }[] = []

const FICHIERS_EXEMPTES = new Set([SOURCE_DES_VALEURS, ...EXCEPTIONS.map((e) => e.fichier)])

/** Les quatre valeurs de nuit : transcrites, et employées par aucune règle (INV-V3, R17). */
const VALEURS_DE_NUIT = [
  '--couleur-encre-nuit',
  '--couleur-encre-douce',
  '--couleur-bave-nuit',
  '--ombre-visee-nuit',
] as const

/**
 * Les éléments **génériques** : nommer l'un d'eux exige un rôle (R13).
 *
 * La spécification ARIA interdit `aria-label` sur les rôles `paragraph` et
 * `generic`. Les technologies d'assistance l'ignorent, et le piège est qu'un
 * balisage fautif *a l'air* correct : c'est la façon dont un lecteur d'écran se
 * met à énoncer « niveau 2 3 », c'est-à-dire une valeur fausse.
 */
const GENERIQUES = new Set([
  'div',
  'span',
  'p',
  'i',
  'b',
  'em',
  'strong',
  'small',
  'u',
  's',
  'sub',
  'sup',
  'pre',
  'blockquote',
])

function fichiersDe(racine: string): readonly string[] {
  const trouves: string[] = []
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree)
    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiersDe(chemin))
      continue
    }
    if (/\.(ts|tsx|css)$/.test(entree)) trouves.push(chemin)
  }
  return trouves
}

const FICHIERS = fichiersDe(SRC).map((chemin) => ({
  chemin: relative(SRC, chemin).split('\\').join('/'),
  contenu: readFileSync(chemin, 'utf8'),
}))

/** Le contenu sans ses commentaires — un commentaire n'est pas une règle. */
function sansCommentaires(contenu: string): string {
  return contenu
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:/])\/\/[^\n]*/g, (_, avant: string) => avant)
}

/**
 * Le prélude d'une `@media`, **neutralisé** avant la recherche de longueurs.
 *
 * Ce n'est pas une tolérance, c'est une limite du langage : la syntaxe des
 * requêtes de média n'évalue pas `var()`, et un seuil de bascule ne **peut
 * pas** être une propriété personnalisée. L'écrire en dur y est la seule voie.
 *
 * Le trou est refermé plus bas, non par une exception mais par un **couplage
 * vérifié** : chaque seuil employé doit correspondre à un palier déclaré dans
 * `tokens.css`. Le nombre reste donc nommé d'un seul endroit, et un palier
 * ajouté à la main sans son jeton fait échouer la porte.
 */
function sansPreludesDeMedia(contenu: string): string {
  return contenu.replace(/@media[^{]*/g, (prelude) => prelude.replace(/[^\n]/g, ' '))
}

interface Releve {
  readonly fichier: string
  readonly ligne: number
  readonly extrait: string
}

function relever(motif: RegExp, filtre?: (fichier: string) => boolean): readonly Releve[] {
  const releves: Releve[] = []
  for (const { chemin, contenu } of FICHIERS) {
    if (filtre !== undefined && !filtre(chemin)) continue
    const lignes = sansPreludesDeMedia(sansCommentaires(contenu)).split('\n')
    lignes.forEach((texte, index) => {
      for (const trouvaille of texte.matchAll(motif)) {
        releves.push({ fichier: chemin, ligne: index + 1, extrait: trouvaille[0].trim() })
      }
    })
  }
  return releves
}

const decrire = (releves: readonly Releve[]): string =>
  releves.map((r) => `${r.fichier}:${r.ligne} → ${r.extrait}`).join('\n  ')

const horsSourceDesValeurs = (fichier: string): boolean => !FICHIERS_EXEMPTES.has(fichier)

describe('la porte de non-régression a bien lu quelque chose', () => {
  it('parcourt un nombre non nul de fichiers', () => {
    expect(FICHIERS.length).toBeGreaterThan(0)
  })

  it('trouve la source unique des valeurs à sa place', () => {
    expect(FICHIERS.map((f) => f.chemin)).toContain(SOURCE_DES_VALEURS)
  })

  it('n’exempte que des fichiers qui existent — une exception morte est un mensonge', () => {
    const chemins = new Set(FICHIERS.map((f) => f.chemin))
    const mortes = [...FICHIERS_EXEMPTES].filter((fichier) => !chemins.has(fichier))
    expect(mortes, `exceptions portant sur un fichier absent : ${mortes.join(', ')}`).toEqual([])
  })
})

describe('aucune valeur visuelle littérale hors de tokens.css (INV-V2)', () => {
  it('aucun code hexadécimal de couleur', () => {
    const releves = relever(
      /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g,
      horsSourceDesValeurs,
    )
    expect(releves, `couleurs en dur :\n  ${decrire(releves)}`).toEqual([])
  })

  it('aucune fonction de couleur littérale', () => {
    const releves = relever(/\b(?:rgb|rgba|hsl|hsla|oklch|lab)\(/g, horsSourceDesValeurs)
    expect(releves, `fonctions de couleur en dur :\n  ${decrire(releves)}`).toEqual([])
  })

  it('aucun angle littéral', () => {
    const releves = relever(/-?\d+(?:\.\d+)?deg\b/g, horsSourceDesValeurs)
    expect(releves, `rotations en dur :\n  ${decrire(releves)}`).toEqual([])
  })

  it('aucune longueur en pixels', () => {
    const releves = relever(/-?\d+(?:\.\d+)?px\b/g, horsSourceDesValeurs)
    expect(releves, `longueurs en pixels en dur :\n  ${decrire(releves)}`).toEqual([])
  })
})

/**
 * Le couplage qui remplace l'exception des préludes de `@media`.
 *
 * Un seuil de bascule est un nombre qui décide de la mise en page ; il ne peut
 * pas vivre dans un `var()`, mais il peut être **tenu** : chaque seuil employé
 * doit avoir son palier déclaré dans `tokens.css`. Ajouter un palier à la main
 * fait alors échouer la porte, ce qui est exactement ce que FR-007 demande —
 * « un palier de largeur **unique** » ne se vérifie que si les paliers se
 * comptent.
 */
describe('chaque seuil de bascule a son palier déclaré (FR-007)', () => {
  const paliers = new Map<string, string>()
  const tokensCss = FICHIERS.find((f) => f.chemin === SOURCE_DES_VALEURS)?.contenu ?? ''
  for (const trouvaille of sansCommentaires(tokensCss).matchAll(
    /(--palier-[a-z0-9-]+)\s*:\s*([^;]+);/g,
  )) {
    paliers.set((trouvaille[2] as string).trim(), trouvaille[1] as string)
  }

  it('déclare au moins un palier', () => {
    expect(paliers.size).toBeGreaterThan(0)
  })

  /** Tous les seuils en pixels écrits dans les préludes de `@media` d'un fichier. */
  const seuilsDeMedia = (contenu: string): readonly string[] =>
    [...sansCommentaires(contenu).matchAll(/@media[^{]*/g)].flatMap((media) =>
      [...(media[0] as string).matchAll(/\d+(?:\.\d+)?px/g)].map((seuil) => seuil[0] as string),
    )

  const feuillesDeLaRegie = FICHIERS.filter(
    ({ chemin }) =>
      chemin.endsWith('.css') && (chemin === SOURCE_DES_VALEURS || !FICHIERS_EXEMPTES.has(chemin)),
  )

  it('n’emploie aucun seuil sans palier', () => {
    const orphelins = feuillesDeLaRegie.flatMap(({ chemin, contenu }) =>
      seuilsDeMedia(contenu)
        .filter((seuil) => !paliers.has(seuil))
        .map((seuil) => `${chemin} → @media ... ${seuil}`),
    )
    expect(
      orphelins,
      `seuils de média sans palier déclaré dans tokens.css :\n  ${orphelins.join('\n  ')}`,
    ).toEqual([])
  })
})

/**
 * FR-039a — **nulle part**, `tokens.css` compris.
 *
 * C'est ce qui rend WCAG 1.4.4 vrai : le plancher protège la lecture par défaut,
 * le `rem` protège celle du joueur qui a réglé son appareil. Une seule taille en
 * pixels suffit à ne plus doubler.
 */
describe('aucune taille de police en pixels, nulle part (FR-039a)', () => {
  it('ni dans une déclaration font-size', () => {
    const releves = relever(/font-size\s*:\s*[^;{}]*\b\d+(?:\.\d+)?px\b/g)
    expect(releves, `tailles de police en pixels :\n  ${decrire(releves)}`).toEqual([])
  })

  it('ni dans une propriété de taille typographique du jeu de valeurs', () => {
    const releves = relever(/--typo-[a-z0-9-]+-taille\s*:\s*[^;{}]*\b\d+(?:\.\d+)?px\b/g)
    expect(releves, `pas typographiques en pixels :\n  ${decrire(releves)}`).toEqual([])
  })
})

describe('les valeurs de nuit sont en réserve (INV-V3, FR-036)', () => {
  const tokensCss = FICHIERS.find((f) => f.chemin === SOURCE_DES_VALEURS)?.contenu ?? ''

  it.each(VALEURS_DE_NUIT)('%s est transcrite', (nom) => {
    expect(tokensCss, `${SOURCE_DES_VALEURS} ne porte pas ${nom}`).toMatch(
      new RegExp(`${nom}\\s*:`),
    )
  })

  it.each(VALEURS_DE_NUIT)('%s n’est référencée par aucune règle', (nom) => {
    const releves = relever(new RegExp(`var\\(\\s*${nom}\\b`, 'g'))
    expect(
      releves,
      `FR-036 met le thème sombre hors périmètre tant que ses ratios ne sont pas ` +
        `mesurés ; ${nom} est pourtant employée :\n  ${decrire(releves)}`,
    ).toEqual([])
  })
})

/**
 * FR-007 et R10 — **le guichet déplace des boîtes, jamais des rangs**.
 *
 * `order` et `flex-direction: *-reverse` produisent le même effet visuel que des
 * zones de grille nommées, et **dissocient l'ordre de tabulation de l'ordre
 * visuel** : c'est la façon canonique de casser WCAG 2.4.3, et elle est d'autant
 * plus tentante qu'elle est plus courte à écrire.
 *
 * C'est la seule moitié de FR-007 qui soit décidable par un automate : jsdom
 * n'applique aucun CSS, et un test de rendu ne peut donc pas voir un réordonnancement
 * visuel. Ici, sur la feuille, il se voit.
 */
describe('le guichet ne réordonne pas visuellement (FR-007, R10)', () => {
  const feuillesDeLaRegie = ['design/parcelle.css', 'design/regie.css', 'design/base.css']

  const dansLesFeuilles = (motif: RegExp) =>
    relever(motif, (fichier) => feuillesDeLaRegie.includes(fichier))

  it('a bien lu les trois feuilles de la Régie', () => {
    const chemins = FICHIERS.map((f) => f.chemin)
    for (const feuille of feuillesDeLaRegie) {
      expect(chemins, `la feuille ${feuille}`).toContain(feuille)
    }
  })

  it('n’emploie aucune propriété `order`', () => {
    const releves = dansLesFeuilles(/(^|[\s;{])order\s*:/g)
    expect(releves, `usages de « order » :\n  ${decrire(releves)}`).toEqual([])
  })

  it('n’emploie aucune direction inversée', () => {
    const releves = dansLesFeuilles(/(?:flex|grid-auto)-(?:direction|flow)\s*:[^;]*reverse/g)
    expect(releves, `directions inversées :\n  ${decrire(releves)}`).toEqual([])
  })

  it('n’emploie aucun `dense` de placement automatique', () => {
    // `grid-auto-flow: dense` réordonne les boîtes pour combler les trous : même
    // effet, même défaut, et il ne se voit pas dans une revue de mise en page.
    const releves = dansLesFeuilles(/grid-auto-flow\s*:[^;]*dense/g)
    expect(releves, `placement dense :\n  ${decrire(releves)}`).toEqual([])
  })

  /** Le guichet **existe**, et il passe par des zones nommées. */
  it('déplace ses boîtes par des zones de grille nommées', () => {
    const zones = dansLesFeuilles(/grid-template-areas\s*:/g)
    expect(zones.length, 'le guichet doit employer des zones nommées').toBeGreaterThan(0)
  })
})

/**
 * INV-N1 — **une seule région polie déclarée dans tout le client**.
 *
 * Le test de rendu compte les régions présentes sur l'écran ; il ne peut compter que
 * celles qui sont *rendues*. Or la seconde région de 001 — celle de `BuildPanel` —
 * n'apparaissait **que sur une grille pleine** : un test de rendu sur une planète
 * neuve ne la voyait pas, et l'invariant tenait par chance.
 *
 * La porte compte donc les **déclarations**, dans la source, où une région
 * conditionnelle se voit autant qu'une région permanente. `role="status"` est compté
 * avec `aria-live="polite"` : le rôle implique l'attribut, et c'est précisément la
 * forme que prenait celle de `BuildPanel`.
 */
describe('une seule région d’annonce polie est déclarée (INV-N1, FR-022)', () => {
  /**
   * Les deux régions qui **remplacent** l'écran au lieu de coexister avec lui.
   *
   * Vérifié par lecture le 2026-08-28 : `PlanetLoader` et `SessionGate` déclarent
   * chacun leur région dans un **retour anticipé** — `if (query.isPending) return …`
   * et `if (status.state === 'loading') return …`. L'écran de parcelle n'est alors
   * pas monté du tout, et il n'existe donc jamais deux régions polies ensemble.
   *
   * FR-022 porte sur ce qui est **sur l'écran** ; un écran d'attente qui prend la
   * place de l'écran n'en fait pas partie. L'exemption est nommée plutôt que devinée
   * d'un dossier : le jour où l'une des deux cesse d'être un retour anticipé, elle
   * devra sortir de cette liste, et la sortir sera une décision.
   */
  const AttentesQuiRemplacentLEcran = [
    'features/auth/PlanetLoader.tsx',
    'features/auth/SessionGate.tsx',
  ]

  const Polie = /aria-live=\{?["']polite["']|role=\{?["']status["']/g

  /**
   * Dédoublonné par `fichier:ligne`.
   *
   * Une même déclaration porte souvent les **deux** formes — `role="status"`
   * *implique* `aria-live="polite"`, et les écrire ensemble est la pratique correcte.
   * Compter les occurrences plutôt que les éléments faisait donc voir deux régions là
   * où il n'y en a qu'une, et la porte accusait à faux.
   */
  const surLEcran = () => {
    const vues = new Set<string>()
    return relever(Polie)
      .filter((releve) => !AttentesQuiRemplacentLEcran.includes(releve.fichier))
      .filter((releve) => {
        const clef = `${releve.fichier}:${releve.ligne}`
        if (vues.has(clef)) return false
        vues.add(clef)
        return true
      })
  }

  it('a bien lu quelque chose — les deux attentes sont trouvées', () => {
    const toutes = relever(Polie).map((releve) => releve.fichier)
    for (const attente of AttentesQuiRemplacentLEcran) {
      expect(toutes, `l’exemption ${attente} porte sur une déclaration réelle`).toContain(attente)
    }
  })

  it('n’en déclare qu’une sur l’écran de parcelle', () => {
    const parFichier = surLEcran().map((releve) => `${releve.fichier}:${releve.ligne}`)

    expect(
      parFichier,
      'deux régions polies se disputent l’ordre de restitution : le joueur entend ' +
        `l’une des deux sans savoir laquelle.\n  ${parFichier.join('\n  ')}`,
    ).toHaveLength(1)
  })

  it('la déclare dans la région d’annonce, et nulle part ailleurs', () => {
    expect(surLEcran()[0]?.fichier).toBe('features/grid/GridLiveRegion.tsx')
  })
})

/**
 * R13 — jamais `aria-label` sur un élément sans rôle.
 *
 * Un composant dont le nom commence par une majuscule reçoit la propriété et la
 * transmet : c'est à sa définition que la règle s'applique, et elle y est
 * vérifiée par ce même parcours.
 */
describe('aucun aria-label sur un élément sans rôle (R13)', () => {
  /** Vrai si cette balise ouvrante nomme un élément générique **sans** rôle. */
  const nommeSansRole = (balise: string, attributs: string): boolean =>
    GENERIQUES.has(balise) && /\baria-label\b/.test(attributs) && !/\brole=/.test(attributs)

  const fautifsDe = ({
    chemin,
    contenu,
  }: {
    chemin: string
    contenu: string
  }): readonly string[] => {
    const texte = sansCommentaires(contenu)
    return [...texte.matchAll(/<([A-Za-z][A-Za-z0-9]*)([^>]*?)\/?>/g)]
      .filter((balise) => nommeSansRole(balise[1] as string, balise[2] as string))
      .map((balise) => {
        const ligne = texte.slice(0, balise.index).split('\n').length
        return `${chemin}:${ligne} → <${balise[1]}> nommé sans rôle`
      })
  }

  it('les éléments génériques nommés portent tous un rôle', () => {
    const fautifs = FICHIERS.filter(({ chemin }) => chemin.endsWith('.tsx')).flatMap(fautifsDe)
    expect(
      fautifs,
      'la spécification ARIA interdit aria-label sur les rôles paragraph et generic ; ' +
        `les technologies d’assistance l’ignorent :\n  ${fautifs.join('\n  ')}`,
    ).toEqual([])
  })
})
