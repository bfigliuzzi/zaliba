import { z } from 'zod'

/**
 * Le modèle d'erreur commun de la version 1 (contracts/README § 7).
 *
 * **Une seule forme de corps**, pour toutes les routes et toutes les versions.
 * La contrainte a l'air modeste ; elle ne l'est pas. Un client natif ancien et
 * non forçable circule sur les magasins d'applications : s'il rencontre une
 * forme d'erreur qu'il ne sait pas lire, il affiche un écran blanc au lieu d'un
 * refus explicable.
 *
 * Ce paquet **n'importe pas `domain`**, et les notions y sont redéclarées. La
 * duplication est volontaire (doc de stack § 3) : sans elle, une
 * refactorisation interne changerait silencieusement le format transmis, et
 * casserait des clients anciens sans qu'aucune compilation n'échoue.
 */

/**
 * `{ code, message, details?, requestId }` — et rien d'autre.
 *
 * Le schéma est **fermé** : une clé inconnue est refusée, jamais ignorée. Un
 * champ ajouté par mégarde partirait en production et deviendrait une
 * dépendance de fait pour un client, donc impossible à retirer.
 */
export const ErrorBodyV1 = z
  .object({
    /** Appartient à une union fermée, documentée route par route. */
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.unknown()).optional(),
    /**
     * L'identifiant de corrélation entre la réponse et le journal. Sans lui,
     * un joueur qui signale « ça n'a pas marché » ne peut être relié à aucune
     * ligne de journal, et l'enquête est impossible.
     */
    requestId: z.string().min(1),
  })
  .strict()

export type ErrorBodyV1 = z.infer<typeof ErrorBodyV1>

/**
 * Les six catégories d'erreur et leur statut HTTP.
 *
 * La ligne qui compte est `game-rule-refusal` → **409**. Un refus du jeu n'est
 * pas une erreur technique : la requête était parfaitement formée, et c'est le
 * jeu qui répond non. Le ranger en 400 dirait au joueur « votre requête est
 * malformée » quand la vérité est « vous n'avez pas assez de Camelote » — et un
 * client qui traite les 400 comme des bogues afficherait le mauvais écran.
 */
export const HTTP_STATUS_BY_CATEGORY = {
  /** Violation de schéma, **avant** toute règle de jeu. */
  'schema-violation': 400,
  /** Jeton absent ou invalide. Aucun détail n'est exposé. */
  authentication: 401,
  /** L'appelant est authentifié mais n'est pas l'occupant. */
  authorization: 403,
  'not-found': 404,
  /** **La porte de toutes les règles de jeu.** */
  'game-rule-refusal': 409,
  /** Défaut serveur. Corrélation par `requestId`, aucun détail exposé. */
  'server-fault': 500,
} as const satisfies Record<string, number>

export type ErrorCategory = keyof typeof HTTP_STATUS_BY_CATEGORY
export type HttpErrorStatus = (typeof HTTP_STATUS_BY_CATEGORY)[ErrorCategory]

/**
 * La catégorie d'un statut, ou `null` s'il n'appartient pas à la table.
 *
 * Retourner `null` plutôt que de deviner : un statut hors table est une faute
 * de conception, et lui inventer une catégorie la rendrait invisible.
 */
export function categoryOfStatus(status: number): ErrorCategory | null {
  const found = Object.entries(HTTP_STATUS_BY_CATEGORY).find(([, value]) => value === status)
  return (found?.[0] as ErrorCategory | undefined) ?? null
}

/**
 * L'union **fermée** des motifs de refus de règle de jeu.
 *
 * Elle est vide à ce stade et s'enrichit tranche par tranche : US2 y ajoute
 * `work-in-progress` et les trois refus de placement, US4 `insufficient-resources`
 * et `max-level-reached`, US5 `cell-not-obstructed`, US6 `building-is-work-target`.
 *
 * Le caractère **fermé** est ce qui satisfait FR-013, FR-034 et SC-007 : ces
 * exigences demandent le *motif exact*, qu'un booléen ou un message libre ne
 * donnent pas. Un client peut donc traiter chaque motif, et la compilation lui
 * dira le jour où un motif nouveau apparaît.
 */
export const REFUSAL_CODES_V1 = [] as const satisfies readonly string[]

export type RefusalCodeV1 = (typeof REFUSAL_CODES_V1)[number]
