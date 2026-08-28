import type { ResourceId } from '@zaliba/catalogs'
import { PlanetSnapshotV1 } from '@zaliba/contracts'
import { DEFAULT_CATALOGS, instant, projectPlanet } from '@zaliba/domain'
import { describe, expect, it } from 'vitest'
import { avecJeton, phraseDeReleve } from '../../../src/features/announce/releve.js'
import { snapshotFromContract } from '../../../src/features/resources/extrapolation.js'
import rawFresh from '../../fixtures/planet-fresh.json' with { type: 'json' }

/**
 * Le relevé (FR-023, FR-023a, INV-N3, INV-N3a).
 *
 * **C'est un besoin d'accessibilité, pas une commodité.** Les compteurs ne sont
 * jamais annoncés d'eux-mêmes ; le relevé est ce qui rend leur information malgré
 * tout accessible à qui écoute la page.
 *
 * **Et le second appui est le sujet de la moitié de ce fichier.** Une région
 * `aria-live` ne réénonce pas un contenu inchangé — et l'état courant *peut* ne pas
 * bouger d'une demande à l'autre. La rédaction précédente de la tranche affirmait
 * que deux relevés diffèrent « les quantités ayant progressé » : c'est faux dès la
 * saturation, que 001 produit déjà. **Le cas saturé est le cas de test, pas le cas
 * de bord.**
 */

const CATALOGS = DEFAULT_CATALOGS
const payload = PlanetSnapshotV1.parse(rawFresh)

function etatA(elapsed: number) {
  const snapshot = snapshotFromContract(payload, CATALOGS)
  const state = projectPlanet(snapshot, CATALOGS, instant(payload.planet.consolidatedAt + elapsed))
  return { holdings: state.holdings, work: state.work, buildings: state.buildings }
}

/**
 * Une planète **saturée** : les trois ressources au plafond, aucun chantier.
 *
 * Le plafond du Berceau est de 18 000 000 grains pour la Camelote et le Jus,
 * 7 200 000 pour la Bave. Les porter au-delà met les trois en saturation dès le
 * premier instant projeté — c'est un état que 001 produit après quelques semaines,
 * et c'est celui où le relevé se répète mot pour mot.
 */
const saturee = PlanetSnapshotV1.parse({
  ...rawFresh,
  holdings: [
    {
      resourceId: 'camelote',
      amountGrains: 18_000_000,
      lostGrains: 0,
      saturatedSince: rawFresh.planet.consolidatedAt - 1000,
    },
    {
      resourceId: 'jus',
      amountGrains: 18_000_000,
      lostGrains: 0,
      saturatedSince: rawFresh.planet.consolidatedAt - 1000,
    },
    {
      resourceId: 'bave-etoiles',
      amountGrains: 7_200_000,
      lostGrains: 0,
      saturatedSince: rawFresh.planet.consolidatedAt - 1000,
    },
  ],
})

function etatSature(elapsed: number) {
  const snapshot = snapshotFromContract(saturee, CATALOGS)
  const state = projectPlanet(snapshot, CATALOGS, instant(saturee.planet.consolidatedAt + elapsed))
  return { holdings: state.holdings, work: state.work, buildings: state.buildings }
}

const RESSOURCES: readonly ResourceId[] = ['camelote', 'jus', 'bave-etoiles']

describe('la phrase énonce les trois quantités, les trois débits et le chantier (INV-N3)', () => {
  const phrase = phraseDeReleve(etatA(0))

  it.each(RESSOURCES)('nomme %s', (resourceId) => {
    const noms = { camelote: 'Camelote', jus: 'Jus', 'bave-etoiles': 'Bave d’étoiles' } as const
    expect(phrase).toContain(noms[resourceId])
  })

  it('porte trois quantités', () => {
    expect(phrase.match(/\d[\d\s ]*,\d\d/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('porte trois débits horaires', () => {
    expect(phrase.match(/par heure|débit nul/g)?.length).toBe(3)
  })

  it('dit le chantier — ou son absence, qui est une information aussi', () => {
    expect(phrase).toMatch(/aucun chantier en cours/i)
  })

  /** Une seule fois par appel : ni doublon, ni répétition (INV-N3). */
  it.each(RESSOURCES)('ne nomme %s qu’une fois', (resourceId) => {
    const noms = { camelote: 'Camelote', jus: 'Jus', 'bave-etoiles': 'Bave d’étoiles' } as const
    expect(phrase.split(noms[resourceId]).length - 1).toBe(1)
  })
})

describe('sur une planète qui progresse, deux relevés diffèrent d’eux-mêmes', () => {
  it('énonce des quantités différentes après quelques minutes', () => {
    expect(phraseDeReleve(etatA(0))).not.toBe(phraseDeReleve(etatA(3600)))
  })
})

/**
 * **FR-023a et INV-N3a — le cas qui a produit l'exigence.**
 *
 * Les trois ressources saturées, aucun chantier : la phrase est **strictement
 * identique** d'un appui à l'autre. C'est là que R11 se trompait en concluant que
 * l'artifice était inutile, et c'est là que le second appui devenait silencieux.
 */
describe('sur une planète saturée, la phrase ne bouge pas — et le jeton la rend distincte', () => {
  it('énonce la même phrase à deux instants différents', () => {
    expect(phraseDeReleve(etatSature(0))).toBe(phraseDeReleve(etatSature(7200)))
  })

  it('dit la saturation, que rien d’autre n’annonce', () => {
    const phrase = phraseDeReleve(etatSature(0))
    expect(phrase.match(/saturée/g)?.length).toBe(3)
    expect(phrase).toMatch(/la production se perd/)
  })

  /** Le cœur de FR-023a : **deux appuis, deux énoncés**. */
  it('rend deux appuis successifs distincts', () => {
    const phrase = phraseDeReleve(etatSature(0))
    expect(avecJeton(phrase, 1)).not.toBe(avecJeton(phrase, 2))
  })

  it('les rend distincts à chaque appui, indéfiniment', () => {
    const phrase = phraseDeReleve(etatSature(0))
    for (let appui = 1; appui < 12; appui += 1) {
      expect(avecJeton(phrase, appui), `l’appui ${appui} doit différer du précédent`).not.toBe(
        avecJeton(phrase, appui - 1),
      )
    }
  })

  /**
   * **Le jeton n'ajoute aucune information fausse, et aucun bruit lisible.**
   *
   * Ce que le joueur entend est la phrase, et rien d'autre : le jeton est un espace
   * de largeur nulle, qu'aucune synthèse vocale ne prononce et qui n'occupe aucun
   * pixel. Ce n'est ni un horodatage — qui serait prononcé — ni un compteur visible
   * — qui serait du bruit.
   */
  it('n’ajoute ni mot, ni chiffre, ni ponctuation', () => {
    const phrase = phraseDeReleve(etatSature(0))
    for (const appui of [0, 1, 2, 3]) {
      const avec = avecJeton(phrase, appui)
      // Retirer les caractères de largeur nulle rend exactement la phrase.
      expect(avec.replace(/\u200B/g, '')).toBe(phrase)
      expect(avec).not.toMatch(/\d{10,}/)
    }
  })

  it('n’ajoute rien de visible — la longueur perçue ne change pas', () => {
    const phrase = phraseDeReleve(etatSature(0))
    for (const appui of [0, 1]) {
      expect(avecJeton(phrase, appui).replace(/\u200B/g, '').length).toBe(phrase.length)
    }
  })
})
