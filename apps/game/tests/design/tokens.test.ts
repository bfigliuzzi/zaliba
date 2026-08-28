import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La porte de conformité du jeu de valeurs (INV-V1, INV-V5).
 *
 * Elle tient FR-001 par un mécanisme et non par la discipline : `tokens.json`
 * est la référence livrée par le dossier de design, `tokens.css` est ce que le
 * navigateur lit, et cette porte échoue à la première divergence — y compris six
 * mois plus tard (R2).
 *
 * **Elle doit constater qu'elle a lu quelque chose.** Une porte qui parcourt
 * zéro clé et sort en succès est pire qu'une porte absente : son inertie prend
 * l'apparence d'un succès. C'est le constat qui a fait descendre TypeScript à la
 * ligne 6 (amendement 2.1.0 de la constitution), et il vaut ici.
 */

const RACINE = join(import.meta.dirname, '../..')
const DOSSIER_DESIGN = join(RACINE, '../../docs/design/2026-08-27-regie-approximative')

type Groupe = Record<string, unknown>

const tokens = JSON.parse(readFileSync(join(DOSSIER_DESIGN, 'tokens.json'), 'utf8')) as Groupe

const CSS = readFileSync(join(RACINE, 'src/design/tokens.css'), 'utf8')

/**
 * Les clés de **documentation** de `tokens.json`, ignorées.
 *
 * Elles sont **nommées** et non devinées d'un préfixe : deviner ferait qu'une
 * clé opérante commençant un jour par `$` disparaîtrait de la porte sans que
 * personne ne l'ait décidé.
 */
const CLES_DOCUMENTAIRES = ['$description', '$note', '$regle', '$viewBox']

const estDocumentaire = (cle: string): boolean => CLES_DOCUMENTAIRES.includes(cle)

/**
 * Les huit groupes transcrits en propriétés personnalisées, et leur préfixe.
 *
 * La table est celle du § 1 de `contracts/jeu-de-valeurs.md`. Le seul renommage
 * est `cible_tactile` → `--cible-*`, qui y figure.
 */
const GROUPES_TRANSCRITS: Readonly<Record<string, string>> = {
  couleur: '--couleur',
  typo: '--typo',
  espacement: '--espacement',
  trait: '--trait',
  ombre: '--ombre',
  rotation: '--rotation',
  arrondi: '--arrondi',
  cible_tactile: '--cible',
}

/**
 * Les deux groupes qui ne se transcrivent **pas** en valeurs CSS, et où ils vont.
 *
 * Les nommer ici plutôt que les omettre en silence est ce qui rend la porte
 * complète : l'assertion d'exhaustivité ci-dessous compare les groupes réels de
 * `tokens.json` à l'union des deux listes, de sorte qu'un **neuvième groupe**
 * arrivant demain fasse échouer la porte au lieu d'être ignoré.
 */
const GROUPES_NON_TRANSCRITS: Readonly<Record<string, string>> = {
  police:
    'les familles deviennent des piles de police, replis compris — une valeur ajoutée par ' +
    'l’implémentation, non une transcription (data-model § 1.2)',
  glyphes: 'la géométrie des sept silhouettes, rendue par src/design/Glyphe.tsx',
}

/**
 * Le rôle de chaque pas typographique, **déclaré ici** (R14).
 *
 * C'est la seule information que la porte ne peut pas tirer de `tokens.json` :
 * le dossier ne dit pas si un pas porte de l'information ou du décor, et c'est
 * précisément ce que R14 tranche. Le déclarer dans la porte le rend opposable.
 */
type Role = 'saisie' | 'information' | 'intitule' | 'decor'

const ROLE_DU_PAS: Readonly<Record<string, Role>> = {
  micro: 'decor',
  note: 'decor',
  label: 'intitule',
  menu: 'information',
  corps: 'information',
  item: 'information',
  'chiffre-xs': 'information',
  'chiffre-s': 'information',
  fiche: 'information',
  'pochoir-s': 'information',
  'chiffre-m': 'information',
  'pochoir-m': 'information',
  'chiffre-l': 'information',
  'titre-m': 'information',
  'titre-l': 'information',
}

/** Les quatre planchers de FR-039, en pixels. */
const PLANCHER: Readonly<Record<Role, number>> = {
  saisie: 16,
  information: 14,
  intitule: 12,
  decor: 9.5,
}

/**
 * Le pas que `tokens.json` ne porte pas.
 *
 * `chiffre-xs` est une **addition** de la tranche : le débit horaire est un
 * chiffre, et FR-002 range tout chiffre dans la famille tabulaire. Le dossier le
 * laissait en corps 9,5 non tabulaire, sous tous les planchers.
 */
