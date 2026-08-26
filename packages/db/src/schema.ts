import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Le schéma de persistance (data-model § 2).
 *
 * Les tables de jeu vivent dans un schéma **`game`**, délibérément absent des
 * schémas exposés de PostgREST. RLS est activée partout, en **refus par
 * défaut**, sans aucune politique permissive : le serveur passe par
 * `service_role`, qui contourne RLS, et RLS est ici la seconde ligne de défense
 * — celle qui tient si le schéma se retrouvait exposé par accident.
 *
 * `owner_id` et `occupant_id` portent des identifiants issus de `auth.users`,
 * **sans clé étrangère** vers ce schéma géré par le fournisseur. Contrepartie
 * assumée : aucune suppression en cascade depuis la suppression d'un compte, à
 * traiter comme une opération explicite le jour où elle existera.
 *
 * Trois contraintes de ce fichier **portent des règles de jeu**, et non de la
 * validation défensive. Elles sont signalées à leur place.
 */

export const gameSchema = pgSchema('game')

/** Le vocabulaire fermé des natures de chantier, tel que le domaine le connaît. */
const WORK_NATURES = ['build', 'upgrade', 'demolish', 'clear'] as const

export const planets = gameSchema
  .table(
    'planets',
    {
      id: uuid('id').primaryKey(),
      /**
       * **Une planète par joueur** (R11). C'est cette unicité — et non un
       * verrou applicatif — qui rend `POST /v1/me/planet` idempotente sous
       * concurrence : de deux transactions simultanées, la seconde échoue, et
       * l'API retourne alors `200` avec la planète existante.
       */
      ownerId: uuid('owner_id').notNull().unique(),
      /**
       * L'occupant, notion **distincte** du propriétaire (FR-006). Rien en 001
       * ne les dissocie, mais l'autorisation porte déjà sur cette colonne :
       * c'est ce qui rend FR-007 vérifiable dès maintenant, plutôt qu'un jour.
       */
      occupantId: uuid('occupant_id').notNull(),
      archetypeId: text('archetype_id').notNull(),
      layoutId: text('layout_id').notNull(),
      consolidatedAt: timestamp('consolidated_at', { withTimezone: true }).notNull(),
    },
    (t) => [index('planets_occupant_idx').on(t.occupantId)],
  )
  .enableRLS()

/**
 * Une ligne par ressource, **jamais une colonne par ressource**. Les ressources
 * sont des données déclaratives : en ajouter une ou en renommer une doit rester
 * une modification de catalogue, pas une migration de schéma.
 */
export const planetResources = gameSchema
  .table(
    'planet_resources',
    {
      planetId: uuid('planet_id')
        .notNull()
        .references(() => planets.id, { onDelete: 'cascade' }),
      resourceId: text('resource_id').notNull(),
      /**
       * En grains — sous-unités de 1/3600 d'unité (R1). `bigint` en base,
       * converti en `number` à la frontière de ce paquet avec une assertion de
       * sûreté : les grains restent très loin de 2⁵³ aux échelles du jeu, et
       * l'assertion transforme un dépassement futur en erreur bruyante plutôt
       * qu'en quantité fausse.
       */
      amountGrains: bigint('amount_grains', { mode: 'bigint' }).notNull(),
      lostGrains: bigint('lost_grains', { mode: 'bigint' }).notNull().default(sql`0`),
    },
    (t) => [
      primaryKey({ columns: [t.planetId, t.resourceId] }),
      check('planet_resources_amount_non_negative', sql`${t.amountGrains} >= 0`),
      check('planet_resources_lost_non_negative', sql`${t.lostGrains} >= 0`),
    ],
  )
  .enableRLS()

/**
 * Ni coût cumulé (R9), ni cases occupées : les deux sont dérivés. Stocker le
 * coût cumulé le rendrait faux au premier rééquilibrage, en silence.
 */
export const buildings = gameSchema
  .table(
    'buildings',
    {
      id: uuid('id').primaryKey(),
      planetId: uuid('planet_id')
        .notNull()
        .references(() => planets.id, { onDelete: 'cascade' }),
      typeId: text('type_id').notNull(),
      /** Figée à la pose (FR-010) : une amélioration ne change pas la forme. */
      variantId: text('variant_id').notNull(),
      orientation: smallint('orientation').notNull(),
      anchorX: smallint('anchor_x').notNull(),
      anchorY: smallint('anchor_y').notNull(),
      level: integer('level').notNull(),
    },
    (t) => [
      index('buildings_planet_idx').on(t.planetId),
      check('buildings_orientation_range', sql`${t.orientation} between 0 and 3`),
      check('buildings_anchor_non_negative', sql`${t.anchorX} >= 0 and ${t.anchorY} >= 0`),
      check('buildings_level_positive', sql`${t.level} >= 1`),
    ],
  )
  .enableRLS()

/**
 * Table **dérivée**, écrite dans la même transaction que `buildings` (R10).
 *
 * Sa clé primaire `(planet_id, x, y)` rend la superposition de deux bâtiments
 * **impossible à écrire** — pas seulement interdite. C'est l'invariant central
 * de la fonctionnalité (I-5), et la garantie tient y compris face à un futur
 * chemin d'écriture qui aurait oublié la validation du domaine.
 *
 * La redondance avec `buildings` est assumée et enregistrée en
 * « Complexity Tracking » du plan : son coût est de deux instructions dans la
 * même transaction. S'en remettre à la validation du domaine serait correct
 * aujourd'hui, et le resterait tant que personne n'ajoute un second chemin
 * d'écriture. La garantie ne se dégrade pas avec la fatigue ; la discipline, si.
 */
