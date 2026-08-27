import { CATALOG_VERSION } from '@zaliba/catalogs'

/**
 * **La divergence de catalogue, détectée plutôt que subie** (R15).
 *
 * Le client calcule ses aperçus avec le **même code** que le serveur (R8), ce qui
 * suppose le même catalogue. Un client resté en cache après un rééquilibrage
 * afficherait alors des coûts exacts pour un monde qui n'existe plus — et le serveur
 * refuserait des commandes que l'interface annonçait comme valides, sans que rien
 * n'explique pourquoi. Comparer les versions transforme cette confusion en un
 * message.
 *
 * **Deux décisions gouvernent ce fichier, et la seconde est la plus importante.**
 *
 * Le rechargement est **proposé, jamais imposé** : recharger d'autorité perdrait la
 * frappe en cours, et pourrait boucler si la divergence venait d'un cache
 * intermédiaire que le rechargement ne vide pas.
 *
 * Et **aucun chiffre calculé localement n'est affiché en attendant**. Un
 * avertissement placé *à côté* de chiffres faux est pire que pas d'avertissement : il
 * laisse le joueur décider s'il croit un nombre dont il n'a aucun moyen de juger.
 * `derivedValuesUsable` est donc un champ et non un commentaire — l'écran le lit, et
 * le test le tient.
 */

export interface CatalogDivergence {
  /** La version que ce client embarque. */
  readonly embedded: string
  /** Celle que la réponse annonce. */
  readonly fromServer: string
  /**
   * Ce que l'interface doit faire. Un seul cas en 001, et le champ existe pour que
   * l'écran n'ait pas à le deviner d'un booléen.
   */
  readonly action: 'offer-reload'
  /**
   * Vrai quand les aperçus et compteurs calculés localement peuvent être affichés.
   * **Toujours faux** dans une divergence : c'est le sujet.
   */
  readonly derivedValuesUsable: false
  /** Le message, qui **nomme les deux versions** — sans elles, aucune enquête. */
  readonly message: string
}

/**
 * La version annoncée, normalisée.
 *
 * Une version absente, vide ou faite d'espaces est traitée comme **divergente**, et
 * non comme un accord. Le sens prudent est le seul défendable : croire à l'accord sur
 * la foi d'une absence ferait afficher des chiffres faux précisément quand on ne sait
 * rien.
 */
function normalize(fromServer: string | null | undefined): string | null {
  if (fromServer === null || fromServer === undefined) return null
  const trimmed = fromServer.trim()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * La divergence, ou `null` quand les versions concordent.
 *
 * La comparaison est une **égalité**, jamais un ordre. Une version plus ancienne côté
 * serveur diverge autant qu'une plus récente — un déploiement annulé remet le serveur
 * en arrière, et le client resté en avance calculerait alors des chiffres que le
 * serveur refuse. L'ordre serait de surcroît impossible à établir : la version est un
 * identifiant, pas un numéro.
 */
export function catalogDivergence(fromServer: string | null | undefined): CatalogDivergence | null {
  const announced = normalize(fromServer)
  if (announced === CATALOG_VERSION) return null

  const named = announced ?? 'aucune version annoncée'

  return {
    embedded: CATALOG_VERSION,
    fromServer: named,
    action: 'offer-reload',
    derivedValuesUsable: false,
    message:
      `Les règles du jeu ont changé : ce client embarque le catalogue ${CATALOG_VERSION}, ` +
      `le serveur applique ${named}. Rechargez la page pour retrouver des chiffres exacts.`,
  }
}

/** Vrai quand le catalogue embarqué est celui que le serveur applique. */
export function isCatalogInSync(fromServer: string | null | undefined): boolean {
  return catalogDivergence(fromServer) === null
}
