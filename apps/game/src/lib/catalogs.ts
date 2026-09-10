import type { GongLength } from '@zaliba/catalogs'
import { type Catalogs, DECLARED_CATALOGS, resolveCatalogs } from '@zaliba/domain'

/**
 * **Le seul endroit du client qui résout un catalogue** (G11).
 *
 * Le client embarque le catalogue **déclaré** — en gongs — parce qu'il calcule
 * ses aperçus avec le même code que le serveur (R8). Mais un catalogue déclaré
 * n'est consommable par aucune fonction de domaine : il lui manque la longueur
 * du gong, et cette longueur **appartient au serveur**. Le client la reçoit dans
 * chaque instantané de planète, et la passe ici.
 *
 * Quinze points d'appel en ont besoin ; une seule décision la produit. Le motif
 * n'est pas l'économie de lignes : une seconde résolution, ailleurs, pourrait
 * employer une autre longueur — et deux chiffres justes séparément seraient
 * incohérents ensemble, sur le même écran, sans que le joueur puisse savoir
 * lequel croire.
 *
 * **Aucune longueur n'est écrite ici.** Ce fichier ne connaît pas le gong
 * canonique et n'a aucun moyen de l'atteindre ; une porte lexicale
 * (`tests/design/gong-hors-du-client.test.ts`) le vérifie sur tout `src/`,
 * parce qu'aucune règle de frontières ne peut le faire.
 */

/**
 * Le dernier couple (longueur, catalogue) résolu.
 *
 * **La mémoïsation n'est pas un confort.** Résoudre à chaque rendu rendrait les
 * aperçus quadratiques en nombre de cases — trente-six cases, chacune demandant
 * un aperçu, chacun reconstruisant les cinq types et les cinq obstacles — sans
 * qu'aucun test de correction ne s'en aperçoive. Un coût qui ne se voit qu'au
 * profilage, et seulement une fois la grille pleine.
 *
 * Le cache tient **une seule entrée**, et c'est suffisant : la longueur d'un
 * serveur ne change pas d'une réponse à l'autre. En garder plusieurs
 * ajouterait une politique d'éviction pour un gain nul.
 */
let cached: { readonly key: string; readonly catalogs: Catalogs } | null = null

/**
 * Le catalogue résolu à la longueur annoncée par le serveur, ou `null`.
 *
 * `null` dans deux cas, qui appellent la même prudence :
 *
 * - **la longueur est absente** — le serveur ne l'a pas annoncée. Le client
 *   n'affiche alors **aucun** chiffre dérivé, au lieu de se replier sur une
 *   valeur par défaut (FR-013, G9). Le repli afficherait des chiffres
 *   d'apparence exacte pour un monde peut-être différent, ce qui est exactement
 *   la faute que la vérification de version a déjà nommée ;
 * - **la longueur est inutilisable** — un taux du catalogue ne s'y résout pas en
 *   entier. Le serveur refuse de démarrer sur une telle longueur, mais le client
 *   ne peut pas s'appuyer là-dessus pour lever : une réponse inattendue ne doit
 *   pas faire tomber l'écran.
 */
export function resolvedCatalogs(gong: GongLength | null | undefined): Catalogs | null {
  if (gong === null || gong === undefined) return null

  // La clé porte la valeur et non l'identité : le client reçoit un objet neuf à
  // chaque réponse, donc mémoïser sur la référence ne mémoïserait rien.
  const key = `${gong.num}/${gong.den}`
  if (cached !== null && cached.key === key) return cached.catalogs

  try {
    const catalogs = resolveCatalogs(DECLARED_CATALOGS, gong)
    cached = { key, catalogs }
    return catalogs
  } catch {
    return null
  }
}

/**
 * Le dernier catalogue résolu de la session, ou `null` si aucun instantané n'a
 * encore été reçu.
 *
 * **C'est la page de règles qui en a besoin**, et elle seule. `/rules` est
 * lisible sans compte et n'appelle aucune route de planète : hors session, elle
 * ne peut pas connaître la longueur du serveur. Un `GET /v1/config` qui la
 * renseignerait a été écarté — la longueur voyage avec l'état qu'elle explique,
 * et un point d'accès séparé pourrait être mis en cache puis démenti (G7).
 *
 * La page publie donc les **gongs déclarés** — qui ne sont pas des chiffres
 * dérivés mais le contenu du catalogue qu'elle embarque — et **dit** que la
 * longueur du serveur ne lui est pas connue. Dès qu'un instantané a été reçu,
 * elle publie les deux colonnes.
 *
 * Se souvenir de ce que le serveur a annoncé n'est pas détenir une longueur :
 * la valeur vient toujours d'une réponse, jamais du bundle.
 */
export function lastResolvedCatalogs(): Catalogs | null {
  return cached?.catalogs ?? null
}

/**
 * Le catalogue **déclaré**, pour ce qui ne dépend d'aucune longueur.
 *
 * La page de règles s'en sert avant tout instantané reçu : elle publie alors les
 * durées en gongs, qui sont des valeurs déclarées et non des chiffres dérivés.
 */
export { DECLARED_CATALOGS }
