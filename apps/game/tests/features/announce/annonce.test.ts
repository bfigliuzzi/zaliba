import type { ResourceId } from '@zaliba/catalogs'
import type { HoldingView, WorkView } from '@zaliba/domain'
import { duration, instant } from '@zaliba/domain'
import { describe, expect, it } from 'vitest'
import {
  type EtatObserve,
  ORIGINES_ANNONCE,
  type OrigineAnnonce,
  transitionsEntre,
} from '../../../src/features/announce/useAnnonce.js'

/**
 * L'annonce : ses **sept origines**, et les deux transitions (R11, INV-N2, INV-N4).
 *
 * **Aucune origine ne correspond à la progression d'un compteur** (INV-N2), et
 * c'est l'invariant central : les quantités changent à la seconde, et les annoncer
 * noierait tout le reste. Le test le *constate* sur la liste des origines plutôt que
 * de le supposer d'une lecture du code.
 *
 * **La rotation de l'empreinte n'a pas d'origine propre** : elle change le verdict
 * de placement sous le curseur, donc elle réécrit l'annonce sous l'origine
 * `curseur`. Le contrat l'énumère comme un événement pour le joueur, pas comme une
 * seconde origine — c'est le même écrivain.
 */

const T0 = instant(1_787_750_000)

const holding = (saturatedSince: number | null): Pick<HoldingView, 'saturatedSince'> => ({
  saturatedSince: saturatedSince === null ? null : instant(saturatedSince),
})

const etat = (patch: Partial<EtatObserve> = {}): EtatObserve => ({
  work: null,
  holdings: {
    camelote: holding(null),
    jus: holding(null),
    'bave-etoiles': holding(null),
  },
  ...patch,
})

const chantier = (): WorkView => ({
  id: '77777777-7777-4777-8777-777777777777',
  nature: 'upgrade',
  target: { kind: 'building', buildingId: '88888888-8888-4888-8888-888888888888' },
  startedAt: T0,
  dueAt: instant(T0 + 120),
  remaining: duration(60),
})

describe('les sept origines, et rien qu’elles (data-model § 6.1)', () => {
  it('en compte exactement sept', () => {
    expect(ORIGINES_ANNONCE.length).toBe(7)
  })

  it('les nomme toutes', () => {
    expect([...ORIGINES_ANNONCE].sort()).toEqual(
      [
        'chantier-acheve',
        'curseur',
        'entree-grille',
        'pose-acceptee',
        'pose-refusee',
        'releve',
        'stockage-sature',
      ].sort(),
    )
  })

  /**
   * INV-N2 — **aucune origine ne correspond à la progression d'un compteur**.
   *
   * L'assertion porte sur les noms, ce qui est plus faible qu'une preuve et plus
   * fort qu'une relecture : une origine `tick`, `seconde`, `compteur` ou
   * `ressource` ne pourrait pas être ajoutée sans faire échouer ce test, et c'est
   * exactement la porte qu'on veut — celle qui refuse le nom avant le mécanisme.
   */
  it('n’en nomme aucune d’après un compteur (INV-N2)', () => {
    const suspectes = (ORIGINES_ANNONCE as readonly string[]).filter((origine) =>
      /tick|seconde|compteur|ressource|quantite|horloge|progression/i.test(origine),
    )
    expect(suspectes, `origines qui sentent le compteur : ${suspectes.join(', ')}`).toEqual([])
  })

  /** La rotation **n'est pas** une origine : elle réécrit sous `curseur`. */
  it('ne porte aucune origine de rotation', () => {
    expect(ORIGINES_ANNONCE as readonly string[]).not.toContain('rotation')
    expect(ORIGINES_ANNONCE as readonly string[]).toContain('curseur')
  })
})

/**
 * INV-N4 — les deux transitions se détectent **par comparaison**, jamais par une
 * échéance d'horloge lue directement.
 *
 * C'est le seul endroit de la tranche où le client observe le temps qui passe pour
 * en tirer une phrase, et il l'observe **indirectement** : comparer deux projections
 * successives ne demande pas de savoir *quand*, seulement *que* quelque chose a
 * changé. L'horloge du client n'est jamais une source de vérité.
 */
