import { initContract } from '@ts-rest/core'
import { z } from 'zod'
import { ErrorBodyV1 } from './errors.js'

/**
 * Le contrat `v1` de la planète.
 *
 * **Ce paquet n'importe pas `domain`.** Les unions littérales sont redéclarées
 * ici plutôt que dérivées du catalogue, et la duplication est volontaire (doc de
 * stack § 3). Sans elle, un renommage interne — une ressource, un type de
 * bâtiment — changerait silencieusement le format transmis et casserait des
 * clients anciens sans qu'aucune compilation n'échoue. Le prix est une liste à
 * tenir à jour ; la contrepartie est qu'on ne peut pas la modifier sans le
 * vouloir, et que l'instantané de JSON Schema le rend visible en revue.
 *
 * **La réponse porte l'instantané, pas l'état projeté.** Le client rejoue la
 * projection localement avec le même code que le serveur (R8) : c'est ce qui
 * fait progresser les compteurs sous les yeux du joueur sans un appel réseau.
 * Envoyer les valeurs dérivées dupliquerait ce calcul et créerait deux vérités
 * là où le monorepo n'en veut qu'une.
 */

const c = initContract()

/** Un entier sûr et positif — la borne appartient au schéma, pas au métier. */
const nonNegativeInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/** Un instant, en secondes UTC (R2). */
const instantSchema = nonNegativeInt

const uuid = z.string().uuid()

export const RESOURCE_IDS_V1 = ['camelote', 'jus', 'bave-etoiles'] as const
export const BUILDING_TYPE_IDS_V1 = ['mine', 'puits', 'racloir', 'centrale', 'entrepot'] as const
export const FOOTPRINT_IDS_V1 = [
  'single',
  'line-2',
  'square-4',
  'l-4',
  't-4',
  'rect-6',
  'square-9',
] as const
export const ARCHETYPE_IDS_V1 = ['berceau'] as const
export const WORK_NATURES_V1 = ['build', 'upgrade', 'demolish', 'clear'] as const

const resourceId = z.enum(RESOURCE_IDS_V1)
const buildingTypeId = z.enum(BUILDING_TYPE_IDS_V1)
const footprintId = z.enum(FOOTPRINT_IDS_V1)

/**
 * Une coordonnée de case, bornée à 0..15.
 *
 * La borne est plus large que la grille 6×6 de 001 : elle borne le **protocole**,
 * pas le contenu. Un archétype futur plus grand ne doit pas imposer une nouvelle
 * version de contrat, et une valeur absurde ne doit pas atteindre le domaine.
 */
const coordinate = z.number().int().min(0).max(15)

export const CellV1 = z.object({ x: coordinate, y: coordinate }).strict()

export const HoldingV1 = z
  .object({
    resourceId,
    /** En grains — sous-unités de 1/3600 d'unité (R1). */
    amountGrains: nonNegativeInt,
    /** Perte cumulée par saturation (FR-026). */
    lostGrains: nonNegativeInt,
  })
  .strict()

export const PlacedBuildingV1 = z
  .object({
    id: uuid,
    typeId: buildingTypeId,
    /** Figée à la pose, pour la vie du bâtiment (FR-010). */
    variantId: footprintId,
    orientation: z.number().int().min(0).max(3),
    anchorX: coordinate,
    anchorY: coordinate,
    level: z.number().int().min(1).max(30),
  })
  .strict()

/**
 * La cible d'un chantier, en union **discriminée** sur `nature`.
 *
 * Chaque variante ne porte que ce que sa nature admet. `upgrade` n'a pas de
 * champ d'empreinte ni d'orientation : c'est ainsi que FR-039 devient inviolable
 * par le contrat lui-même, plutôt que par une vérification qu'on pourrait
 * oublier d'écrire dans un nouveau chemin.
 */
export const WorkTargetV1 = z.discriminatedUnion('nature', [
  z
    .object({
      nature: z.literal('build'),
      typeId: buildingTypeId,
      variantId: footprintId,
      orientation: z.number().int().min(0).max(3),
      anchorX: coordinate,
      anchorY: coordinate,
    })
    .strict(),
  z.object({ nature: z.literal('upgrade'), buildingId: uuid }).strict(),
  z.object({ nature: z.literal('demolish'), buildingId: uuid }).strict(),
  z.object({ nature: z.literal('clear'), x: coordinate, y: coordinate }).strict(),
])

export const ScheduledWorkV1 = z
  .object({
    id: uuid,
    startedAt: instantSchema,
    /** L'effet court depuis cet instant, pas depuis sa constatation (FR-032). */
    dueAt: instantSchema,
    target: WorkTargetV1,
  })
  .strict()

