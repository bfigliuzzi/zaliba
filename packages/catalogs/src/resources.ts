/**
 * Les trois ressources de Zaliba.
 *
 * Convention de langue (R18) : les identifiants de contenu de jeu gardent le
 * vocabulaire français du document de conception, en kebab-case. Ce sont des
 * noms propres — les traduire n'aurait aucun sens.
 */

/**
 * Le rôle **arrêté** d'une ressource, tel que le document de conception le fixe.
 * Il ne dit pas ce qui la consomme aujourd'hui : voir `uses`.
 */
export type ResourceRole = 'construction' | 'research' | 'propulsion'

export interface Resource {
  readonly id: ResourceId
  /** Rôle arrêté par la conception, indépendant de l'itération livrée. */
  readonly roles: readonly ResourceRole[]
  /**
   * Ce qui la dépense **effectivement en 001**. Le Jus a une liste vide, et
   * c'est assumé (R22) : ses deux débouchés — propulsion des flottes et
   * recherche — sont hors périmètre. Il est produit, stocké, plafonné et
   * saturable comme les deux autres, mais rien ne le dépense.
   *
   * Cette distinction n'est pas une coquetterie : elle rend FR-062 vérifiable
   * par une donnée plutôt que par une convention de rédaction.
   */
  readonly uses: readonly ResourceRole[]
}

export const RESOURCES = {
  camelote: {
    id: 'camelote',
    roles: ['construction', 'research'],
    uses: ['construction'],
  },
  jus: {
    id: 'jus',
    roles: ['propulsion', 'research'],
    uses: [],
  },
  'bave-etoiles': {
    id: 'bave-etoiles',
    roles: ['construction', 'research'],
    uses: ['construction'],
  },
} as const satisfies Record<string, Omit<Resource, 'id'> & { id: string }>

/**
 * L'union littérale est **dérivée du catalogue**, jamais déclarée à côté de lui.
 * Conséquence recherchée (doc de stack § 5.1) : ajouter une ressource fait
 * échouer la compilation partout où un traitement exhaustif l'a oubliée.
 */
export type ResourceId = keyof typeof RESOURCES

export const RESOURCE_IDS = Object.keys(RESOURCES) as readonly ResourceId[]