describe('les deux transitions de R11 (INV-N4)', () => {
  it('ne détecte rien au premier état — il n’y a rien à comparer', () => {
    expect(transitionsEntre(null, etat({ work: chantier() }))).toEqual([])
  })

  it('détecte l’achèvement quand work passe de non nul à nul', () => {
    const trouvees = transitionsEntre(etat({ work: chantier() }), etat({ work: null }))
    expect(trouvees.map((une) => une.origine)).toEqual(['chantier-acheve'])
  })

  it('rend le chantier achevé, pour qu’il puisse être nommé', () => {
    const acheve = chantier()
    const trouvees = transitionsEntre(etat({ work: acheve }), etat({ work: null }))
    expect(trouvees[0]?.acheve).toBe(acheve)
  })

  it('ne détecte rien quand le chantier se poursuit', () => {
    expect(transitionsEntre(etat({ work: chantier() }), etat({ work: chantier() }))).toEqual([])
  })

  it('ne détecte rien quand un chantier **commence**', () => {
    // Un lancement est une action du joueur : elle a sa propre annonce
    // (`pose-acceptee`), et l'annoncer deux fois ferait répéter le lecteur d'écran.
    expect(transitionsEntre(etat({ work: null }), etat({ work: chantier() }))).toEqual([])
  })

  it('détecte la saturation quand saturatedSince passe de nul à un instant', () => {
    const trouvees = transitionsEntre(
      etat(),
      etat({
        holdings: {
          camelote: holding(T0),
          jus: holding(null),
          'bave-etoiles': holding(null),
        },
      }),
    )
    expect(trouvees).toEqual([{ origine: 'stockage-sature', resourceId: 'camelote' }])
  })

  it('ne redétecte pas une saturation déjà acquise', () => {
    const sature = etat({
      holdings: { camelote: holding(T0), jus: holding(null), 'bave-etoiles': holding(null) },
    })
    expect(transitionsEntre(sature, sature)).toEqual([])
  })

  it('détecte deux saturations simultanées, chacune nommée', () => {
    const trouvees = transitionsEntre(
      etat(),
      etat({
        holdings: { camelote: holding(T0), jus: holding(T0), 'bave-etoiles': holding(null) },
      }),
    )
    expect(trouvees.map((une) => une.resourceId)).toEqual(['camelote', 'jus'])
  })

  it('détecte l’achèvement **et** la saturation ensemble', () => {
    const trouvees = transitionsEntre(
      etat({ work: chantier() }),
      etat({
        work: null,
        holdings: { camelote: holding(T0), jus: holding(null), 'bave-etoiles': holding(null) },
      }),
    )
    expect(trouvees.map((une) => une.origine)).toEqual(['chantier-acheve', 'stockage-sature'])
  })

  /**
   * Une saturation **résorbée puis revenue** doit se redétecter. C'est ce qui exige
   * que la référence d'état avance à chaque observation, et non seulement quand une
   * transition a lieu.
   */
  it('redétecte une saturation qui revient après avoir été résorbée', () => {
    const nu = etat()
    const sature = etat({
      holdings: { camelote: holding(T0), jus: holding(null), 'bave-etoiles': holding(null) },
    })

    expect(transitionsEntre(nu, sature).length).toBe(1)
    expect(transitionsEntre(sature, nu).length).toBe(0)
    expect(transitionsEntre(nu, sature).length).toBe(1)
  })

  /** Aucune transition ne lit l'instant : la fonction n'en reçoit aucun. */
  it('ne prend aucun instant en argument (INV-N4)', () => {
    expect(transitionsEntre.length).toBe(2)
  })
})

describe('le type des origines est fermé', () => {
  it('n’admet que les sept', () => {
    const origines: readonly OrigineAnnonce[] = [...ORIGINES_ANNONCE]
    const noms: readonly ResourceId[] = ['camelote', 'jus', 'bave-etoiles']
    expect(origines.length + noms.length).toBe(10)
  })
})