const PAS_AJOUTES: Readonly<Record<string, number>> = { 'chiffre-xs': 14 }

/**
 * Le nombre exprimé en `rem`, plancher appliqué.
 *
 * Quatre décimales : 9,5 ÷ 16 vaut 0,59375, et le tronquer plus court
 * déplacerait le texte de décor sous son plancher pour une raison d'arrondi.
 */
function remDe(pixels: number): string {
  return `${Math.round((pixels / 16) * 10_000) / 10_000}rem`
}

/**
 * Les propriétés personnalisées du **premier** bloc `:root` de `tokens.css`.
 *
 * Le premier seulement, et c'est délibéré : le budget de largeur de R9
 * redéclare plusieurs de ces propriétés sous 360 px, dans un `@media`. Les lire
 * toutes donnerait deux valeurs par clé et la porte comparerait la dernière
 * gagnante, c'est-à-dire la valeur resserrée, à celle du dossier.
 */
function proprietesDeLaRacine(css: string): Map<string, string> {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const debut = sansCommentaires.indexOf(':root')
  if (debut === -1) throw new Error('tokens.css ne porte aucun bloc :root')

  const ouvrante = sansCommentaires.indexOf('{', debut)
  const fermante = sansCommentaires.indexOf('}', ouvrante)
  const bloc = sansCommentaires.slice(ouvrante + 1, fermante)

  const proprietes = new Map<string, string>()
  for (const ligne of bloc.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    proprietes.set(ligne[1] as string, (ligne[2] as string).trim().replace(/\s+/g, ' '))
  }
  return proprietes
}

const racine = proprietesDeLaRacine(CSS)

/**
 * La **notation** d'une valeur CSS, neutralisée avant comparaison.
 *
 * INV-V1 porte « à la valeur près », et non au caractère près. Or CSS admet
 * plusieurs écritures d'une même valeur, et le formateur de Biome en choisit
 * une : `#1B2220` devient `#1b2220`, `.16em` devient `0.16em`,
 * `rgba(27,34,32,.35)` devient `rgba(27, 34, 32, 0.35)`. Le dossier de design,
 * lui, écrit l'autre.
 *
 * **Comparer les caractères opposerait deux portes du dépôt l'une à l'autre** :
 * le lint échouerait exactement quand la conformité passe, et l'une des deux
 * finirait désactivée. Trois normalisations suffisent, et chacune porte sur une
 * différence dont on peut démontrer qu'elle ne change pas la valeur :
 *
 * 1. la casse d'un hexadécimal — la syntaxe est insensible à la casse ;
 * 2. le zéro de tête d'un décimal — `.5` et `0.5` sont le même nombre ;
 * 3. l'espace autour d'une virgule d'argument, et les suites d'espaces.
 *
 * Ce qui n'est **pas** normalisé : l'unité, le signe, le nombre lui-même, l'ordre
 * des composantes. Une divergence sur l'un de ces quatre reste une divergence.
 */
function normaliser(valeur: string): string {
  return valeur
    .replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => hex.toLowerCase())
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s,(:+\-*/])\.(\d)/g, '$10.$2')
    .trim()
}

type Couple = readonly [string, string]

const nomsOperants = (groupe: Groupe): readonly string[] =>
  Object.keys(groupe).filter((nom) => !estDocumentaire(nom))

/**
 * Une couleur est un objet : sa `valeur` est la teinte.
 *
 * Son `role` et ses `contraste_*` sont de la documentation, et FR-001a en fait
 * de la documentation explicitement — un ratio annoncé n'est jamais une
 * autorisation. La porte de contraste les **recalcule** au lieu de les lire.
 */
function couplesDeCouleur(prefixe: string, groupe: Groupe): readonly Couple[] {
  return nomsOperants(groupe).map(
    (nom) => [`${prefixe}-${nom}`, String((groupe[nom] as Groupe)['valeur'])] as Couple,
  )
}

/** Un pas typographique est un objet : une propriété personnalisée par propriété. */
function couplesDeTypo(prefixe: string, groupe: Groupe): readonly Couple[] {
  return nomsOperants(groupe).flatMap((nom) =>
    nomsOperants(groupe[nom] as Groupe).map(
      (propriete) =>
        [`${prefixe}-${nom}-${propriete}`, String((groupe[nom] as Groupe)[propriete])] as Couple,
    ),
  )
}

