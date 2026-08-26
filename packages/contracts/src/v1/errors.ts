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
 * Elle s'enrichit tranche par tranche : US2 a apporté les six premiers, US4
 * `building-not-found` et `max-level-reached` ; US5 apportera
 * `cell-not-obstructed`, US6 `building-is-work-target`.
 *
 * Le caractère **fermé** est ce qui satisfait FR-013, FR-034 et SC-007 : ces
 * exigences demandent le *motif exact*, qu'un booléen ou un message libre ne
 * donnent pas. Un client peut donc traiter chaque motif, et la compilation lui
 * dira le jour où un motif nouveau apparaît.
 *
 * **`message` n'est jamais la source de vérité.** Le client dérive son affichage
 * de `code` et de `details`. Le reconnaître au texte casserait à la première
 * reformulation, et casserait en silence.
 */
export const REFUSAL_CODES_V1 = [
  /** Au plus un chantier par planète (FR-033, FR-034). */
  'work-in-progress',
  /** Le manque **par ressource**, et le temps pour le combler (SC-007). */
  'insufficient-resources',
  'placement-out-of-grid',
  'placement-on-obstructed-cell',
  'placement-on-occupied-cell',
  /** Le choix entre variantes est géométrique, et le catalogue le borne (FR-009). */
  'variant-not-available-for-type',
  /**
   * La cible d'une amélioration n'est pas sur cette planète.
   *
   * C'est un refus de **règle de jeu** et non une requête malformée : le schéma
   * accepte n'importe quel UUID, et rien en lui ne peut dire qu'une planète porte
   * ce bâtiment. Le ranger en 400 dirait au joueur « votre requête est malformée »
   * quand la vérité est « ce bâtiment n'existe plus ».
   */
  'building-not-found',
  /** Le plafond de niveau du catalogue est atteint (FR-040). */
  'max-level-reached',
] as const satisfies readonly string[]

export type RefusalCodeV1 = (typeof REFUSAL_CODES_V1)[number]

/**
 * La forme de `details`, code par code.
 *
 * Elle est **typée**, et c'est ce qui distingue un refus exploitable d'un
 * message d'erreur : un client qui reçoit `placement-on-obstructed-cell` sait
 * qu'il trouvera dans `details.cells` la liste des cases à marquer sur la
 * grille, et il peut le faire sans lire une phrase.
 *
 * Les codes qui ne relèvent pas d'une règle de jeu — `not-occupant` en 403,
 * `planet-not-provisioned` en 404 — n'ont **pas** de détail : dire au demandeur
 * qui occupe la planète, ou qu'elle existe ailleurs, serait répondre à une
 * question qu'il n'a pas le droit de poser.
 */
export const RefusalDetailsV1 = {
  'work-in-progress': z
    .object({
      workId: z.string().uuid(),
      nature: z.enum(['build', 'upgrade', 'demolish', 'clear']),
      /** L'échéance, en secondes UTC. SC-006 exige de dire **quand**. */
      dueAt: z.number().int().min(0),
    })
    .strict(),

  'insufficient-resources': z
    .object({
      shortfall: z
        .array(
          z
            .object({
              resourceId: z.enum(['camelote', 'jus', 'bave-etoiles']),
              grains: z.number().int().min(0),
            })
            .strict(),
        )
        .min(1),
      /**
       * `null` quand le rythme courant ne permettra **jamais** d'atteindre le
       * montant, parce que la ressource sature avant. C'est une information
       * utile et non un cas d'erreur : elle dit au joueur qu'attendre ne servira
       * à rien, et qu'il lui faut d'abord un entrepôt.
       */
      secondsUntilAffordable: z.number().int().min(0).nullable(),
    })
    .strict(),

  'placement-out-of-grid': cellsDetail(),
  'placement-on-obstructed-cell': cellsDetail(),
  'placement-on-occupied-cell': cellsDetail(),

  'variant-not-available-for-type': z
    .object({
      typeId: z.enum(['mine', 'puits', 'racloir', 'centrale', 'entrepot']),
      variantId: z.enum(['single', 'line-2', 'square-4', 'l-4', 't-4', 'rect-6', 'square-9']),
    })
    .strict(),

  /**
   * L'identifiant demandé, **repris tel quel**.
   *
   * Le rendre permet au client de savoir *lequel* de ses repères est périmé, ce
   * qui compte dès qu'un second onglet est ouvert : la démolition faite ailleurs
   * explique le refus, et le client peut retirer le bâtiment de sa vue plutôt que
   * de laisser le joueur réessayer.
   */
  'building-not-found': z.object({ buildingId: z.string().uuid() }).strict(),

  /**
   * Le plafond est **dans le détail**, et non seulement dans le code.
   *
   * « Niveau maximal atteint » laisserait chercher lequel, alors que c'est une
   * donnée publiée du catalogue. Le dire ici évite au client de la redériver — donc
   * évite qu'il en tienne une copie qui se périmerait au premier rééquilibrage.
   */
  'max-level-reached': z
    .object({
      buildingId: z.string().uuid(),
      maxLevel: z.number().int().min(1).max(30),
    })
    .strict(),
} as const satisfies Record<RefusalCodeV1, z.ZodTypeAny>

/**
 * Les cases fautives, **énumérées** et non résumées.
 *
 * Toutes, et non seulement la première : un fantôme d'empreinte doit pouvoir
 * marquer chacune d'elles, sans quoi le joueur corrige une case pour en
 * découvrir une autre (FR-013).
 */
function cellsDetail() {
  return z
    .object({
      cells: z
        .array(
          z
            .object({
              x: z.number().int().min(0).max(15),
              y: z.number().int().min(0).max(15),
            })
            .strict(),
        )
        .min(1),
    })
    .strict()
}

/** Vrai si `code` appartient à l'union fermée des refus de règle de jeu. */
export function isRefusalCodeV1(code: string): code is RefusalCodeV1 {
  return (REFUSAL_CODES_V1 as readonly string[]).includes(code)
}