export const buildingCells = gameSchema
  .table(
    'building_cells',
    {
      planetId: uuid('planet_id')
        .notNull()
        .references(() => planets.id, { onDelete: 'cascade' }),
      x: smallint('x').notNull(),
      y: smallint('y').notNull(),
      buildingId: uuid('building_id')
        .notNull()
        .references(() => buildings.id, { onDelete: 'cascade' }),
    },
    (t) => [
      primaryKey({ columns: [t.planetId, t.x, t.y] }),
      index('building_cells_building_idx').on(t.buildingId),
    ],
  )
  .enableRLS()

/**
 * L'état obstrué d'une case est *la disposition du catalogue **moins** ces
 * lignes*. Il n'y a donc aucune table de 36 lignes par planète, et surtout :
 * une case déblayée ne peut pas redevenir obstruée, parce qu'il n'existe aucun
 * chemin d'écriture pour cela (I-8, FR-045).
 */
export const clearedCells = gameSchema
  .table(
    'cleared_cells',
    {
      planetId: uuid('planet_id')
        .notNull()
        .references(() => planets.id, { onDelete: 'cascade' }),
      x: smallint('x').notNull(),
      y: smallint('y').notNull(),
      clearedAt: timestamp('cleared_at', { withTimezone: true }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.planetId, t.x, t.y] })],
  )
  .enableRLS()

export const works = gameSchema
  .table(
    'works',
    {
      id: uuid('id').primaryKey(),
      planetId: uuid('planet_id')
        .notNull()
        .references(() => planets.id, { onDelete: 'cascade' }),
      nature: text('nature').notNull(),
      startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
      dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
      /**
       * Les lignes résolues **restent** : elles sont l'histoire de la planète,
       * et le support d'une enquête ultérieure. C'est ce qui impose que l'index
       * d'unicité soit *partiel*.
       */
      resolvedAt: timestamp('resolved_at', { withTimezone: true }),
      targetBuildingId: uuid('target_building_id').references(() => buildings.id, {
        onDelete: 'cascade',
      }),
      targetX: smallint('target_x'),
      targetY: smallint('target_y'),
      typeId: text('type_id'),
      variantId: text('variant_id'),
      orientation: smallint('orientation'),
    },
    (t) => [
      /**
       * **FR-033 devient une contrainte de base.** Deux vues du jeu ouvertes
       * simultanément ne peuvent pas lancer deux chantiers : la seconde
       * transaction échoue, et le refus renvoyé est `work-in-progress`.
       *
       * C'est le point qui mérite d'être compris : ce n'est **pas** une
       * vérification préalable. Vérifier puis écrire ouvrirait une fenêtre de
       * course entre les deux, et cette fenêtre serait exploitable. Ici, la
       * course est arbitrée par la base, qui est la seule à pouvoir le faire.
       */
      uniqueIndex('works_one_unresolved_per_planet')
        .on(t.planetId)
        .where(sql`${t.resolvedAt} is null`),
      index('works_planet_idx').on(t.planetId),
      check(
        'works_nature_vocabulary',
        sql`${t.nature} in ('build', 'upgrade', 'demolish', 'clear')`,
      ),
      check('works_due_after_start', sql`${t.dueAt} > ${t.startedAt}`),
      check(
        'works_orientation_range',
        sql`${t.orientation} is null or ${t.orientation} between 0 and 3`,
      ),
      /**
       * La cohérence entre la nature et les colonnes de cible. Une ligne dont
       * la nature contredit sa cible est un état que le domaine ne sait pas
       * lire : mieux vaut qu'elle n'existe pas.
       */
      check(
        'works_target_matches_nature',
        sql`(
          (${t.nature} = 'build' and ${t.typeId} is not null and ${t.variantId} is not null
             and ${t.orientation} is not null and ${t.targetX} is not null
             and ${t.targetY} is not null and ${t.targetBuildingId} is null)
          or (${t.nature} in ('upgrade', 'demolish') and ${t.targetBuildingId} is not null
             and ${t.targetX} is null and ${t.targetY} is null and ${t.typeId} is null
             and ${t.variantId} is null and ${t.orientation} is null)
          or (${t.nature} = 'clear' and ${t.targetX} is not null and ${t.targetY} is not null
             and ${t.targetBuildingId} is null and ${t.typeId} is null
             and ${t.variantId} is null and ${t.orientation} is null)
        )`,
      ),
    ],
  )
  .enableRLS()

/**
 * Le reçu d'idempotence (doc de stack § 6.4).
 *
 * La cible est une application mobile sur réseau instable : une requête réémise
 * ne doit jamais dépenser deux fois. La seconde tentative retourne le premier
 * résultat, **à l'identique**.
 */
export const commandReceipts = gameSchema
  .table(
    'command_receipts',
    {
      playerId: uuid('player_id').notNull(),
      idempotencyKey: text('idempotency_key').notNull(),
      response: jsonb('response').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.playerId, t.idempotencyKey] })],
  )
  .enableRLS()

export const WORK_NATURE_VALUES = WORK_NATURES
export type WorkNature = (typeof WORK_NATURES)[number]