/**
 * L'instantané daté — la réponse commune aux trois routes.
 *
 * **Ce qui en est absent, et pourquoi** : quantités courantes, plafonds, taux
 * nominaux et effectifs, rapport d'énergie, temps avant saturation, cases
 * occupées de chaque bâtiment, gisements, état obstrué des cases, coûts cumulés,
 * temps restant du chantier. Tout cela se dérive de ce qui est ici, et le client
 * le dérive déjà pour animer ses compteurs.
 */
export const PlanetSnapshotV1 = z
  .object({
    /** La base du calcul de décalage d'horloge côté client. */
    serverInstant: instantSchema,
    /** Rend une divergence client/serveur détectable, non silencieuse (R15). */
    catalogVersion: z.string().min(1).max(64),
    planet: z
      .object({
        id: uuid,
        archetypeId: z.enum(ARCHETYPE_IDS_V1),
        layoutId: z.string().min(1).max(64),
        ownerId: uuid,
        /** Notion **distincte** du propriétaire (FR-006). */
        occupantId: uuid,
        consolidatedAt: instantSchema,
      })
      .strict(),
    holdings: z
      .array(HoldingV1)
      .length(RESOURCE_IDS_V1.length)
      // Exactement une entrée par ressource : un doublon ferait dépendre
      // l'affichage de l'ordre de lecture, et un manque laisserait un compteur
      // vide sans que rien ne le signale.
      .refine(
        (holdings) => new Set(holdings.map((h) => h.resourceId)).size === RESOURCE_IDS_V1.length,
        { message: 'Une entrée par ressource, exactement.' },
      ),
    buildings: z.array(PlacedBuildingV1).max(36),
    /** Les cases déblayées, **par écart** au catalogue. */
    clearedCells: z.array(CellV1).max(36),
    /**
     * Au plus un (FR-033). Un chantier échu et non consolidé apparaît
     * **toujours** ici : c'est la projection locale qui l'applique, à `dueAt`.
     */
    work: ScheduledWorkV1.nullable(),
  })
  .strict()

export type PlanetSnapshotV1 = z.infer<typeof PlanetSnapshotV1>
export type HoldingV1 = z.infer<typeof HoldingV1>
export type PlacedBuildingV1 = z.infer<typeof PlacedBuildingV1>
export type ScheduledWorkV1 = z.infer<typeof ScheduledWorkV1>
export type WorkTargetV1 = z.infer<typeof WorkTargetV1>
export type CellV1 = z.infer<typeof CellV1>

/**
 * L'intention de chantier — union discriminée **fermée**, qui s'élargit tranche
 * par tranche.
 *
 * **Ce que ce corps ne peut pas contenir**, faute de champ pour le contenir :
 * `cost`, `duration`, `dueAt`, `production`, `refund`, `result`, `clientNow`, ni
 * quelque horodatage que ce soit. Ce n'est pas une validation à écrire, c'est un
 * champ à ne pas créer — la forme mécanique de FR-055 à FR-057. Un champ qu'on
 * ne peut pas envoyer est un champ qu'on ne peut pas exploiter, et une
 * vérification qu'on ne peut pas oublier dans six mois.
 *
 * **Pourquoi une seule nature ici, alors que `WorkTargetV1` en porte quatre.**
 * La cible décrit un chantier *déjà planifié*, et un instantané peut en porter
 * de n'importe quelle nature. L'intention, elle, décrit ce que le joueur a le
 * droit de demander **maintenant**, et une nature que le serveur ne sait pas
 * honorer serait une promesse rompue à l'exécution : le schéma accepterait, le
 * code n'aurait rien à répondre, et le joueur recevrait un défaut serveur là où
 * le jeu voulait dire « pas encore ».
 *
 * Le sens de l'élargissement est celui que le versionnement autorise : élargir
 * une entrée est **compatible** (README § 2), la resserrer ne l'est pas. Déclarer
 * les quatre natures d'avance nous aurait interdit d'en retirer une ; les déclarer
 * au fur et à mesure n'a rien coûté. `upgrade` est arrivée avec US4, `clear` avec
 * US5, `demolish` avec US6.
 *
 * **L'union est désormais complète**, et la règle qui l'a construite cesse d'avoir
 * un effet visible — une nature n'entrait dans cette liste que quand une route
 * savait l'exécuter. C'est précisément pourquoi il faut le dire : la liste ne doit
 * plus jamais rétrécir.
 */
export const WORK_INTENT_NATURES_V1 = ['build', 'upgrade', 'clear', 'demolish'] as const