/** Les six autres groupes : une valeur scalaire par nom. */
function couplesScalaires(prefixe: string, groupe: Groupe): readonly Couple[] {
  return nomsOperants(groupe).map((nom) => [`${prefixe}-${nom}`, String(groupe[nom])] as Couple)
}

/** Chaque couple (propriété attendue, valeur attendue) que `tokens.json` impose. */
function couplesAttendus(): readonly Couple[] {
  return Object.entries(GROUPES_TRANSCRITS).flatMap(([groupe, prefixe]) => {
    const contenu = tokens[groupe] as Groupe
    if (groupe === 'couleur') return couplesDeCouleur(prefixe, contenu)
    if (groupe === 'typo') return couplesDeTypo(prefixe, contenu)
    return couplesScalaires(prefixe, contenu)
  })
}

describe('le jeu de valeurs transcrit le dossier de design', () => {
  it('a lu un nombre non nul de clés — sans quoi la porte est inerte', () => {
    const couples = couplesAttendus()
    expect(couples.length).toBeGreaterThan(0)
    expect(racine.size).toBeGreaterThan(0)
  })

  it('ne laisse aucun groupe de tokens.json hors de la porte', () => {
    const connus = new Set([
      ...Object.keys(GROUPES_TRANSCRITS),
      ...Object.keys(GROUPES_NON_TRANSCRITS),
    ])
    const inconnus = Object.keys(tokens).filter(
      (groupe) => !estDocumentaire(groupe) && !connus.has(groupe),
    )
    expect(
      inconnus,
      `groupes de tokens.json que la porte ne sait pas traiter : ${inconnus.join(', ')}`,
    ).toEqual([])
  })

  it('porte chaque valeur du dossier, à la valeur près (INV-V1)', () => {
    const manquantes: string[] = []
    const divergentes: string[] = []

    for (const [propriete, attendue] of couplesAttendus()) {
      // Les tailles de police font exception à l'égalité littérale : elles sont
      // relevées au plancher de leur rôle, et éprouvées séparément.
      if (/^--typo-.+-taille$/.test(propriete)) continue

      const trouvee = racine.get(propriete)
      if (trouvee === undefined) manquantes.push(propriete)
      else if (normaliser(trouvee) !== normaliser(attendue)) {
        divergentes.push(`${propriete} : dossier « ${attendue} », css « ${trouvee} »`)
      }
    }

    expect(manquantes, `propriétés absentes de tokens.css : ${manquantes.join(', ')}`).toEqual([])
    expect(divergentes, `valeurs divergentes :\n  ${divergentes.join('\n  ')}`).toEqual([])
  })
})

/**
 * La règle typographique de R14 (INV-V5).
 *
 * **Une règle, jamais une liste d'exceptions.** La porte calcule
 * `max(dossier, plancher[rôle]) ÷ 16` et compare ; un pas ajouté demain reçoit
 * son plancher tout seul, alors qu'une exception énumérée serait invisible en
 * revue six mois plus tard.
 */
describe('le plancher typographique par rôle', () => {
  const pas = {
    ...Object.fromEntries(
      Object.entries(tokens['typo'] as Groupe)
        .filter(([nom]) => !estDocumentaire(nom))
        .map(([nom, valeur]) => [nom, Number.parseFloat(String((valeur as Groupe)['taille']))]),
    ),
    ...PAS_AJOUTES,
  } as Record<string, number>

  it('couvre tous les pas, et rien qu’eux', () => {
    expect(Object.keys(pas).sort()).toEqual(Object.keys(ROLE_DU_PAS).sort())
  })

  it('exprime chaque taille en rem, plancher de son rôle appliqué (INV-V5)', () => {
    const ecarts: string[] = []

    for (const [nom, tailleDuDossier] of Object.entries(pas)) {
      const role = ROLE_DU_PAS[nom]
      if (role === undefined) {
        ecarts.push(`${nom} : aucun rôle déclaré dans la porte`)
        continue
      }

      const attendue = remDe(Math.max(tailleDuDossier, PLANCHER[role]))
      const trouvee = racine.get(`--typo-${nom}-taille`)
      if (trouvee !== attendue) {
        ecarts.push(
          `--typo-${nom}-taille : rôle « ${role} », dossier ${tailleDuDossier} px, ` +
            `plancher ${PLANCHER[role]} px, attendu « ${attendue} », trouvé « ${trouvee} »`,
        )
      }
    }

    expect(ecarts, `écarts au plancher typographique :\n  ${ecarts.join('\n  ')}`).toEqual([])
  })

  it('ajoute chiffre-xs, que le dossier ne porte pas', () => {
    expect(racine.get('--typo-chiffre-xs-taille')).toBe(remDe(14))
  })
})
