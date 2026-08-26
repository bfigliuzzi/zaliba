# Tasks: La planète mère

**Input** : documents de conception de `/specs/001-la-planete-mere/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests** : **obligatoires et écrits d'abord**. Le principe III de la
[constitution](../../.specify/memory/constitution.md) est non négociable : chaque
tâche d'implémentation est précédée d'une tâche de test dont l'échec doit être
**observé** avant d'écrire la moindre ligne d'implémentation. Un test écrit après
le code est de la dette à signaler en revue.

Cette règle vaut **aussi pour l'interface et pour le schéma de persistance** :
dans chaque tranche, le parcours Playwright est écrit **en premier**, avant tout
composant ; les contraintes du schéma `game` sont éprouvées avant d'être écrites.
Un parcours écrit d'abord échoue pour la bonne raison — le comportement décrit
n'existe pas — et c'est précisément l'échec que le principe III demande
d'observer.

**Organisation** : les tâches sont groupées par tranche utilisateur, pour que
chacune soit implémentable, testable et livrable indépendamment.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : parallélisable — fichiers distincts, aucune dépendance sur une tâche
  inachevée
- **[Story]** : la tranche servie (US1 à US8). Absent en Setup, en Fondations et
  en Finition
- Chaque description porte son chemin de fichier exact
- La numérotation est **séquentielle et sans trou** : `T001` à `T163`

## Conventions de chemin

Monorepo pnpm, découpage de [plan.md](./plan.md) § « Source Code » :
`apps/game/`, `apps/api/`, `packages/catalogs/`, `packages/domain/`,
`packages/contracts/`, `packages/db/`.

Langue des identifiants : structure du code en anglais, identifiants de contenu
de jeu en kebab-case français (R18).

---

## Phase 1 : Setup — amorçage du monorepo

**Objectif** : un dépôt qui compile, se vérifie et refuse une fusion fautive.
Aucun code applicatif ici.

**⚠️ Les trois vérifications R17 passent en premier.** Elles se tranchent par
exécution, jamais par raisonnement, et **avant** toute écriture de code
applicatif. Chacune a son repli, énoncé en [research.md R17](./research.md).

- [x] T001 [P] Vérifier par exécution la compatibilité de `zod` 4.4.3 avec `@ts-rest/core`, `@ts-rest/fastify` et `@ts-rest/open-api` 3.52.1 dans un bac à sable jetable ; consigner le verdict et la version retenue dans `specs/001-la-planete-mere/research.md` § R17. Repli : épingler la version de zod acceptée par ts-rest. Un changement de version majeure impose un amendement MINOR de `.specify/memory/constitution.md`.
- [x] T002 [P] Vérifier par exécution la compatibilité de `typescript` 7.0.2 avec Biome 2.5.10, drizzle-kit 0.31.10, ts-rest 3.52.1 et Vitest 4.1.11 ; consigner le verdict dans `specs/001-la-planete-mere/research.md` § R17. Repli : épingler la dernière version de la ligne précédente et consigner l'écart par amendement — jamais par une échappatoire de typage.
- [x] T003 Aligner la chaîne d'outils locale sur les versions épinglées : créer `.nvmrc` (Node 24.19.0) et le champ `packageManager` (pnpm 11.22.0) dans `package.json` à la racine. Si une version épinglée n'existe pas, corriger `docs/architecture/2026-08-23-choix-de-stack.md` § 8, qui consigne un relevé faillible.
- [x] T004 Créer `pnpm-workspace.yaml` (`apps/*`, `packages/*`) et le `package.json` racine avec les scripts `typecheck`, `boundaries`, `test`, `test:integration`, `dev`, `e2e` attendus par `specs/001-la-planete-mere/quickstart.md` § 2.
- [x] T005 Créer `turbo.json` : graphe de tâches `build`, `typecheck`, `test`, `lint`, avec les dépendances inter-paquets et le cache.
- [x] T006 Créer `tsconfig.base.json` à la racine (mode strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) et un `tsconfig.json` par paquet qui l'étend.
- [x] T007 [P] Créer `biome.json` : format et lint pour tout le dépôt, aucune règle désactivée sans commentaire justificatif.
- [x] T008 Créer les six squelettes de paquet avec leur `package.json` aux versions **exactes** (aucune plage) : `packages/catalogs/`, `packages/domain/`, `packages/contracts/`, `packages/db/`, `apps/api/`, `apps/game/`.
- [x] T009 Créer `.dependency-cruiser.cjs` avec les règles de la table § 3 du document de stack, **en porte bloquante** : `catalogs` n'importe rien ; `domain` n'importe que `catalogs` ; `contracts` n'importe **pas** `domain` ; `db` n'importe ni `domain` ni `contracts` ; `game` n'importe **pas** `db` ; `kernel` n'importe **jamais** un module ; le graphe entre modules est acyclique.
- [x] T010 [P] Créer `vitest.workspace.ts` à la racine et la configuration de couverture avec seuil sur `packages/domain` uniquement (quickstart § 6).
- [x] T011 [P] Créer `playwright.config.ts` à la racine avec `@axe-core/playwright` câblé.
- [x] T012 Créer `.github/workflows/ci.yml` avec les onze portes de la table § 7.8 du document de stack, **toutes bloquantes** : types, format et lint, frontières de paquets, domaine et propriétés, cohérence des catalogues, contrats, intégration (Docker requis), parcours et accessibilité, vulnérabilités, `gitleaks`, seuil de couverture domaine.
- [x] T013 [P] Créer `.env.example` à la racine listant `DATABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_SERVICE_ROLE_KEY` pour `apps/api`, et l'URL d'API plus la clé `anon` pour `apps/game`, avec la mention explicite que la clé `anon` n'est pas un secret.
- [x] T014 **Fait le 2026-08-23.** Consigner dans `docs/design/conception-du-jeu.md` que l'extracteur de Bave d'étoiles s'appelle **racloir** : retirer la question ouverte du § 11 et porter la décision au journal des modifications. **Avant toute écriture du catalogue de bâtiments** — un changement de nom serait une modification de catalogue **et** un diff d'instantané d'équilibrage.

**Point de contrôle** : `pnpm install`, `pnpm -w typecheck`, `pnpm -w boundaries`
et `pnpm -w lint` passent sur un dépôt vide de logique. ✅ **Franchi le 2026-08-26.**

### Divergences constatées à l'exécution

Trois écarts entre ce que ces tâches décrivaient et ce que l'exécution a imposé.
Aucun n'est un contournement : chacun est un repli nommé d'avance par R17, ou une
correction d'un relevé faillible.

1. **T001 — zod épinglé à 3.25.76**, et non 4.4.3. zod 4 est incompatible au
   typage avec `@ts-rest/*` 3.52.1. Amendement MINOR 2.1.0 de la constitution.
2. **T002 — TypeScript épinglé à 6.0.3**, et non 7.0.2. `dependency-cruiser`
   18.2.0 parcourt **zéro module** sous la ligne 7 et rapporte un succès : la
   porte du principe II était inerte. Porté par le même amendement 2.1.0.
   Ce verdict **corrige** une première conclusion du même jour, tirée du code de
   sortie de l'outil. La leçon est consignée en R17 : exécuter ne suffit pas, il
   faut vérifier que l'outil a produit un résultat **non vide**.
3. **T010 — `vitest.config.ts` et non `vitest.workspace.ts`.** Vitest 4 a
   supprimé le fichier d'espace de travail ; il est **ignoré en silence**. Les
   projets se déclarent en `test.projects`. Aucune perte de portée.

La porte de T009 a par ailleurs été **éprouvée par violation délibérée** — un
`contracts → domain`, un `kernel → module` et un `game → db` : les trois sont
attrapées. Une porte jamais vue échouer ne prouve rien.

**Reste à la main de la personne qui développe** : la machine locale exécute
Node 24.18.0 contre 24.19.0 porté par `.nvmrc`. `corepack` a aligné pnpm ; il ne
peut pas aligner l'environnement d'exécution.

---

## Phase 2 : Fondations — prérequis bloquants

**Objectif** : le noyau de grandeurs, le socle de persistance, le socle HTTP et le
socle client, authentification comprise. Rien ici n'est propre à une tranche ;
tout le reste en dépend.

**⚠️ CRITIQUE** : aucune tranche utilisateur ne peut commencer avant la fin de
cette phase.

### Catalogues — le contenu déclaratif

- [x] T015 [P] Écrire le test de cohérence des identifiants de catalogue dans `packages/catalogs/tests/ids.test.ts` : tout identifiant référencé existe, aucun orphelin, aucun doublon (data-model § 1.8). Observer l'échec.
- [x] T016 [P] Écrire le test des empreintes dans `packages/catalogs/tests/footprints.test.ts` : les sept formes du vocabulaire fermé, leurs surfaces (1, 2, 4, 4, 4, 6, 9), la normalisation `min x = min y = 0`, et le nombre d'orientations distinctes de la table R6 (1, 2, 1, 4, 4, 2, 1). Observer l'échec.
- [x] T017 [P] Écrire le test des courbes nommées dans `packages/domain/tests/kernel/curves.test.ts` : `linear`, `geometric` et `steps` de R19, avec **une seule troncature en fin de calcul** pour `geometric` (`⌊base × num^(n−1) ÷ den^(n−1)⌋`) et la reproductibilité à la main. Observer l'échec.
- [x] T018 Implémenter `packages/catalogs/src/resources.ts` : les trois ressources `camelote` (construction et recherche), `jus` (propulsion des flottes, sans emploi en 001 — R22) et `bave-etoiles` (construction et recherche), et les unions littérales `ResourceId`, `BuildingTypeId`, `FootprintId`, `ObstacleId`, `LayoutId`, `ArchetypeId`, `CurveId` dérivées du catalogue (data-model § 1.1).
- [x] T019 Implémenter `packages/catalogs/src/footprints.ts` : les sept empreintes en ensembles d'offsets normalisés, orientations **précalculées** par `(x, y) → (−y, x)` puis renormalisation et dédoublonnage (R6). Ne jamais implémenter la symétrie : le miroir doit être inatteignable par construction, pas interdit par une garde.
- [x] T020 [P] Implémenter `packages/catalogs/src/curves.ts` : la déclaration des courbes nommées et de leurs paramètres, sans aucune évaluation.
- [x] T021 Implémenter `packages/domain/src/kernel/curves.ts` : l'évaluation des trois courbes en arithmétique entière étendue, et `cumulativeCost(curve, level)` = `Σ(k=1..N)` sur les valeurs **déjà tronquées** (R19).

### Noyau de domaine — les grandeurs

- [x] T022 [P] Écrire le test du temps dans `packages/domain/tests/kernel/time.test.ts` : `Instant` entier de secondes UTC, `Duration` entière et strictement positive pour un chantier, troncature vers le bas (R2). Observer l'échec.
- [x] T023 [P] Écrire le test des ressources dans `packages/domain/tests/kernel/resources.test.ts` : grains à `1/3600` unité (R1), affichage `⌊grains ÷ 3600⌋`, plafonnement `q = min(brut, P)`, perte `perdu = max(0, brut − P)` cumulée, et instant de saturation `t₀ + ⌈(P − q₀) ÷ r⌉`, infini si `r = 0` (R4). Observer l'échec.
- [x] T024 Implémenter `packages/domain/src/kernel/time.ts` : `Instant`, `Duration` et leurs conversions. **Aucune fonction n'appelle l'horloge système** : l'instant est toujours un argument explicite.
- [x] T025 Implémenter `packages/domain/src/kernel/resources.ts` : `Grains`, `RatePerHour`, plafonnement, perte cumulée, instant de saturation.
- [x] T026 [P] Écrire le test de l'union d'effets dans `packages/domain/tests/kernel/effects.test.ts` : traitement exhaustif vérifié à la compilation, aucun effet hors vocabulaire, `cancel-work` et `notify-player` **inexistants** — c'est ainsi que FR-037 est tenu, par absence et non par garde. Observer l'échec.
- [x] T027 Implémenter `packages/domain/src/kernel/effects.ts` : l'union **fermée** des sept effets de R16 — `debit-resources`, `credit-resources`, `place-building`, `set-building-level`, `remove-building`, `clear-cell`, `schedule-work`. Le vocabulaire est détenu par le noyau.

### Persistance

L'ordre de ce bloc n'est pas celui de l'intuition : le harnais et le pilote
viennent d'abord parce que le **test des contraintes** en dépend, et ce test
précède le schéma qu'il éprouve.

- [x] T028 Implémenter le pilote `postgres` (postgres.js) dans `packages/db/src/client.ts` : pooler de session Supabase, ou pooler de transaction **avec requêtes préparées désactivées** (R13).
- [x] T029 Implémenter le harnais Testcontainers dans `apps/api/tests/integration/harness.ts` : PostgreSQL réel, migrations appliquées **si elles existent**, base réinitialisée entre les cas. Aucun simulacre — un simulacre testerait le simulacre, pas le SQL.
- [x] T030 **Éprouvé le 2026-08-26 : 36 échecs, puis 43 cas au vert.** Écrire le test des contraintes de schéma dans `apps/api/tests/integration/schema-constraints.test.ts` sur un PostgreSQL réel : deux planètes pour un même `owner_id` → violation d'unicité ; deux chantiers non résolus pour une même planète → violation de l'index partiel `(planet_id) where resolved_at is null`, **I-9** (FR-033) ; deux bâtiments sur la même case → violation de la clé primaire `(planet_id, x, y)`, **I-5** (R10) ; une ligne de `works` dont la colonne de cible contredit sa `nature` → violation de la contrainte de cohérence ; **RLS active et refus par défaut** sur les sept tables. Observer l'échec — les relations n'existent pas encore, et c'est le bon échec.
- [x] T031 Implémenter `packages/db/src/schema.ts` : le schéma `game` et ses sept tables de data-model § 2 — `planets` (unique sur `owner_id`), `planet_resources`, `buildings`, `building_cells` (clé primaire `(planet_id, x, y)`), `cleared_cells`, `works` (**unique `(planet_id) where resolved_at is null`** et contrainte de cohérence `nature` ↔ colonnes de cible), `command_receipts`.
- [x] T032 Générer la migration initiale dans `packages/db/migrations/` par `drizzle-kit`, avec **RLS activée sur toutes les tables, refus par défaut, aucune politique permissive**, et le schéma `game` **absent des schémas exposés** de PostgREST. T030 doit passer au vert à l'issue de cette tâche.
- [x] T033 [P] Écrire le test de conversion `bigint` → `number` dans `packages/db/tests/grains.test.ts` : assertion de sûreté qui transforme un dépassement de `2⁵³` en erreur bruyante. Observer l'échec.
- [x] T034 Implémenter la conversion de grains à la frontière de `packages/db/src/`.

### Socle HTTP

- [x] T035 [P] Écrire le test du modèle d'erreur dans `packages/contracts/tests/errors.test.ts` : forme unique `{ code, message, details?, requestId }`, et la table de statuts 400 / 401 / 403 / 404 / 409 / 500 de `contracts/README.md` § 7. Observer l'échec.
- [x] T036 Implémenter `packages/contracts/src/v1/errors.ts` : le modèle d'erreur commun et le squelette de l'union fermée `RefusalV1`, enrichie tranche par tranche.
- [x] T037 Implémenter le harnais d'instantané de JSON Schema dans `packages/contracts/tests/snapshots/` : le schéma dérivé de chaque route est figé en fichier de référence ; tout changement de forme fait échouer la porte (`contracts/README.md` § 8).
- [x] T038 Implémenter le squelette Fastify dans `apps/api/src/server.ts` avec le greffon de corrélation (`requestId` en réponse et en journal) et le greffon de mapping d'erreurs de `apps/api/src/plugins/errors.ts`.
- [x] T039 Écrire le test de la liste noire de journalisation dans `apps/api/tests/logging-redaction.test.ts` : aucun jeton, aucune adresse de courriel, aucune clé de service dans les journaux, quelle que soit la requête. Observer l'échec.
- [x] T040 Implémenter le journal structuré dans `apps/api/src/plugins/logging.ts` : pino, identifiant de corrélation par requête, **liste noire explicite** — jetons, adresses de courriel, clé de service ne sont jamais journalisés.
- [x] T041 [P] Écrire le test de l'adaptateur d'authentification dans `apps/api/tests/auth.test.ts` sur des jetons de fixture signés par une paire de clés de test : jeton absent, expiré, signature invalide → **401 sans détail** ; jeton valide → un identifiant de joueur, et **rien d'autre**. Observer l'échec.
- [x] T042 Implémenter `apps/api/src/plugins/auth.ts` : vérification **locale** de la signature JWT par JWKS avec `jose`, JWKS mis en cache, aucun appel réseau par requête (R12). **Aucun droit n'est lu dans le jeton.**
- [x] T043 [P] Implémenter `apps/api/src/plugins/cors.ts` avec `@fastify/cors` : origine du client autorisée, en-tête `Idempotency-Key` accepté.
- [x] T044 Écrire le test d'intégration de la forme unique de commande dans `apps/api/tests/integration/command.test.ts` : verrouillage `SELECT … FOR UPDATE`, autorisation vérifiée **sur la ligne verrouillée**, résolution du chantier échu, projection au `now()` de la transaction tronqué à la seconde, `decide()`, `apply()`, écriture de l'instantané et du reçu — le tout dans **une seule** transaction (data-model § 2). Observer l'échec.
- [x] T045 Implémenter `apps/api/src/command/execute.ts` : la forme unique de toute mutation, sans exception. L'instant de référence est le `now()` de PostgreSQL, jamais l'horloge du client.
- [x] T046 Écrire le test d'idempotence dans `apps/api/tests/integration/idempotency.test.ts` : `Idempotency-Key` obligatoire (absente → **400**) ; deuxième tentative avec la même clé → **la première réponse rejouée à l'identique**, en-tête `Idempotency-Replayed: true`, aucun effet ; un **refus ne consomme pas** la clé. Observer l'échec.
- [x] T047 Implémenter `apps/api/src/command/idempotency.ts` : le reçu de commande et le rejeu à l'identique.

### Socle client

- [x] T048 Implémenter le squelette de `apps/game` dans `apps/game/src/main.tsx` : Vite, React, TanStack Router (`routes/planet.tsx`, `routes/rules.tsx`) et TanStack Query.
- [x] T049 [P] Écrire le test de session dans `apps/game/tests/session.test.ts` : la session est la **seule** source du jeton ; sans session, aucune requête n'est émise et l'écran de connexion s'affiche ; un jeton expiré est renouvelé silencieusement puis la requête réémise ; le jeton ne figure **jamais** dans une URL ni dans un journal. Observer l'échec.
- [x] T050 Implémenter `apps/game/src/lib/session.ts` : `@supabase/supabase-js` employé **exclusivement** comme client d'authentification. Aucun accès direct à la base — le schéma `game` n'est pas exposé et le client n'a que l'API pour interlocuteur (doc de stack § 6.1).
- [x] T051 Implémenter `apps/game/src/features/auth/AuthScreen.tsx` : inscription et connexion par courriel, **intégralement au clavier** (FR-058), erreurs annoncées de façon perceptible sans dépendre de la couleur seule (FR-060), conformes à WCAG 2.1 AA (FR-061).
- [x] T052 Implémenter `apps/game/src/lib/api.ts` : le client `ts-rest` typé, l'en-tête `Authorization` alimenté par la session, la génération d'une `Idempotency-Key` UUID par commande.
- [x] T053 [P] Écrire le test du décalage d'horloge dans `apps/game/tests/clock.test.ts` : `serverInstant` de la réponse est la seule référence ; l'horloge locale ne sert qu'à mesurer un **écoulement**, jamais un instant absolu. Observer l'échec.
- [x] T054 Implémenter `apps/game/src/lib/clock.ts` : le décalage d'horloge et la mesure d'écoulement.
- [x] T055 Reporter dans la table des versions épinglées de `docs/architecture/2026-08-23-choix-de-stack.md` § 8 les versions exactes relevées à l'installation de `jose`, `postgres` (postgres.js) et `@fastify/cors`, ainsi que la version majeure de PostgreSQL fournie par Supabase.

**Point de contrôle** : `pnpm -w typecheck`, `pnpm -w boundaries` et `pnpm -w test` passent. Un joueur peut s'inscrire et se connecter ; il n'a encore aucune planète. Les fondations sont posées ; les tranches peuvent démarrer. ✅ **Franchi le 2026-08-26** — 326 tests unitaires, 72 d'intégration, lint et frontières (81 modules) au vert.

### Divergences constatées à l'exécution

1. **T038 et T043 n'avaient pas de tâche de test associée.** Le principe III
   étant non négociable, `apps/api/tests/server.test.ts` et
   `apps/api/tests/cors.test.ts` ont été écrits d'abord et observés en échec.
   Même chose côté client pour T048, T051 et T052.
2. **Le harnais d'intégration sautait ses migrations en silence** (T029).
   `migrationsDir()` résolvait depuis `process.cwd()`, que Vitest place à la
   racine du dépôt et non au `root` du projet : `existsSync` répondait « non »
   et les 43 cas de T030 échouaient en dénonçant un schéma manquant. Corrigé par
   une résolution depuis `import.meta.url`, et `applyMigrations` rend désormais
   compte du nombre d'instructions exécutées. **Deuxième occurrence** du motif
   de R17 : un outil qui rapporte un succès sans avoir rien traité.
3. **Le harnais montait son propre pilote PostgreSQL**, sans la configuration
   `bigint` de la production — il éprouvait donc un pilote que la production
   n'exécute pas. Il emploie `createSql`, et `packages/db` expose `GameSql` et
   `GameTransaction` : annoncer `postgres.Sql` effaçait du typage
   l'enregistrement `bigint` que la configuration venait de déclarer.
4. **Aucune dépendance nouvelle n'a été ajoutée.** `fastify-plugin` a été
   écarté : les greffons sont des fonctions ordinaires appliquées à l'instance
   racine, ce qui rend l'encapsulation — et donc le paquet qui la rompt —
   inutile (principe V).
5. **La porte de verrouillage a été éprouvée par violation délibérée.** Sans
   `FOR UPDATE`, deux crédits de 500 en donnent 1500 au lieu de 2000. Un verrou
   jamais vu manquer ne prouve rien.
6. **T055 reste partielle et le dit** : la majeure PostgreSQL de Supabase n'a pas
   pu être relevée — aucun projet Supabase n'existe. Le harnais tourne
   entre-temps sur `postgres:17-alpine`, et l'écart est nommé au § 8 du document
   de stack plutôt que masqué.

---

## Phase 3 : US1 — Fonder sa colonie et la voir produire (P1) 🎯 MVP

**Objectif** : un nouveau joueur est installé sur son Berceau, voit sa grille 6×6
et ses compteurs progresser, et retrouve après trois semaines d'absence
exactement ce que les règles publiées lui devaient, à la seconde près.

**Test indépendant** : créer un compte, relever les compteurs, avancer l'instant
d'observation, comparer au calcul mené à la main depuis les règles publiées.
Écart attendu : **nul**, plafond compris.

### Tests d'abord ⚠️

- [x] T056 [US1] **Éprouvé le 2026-08-26 sur la pile Supabase locale : 12 cas, deux profils (bureau et mobile), au vert.** Il a trouvé deux défauts réels — le focus qui ne suivait pas les flèches, et des compteurs qui ne bougeaient qu'une fois toutes les trois minutes. Écrire le parcours Playwright dans `apps/game/tests/e2e/us1-planet.spec.ts` : créer un compte, ouvrir la planète, vérifier la grille 6×6, les 10 obstacles, les 26 cases libres et les trois gisements aux coordonnées de R7 ; vérifier que les compteurs continuent de progresser **en mode hors ligne du navigateur** ; passer `axe-core` **sans écart**. Observer l'échec.
- [x] T057 [P] [US1] Écrire les tests de cohérence de la disposition du Berceau dans `packages/catalogs/tests/layout-berceau.test.ts` : 36 cases, **10 obstruées**, 26 libres, exactement une veine de Camelote, un geyser de Jus et un récif de Bave d'étoiles, **au plus un gisement par case et d'une seule ressource** (FR-015), chaque case obstruée portant un type d'obstacle existant (FR-002, FR-004, FR-042). Observer l'échec.
- [x] T058 [P] [US1] Écrire les tests de cohérence économique du catalogue dans `packages/catalogs/tests/balance.test.ts` : production de base du Berceau **non nulle** pour les trois ressources (FR-018), capacité de base non nulle pour les trois ressources (FR-025), **énergie de base du Berceau non nulle** (FR-022), stock de départ suffisant pour une centrale **et** un extracteur de niveau 1 (FR-019) ; **aucun coût du catalogue n'est libellé en Jus** (FR-062, R22). Observer l'échec.
- [x] T059 [P] [US1] Écrire les tests unitaires de projection dans `packages/domain/tests/kernel/projection.test.ts` : projection à `t₀ + 1 h`, `+ 3 semaines`, `+ 3 semaines + 1 s` comparée au calcul mené à la main ; segmentation en **deux segments au plus** autour de `dueAt` (R3, FR-032) ; `at < consolidatedAt` est une erreur de programmation, pas un cas de jeu. Observer l'échec.
- [x] T060 [P] [US1] Écrire les invariants fast-check dans `packages/domain/tests/kernel/invariants.test.ts` : **I-1** `0 ≤ amount ≤ cap` pour toute suite de commandes légales ; **I-2** `project(t₀→t₁→t₂) = project(t₀→t₂)`, **quantité et perte cumulée** ; **I-3** dépenser puis projeter = projeter puis dépenser au même instant ; **I-4** aucune suite de commandes légales ne crée de ressource à partir de rien ; **I-10** la production reste strictement positive depuis un état vide ; **I-11** deux appels de `project` au même `at` sont égaux. Observer l'échec.
- [x] T061 [P] [US1] Écrire le test d'instantané de JSON Schema de `PlanetSnapshotV1` dans `packages/contracts/tests/v1/snapshot.test.ts`, et l'échantillon enregistré de la version 1 dans `packages/contracts/tests/fixtures/v1/`. Vérifier notamment l'**absence** des champs dérivables : quantités courantes, plafonds, taux, rapport d'énergie, temps avant saturation, cases occupées, gisements, coûts cumulés, temps restant. Observer l'échec.
- [x] T062 [P] [US1] Écrire le test d'extrapolation dans `apps/game/tests/features/resources/extrapolation.test.ts` : la boucle rejoue `project()` localement à partir de l'instantané détenu et du décalage d'horloge ; **aucun appel réseau** n'est émis ; la valeur affichée à `t` est exactement celle que le serveur donnerait au même `t` (R8). Observer l'échec.

### Implémentation

- [x] T063 [US1] Implémenter `packages/catalogs/src/obstacles.ts` : les cinq types d'obstacle de R7 — `eboulis`, `rocher`, `filon-enfoui`, `poche-scellee`, `croute-calcifiee` — avec leur coût, leur durée et leur **résultat de déblaiement** (terrain nu ou gisement nommé).
- [x] T064 [US1] Implémenter `packages/catalogs/src/layouts/berceau.ts` : la disposition unique et identique pour tous de R7 — dix obstacles aux cases (3,0) (5,1) (0,2) (1,2) (3,2) (4,2) (5,2) (1,3) (2,3) (2,4), veine de Camelote en (0,4), geyser de Jus en (1,1), récif de Bave d'étoiles en (4,4) — plus la production de base, la capacité de base, **l'énergie de base** (FR-022) et le stock de départ. **Aucun tirage au sort** (FR-003, SC-008).
- [x] T065 [US1] Implémenter `packages/catalogs/src/version.ts` : l'identifiant de version de catalogue exposé dans chaque réponse, pour que la divergence client/serveur soit détectable et non silencieuse (R15).
- [x] T066 [US1] Implémenter `packages/domain/src/kernel/grid.ts` (première moitié) : `Cell`, les vues de case — libre, obstruée, occupée, gisement, obstacle — dérivées de la disposition du catalogue **moins** `clearedCells`. Une case occupée par un bâtiment **conserve la mention de son gisement** (FR-020). La validation de placement arrive en US2.
- [x] T067 [US1] Implémenter `packages/domain/src/kernel/rates.ts` (première moitié) : la production de base du Berceau, **insensible au déficit d'énergie** et ajoutée après le rapport (FR-018, R5). Les taux d'extracteur arrivent en US2.
- [x] T068 [US1] Implémenter `packages/domain/src/kernel/projection.ts` : `project(snapshot, catalogs, at) -> ProjectedState`, fonction **pure**, avec segmentation autour de `dueAt` et application des effets d'achèvement à l'échéance (R3, FR-031, FR-032). `at` est un argument, jamais un appel d'horloge.
- [x] T069 [US1] Implémenter `packages/domain/src/modules/construction/completion.ts` : `effectsOnCompletion(work, snapshotAtDue, catalogs)` — les effets d'un chantier sont **redérivés** à l'achèvement, jamais sérialisés en base.
- [x] T070 [US1] Implémenter `packages/contracts/src/v1/planet.ts` : `PlanetSnapshotV1` et les routes `POST /v1/me/planet` et `GET /v1/me/planet`, schémas **fermés** (clés inconnues refusées) et **bornés** (tout nombre entier, minimum et maximum), analysés par `parse` et jamais transtypés. Ce paquet **n'importe pas `domain`** : les notions sont redéclarées.
- [x] T071 [US1] Implémenter `packages/db/src/repository/snapshot.ts` : `loadSnapshot(planetId)` et `writeSnapshot(snapshot)`, avec la conversion de grains à la frontière du paquet.
- [x] T072 [US1] Écrire le test d'intégration du provisionnement dans `apps/api/tests/integration/provision.test.ts` : deux appels **concurrents** de `POST /v1/me/planet` ne créent **jamais** deux planètes — l'index unique sur `owner_id` le garantit et la transaction perdante retourne `200` ; deux comptes indépendants reçoivent une disposition **identique** (SC-008). Observer l'échec.
- [x] T073 [US1] Écrire le test d'intégration de pureté du `GET` dans `apps/api/tests/integration/get-planet.test.ts` : `GET` ne provisionne rien (404 `planet-not-provisioned`), n'écrit **rien**, y compris avec un chantier échu depuis trois semaines qui doit rester présent dans `work` (FR-031, R3, R11). Observer l'échec.
- [x] T074 [US1] Implémenter `apps/api/src/routes/v1/planet.ts` : `POST /v1/me/planet` idempotente (`201` créée, `200` existante) et `GET /v1/me/planet` pure. Le joueur est **propriétaire et occupant** de sa planète (FR-006).
- [x] T075 [US1] Implémenter `apps/game/src/features/auth/useProvisionOnFirstVisit.ts` : au premier accès authentifié, émettre `POST /v1/me/planet` — idempotente, R11 — puis afficher la planète. Un `404 planet-not-provisioned` sur `GET` déclenche le provisionnement, **jamais** une page d'erreur (FR-001).
- [x] T076 [US1] Implémenter `apps/game/src/features/grid/GridView.tsx` : `role="grid"` de trente-six cases, `tabindex` mobile, distinction libre / obstruée / gisement **sans dépendre de la couleur seule** (FR-060), **gisement recouvert par un bâtiment restant visible en tant que tel** (FR-020), lisible sans zoom sur un écran de téléphone (SC-009).
- [x] T077 [US1] Implémenter `apps/game/src/features/resources/ResourcePanel.tsx` : par ressource, la quantité détenue, le plafond, le temps restant avant saturation au rythme courant, et la quantité perdue cumulée (FR-026, FR-027).
- [x] T078 [US1] Implémenter `apps/game/src/features/resources/useExtrapolatedHoldings.ts` : la boucle d'animation qui rejoue `project()` localement, **sans un seul appel réseau**, à partir de l'instantané détenu et du décalage d'horloge (R8).
- [x] T079 [US1] Implémenter `apps/game/src/routes/planet.tsx` : l'écran de planète assemblant grille, ressources et chantier en cours.

**Point de contrôle** : US1 est fonctionnelle et testable seule. Le joueur s'inscrit, reçoit sa planète et la voit produire. C'est le MVP livrable. ✅ **Franchi le 2026-08-26, parcours de bout en bout compris** — 669 tests unitaires, 98 d'intégration, 12 cas Playwright sur deux profils, `axe-core` sans écart, types, lint et frontières (127 modules) au vert.

### Divergences constatées à l'exécution

1. **`buildings.ts` avancé de la phase 4.** T091 le prévoyait en US2, mais T058
   est une tâche d'US1 et éprouve FR-019 sur les coûts de bâtiment. Seule la
   part nécessaire est écrite — identité, variantes, bornes, coûts ; les courbes
   de production, d'énergie et de capacité restent à T091, T112 et T145.
2. **`kernel` ne peut pas appeler `effectsOnCompletion`.** La règle « `kernel`
   n'importe jamais un module. Aucune exception » a été attrapée par
   `dependency-cruiser`. Le résolveur d'achèvement est injecté en argument
   **obligatoire**, et câblé par une racine de composition — `src/game.ts` —
   qui n'est ni noyau ni module. Une valeur par défaut « aucun effet » aurait
   laissé la segmentation fonctionner en apparence pendant que les chantiers
   s'achèveraient sans rien produire.
3. **`schedule-work` ne portait pas sa cible.** Un effet qui ne se suffit pas à
   lui-même oblige son destinataire à reprendre une décision que le module avait
   déjà prise. `WorkTarget` a rejoint le vocabulaire du noyau.
4. **Drizzle ne peut pas s'appuyer sur une transaction `postgres.js`** : son
   pilote lit `client.options.parsers`, propriété du pool. Le dépôt emploie donc
   du SQL explicite ; Drizzle garde le schéma et les migrations. Le prix — une
   liste de colonnes en clair — est payé par les tests d'intégration, qui la
   confrontent au vrai schéma à chaque exécution.
5. **Sept tâches d'implémentation n'avaient pas de tâche de test** (T038, T043,
   T048, T051, T052, T066, T067, plus `snapshot.ts` et `completion.ts`). Les
   tests ont été écrits d'abord quand la tâche le permettait, et rattrapés avant
   fusion sinon — c'est le seuil de couverture du domaine qui a rendu le trou
   visible, en passant de 76 % à 97 % de lignes une fois comblé.
6. **Le projet Vitest `game` est scindé en `game` et `game-dom`.** Un test de
   logique n'a pas besoin d'un jsdom, dont le montage coûtait jusqu'à cinquante
   secondes par fichier sur une machine chargée. La frontière est l'extension.
7. **`*.contract.json` est exclu du formateur** : Biome repliait les tableaux
   courts du fichier de référence, et l'instantané de schéma échouait à chaque
   exécution.
8. **Le parcours de bout en bout a trouvé deux défauts que rien d'autre ne
   voyait.** Le premier : les flèches déplaçaient le *curseur* — quelle case
   porte `tabIndex={0}` — sans déplacer le **focus**. Les cas unitaires
   comptaient les `tabIndex` et le compte était juste ; un joueur au clavier,
   lui, restait bloqué sur la première case. Le second est ci-dessous.
9. **La quantité détenue s'affiche au centième d'unité.** Le critère 3 d'US1
   exige une progression « continue » ; en unités entières, la Camelote change
   une fois toutes les trois minutes et la Bave d'étoiles toutes les douze —
   rien ne bouge sous les yeux du joueur. **R1 n'est pas touché** : le grain
   reste l'unité canonique, seule la résolution d'affichage augmente, et la
   troncature va toujours vers le bas. Arbitrage pris avec la personne qui
   développe, contre une barre de progression et contre un amendement du
   critère.
10. **L'API n'avait aucun point d'entrée exécutable.** `pnpm dev` importait
    `server.ts` et rendait la main : rien n'écoutait. `src/main.ts` lit
    l'environnement, assemble et écoute — et **s'arrête** si une variable
    manque, plutôt que de démarrer un serveur qui refuserait tout ou, pire, en
    accepterait qu'il n'aurait pas dû.
11. **La pile Supabase locale entre dans le dépôt** (`supabase/config.toml`), en
    clés **asymétriques** ES256 comme R12 l'exige. Deux pièges rencontrés et
    consignés en quickstart § 1 : `[analytics]` monte le socket Docker de l'hôte
    — que la VM Rancher refuse, **même cause que Ryuk** — et le JWK doit porter
    `key_ops: ["sign","verify"]`, sans quoi GoTrue ne trouve aucune clé de
    signature.

---

## Phase 4 : US2 — Poser un bâtiment sur la grille (P2)

**Objectif** : choisir un type, choisir une variante d'empreinte, la pivoter, la
déplacer et la poser, avec coût, durée, validité et gisements recouverts affichés
**avant** de valider — le tout au clavier seul et restitué à un lecteur d'écran.

**Test indépendant** : poser un extracteur sur son gisement et vérifier que la
production augmente **exactement** du montant annoncé avant la pose.

### Tests d'abord ⚠️

- [x] T080 [US2] Écrire le parcours Playwright dans `apps/game/tests/e2e/us2-build.spec.ts` : `Tab` jusqu'à la grille, sélectionner `mine`, choisir `square-4`, flèches jusqu'en (0,4), `R`, `Entrée` — **sans aucun dispositif de pointage** (SC-004) ; vérifier que ce parcours tient dans le **nombre d'interactions publié par SC-001** ; vérifier les annonces `aria-live` ; provoquer les trois refus de placement et vérifier trois `code` distincts avec les cases fautives ; lancer deux chantiers depuis **deux onglets simultanés** et vérifier que la seconde demande échoue ; passer `axe-core` sans écart. Observer l'échec.
- [x] T081 [P] [US2] Écrire les tests de cohérence des types de bâtiment dans `packages/catalogs/tests/buildings.test.ts` : les cinq types de R20 et leurs variantes (`mine` → `square-4`, `l-4`, `t-4` ; `puits` → `rect-6` ; `racloir` → `square-9` ; `centrale` → `line-2` ; `entrepot` → `single`) ; **les variantes d'un même type ont la même surface et des courbes identiques** (FR-009) ; les coûts sont strictement croissants avec le niveau ; **tout type sauf la `centrale` porte une courbe de consommation d'énergie**, l'`entrepot` compris (FR-022) ; **chaque type porte un niveau maximal, une durée de démolition et une fraction de remboursement** (FR-046, R20). Observer l'échec.
- [x] T082 [P] [US2] Écrire le test de FR-005 dans `packages/catalogs/tests/layout-placements.test.ts` — **la seule autorité sur cette exigence**, la vérification manuelle de R7 n'en étant qu'un brouillon : chacune des sept empreintes admet au moins un placement valide sur le Berceau, et chacun des trois extracteurs admet un placement recouvrant le gisement de sa ressource. Observer l'échec.
- [x] T083 [P] [US2] Écrire les tests de placement dans `packages/domain/tests/kernel/grid.test.ts` : un cas par motif de l'union fermée `PlacementRefusal` — `out-of-grid`, `obstructed`, `occupied` — avec **énumération des cases fautives** (FR-012, FR-013). Observer l'échec.
- [x] T084 [P] [US2] Écrire les invariants de grille dans `packages/domain/tests/kernel/grid-invariants.test.ts` : **I-5** les cases de deux bâtiments d'une même planète sont disjointes ; **I-6** aucune suite de rotations ne produit le miroir d'une empreinte chirale — **`l-4` est la seule** : le T a un axe de symétrie vertical, donc son miroir *est* son orientation 0 (corrigé le 2026-08-26, cf. R6). Observer l'échec.
- [x] T085 [P] [US2] Écrire les invariants de production dans `packages/domain/tests/kernel/rates-invariants.test.ts` : **I-12** un extracteur ne recouvrant aucun gisement produit **zéro** ; **I-13** la production est proportionnelle au nombre de gisements recouverts — deux veines donnent exactement le double d'une (US2-3, US2-4). Observer l'échec.
- [x] T086 [P] [US2] Écrire les tests du module de construction dans `packages/domain/tests/modules/construction/build.test.ts` : `decide()` retourne des **effets** et ne mute rien ; `preview()` annonce coût, durée, `dueAt`, gisements recouverts et taux résultant ; **poser un second bâtiment du même type est accepté — seule la surface disponible contraint leur nombre** (FR-014) ; refus `work-in-progress` avec l'échéance du chantier en cours (FR-034) ; refus `variant-not-available-for-type`. Observer l'échec.
- [x] T087 [P] [US2] Écrire les **tests d'absence** de champ dans `packages/contracts/tests/v1/works-absence.test.ts` : une charge portant `cost`, `duration`, `dueAt`, `production`, `refund`, `result`, `clientNow` ou tout horodatage est rejetée en **400** pour clé inconnue ; **aucune route ni aucune nature ne permet d'annuler ou de remplacer un chantier** (FR-037). C'est la forme mécanique de FR-055 à FR-057 — ces exigences ne sont pas des validations à écrire, ce sont des champs à ne pas créer. Observer l'échec.
- [x] T088 [P] [US2] Écrire les **tests de bornes** dans `packages/contracts/tests/v1/works-bounds.test.ts` : `orientation` à 7 ou à −1, `anchorX` hors `0..15`, valeurs non entières, `NaN`, quantités négatives — toutes rejetées en **400** par le schéma, pas par le métier. Observer l'échec.
- [x] T089 [P] [US2] Écrire le test du curseur de grille dans `apps/game/tests/features/grid/cursor.test.ts` : machine à états du modèle R14 — flèches, `R`, `Entrée` —, bornes de la grille, orientation cyclique modulo 4, et l'appui pointeur menant au **même** état que le clavier. Observer l'échec.
- [x] T090 [P] [US2] Écrire le test des annonces dans `apps/game/tests/features/grid/live-region.test.ts` : chaque déplacement restitue position, contenu de case, empreinte, orientation, validité et nombre de gisements recouverts (FR-059) ; une rotation d'empreinte à orientation unique — le carré de quatre — n'annonce **rien** comme changé (R6). Observer l'échec.

### Implémentation

- [x] T091 [US2] Implémenter `packages/catalogs/src/buildings.ts` : les cinq types de R20, leurs variantes d'empreinte, leur niveau maximal, leur durée de démolition, leur fraction de remboursement, et leurs courbes de coût, de durée, de production, de consommation et de capacité. Le choix entre variantes est **purement géométrique** et ne porte jamais d'avantage chiffré (FR-009).
- [x] T092 [US2] Implémenter `packages/domain/src/kernel/grid.ts` (seconde moitié) : `orientedCells(variantId, orientation)`, `placementCells(variantId, orientation, anchor)` et `validatePlacement(grid, cells)` retournant `Ok | PlacementRefusal`. La contiguïté n'est jamais à vérifier : les sept empreintes sont contiguës par définition et une translation la conserve.
- [x] T093 [US2] Implémenter `packages/domain/src/kernel/rates.ts` (seconde moitié) : le taux nominal d'un extracteur = `courbeProduction(niveau) × gisements recouverts de sa ressource` (R5, FR-016, FR-017).
- [x] T094 [US2] Implémenter `packages/domain/src/modules/construction/build.ts` : validation, calcul du coût et de la durée, effets `debit-resources` et `schedule-work` au lancement, `place-building` à l'échéance. **Le module ne mute rien** : il retourne des effets que le noyau applique.
- [x] T095 [US2] Implémenter `packages/domain/src/modules/construction/preview.ts` : `preview(state, command, catalogs) -> Result<Preview, Refusal>` avec `cost`, `duration`, `dueAt`, `shortfall`, `secondsUntilAffordable` et l'effet discriminé — la variante `build` d'abord (data-model § 1.6). Le même code sert le client et le serveur (R8).
- [x] T096 [US2] Étendre `packages/contracts/src/v1/planet.ts` avec `POST /v1/me/planet/works` : union discriminée **fermée** sur `nature`, variante `build` (`typeId`, `variantId`, `orientation` `0..3`, `anchorX` `0..15`, `anchorY` `0..15`) et **rien d'autre**.
- [x] T097 [US2] Étendre `packages/contracts/src/v1/errors.ts` avec les codes `work-in-progress` (`{ workId, nature, dueAt }`), `placement-out-of-grid`, `placement-on-obstructed-cell`, `placement-on-occupied-cell` (`{ cells }`), `variant-not-available-for-type` et `not-occupant` (**403**), plus leurs `details` typés.
- [x] T098 [US2] Implémenter l'écriture de `game.building_cells` dans la **même transaction** que `game.buildings`, dans `packages/db/src/repository/buildings.ts` (R10).
- [x] T099 [US2] Écrire le test d'intégration d'unicité du chantier dans `apps/api/tests/integration/work-uniqueness.test.ts` : deux commandes simultanées depuis deux sessions — exactement **une** réussit, la seconde est refusée en `409 work-in-progress` avec `dueAt`. C'est l'index unique `(planet_id) where resolved_at is null` qui le garantit, **pas** une vérification préalable. C'est **I-9** éprouvé de bout en bout, là où T030 ne l'éprouvait qu'au niveau du schéma. Observer l'échec.
- [x] T100 [US2] Écrire le test d'intégration d'autorisation dans `apps/api/tests/integration/authorization.test.ts` — **le moins intuitif et le plus important** : l'`occupant_id` de la planète change entre la lecture et l'écriture ; la commande est **rejetée** en `403 not-occupant`. L'autorisation se vérifie dans la transaction, sur la ligne verrouillée, jamais avant (FR-007). Observer l'échec.
- [x] T101 [US2] Implémenter `apps/api/src/routes/v1/works.ts` : `POST /v1/me/planet/works` retournant `201` avec l'instantané **après** débit et planification, pour que le client n'ait aucun `GET` à enchaîner.
- [x] T102 [US2] Implémenter `apps/game/src/features/grid/useGridCursor.ts` : le modèle d'interaction curseur de R14 — flèches au clavier, appui sur une case au pointeur, `R` pour pivoter, `Entrée` pour confirmer. **Aucun glisser-déposer** : le même parcours sert le clavier et le pointeur.
- [x] T103 [US2] Implémenter `apps/game/src/features/grid/FootprintGhost.tsx` : le fantôme de l'empreinte orientée sous le curseur, avec la validité et les cases fautives rendues sans dépendre de la couleur seule.
- [x] T104 [US2] Implémenter `apps/game/src/features/grid/GridLiveRegion.tsx` : la région `aria-live` annonçant à chaque déplacement la position, le contenu de la case, l'empreinte courante, son orientation, la validité du placement et **le nombre de gisements recouverts** (FR-059). Une rotation d'empreinte à orientation unique — le carré de quatre — ne doit **rien** annoncer comme changé (R6).
- [x] T105 [US2] Implémenter `apps/game/src/features/work/BuildPanel.tsx` : sélecteur de type, sélecteur de variante, aperçu local par `preview()` — coût, durée, gisements recouverts, production annoncée — et **confirmation explicite** postérieure à cet affichage (FR-035).
- [x] T106 [US2] Implémenter `apps/game/src/features/work/CurrentWork.tsx` : la nature du chantier en cours, sa cible et le temps restant, extrapolé localement (FR-038).

**Point de contrôle** : US1 et US2 fonctionnent indépendamment. La mécanique qui
donne son identité au jeu est livrée. ✅ **Franchi le 2026-08-26** — 878 tests
unitaires, 125 d'intégration, 48 cas Playwright sur deux profils (US1 et US2),
`axe-core` sans écart, types, lint et frontières (158 modules) au vert. Le
parcours de pose **tient dans le plafond de quinze frappes** que publie SC-001,
et le parcours le compte plutôt que de l'affirmer.

### Divergences constatées à l'exécution

1. **`insufficient-resources` avancé de la phase 6.** T097 ne le listait pas et
   T124 l'apporte en US4 — mais T095 exige `shortfall` et
   `secondsUntilAffordable` dès maintenant, et sans le **code de refus**
   correspondant, un chantier trop cher aurait levé une `RangeError` au débit :
   un 500 là où le jeu voulait dire non. Le motif est donc livré avec la
   mécanique qui peut le produire.
2. **Les courbes d'énergie avancées de la phase 5.** T081 éprouve « tout type
   sauf la `centrale` porte une courbe de consommation, l'`entrepot` compris » :
   c'est un test d'US2, donc la donnée est écrite en T091. T112 trouvera cette
   moitié en place ; il lui reste la production de la centrale et le câblage du
   rapport. La courbe de **capacité** de l'entrepôt, elle, reste à T145 —
   aucun test de cette tranche ne la contraint, et une donnée d'équilibrage
   qu'aucun test ne tient est une valeur qui dérive en silence.
3. **`WorkIntentV1` est restreint à la nature `build`.** Le contrat déclarait
   les quatre natures depuis T070, alors que le serveur n'en honore qu'une. Le
   sens du versionnement tranche : élargir une entrée est **compatible**, la
   resserrer ne l'est pas — donc on ne déclare une nature qu'au moment où elle
   est servie, sous peine de ne plus pouvoir la retirer. `WorkTargetV1`, qui
   décrit un chantier *déjà planifié* dans la réponse, garde les quatre.
   L'instantané de JSON Schema a été relu et assumé : le diff ne porte que ce
   retrait.
4. **La forme unique de commande a changé de couture.** Elle prévoyait deux
   temps — « les effets d'achèvement » puis « marquer résolu » —, comme si
   l'achèvement était une liste d'effets à appliquer à l'instant de la commande.
   Il ne l'est pas : il s'applique à `dueAt`, et la production qui suit court aux
   **nouveaux** taux depuis cette échéance. Les séparer obligeait à appliquer les
   effets au mauvais instant, ou à reconstruire la segmentation hors du domaine.
   Les deux crochets sont remplacés par un seul, `consolidate`.
5. **Un cycle de dépendances dans `packages/db`**, refusé par
   `dependency-cruiser` : `snapshot.ts` → `buildings.ts` → `snapshot.ts`, par les
   types de forme. Les formes de persistance vivent désormais dans
   `repository/records.ts`, qui n'importe rien. La porte a fait son travail — et
   le compte de modules parcourus (154) confirme qu'elle n'est pas inerte.
6. **`building_cells` n'insère que les cases des bâtiments *nouveaux*.** Un
   `on conflict … do nothing` paraissait plus robuste et détruisait la garantie
   de R10 : il aurait transformé une superposition en écrasement silencieux.
   Comme les cases d'un bâtiment déjà en base sont déjà justes — variante,
   orientation et ancre sont figées à la pose —, il suffit de ne pas les
   réinsérer, et le conflit redevient une erreur.
7. **`GridView` devient contrôlée** : le curseur remonte dans l'écran de planète.
   Quatre choses en dépendent — le fantôme, l'aperçu, l'annonce et le lancement —
   et aucune n'appartient à la grille. Une grille qui détiendrait son curseur
   obligerait chacune des quatre à en tenir une copie, c'est-à-dire à afficher un
   fantôme à un endroit et à poser à un autre.
8. **`WorkInProgress.tsx` est remplacé par `CurrentWork.tsx`** (T106). Il
   manquait la **cible** : « construction en cours, deux minutes » ne dit pas
   *quoi*, et FR-038 l'exige — d'autant qu'un chantier n'est pas annulable.
9. **Le parcours de bout en bout a trouvé un défaut d'accessibilité réel** :
   deux groupes aux noms confusables, « Aperçu du chantier » et « Chantier ».
   Aucun test de composant ne pouvait l'attraper, chacun ne voyant qu'un groupe.
   Renommé en « Aperçu de la construction ».
10. **Quatre composants n'avaient pas de tâche de test** (T103 à T106). Les
    tests ont été écrits après leur implémentation — dette au titre du principe
    III, signalée et rattrapée avant fusion. Leur valeur a été vérifiée par
    **mutation** : deux mutations ciblées font tomber quatre cas.
11. **`cleared_cells` est écrite dès maintenant**, dans `repository/cells.ts` —
    le fichier que T132 nomme. Un instantané portant une case déblayée que le
    dépôt n'aurait pas persistée était un trou silencieux ; US5 trouvera
    l'écriture en place.
12. **Le curseur persiste entre deux poses**, et c'est une décision de jeu que le
    test a révélée : un joueur qui pose deux bâtiments voisins apprécie de
    repartir d'où il était. C'est le test qui doit dire d'où il part.

---

## Phase 5 : US3 — Alimenter la colonie en énergie (P3)

**Objectif** : une contrainte d'énergie instantanée — l'énergie est une ressource
**à part**, produite par le Berceau et par la centrale, consommée par **tous** les
autres bâtiments —, un rapport affiché, une production effective exacte, et
l'effet énergétique de toute action annoncé **avant** paiement.

**Test indépendant** : provoquer un déficit et vérifier que la production
effective de chaque extracteur vaut sa nominale multipliée par le rapport, et que
la capacité des entrepôts reste entière.

- [x] T107 [US3] Écrire le parcours Playwright dans `apps/game/tests/e2e/us3-energy.spec.ts` : construire jusqu'au déficit, vérifier le rapport affiché et la production effective, demander l'aperçu d'une action qui ferait basculer en déficit et vérifier qu'il l'annonce avant paiement ; vérifier qu'un entrepôt posé en déficit **ne perd pas de capacité** tout en apparaissant dans la consommation ; passer `axe-core` sans écart. Observer l'échec.
- [x] T108 [P] [US3] Écrire les tests d'énergie dans `packages/domain/tests/kernel/energy.test.ts` : `E₊` somme **l'énergie de base du Berceau et les centrales** — une mine posée avant toute centrale n'est donc **pas** réduite à zéro (FR-022) ; `E₋` somme la consommation de **tous** les bâtiments sauf la centrale, l'entrepôt compris (FR-022) ; rapport `1` quand `E₋ ≤ E₊` ; sinon `taux effectif = ⌊taux nominal × E₊ ÷ E₋⌋` avec **une seule troncature, sur le taux et non sur le gain** (R5) ; production de 60 pour consommation de 100 → exactement 60 % (US3-2) ; la production de base du Berceau n'est **jamais** touchée (FR-018). Observer l'échec.
- [x] T109 [P] [US3] Écrire le test de la capacité non dégradée dans `packages/domain/tests/kernel/energy-capacity.test.ts` : en déficit, les trois plafonds sont **inchangés** — le rapport ne s'applique qu'à la production (FR-023b, R21) — alors même que la consommation de l'entrepôt figure dans `consumed` et dégrade le rapport des extracteurs (US3-4). Observer l'échec.
- [x] T110 [P] [US3] Écrire le test d'additivité sous déficit dans `packages/domain/tests/kernel/energy-invariants.test.ts` : le taux effectif étant entier et constant sur un segment, I-2 tient sous déficit comme hors déficit. Observer l'échec.
- [x] T111 [US3] Implémenter `packages/domain/src/kernel/energy.ts` : `produced` = énergie de base du Berceau + production des centrales, `consumed`, rapport `{ numerator, denominator }` et application au taux nominal. **L'énergie est une grandeur instantanée, ni stockée ni accumulée** (FR-021).
- [x] T112 [US3] Étendre `packages/catalogs/src/buildings.ts` avec les courbes d'énergie : production de la `centrale`, et consommation de **tous les autres types** — `mine`, `puits`, `racloir` et `entrepot` (FR-022). La `centrale` est le seul type qui ne consomme pas.
- [x] T113 [US3] Câbler le rapport d'énergie dans `packages/domain/src/kernel/projection.ts` et exposer `energy` et les deux taux — nominal et effectif — dans `ProjectedState` (FR-024).
- [x] T114 [US3] Étendre `packages/domain/src/modules/construction/preview.ts` avec `energyAfter` : le rapport résultant et la production effective résultante, annoncés **avant paiement** (US3-3).
- [x] T115 [US3] Implémenter `apps/game/src/features/resources/EnergyPanel.tsx` : énergie produite — **base du Berceau et centrales distinguées** —, consommation **détaillée par bâtiment** — l'entrepôt y figure —, rapport, et par extracteur la production nominale **et** effective affichées séparément (FR-024).

**Point de contrôle** : la contrainte d'énergie existe avant que le joueur puisse la déclencher.

### Divergences constatées à l'exécution

1. **Le vocabulaire du rapport a déménagé.** `EnergyRatio`, `NO_DEFICIT` et
   `applyEnergyRatio` vivaient dans `rates.ts` depuis US1 ; ils vivent désormais
   dans `energy.ts`, avec la grandeur qu'ils décrivent. `rates.ts` ne fait plus
   qu'**appliquer** un rapport : il sait multiplier un taux, il ne sait pas d'où
   vient le déficit. Les deux moitiés s'éprouvent donc séparément, et le graphe
   reste acyclique — `energy.ts` n'importe pas `rates.ts`.
2. **`EnergyReport` porte plus que les trois champs annoncés.** T113 nommait
   `produced`, `consumed` et le rapport ; T115 exige la base du Berceau et les
   centrales **distinguées**, et la consommation **détaillée par bâtiment**. Un
   total seul n'a rien à afficher : il laisserait deviner quel bâtiment démolir.
   D'où `base`, `fromPlants`, `consumers[]` et `deficit`.
3. **L'aperçu annonce aussi la production sous le rapport résultant**
   (`effectiveRateAfter`). T114 ne demandait que `energyAfter` — mais annoncer la
   production sous le rapport *courant* promettrait un chiffre que la pose rendrait
   faux à l'instant même où elle l'atteint : un extracteur posé sans centrale se
   dégrade lui-même.
4. **Le rapport est recalculé par segment**, et non une fois par projection. Un
   chantier échu à l'intérieur de la fenêtre change la consommation : le calculer
   une fois appliquerait à la période antérieure une consommation qui n'existait
   pas encore. C'est ce qui fait de l'énergie une grandeur réellement instantanée
   (FR-021), et non une valeur figée à l'ouverture.
5. **Deux attributs distincts dans le document**, et c'est le parcours de bout en
   bout qui l'a imposé : `data-energy` porte `E₊/E₋`, `data-energy-ratio` porte le
   rapport. Sur une planète neuve `E₋` vaut **zéro** — les deux membres se lisent,
   le quotient n'existe pas —, et publier « 20/0 » sous le nom de rapport était
   faux. Aucun test de domaine ne pouvait l'attraper : le domaine, lui, rendait
   bien `1/1`.
6. **La colonne `energyProduction` est arrivée avec son test d'exclusivité.** Un
   type qui ne remplirait **ni** l'une **ni** l'autre des deux colonnes serait
   invisible dans le rapport — ni au numérateur, ni au dénominateur —, donc gratuit
   sans qu'aucune règle publiée ne le dise. La valeur du test a été vérifiée par
   **mutation** : trois mutations ciblées font tomber sept cas.
7. **Trois fichiers de tests de composant ont été écrits sans tâche qui les
   nomme** — `energy-panel.test.tsx`, et les ajouts à `build-panel.test.tsx` et
   `resource-panel.test.tsx`. Ils l'ont été **avant** leur implémentation, la note
   10 de la phase 4 ayant consigné la dette inverse : elle ne se répète pas.
8. **`data-cap` sur le panneau de ressources.** Le parcours d'US3 compare deux
   plafonds pour établir que le déficit ne les dégrade pas (FR-023b) : il lui faut
   le chiffre, pas son formatage. Relire à l'envers un nombre à séparateurs de
   milliers aurait été fragile autant qu'inutile.
9. **L'équilibrage de la centrale est `30 + 15 × (n − 1)`**, et il est *tenu par un
   test* : avec les vingt de base du Berceau, une centrale de niveau 1 alimente un
   de chaque autre type au niveau 1. Sans cette borne, le premier écran du jeu
   serait un déficit, et le joueur apprendrait la mécanique en étant puni par elle.
   La tension revient avec les niveaux — sept par niveau pour un racloir, quinze
   pour une centrale —, donc monter ses extracteurs finit toujours par exiger de
   monter sa centrale.
10. **La consommation de tous les types était déjà là** (divergence 2 de la
    phase 4). T112 n'a donc apporté que la production de la centrale ; la courbe de
    **capacité** de l'entrepôt reste à T145, aucun test de cette tranche ne la
    contraignant.

---

## Phase 6 : US4 — Améliorer un bâtiment (P4)

**Objectif** : porter un bâtiment au niveau suivant, sans qu'aucune case change,
avec le gain de production exact affiché avant paiement.

**Test indépendant** : améliorer un extracteur posé, comparer le gain annoncé au
gain constaté, vérifier que les cases occupées sont inchangées.

- [x] T116 [US4] Écrire le parcours Playwright dans `apps/game/tests/e2e/us4-upgrade.spec.ts` : améliorer un extracteur **au clavier seul**, vérifier l'aperçu complet et l'identité des cases occupées après achèvement ; passer `axe-core` sans écart. Observer l'échec.
- [x] T117 [P] [US4] Écrire l'invariant **I-7** dans `packages/domain/tests/modules/construction/upgrade-invariants.test.ts` : une amélioration laisse l'ensemble des cases occupées identique, **à la case près**, quels que soient le type, la variante et l'orientation (FR-039, US4-1). Observer l'échec.
- [x] T118 [P] [US4] Écrire les tests d'amélioration dans `packages/domain/tests/modules/construction/upgrade.test.ts` : coût et durée suivant les courbes publiées (FR-040) ; aperçu portant coût, durée, `rateBefore`, `rateAfter` et `delta` (FR-041) ; refus `insufficient-resources` avec le **manque par ressource** et `secondsUntilAffordable` au rythme courant (US4-3) ; refus `max-level-reached` au niveau maximal du catalogue. Observer l'échec.
- [x] T119 [P] [US4] Écrire le test de `secondsUntilAffordable` à `null` dans `packages/domain/tests/modules/construction/affordability.test.ts` : quand le taux courant ne permettra jamais d'atteindre le montant parce que la ressource sature avant, la valeur est `null` — **information utile, pas cas d'erreur** : elle dit au joueur qu'il lui faut d'abord un entrepôt. Observer l'échec.
- [x] T120 [P] [US4] Écrire le test d'absence dans `packages/contracts/tests/v1/upgrade-absence.test.ts` : une charge `upgrade` portant `variantId` ou `orientation` est rejetée en **400**. Observer l'échec, puis vérifier qu'il passe sans modifier le contrat — l'absence de champ, et non une validation, est ce qui rend FR-039 inviolable.
- [x] T121 [US4] Implémenter `packages/domain/src/modules/construction/upgrade.ts` : effets `debit-resources` et `schedule-work` au lancement, `set-building-level` à l'échéance.
- [x] T122 [US4] Étendre `packages/domain/src/modules/construction/preview.ts` avec la variante `upgrade` : `cellsUnchanged: true`, `rateBefore`, `rateAfter`, `delta`, `energyAfter`.
- [x] T123 [US4] Étendre `packages/contracts/src/v1/planet.ts` avec la variante `{ nature: 'upgrade', buildingId }` — et **rien d'autre**.
- [x] T124 [US4] Étendre `packages/contracts/src/v1/errors.ts` avec `insufficient-resources` (`{ shortfall: [{ resourceId, grains }], secondsUntilAffordable }`), `building-not-found` et `max-level-reached`.
- [x] T125 [US4] Implémenter `apps/game/src/features/work/UpgradePanel.tsx` : coût, durée, production actuelle, production résultante et leur différence, plus le manque par ressource et le temps restant en cas d'insuffisance.

**Point de contrôle** : la voie de progression qui ne consomme pas de surface est
ouverte. ✅ **Franchi le 2026-08-26.**

### Divergences constatées à l'exécution

1. **Une route de plus n'a pas été créée** — `POST /works` **aiguille** désormais
   sur la nature de l'intention. Aucune tâche ne le nommait, et il le fallait :
   T123 déclare la nature au contrat, T116 exige le parcours complet, et rien
   entre les deux ne disait qui l'exécute. Une route par mécanique aurait obligé
   chacune à vérifier « au plus un chantier par planète » (FR-033) — une règle qui
   porte sur la planète et non sur la mécanique —, et la première qui l'oublierait
   ouvrirait la porte à deux chantiers simultanés.
2. **`modules/construction/refusals.ts` est né.** `work-in-progress` et
   `insufficient-resources` ne dépendent pas de ce qu'on construit : les
   redéclarer par mécanique en aurait fait quatre formes identiques et
   indépendamment modifiables, alors que l'API et le client les indexent par
   `code`. `build.ts` les importe désormais aussi — la pose est arrivée la
   première, elle n'est pas propriétaire d'un vocabulaire partagé.
3. **L'ordre des contrôles a été corrigé par le test d'intégration**, pas par le
   raisonnement. « Bâtiment introuvable » venait d'abord ; un joueur qui lance une
   pose puis tente d'améliorer le bâtiment qu'elle produira entendait donc « ce
   bâtiment n'est pas sur la planète ». C'est vrai et inutile : la cause est le
   chantier, et le chantier *explique* l'absence. `work-in-progress` passe devant.
   Aucun ordre n'échouait à compiler, et aucun test de domaine ne le regardait.
4. **`Preview` s'est scindé en `PreviewTerms` + effet.** Les quatre mécaniques se
   distinguent par leur effet, jamais par leurs termes — coût, durée, échéance,
   manque, délai. Un aperçu par mécanique aurait laissé dériver la forme du manque,
   et l'écran devrait savoir laquelle il regarde pour savoir comment lire un coût.
5. **`energyAfterUpgrade` **remplace** le bâtiment dans le détail, là où
   `energyAfterBuilding` l'ajoute.** L'ajouter compterait deux fois un seul
   bâtiment, donc annoncerait un déficit qui n'arrivera pas — et ferait renoncer le
   joueur à une amélioration que le jeu lui accordait. Il est remplacé **à sa
   place** : le détail suit l'ordre de l'instantané, et réordonner le tableau
   ferait chercher la ligne qu'on regardait.
6. **`delta` peut être négatif, et c'est publié tel quel.** Une amélioration qui
   fait basculer la planète en déficit fait *baisser* la production du bâtiment
   qu'elle améliore. L'écrêter à zéro aurait caché précisément l'information qui
   doit faire poser une centrale d'abord. Le cas est tenu par un test :
   `⌊15 × 20 ÷ 22⌋ = 13` avant, `⌊16 × 20 ÷ 26⌋ = 12` après.
7. **Le libellé des boutons en vol a changé dans les deux panneaux.** « Lancement
   en cours… » était générique ; avec deux panneaux, les deux boutons auraient
   porté le **même** nom accessible au moment précis où le joueur a besoin de
   savoir lequel il a engagé. C'est la leçon d'US2 — noms *distincts*, pas
   seulement différents — étendue aux états transitoires. Le `pending` de l'écran
   est devenu `'build' | 'upgrade' | null` pour la même raison : `aria-busy` sur un
   bouton qu'on n'a pas pressé est une information fausse.
8. **`CurrentWork` nomme désormais le bâtiment cible.** Sa branche `building`
   disait « un bâtiment posé », faute de tranche qui produise ce genre de chantier.
   US4 en produit un, et FR-038 exige de savoir *lequel* — un chantier n'est ni
   annulable ni remplaçable (FR-037). Le repli reste : une seconde vue peut démolir
   la cible, et un identifiant technique serait pire que ne rien dire.
9. **Trois tâches de test manquaient, et ont été écrites.**
   `upgrade-panel.test.tsx` et les cas ajoutés à `refusal-notice.test.tsx` et
   `current-work.test.tsx` — **avant** leur sujet, la dette de la phase 4 ne se
   répétant pas. Plus deux fichiers qu'aucune tâche ne prévoyait :
   `apps/api/tests/refusal-vocabulary.test.ts`, qui éprouve que le vocabulaire de
   refus du domaine et celui du contrat sont **le même** — vérifiable dans le seul
   paquet qui voit les deux, `contracts` n'important pas `domain` —, et
   `apps/api/tests/integration/upgrade.test.ts`, qui écrit une ligne de chantier
   d'amélioration dans un vrai PostgreSQL. La valeur du premier a été vérifiée par
   **mutation** : deux mutations ciblées font tomber huit cas.
10. **T119 ne créait pas de test, il en déplaçait un.** Le contrat de
    `secondsUntilAffordable` vivait dans `build.test.ts`. Il a déménagé dans
    `affordability.test.ts` — son sujet —, et trois propriétés non couvertes s'y
    sont ajoutées : l'**exactitude** du délai (l'ancien test disait seulement
    « > 0 »), le **maximum** sur les ressources plutôt que leur somme, et le
    plafond **atteint** distingué du plafond dépassé.
11. **T124 était à moitié faite.** `insufficient-resources` avait été avancé en
    phase 4 ; la tâche n'a donc apporté que `building-not-found` et
    `max-level-reached`. L'instantané de JSON Schema a bougé d'un diff **purement
    additif** — une variante de plus dans l'union d'entrée de `startWork`, aucune
    borne relâchée. Élargir une entrée est compatible ; le diff a été lu et
    approuvé.
12. **Le parcours a de nouveau attrapé ce qu'aucun test unitaire ne voyait** — mais
    pas dans le code : une **API démarrée avant les changements** avait été
    réutilisée par `reuseExistingServer`, et rejetait la nature `upgrade` en 400.
    Le piège est consigné depuis la phase 4 ; il s'est représenté à l'identique.
13. **Quatre cas d'US2 sont tombés, et le défaut était dans leur localisateur.**
    `getByRole('group', { name: /aperçu/i })` était sans ambiguïté tant qu'il n'y
    avait qu'un aperçu ; l'écran en porte deux depuis US4, aux noms *distincts*
    — « Aperçu de la construction », « Aperçu de l'amélioration ». C'est la leçon de
    la phase 4 appliquée cette fois au test : un localisateur qui accepte deux
    repères n'éprouve ni l'un ni l'autre. Les deux occurrences ont été nommées en
    entier, et US2 repasse en entier — plafond de frappes de SC-001 compris.

---

## Phase 7 : US5 — Déblayer une case obstruée (P5)

**Objectif** : libérer du terrain contre des ressources et du temps, en sachant
**avant** de payer si l'on obtiendra du terrain nu ou un gisement nommé.

**Test indépendant** : déblayer une case et vérifier que ce qui apparaît
correspond exactement à ce qui était annoncé.

- [ ] T126 [US5] Écrire le parcours Playwright dans `apps/game/tests/e2e/us5-clear.spec.ts` : sélectionner (3,2) **au clavier seul**, vérifier que l'aperçu annonce « geyser de Jus », payer, atteindre l'échéance, vérifier que la case est libre et porte un geyser de Jus ; passer `axe-core` sans écart. Observer l'échec.
- [ ] T127 [P] [US5] Écrire l'invariant **I-8** dans `packages/domain/tests/modules/construction/clear-invariants.test.ts` : une case déblayée ne redevient **jamais** obstruée — aucun chemin d'écriture ne le permet (FR-045). Observer l'échec.
- [ ] T128 [P] [US5] Écrire les tests de déblaiement dans `packages/domain/tests/modules/construction/clear.test.ts` : coût, durée et résultat lus du type d'obstacle et annoncés avant paiement (FR-042, FR-043) ; **déterminisme** — deux déblaiements de la même case dans le même état donnent le même résultat, aucun tirage au sort (FR-044, US5-3) ; refus `cell-not-obstructed` sur une case libre. Observer l'échec.
- [ ] T129 [US5] Implémenter `packages/domain/src/modules/construction/clear.ts` : effets `debit-resources` et `schedule-work` au lancement, `clear-cell` à l'échéance.
- [ ] T130 [US5] Étendre `packages/domain/src/modules/construction/preview.ts` avec la variante `clear` : `reveals: 'bare-ground' | { depositOf: ResourceId }`.
- [ ] T131 [US5] Étendre `packages/contracts/src/v1/planet.ts` avec `{ nature: 'clear', x, y }` et `packages/contracts/src/v1/errors.ts` avec `cell-not-obstructed` (`{ x, y }`).
- [ ] T132 [US5] Implémenter l'écriture de `game.cleared_cells` dans `packages/db/src/repository/cells.ts` — l'état obstrué d'une case est la disposition du catalogue **moins** ces lignes, jamais une table de 36 lignes par planète.
- [ ] T133 [US5] Implémenter `apps/game/src/features/work/ClearPanel.tsx` : coût, durée et **nature exacte du résultat** affichés avant tout paiement, accessibles au clavier depuis le curseur de grille.

**Point de contrôle** : le premier antidote à la grille figée est livré.

---

## Phase 8 : US6 — Démolir pour réorganiser (P6)

**Objectif** : récupérer une fraction du coût cumulé, libérer les cases, et
connaître **avant confirmation** le montant qui serait écrêté par un plafond.

**Test indépendant** : démolir un bâtiment et vérifier le remboursement, la
libération des cases et la disparition de sa production.

- [ ] T134 [US6] Écrire le parcours Playwright dans `apps/game/tests/e2e/us6-demolish.spec.ts` : démolir un bâtiment de niveau 3 **au clavier seul, sans aucun dispositif de pointage** (FR-058, SC-004), vérifier que le remboursement vaut la fraction publiée du coût cumulé des **trois** niveaux, que les cases redeviennent libres et les gisements intacts ; provoquer un écrêtement et vérifier qu'il est annoncé avant confirmation ; passer `axe-core` sans écart. Observer l'échec.
- [ ] T135 [P] [US6] Écrire les tests de démolition dans `packages/domain/tests/modules/construction/demolish.test.ts` : remboursement = `fraction × Σ(k=1..N) coût(k)`, **dérivé de la courbe et non stocké** (R9, FR-046) ; durée lue du catalogue ; à l'achèvement les cases redeviennent libres et **les gisements qu'elles portaient sont intacts** (FR-047) ; la production cesse à l'instant exact de l'échéance, pas à celui de la constatation (FR-048) ; refus `building-is-work-target` sur la cible du chantier en cours. Observer l'échec.
- [ ] T136 [P] [US6] Écrire le test d'écrêtement dans `packages/domain/tests/modules/construction/demolish-clipping.test.ts` : un remboursement dépassant un plafond est écrêté et **le montant écrêté est annoncé avant confirmation** (FR-049). C'est calculable exactement parce qu'aucune autre transition ne peut survenir entre le lancement et l'échéance (R3, R4). Observer l'échec.
- [ ] T137 [US6] Implémenter `packages/domain/src/modules/construction/demolish.ts` : effet `schedule-work` au lancement, `remove-building` et `credit-resources` à l'échéance.
- [ ] T138 [US6] Étendre `packages/domain/src/modules/construction/preview.ts` avec la variante `demolish` : `refund`, `clippedAmount`, `cellsFreed`, `depositsPreserved`.
- [ ] T139 [US6] Étendre `packages/contracts/src/v1/planet.ts` avec `{ nature: 'demolish', buildingId }` et `packages/contracts/src/v1/errors.ts` avec `building-is-work-target` (`{ workId }`).
- [ ] T140 [US6] Implémenter la suppression en cascade de `game.building_cells` à la démolition dans `packages/db/src/repository/buildings.ts`, dans la même transaction.
- [ ] T141 [US6] Implémenter `apps/game/src/features/work/DemolishPanel.tsx` : remboursement annoncé, montant écrêté le cas échéant, durée, et confirmation explicite.

**Point de contrôle** : le second antidote à la grille figée est livré. Une erreur de placement n'est plus définitive.

---

## Phase 9 : US7 — Étendre sa capacité de stockage (P7)

**Objectif** : relever les plafonds, repousser la saturation, et rendre la perte
visible et comptabilisée.

**Test indépendant** : poser un entrepôt et vérifier que le plafond et le temps
avant saturation augmentent des montants annoncés.

- [ ] T142 [US7] Écrire le parcours Playwright dans `apps/game/tests/e2e/us7-storage.spec.ts` : poser un entrepôt **au clavier seul, sans aucun dispositif de pointage** (FR-058, SC-004), vérifier que les trois plafonds augmentent du montant annoncé et que le temps avant saturation s'allonge ; vérifier qu'une ressource saturée cesse de croître et que la perte est comptabilisée ; passer `axe-core` sans écart. Observer l'échec.
- [ ] T143 [P] [US7] Écrire les tests de capacité dans `packages/domain/tests/kernel/capacity.test.ts` : plafond = capacité de base du Berceau **plus** celle des entrepôts posés (FR-025) ; l'entrepôt relève le plafond des **trois** ressources ; le plafond augmente exactement du montant annoncé avant la pose (US7-1). Observer l'échec.
- [ ] T144 [P] [US7] Écrire le test de saturation longue dans `packages/domain/tests/kernel/saturation.test.ts` : saturer pendant trois semaines puis projeter — la ressource vaut **exactement** son plafond, la durée de saturation et la quantité perdue sont exactes (US1-5, US7-3, SC-003). Observer l'échec.
- [ ] T145 [US7] Étendre `packages/catalogs/src/buildings.ts` avec la courbe de capacité de l'`entrepot`.
- [ ] T146 [US7] Câbler le calcul de plafond des entrepôts dans `packages/domain/src/kernel/resources.ts` et l'exposer en `cap` dans `ProjectedState`.
- [ ] T147 [US7] Étendre `packages/domain/src/modules/construction/preview.ts` : l'effet d'un entrepôt sur les trois plafonds et sur le temps avant saturation, annoncé avant la pose.
- [ ] T148 [US7] Étendre `apps/game/src/features/resources/ResourcePanel.tsx` : par ressource, capacité, remplissage, temps restant avant saturation au rythme courant et **quantité perdue cumulée**, consultable (FR-027, US7-3).

**Point de contrôle** : la saturation est repoussable par le jeu, et par le jeu seul (FR-028).

---

## Phase 10 : US8 — Consulter les règles de calcul (P8)

**Objectif** : la référence consolidée, **générée depuis les catalogues** et non
rédigée, suffisante pour reproduire à la main n'importe quel chiffre affiché.

**Test indépendant** : prendre un échantillon de chiffres affichés en jeu et les
recalculer à la main depuis la seule page de règles. Écart attendu : **aucun**.

- [ ] T149 [US8] Écrire le parcours Playwright dans `apps/game/tests/e2e/us8-rules.spec.ts` : relever un échantillon de tous les chiffres affichés sur la planète — coûts, durées, productions, capacités, temps avant saturation — et vérifier qu'ils se recalculent depuis la seule page de règles (SC-002) ; atteindre l'écran de règles **au clavier seul** ; passer `axe-core` sans écart. Observer l'échec.
- [ ] T150 [P] [US8] Écrire le test de décomposition de production dans `packages/domain/tests/kernel/breakdown.test.ts` : toute production affichée se décompose en ses **quatre facteurs** — valeur de base du type, facteur de niveau, gisements recouverts, rapport d'énergie — dont le produit redonne exactement la valeur affichée (FR-053, US8-1). Observer l'échec.
- [ ] T151 [P] [US8] Écrire le test de génération de la page de règles dans `apps/game/tests/rules-generation.test.ts` : tout contenu chiffré de l'écran provient de `packages/catalogs` ; **aucune valeur n'est rédigée à la main** ; un rééquilibrage du catalogue met la page à jour sans intervention (R15). Observer l'échec.
- [ ] T152 [P] [US8] Écrire le test de divergence de catalogue dans `apps/game/tests/lib/catalog-version.test.ts` : une `catalogVersion` de réponse différente de celle du paquet embarqué **propose le rechargement** et n'affiche aucun chiffre calculé localement en attendant (R15). Observer l'échec.
- [ ] T153 [US8] Implémenter `packages/domain/src/kernel/breakdown.ts` : la décomposition d'une production en ses quatre facteurs.
- [ ] T154 [US8] Implémenter `apps/game/src/features/rules/RulesContent.tsx` : courbes nommées et leurs paramètres, valeurs par type et par niveau, formules de production, de plafond et de rapport d'énergie, **toutes générées** depuis `packages/catalogs`.
- [ ] T155 [US8] Implémenter `apps/game/src/routes/rules.tsx` : l'écran de règles, accessible depuis l'écran de planète au clavier.
- [ ] T156 [US8] Implémenter la détection de divergence de catalogue dans `apps/game/src/lib/catalogVersion.ts` : comparer le `catalogVersion` de la réponse à celui du paquet embarqué et **proposer le rechargement** plutôt que d'afficher des chiffres faux en silence (R15).

**Point de contrôle** : les huit tranches sont livrées et indépendamment fonctionnelles.

---

## Phase 11 : Finition et préoccupations transverses

- [ ] T157 [P] Geler l'**instantané d'équilibrage** des coûts, durées, productions et capacités pour les niveaux 1 à 30 dans `packages/catalogs/tests/snapshots/balance.snap`. Un diff se **lit et s'approuve**, il ne se contourne pas : le jeu ne sera jamais rééquilibré par accident.
- [ ] T158 [P] Implémenter l'export OpenAPI par `@ts-rest/open-api` dans `packages/contracts/src/openapi.ts` et le publier en artefact de CI — la transparence promise à P4.
- [ ] T159 [P] Vérifier les objectifs de performance de `plan.md` sur la **machine de référence nommée dans `quickstart.md` § 6**, sous une charge décrite : projection d'une planète **sous la milliseconde**, `GET` de l'état **sous 200 ms au 95ᵉ centile** sur 1 000 requêtes, joueur inactif à **zéro écriture et zéro calcul**. Consigner la machine, la charge et le relevé dans `specs/001-la-planete-mere/quickstart.md`.
- [ ] T160 [P] Vérifier SC-009 dans `apps/game/tests/e2e/mobile.spec.ts` : sur une fenêtre d'affichage de **360 × 640 px**, les 36 cases de la grille sont visibles **sans défilement ni zoom**, le corps de texte fait **au moins 16 px** et toute cible interactive **au moins 44 × 44 px**.
- [ ] T161 [P] Vérifier que le seuil de couverture de `packages/domain` défini en T010 est effectivement atteint et que la porte de T012 échoue quand il ne l'est pas — mesuré sur le domaine **uniquement** : un chiffre mêlant interface et domaine ne veut rien dire.
- [ ] T162 Vérifier que les **six divergences** de `spec.md` § « Divergences avec le document de conception » sont bien reportées dans `docs/design/conception-du-jeu.md`, et que son journal des modifications les couvre toutes : empreintes L et T à quatre cases et abandon du trois-en-ligne, variantes d'empreinte, plafond de stockage et saturation, énergie, dix obstacles sur trente-six, rôle de chaque ressource.
- [ ] T163 Exécuter `specs/001-la-planete-mere/quickstart.md` de bout en bout sur une machine propre, dont les **trois tests qu'aucun raisonnement ne remplace** — concurrence, idempotence, autorisation dans la transaction — et consigner tout écart constaté.

---

## Dépendances et ordre d'exécution

### Dépendances de phase

- **Setup (phase 1)** : aucune dépendance. **T001 à T003 passent avant tout le reste** — R17 se tranche par exécution, avant la première ligne de code applicatif. **T014 passe avant T091** : le nom du racloir est une donnée de catalogue.
- **Fondations (phase 2)** : dépendent du Setup. **Bloquent toutes les tranches.**
- **Tranches (phases 3 à 10)** : dépendent des Fondations, puis se suivent dans l'ordre de priorité.
- **Finition (phase 11)** : dépend des tranches livrées.

### Dépendances entre tranches

Les tranches ne sont pas toutes mutuellement indépendantes : la spécification les
a ordonnées par nécessité, et cet ordre porte des dépendances réelles.

- **US1 (P1)** : après les Fondations. Aucune dépendance sur une autre tranche.
- **US2 (P2)** : après US1 — le catalogue de bâtiments et les taux d'extracteur s'appuient sur la projection et sur la disposition livrées par US1.
- **US3 (P3)** : après US2 — il faut des bâtiments pour consommer de l'énergie, et un entrepôt pour éprouver la capacité non dégradée de FR-023b.
- **US4 (P4)** : après US2 — on n'améliore que ce qui est posé.
- **US5 (P5)** : après US1 pour la disposition et les types d'obstacle ; **indépendante de US2, US3 et US4**.
- **US6 (P6)** : après US2 — on ne démolit que ce qui est posé.
- **US7 (P7)** : après US2 pour l'entrepôt en tant que bâtiment ; les plafonds eux-mêmes existent depuis US1.
- **US8 (P8)** : après les tranches dont elle publie les règles. Livrée en dernier, elle couvre tout le catalogue.

### À l'intérieur de chaque tranche

- **Le test est écrit et son échec observé avant l'implémentation.** Sans exception : principe III.
- **Le parcours Playwright ouvre la tranche**, il ne la referme pas. C'est lui qui décrit le comportement attendu de bout en bout ; les tests de domaine le raffinent.
- Catalogues avant domaine ; noyau avant modules ; domaine avant contrats ; contrats avant API ; API avant client.
- Les invariants fast-check accompagnent le noyau, ils ne le suivent pas.

### Ordre non intuitif de la persistance

En phase 2, le bloc Persistance ne suit pas l'ordre de lecture. Le pilote (T028)
et le harnais (T029) précèdent le **test des contraintes** (T030), qui précède
lui-même le schéma (T031) et sa migration (T032). Le test échoue d'abord parce
que les relations n'existent pas : c'est l'échec attendu, et il devient vert
en T032.

### Occasions de parallélisme

- T001 et T002 en parallèle ; T003 les suit.
- T007, T010, T011, T013 en parallèle une fois les squelettes créés.
- Tous les tests d'une même tranche marqués `[P]` s'écrivent en parallèle : ce sont des fichiers distincts. Le parcours Playwright de tête ne l'est pas — il fixe le vocabulaire d'interface que les autres reprennent.
- En phase 2, les trois blocs — catalogues, persistance, socle HTTP — avancent en parallèle une fois le noyau de grandeurs posé. Le socle client suit le socle HTTP.
- Les tâches de client d'une tranche sont parallélisables entre elles quand elles portent sur des fichiers distincts : par exemple T103, T104 et T106.

---

## Exemple de parallélisation : US2

```bash
# 1. Le parcours de bout en bout, seul et en premier — il fixe le vocabulaire :
Task: "Parcours US2 dans apps/game/tests/e2e/us2-build.spec.ts"

# 2. Puis tous les autres tests en parallèle — observer neuf échecs :
Task: "Cohérence des types de bâtiment dans packages/catalogs/tests/buildings.test.ts"
Task: "FR-005 dans packages/catalogs/tests/layout-placements.test.ts"
Task: "Motifs de refus de placement dans packages/domain/tests/kernel/grid.test.ts"
Task: "I-5 et I-6 dans packages/domain/tests/kernel/grid-invariants.test.ts"
Task: "I-12 et I-13 dans packages/domain/tests/kernel/rates-invariants.test.ts"
Task: "Module de construction dans packages/domain/tests/modules/construction/build.test.ts"
Task: "Tests d'absence dans packages/contracts/tests/v1/works-absence.test.ts"
Task: "Tests de bornes dans packages/contracts/tests/v1/works-bounds.test.ts"
Task: "Curseur de grille dans apps/game/tests/features/grid/cursor.test.ts"
Task: "Annonces dans apps/game/tests/features/grid/live-region.test.ts"

# 3. Puis les composants clients, sur fichiers distincts :
Task: "FootprintGhost dans apps/game/src/features/grid/FootprintGhost.tsx"
Task: "GridLiveRegion dans apps/game/src/features/grid/GridLiveRegion.tsx"
Task: "CurrentWork dans apps/game/src/features/work/CurrentWork.tsx"
```

---

## Stratégie de livraison

### MVP d'abord — US1 seule

1. Phase 1 : Setup, R17 en tête.
2. Phase 2 : Fondations — **critique**, bloque tout. Authentification comprise : sans elle, aucun parcours n'est démontrable.
3. Phase 3 : US1.
4. **S'ARRÊTER ET VALIDER** : la section US1 de `quickstart.md` § 4, écart nul sur trois semaines.
5. Le joueur s'inscrit et possède une planète vivante. C'est démontrable.

### Livraison incrémentale

Chaque tranche s'ajoute sans casser les précédentes, et chacune se valide par sa
section de `quickstart.md` § 4 :

Setup + Fondations → US1 (MVP) → US2 → US3 → US4 → US5 → US6 → US7 → US8 → Finition.

US5 peut être avancée juste après US1 si l'on veut valider tôt le déblaiement :
c'est la seule tranche qui ne dépend pas de US2.

### Travail à plusieurs

Une fois les Fondations achevées, US2 et US5 peuvent avancer en parallèle. US3,
US4, US6 et US7 dépendent toutes de US2 et se partagent ensuite sans conflit :
elles touchent des modules et des composants distincts.

---

## Notes

- `[P]` = fichiers distincts, aucune dépendance sur une tâche inachevée.
- `[Story]` rattache la tâche à sa tranche, pour la traçabilité exigée par le principe I : **tout code livré doit être rattachable à une tâche**.
- Vérifier que le test échoue **avant** d'implémenter. Un test vert du premier coup ne prouve rien.
- Committer après chaque tâche ou groupe logique, en français.
- Un écart entre le code et la spécification se résout en corrigeant explicitement **l'un ou l'autre**, jamais en le laissant courir.
- Les treize invariants de [data-model.md § 1.7](./data-model.md) et les dix-huit contrôles de cohérence de § 1.8 sont la **valeur** de cette tranche, pas son ornement.