export const WorkIntentV1 = z.discriminatedUnion('nature', [
  z
    .object({
      nature: z.literal('build'),
      typeId: buildingTypeId,
      variantId: footprintId,
      orientation: z.number().int().min(0).max(3),
      anchorX: coordinate,
      anchorY: coordinate,
    })
    .strict(),

  /**
   * **Une cible, et rien d'autre** — la forme mécanique de FR-039.
   *
   * Ni `variantId`, ni `orientation`, ni `anchorX`/`anchorY`, ni `level`. « Une
   * amélioration ne change ni la variante, ni l'orientation, ni les cases
   * occupées » n'est donc pas une vérification à écrire dans le module de
   * construction : c'est un champ à ne pas créer ici. Une vérification vit dans un
   * chemin de code, et un second chemin la contourne un jour ; un champ qui
   * n'existe pas ne s'envoie pas.
   *
   * Le niveau visé est **dérivé** du niveau courant, jamais annoncé : c'est
   * toujours `N+1`, et le laisser proposer ferait de la progression un champ de
   * formulaire.
   */
  z.object({ nature: z.literal('upgrade'), buildingId: uuid }).strict(),

  /**
   * **Une case, et rien d'autre** — la forme mécanique de FR-044.
   *
   * Ni `reveals`, ni `depositOf`, ni `obstacleId`. « Le résultat d'un déblaiement
   * est déterminé par le type d'obstacle, et jamais tiré au sort » n'est donc pas
   * une vérification à écrire côté serveur : c'est un champ à ne pas créer ici.
   * Personne ne peut réclamer un geyser sous un éboulis, parce qu'il n'y a aucun
   * endroit pour le réclamer.
   *
   * Le type d'obstacle est **dérivé** de la disposition du catalogue moins les
   * cases déjà déblayées, jamais annoncé : le laisser proposer ferait du contenu
   * de la planète un champ de formulaire.
   *
   * `x` et `y` à plat, et non un objet `cell` : c'est la forme que `PlacedBuilding`
   * emploie déjà pour son ancre (`anchorX`, `anchorY`), et une seconde convention
   * de coordonnées dans le même contrat obligerait chaque client à savoir laquelle
   * s'applique où.
   */
  z.object({ nature: z.literal('clear'), x: coordinate, y: coordinate }).strict(),

  /**
   * **Une cible, et rien d'autre** — la forme mécanique de FR-046 et FR-049.
   *
   * Ni `refund`, ni `clippedAmount`, ni `level`, ni `cumulativeCost`. Le
   * remboursement vaut `fraction × Σ(k=1..N) coût(k)` et il est **dérivé** de la
   * courbe du catalogue (R9) ; le montant écrêté se déduit de la place disponible à
   * l'échéance. Les laisser proposer, c'est laisser se rembourser soi-même — et
   * aucune vérification n'est aussi solide qu'un champ absent.
   *
   * Aucune géométrie non plus : les cases libérées se redérivent de la variante, de
   * l'orientation et de l'ancre du bâtiment, toutes figées à la pose (FR-010).
   */
  z.object({ nature: z.literal('demolish'), buildingId: uuid }).strict(),
])

export type WorkIntentV1 = z.infer<typeof WorkIntentV1>

/** Les trois routes. Pas quatre : ni aperçu (R8), ni catalogue (R15). */
export const planetContractV1 = c.router(
  {
    provisionPlanet: {
      method: 'POST',
      path: '/v1/me/planet',
      // Corps vide : tout ce que le serveur peut dériver est absent du contrat.
      body: z.object({}).strict(),
      responses: {
        201: PlanetSnapshotV1,
        200: PlanetSnapshotV1,
        401: ErrorBodyV1,
      },
      summary: 'Installe le joueur sur son Berceau. Idempotente.',
    },

    readPlanet: {
      method: 'GET',
      path: '/v1/me/planet',
      responses: {
        200: PlanetSnapshotV1,
        401: ErrorBodyV1,
        404: ErrorBodyV1,
      },
      summary: 'Lit l’instantané daté. Fonction pure : n’écrit rien (FR-031).',
    },

    startWork: {
      method: 'POST',
      path: '/v1/me/planet/works',
      body: WorkIntentV1,
      responses: {
        201: PlanetSnapshotV1,
        400: ErrorBodyV1,
        401: ErrorBodyV1,
        403: ErrorBodyV1,
        404: ErrorBodyV1,
        409: ErrorBodyV1,
      },
      summary: 'Lance un chantier. Le coût est débité au lancement (FR-036).',
    },
  },
  {
    strictStatusCodes: true,
  },
)
