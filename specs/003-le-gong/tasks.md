# Tasks: Le Gong — l'unité de temps déclarée du jeu

**Input**: documents de conception de `specs/003-le-gong/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/v1-gong.md](./contracts/v1-gong.md), [quickstart.md](./quickstart.md)

**Tests**: obligatoires. Le principe III de la constitution est non négociable —
test écrit, **observé en échec**, puis implémentation. Chaque phase de récit
place ses tests avant son implémentation, et l'ordre des tâches est l'ordre
d'exécution.

**Organization**: les tâches sont groupées par récit utilisateur pour que chacun
soit implémentable et éprouvable seul.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable — fichiers distincts, aucune dépendance sur une tâche
  inachevée
- **[Story]** : le récit auquel la tâche appartient (US1 à US5)
- Le chemin exact du fichier figure dans chaque description

## Path Conventions

Monorepo pnpm + Turborepo : `packages/{catalogs,domain,contracts,db}/`,
`apps/{api,game}/`. Les paquets se résolvent par `dist/` — `pnpm -w build`
d'abord, toujours.

---

## Trois décisions prises ici, à ne pas redécouvrir

Les documents de conception laissaient trois points au découpage. Ils sont
tranchés, la spécification a été amendée là où ils la débordaient, et les tâches
en découlent.

**1. Le catalogue résolu porte sa propre longueur de gong.** `Catalogs` gagne un
champ `gong`. C'est la forme mécanique de [G10](./research.md#g10--buildapi-dérive-ce-quil-annonce-de-ce-quil-applique) :
un serveur qui annoncerait autre chose qu'il n'applique devient un état
**impossible à écrire**, plutôt qu'un état qu'un test surveille.

**2. Le renommage porte sur ce que le catalogue déclare, jamais sur ce que le
domaine consomme.** C'est la décision la plus lourde de conséquences, et elle
tient en une ligne : les formes **déclarées** sont neuves — `DeclaredBuilding`
avec `demolitionGongs`, `DeclaredObstacle` avec `durationGongs` — tandis que les
formes **résolues** gardent `demolitionSeconds` et `durationSeconds`.

Trois conséquences, toutes voulues :

- `packages/domain/src/modules/construction/demolish.ts` et `clear.ts` lisent ces
  champs **sur un catalogue résolu** et ne changent donc **pas d'une ligne**.
  Sans cette décision, le renommage cassait deux fichiers source qu'aucune tâche
  ne nommait ;
- les deux faisceaux deviennent **structurellement inassignables** l'un à
  l'autre par un nom obligatoire, et pas seulement par le champ `gong`. C'est ce
  que T020 vérifie ;
- un champ nommé `demolitionGongs` qui contiendrait des secondes se verrait à la
  lecture. Un nom qui dit son unité ne peut pas mentir.

**3. La page de règles ouverte hors session ne connaît pas la longueur du
serveur.** `/rules` est lisible sans compte et n'appelle aucune route ; le
`GET /v1/config` qui la renseignerait est écarté par
[G7](./research.md#g7--la-longueur-du-gong-voyage-dans-linstantané-de-planète).
Elle publie donc les **gongs déclarés**, qui ne sont pas des chiffres dérivés,
et **dit** que la longueur du serveur ne lui est pas connue — sans afficher
aucune seconde. Dès qu'un instantané a été reçu, elle publie les deux colonnes.

Ce comportement débordait FR-016 et FR-017, qui étaient inconditionnels, et
US1-1, qui disait « un serveur **quelconque** ». **La spécification a été
amendée** plutôt que contredite en silence : FR-013, FR-016 et FR-017 nomment
désormais l'état « avant tout instantané », et US1 gagne un quatrième scénario
d'acceptation. C'est T061.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: la variable de configuration et sa place dans la chaîne de portes.
Aucune dépendance à installer ([G15](./research.md#g15--aucune-dépendance-nouvelle)).

- [X] T001 Ouvrir dans `.env.example` une **troisième section**, « `apps/api` — configuration non secrète », entre les deux sections existantes, et y déclarer `GONG_SECONDS` : son sens, sa forme (entier ou fraction entière `1/2`), la valeur canonique `10`, le fait qu'elle soit **exigée** — un oubli refuse le démarrage comme pour `DATABASE_URL` — et le fait qu'elle soit **publique**, puisque la page de règles l'énonce (FR-016).

  **Ni l'une ni l'autre des deux sections existantes ne convient**, et c'est ce qui justifie la troisième. La section `apps/api` s'ouvre sur « tout ce qui suit est secret », ce que le gong n'est pas. La section `apps/game` s'ouvre sur « tout ce qui suit est public » mais désigne le **client** : toutes ses variables portent le préfixe `VITE_` et sont embarquées dans le bundle. Y ranger `GONG_SECONDS` ferait de la longueur du gong une configuration locale du client — exactement ce que FR-012 et SC-005 interdisent. Amender l'en-tête du fichier, dont la règle actuelle (« un secret vit dans `apps/api` et nulle part ailleurs ») ne prévoit pas la configuration de serveur non secrète
- [X] T002 [P] Ajouter `GONG_SECONDS=10` à l'étape « Variables d'environnement des deux serveurs » de `.github/workflows/ci.yml`, sans quoi la porte de parcours ne démarrera plus
- [X] T003 [P] Ajouter `GONG_SECONDS` au § 1 (pile locale) de `specs/001-la-planete-mere/quickstart.md`, avec la table de valeurs du § 1 de `specs/003-le-gong/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: l'unité, les deux types de catalogue, et la fonction pure qui fait
le pont. Rien de ce qui suit n'est faisable sans cette phase.

**⚠️ CRITICAL**: aucun récit ne peut commencer avant la fin de cette phase.

**⚠️ T004 EN PREMIER, ET AVANT TOUTE MODIFICATION DE `packages/catalogs`.** La
preuve de FR-010 se compare à des valeurs qui n'existeront plus une fois le
catalogue basculé. Les figer après la bascule prouverait que le catalogue est
égal à lui-même.

- [X] T004 Figer les **240 valeurs d'avant la tranche** dans `packages/domain/tests/fixtures/avant-le-gong.json` — **140** durées de construction (quatre types sur trente niveaux, plus l'entrepôt sur vingt), **5** durées de démolition, **5** durées de déblaiement, **90** taux (trois extracteurs sur trente niveaux) — engendrées depuis le catalogue **actuel** par un script jetable, puis committées.

  Le compte est décomposé parce qu'il l'a été de travers : les documents de conception annonçaient 230, qui est le total sans la démolition ni le déblaiement. FR-010 dit « chaque durée », et exclure ces dix valeurs les laisserait hors de la seule preuve que rien n'a bougé. **La fixture doit compter 240 entrées, et le script doit le vérifier avant d'écrire**

### L'unité

- [X] T005 [P] Test — `packages/catalogs/tests/gong.test.ts` : `GONG_CANONICAL` vaut `{ num: 10, den: 1 }`, et le plus grand commun diviseur des quinze durées déclarées vaut exactement un gong ([G2](./research.md#g2--le-gong-canonique-dure-dix-secondes)). Observer l'échec : le module n'existe pas
- [X] T006 Créer `packages/catalogs/src/gong.ts` : le type `GongLength { num, den }` — fraction entière, jamais un flottant ([G3](./research.md#g3--la-longueur-du-gong-est-une-fraction-entière-de-secondes)) — et `GONG_CANONICAL`, puis l'exporter depuis `packages/catalogs/src/index.ts`

### Le catalogue change d'unité de déclaration

- [X] T007 Test — `packages/catalogs/tests/buildings.test.ts` : toutes les bases de `buildDuration` et toutes les valeurs de `demolitionGongs` sont des **entiers de gongs** ; toutes les bases de `production` sont des **entiers de grains par gong**. Ce fichier **change d'unité dans ses assertions** — `300` devient `30` — et c'est normal : `packages/catalogs` n'importe rien (règle `catalogs-n-importe-rien`), donc il ne peut pas résoudre et n'éprouve que le catalogue **déclaré**. C'est l'un des deux seuls endroits où une assertion est réécrite plutôt que redirigée
- [X] T008 Basculer `packages/catalogs/src/buildings.ts` : `Building` **se dédouble** — `DeclaredBuilding` porte `demolitionGongs` et les bases en gongs ; `Building` garde `demolitionSeconds` et devient la forme *résolue*, que seul `resolveCatalogs` sait produire. Les deux types vivent dans `packages/catalogs` — c'est le paquet du vocabulaire de données, et il ne résout rien pour autant —, mais **seules les données déclarées y sont exportées** : il n'existe aucun `BUILDINGS` résolu. Puis : `buildDuration` en gongs (mine 12, puits 15, racloir 20, centrale 9, entrepôt 10), `demolitionSeconds` devient `demolitionGongs` (30, 42, 60, 24, 18), `production` en grains par gong (mine 150, puits 80, racloir 40). Réécrire les commentaires d'unité : ni « secondes » ni « unités par heure » ne doivent plus décrire ces champs
- [X] T009 Basculer `packages/catalogs/src/obstacles.ts`, sur le même dédoublement : `DeclaredObstacle.durationGongs` (30, 90, 180, 270, 360) et `Obstacle.durationSeconds` conservé pour la forme résolue, commentaire d'unité compris
- [X] T010 Régénérer `packages/catalogs/tests/snapshots/balance.snap` — en-têtes de colonne en gongs et en grains par gong — et amender l'en-tête documentaire de `packages/catalogs/tests/snapshots/balance.test.ts` qui énonce les unités. **Lire et approuver le diff** : c'est le geste que ce fichier existe pour rendre obligatoire
- [X] T010a Rattacher `packages/catalogs/tests/balance.test.ts` — **le fichier homonyme, hors de `snapshots/`** — dont l'assertion `BUILDINGS[typeId].demolitionSeconds > 0` porte sur un champ qui n'existe plus. Il avait été oublié parce que T010 nomme son homonyme ; il est le second des deux endroits où l'unité d'une assertion change
- [X] T011 Faire monter `CATALOG_VERSION` dans `packages/catalogs/src/version.ts` — un changement d'unité de déclaration est un changement de catalogue, et R15 doit le voir

### La résolution, en fonction pure

- [X] T012 [P] Test — `packages/domain/tests/kernel/gong.test.ts` : `resolveCatalogs` résout **la base** et jamais la valeur évaluée ([G4](./research.md#g4--la-résolution-porte-sur-la-base-de-la-courbe-jamais-sur-la-valeur-évaluée)) — base de durée `max(1, ⌊gongs × num ÷ den⌋)`, base de taux `grainsParGong × den ÷ num` —, et le `num`, le `den` et le `kind` de chaque courbe sont **intacts**
- [X] T013 [P] Test — `packages/domain/tests/kernel/gong-refus.test.ts` : une longueur dont un taux ne se résout pas en entier fait lever une `RangeError` **nommant la ressource et le type fautifs** (FR-006) ; un message générique fait échouer le test
- [X] T014 Créer `packages/domain/src/kernel/gong.ts` : le type `DeclaredCatalogs`, la fonction pure `resolveCatalogs(declared, gong): Catalogs`, et la validation d'intégralité des taux. Elle produit les formes **résolues** — `Building` avec `demolitionSeconds`, `Obstacle` avec `durationSeconds` — depuis les formes déclarées, et recopie `gong` dans le faisceau. N'importe que `@zaliba/catalogs` : la règle `domain-n-importe-que-catalogs` la couvre **sans règle nouvelle**
- [X] T015 `packages/domain/src/kernel/catalogs.ts` : `Catalogs` gagne `readonly gong: GongLength` (décision 1 ci-dessus, [G10](./research.md#g10--buildapi-dérive-ce-quil-annonce-de-ce-quil-applique)) et ses `buildings` / `obstacles` sont les formes **résolues** — donc ce fichier ne change presque pas ; `DEFAULT_CATALOGS` devient `DECLARED_CATALOGS: DeclaredCatalogs` ([G16](./research.md#g16--le-catalogue-déclaré-et-le-catalogue-résolu-sont-deux-types-distincts))
- [X] T016 Exporter `./kernel/gong.js` depuis `packages/domain/src/index.ts`
- [X] T016a **Constat, et non modification** — `packages/domain/src/modules/construction/demolish.ts:139` et `clear.ts:133` lisent `.demolitionSeconds` et `.durationSeconds` sur un `Catalogs`. Vérifier qu'ils **compilent sans être touchés**. S'ils ne compilent pas, la décision 2 en tête de ce document n'a pas été tenue : les formes résolues ont été renommées avec les déclarées, et c'est T008/T009/T014 qu'il faut reprendre — surtout pas ces deux fichiers, qui n'ont aucune raison de connaître le gong

### Le dépôt suit

- [X] T017 Créer `packages/domain/tests/catalogs.ts` — un `CATALOGS = resolveCatalogs(DECLARED_CATALOGS, GONG_CANONICAL)` partagé — puis y rattacher les **26 fichiers** de `packages/domain/tests/` qui appellent `DEFAULT_CATALOGS`. Aucune assertion d'équilibrage n'est réécrite : seul l'appel change, et c'est la conséquence heureuse de G16
- [X] T017a **La moitié oubliée de T017, et elle n'est pas facultative.** Onze fichiers de test ne se contentent pas de *passer* le catalogue : ils **calculent leur attendu** depuis le catalogue déclaré, en important `BUILDINGS` ou `OBSTACLES` directement. Après T008/T009 ils compareraient douze gongs à cent vingt secondes. Remplacer la **source** — `BUILDINGS[x]` → `CATALOGS.buildings[x]`, `OBSTACLES[x]` → `CATALOGS.obstacles[x]` — sans toucher à l'attendu :

  | Fichier | Ce qu'il lit |
  | --- | --- |
  | `tests/modules/construction/upgrade.test.ts` | `evaluateCurve(BUILDINGS.mine.buildDuration, n)` ×5 |
  | `tests/modules/construction/upgrade-invariants.test.ts` | `buildDuration` |
  | `tests/modules/construction/build.test.ts` | `buildDuration` ×3, `production` |
  | `tests/modules/construction/demolish.test.ts` | `demolitionSeconds` ×6 |
  | `tests/modules/construction/demolish-clipping.test.ts` | `demolitionSeconds` ×3 |
  | `tests/modules/construction/clear.test.ts` | `durationSeconds` ×4 |
  | `tests/modules/construction/clear-invariants.test.ts` | `durationSeconds` ×2 |
  | `tests/kernel/breakdown.test.ts` | `production` |
  | `tests/kernel/energy.test.ts` | `production` |
  | `tests/kernel/rates-invariants.test.ts` | `production` |
  | `apps/game/tests/rules-generation.test.tsx` | `buildDuration`, `durationSeconds` |

  Le compte est vérifiable et doit l'être : après T017a, `grep -rn "BUILDINGS\[\|BUILDINGS\.\|OBSTACLES\[\|OBSTACLES\." packages/domain/tests apps/game/tests` ne doit plus rendre **aucune** lecture d'un champ à dimension de temps. Les lectures de coût, d'empreinte, d'énergie ou de capacité peuvent rester : ces grandeurs-là ne sont pas résolues (FR-004)
- [X] T018 [P] Rattacher `packages/domain/scripts/bench-projection.ts` au catalogue résolu
- [X] T019 Rattacher les **16 fichiers** de `apps/game/tests/` et le fichier de `apps/api/tests/` qui référencent `DEFAULT_CATALOGS` (panneaux de travaux, extrapolation, régie, grille, vocabulaire de refus, harnais d'intégration). `rules-generation.test.tsx` relève **aussi** de T017a : il calcule son attendu
- [X] T020 Porte — `pnpm -w build && pnpm -w typecheck && pnpm -w boundaries` : vérifier qu'un `DeclaredCatalogs` passé à `previewBuild` **ne compile pas**. Deux choses le garantissent depuis la décision 2 — le champ `gong` que seul le résolu porte, et les champs à dimension de temps qui changent de nom —, et il en fallait au moins une : TypeScript est structurel, deux formes identiques auraient été mutuellement assignables. Si le compilateur l'accepte, T008, T009 et T015 sont à reprendre. Vérifier aussi le sens inverse — un `Catalogs` là où un `DeclaredCatalogs` est attendu doit être refusé, sans quoi `resolveCatalogs` pourrait être appliquée deux fois

**Checkpoint**: l'unité existe, le catalogue la déclare, le domaine la résout. Les
récits peuvent commencer.

---

## Phase 3: User Story 4 — Rien ne change pour le joueur d'aujourd'hui (Priority: P1) 🎯 MVP

**Goal**: prouver que le changement d'unité n'a déplacé **aucun** chiffre au gong
canonique.

**Pourquoi ce récit d'abord alors que quatre sont en P1** : le § 2 du
[quickstart](./quickstart.md#us4-dabord--rien-na-bougé) le dit — si l'équilibrage
a bougé, le reste ne vaut rien. C'est le socle de confiance des trois autres.

**Independent Test**: `pnpm -w test --project domain` compare les 240 valeurs
résolues au gong canonique à la fixture de T004. Un écart d'une seconde sur un
seul niveau fait échouer la tranche.

- [X] T021 [US4] Test — `packages/domain/tests/kernel/gong-egalite.test.ts` : les **240** valeurs résolues au gong canonique sont **strictement égales** à `packages/domain/tests/fixtures/avant-le-gong.json` (FR-010, SC-001). Le test **échoue s'il a comparé moins de 240 valeurs** — pas seulement zéro : une fixture amputée de ses dix durées de démolition et de déblaiement passerait en vert sans les avoir vues, et c'est exactement l'erreur que le compte de « 230 » a failli inscrire
- [X] T022 [US4] Faire passer T021. Un écart se corrige dans `packages/domain/src/kernel/gong.ts`, **jamais** dans `packages/catalogs/` : la tranche ne rééquilibre rien
- [X] T023 [P] [US4] Test de propriété — `packages/domain/tests/kernel/gong-invariants.test.ts` (fast-check) : à **toute** longueur de gong, coûts, capacités, consommation et production d'énergie, empreintes, variantes, plafonds de niveau, fraction de remboursement, gisements et dispositions sont identiques entre le catalogue déclaré et le catalogue résolu (FR-004, [G13](./research.md#g13--lénergie-les-coûts-et-les-capacités-ne-sont-pas-touchés))
- [X] T024 [P] [US4] Test — `packages/domain/tests/kernel/gong.test.ts` : une durée résolue vaut **au moins une seconde** (FR-008), sur la base comme sur toute valeur de courbe ; un chantier instantané n'est pas un chantier
- [ ] T025 [US4] Porte — `GONG_SECONDS=10 pnpm -w e2e` : les dix parcours de `apps/game/tests/e2e/` passent **sans modification** (SC-008)
- [X] T026 [US4] Porte — `pnpm -w test:coverage` : le seuil de couverture du domaine ne baisse pas ; `packages/domain/src/kernel/gong.ts` est couvert

**Checkpoint**: l'égalité stricte est acquise et tenue par un test. Tout ce qui
suit s'y appuie.

---

## Phase 4: User Story 2 — Un serveur peut battre plus vite, et tout suit (Priority: P1)

**Goal**: la longueur du gong devient un paramètre du serveur, validé au
démarrage, et elle accélère **tout** ce qui a une dimension de temps dans le même
rapport.

**Independent Test**: le même scénario sur deux serveurs de gongs différents —
les délais mesurés sont dans le rapport des longueurs, chantiers **et**
accumulation.

### Tests pour US2 ⚠️ à écrire et à voir échouer d'abord

- [X] T027 [P] [US2] Test — `apps/api/tests/gong-config.test.ts` : `parseGongSeconds` accepte `"10"`, `"1/2"`, `"1/6"` ; refuse l'absence, `""`, `"0"`, `"-3"`, `"abc"`, `"1.5"`, `"1/0"` — **en nommant la variable et la valeur** (FR-007)
- [X] T028 [P] [US2] Test — `apps/api/tests/gong-demarrage.test.ts` : `buildApi` refuse une longueur dont un taux ne se résout pas en entier, en nommant la ressource et le type (FR-006, SC-007)
- [X] T029 [P] [US2] Test d'intégration — `apps/api/tests/integration/gong.test.ts` : à `{ 1, 6 }`, un chantier de mine de niveau 1 s'achève à `startedAt + 2 s` ; à `{ 10, 1 }`, à `startedAt + 120 s`
- [X] T030 [P] [US2] Test — `packages/domain/tests/kernel/gong-accumulation.test.ts` : le temps nécessaire pour réunir le coût d'une même amélioration est dans le **même rapport** que les durées de chantier (SC-002). C'est le point qui a motivé le Gong : une accélération qui ne porterait que sur les chantiers laisserait le joueur affamé
- [X] T031 [US2] Test — dans `packages/domain/tests/kernel/gong-accumulation.test.ts` : coûts, capacités et rapport d'énergie **inchangés** entre `{ 10, 1 }` et `{ 1, 6 }` sur un même état de jeu
- [X] T031a [US2] Test — dans `packages/domain/tests/kernel/gong-accumulation.test.ts` : **le rapport d'accélération, et sa limite** (SC-002, reformulé). Deux assertions distinctes, parce que deux propriétés distinctes :

  1. les **taux** et les **bases de durée qui se résolvent sans reste** suivent le rapport **exactement** — la mine, 12 gongs, tombe sur 2 s à `{ 1, 6 }` : ×60 pile ;
  2. une base qui **ne** se résout pas sans reste tronque une fois, et la courbe reporte l'écart. La centrale (9 gongs) tombe sur `max(1, ⌊9 ÷ 6⌋) = 1 s` au lieu de 1,5 : ×90. Au niveau 30, la courbe `7/5` porte l'écart à environ **8 650 secondes**. Le test vérifie que l'écart reste **borné par `troncature × courbe(niveau)`**, ce qui est calculable, et non par « une seconde », qui est faux.

  Cette tâche existe parce que SC-002 promettait « à la seconde près » un rapport que l'arithmétique entière de G4 ne peut pas tenir. La spécification a été corrigée ; ce test est ce qui empêchera de réécrire la promesse dans l'autre sens. Au gong canonique, aucune troncature n'a lieu et la seconde assertion est vide de contenu — le test doit donc s'exécuter **hors** du canonique
- [X] T032 [US2] Test — `apps/api/tests/integration/gong.test.ts` : un chantier déjà planifié garde son `dueAt` quand le serveur redémarre à une autre longueur ([G14](./research.md#g14--un-chantier-en-cours-nest-jamais-recalculé))

### Implémentation pour US2

- [X] T033 [US2] Créer `apps/api/src/config/gong.ts` : `parseGongSeconds(raw: string | undefined): GongLength`, fonction pure. Elle vit **hors de `main.ts`**, parce que ce qui doit être éprouvé n'a rien à faire dans un point d'entrée que nul test ne monte
- [X] T034 [US2] `apps/api/src/main.ts` : lire `GONG_SECONDS` par `required()`, la convertir par T033, la passer à `buildApi`
- [X] T035 [US2] `apps/api/src/app.ts` : `ApiDependencies` gagne `gong: GongLength` — **obligatoire, sans valeur par défaut**. Le repli `gong ?? GONG_CANONICAL` d'abord envisagé est écarté : il place un défaut silencieux au cœur exact du composant dont FR-007 exige qu'il refuse, et le refus ne vivrait alors que dans `main.ts`, qu'aucun test ne monte. Le confort qu'il apportait aux harnais est rendu par T038, où un défaut de **test** est à sa place. Le catalogue est résolu **une fois** par `resolveCatalogs(DECLARED_CATALOGS, gong)` ; l'import de `CATALOG_VERSION` et le champ `catalogVersion` **disparaissent** au profit de `catalogs.version` ([G10](./research.md#g10--buildapi-dérive-ce-quil-annonce-de-ce-quil-applique))
- [X] T036 [US2] `apps/api/src/routes/v1/planet.ts` et `apps/api/src/routes/v1/works.ts` : `deps.catalogVersion` disparaît ; les deux routes lisent `deps.catalogs`
- [X] T037 [US2] `apps/api/src/mapping/snapshot.ts` : `toContract(snapshot, serverInstant, catalogs)` — version **et** longueur de gong dérivées du catalogue résolu, jamais de deux arguments qui pourraient se contredire
- [X] T038 [US2] `apps/api/tests/integration/harness.ts` et `apps/api/tests/integration/server-harness.ts` : injecter une longueur de gong, canonique par défaut
- [X] T039 [US2] Journaliser la longueur retenue au démarrage dans `apps/api/src/main.ts`, sans donnée personnelle — un serveur qui bat au mauvais rythme est indétectable de l'intérieur, et le journal est la seule trace externe

**Checkpoint**: un serveur bat au rythme qu'on lui donne, ou refuse de démarrer.

---

## Phase 5: User Story 3 — Le client apprend le gong du serveur (Priority: P1)

**Goal**: la longueur voyage dans l'instantané, le client la reçoit, et aucune
configuration locale ne la porte.

**Independent Test**: changer `GONG_SECONDS` et redémarrer le **serveur seul** ;
les aperçus du client suivent dès la réponse suivante, sans rechargement ni
recompilation.

### Tests de contrat pour US3 ⚠️ les cinq propriétés de `contracts/v1-gong.md` § 5

- [X] T040 [P] [US3] Test 1 et 3 — `packages/contracts/tests/v1/gong.test.ts` : un instantané portant `gong: { num, den }` est **accepté** ; un instantané **sans** `gong` reste valide
- [X] T041 [US3] Test 2 dans `packages/contracts/tests/v1/gong.test.ts` — `num` ou `den` nul, négatif ou non entier est **rejeté**
- [X] T042 [US3] Test 4 dans `packages/contracts/tests/v1/gong.test.ts` — un corps de commande portant `gong` est **rejeté** pour les quatre natures (`build`, `upgrade`, `clear`, `demolish`) : refusé à la frontière, pas ignoré (FR-014)
- [X] T043 [US3] Test 5 dans `packages/contracts/tests/v1/gong.test.ts` — un instantané portant une clé inconnue **reste rejeté** : l'ajout n'a pas relâché `.strict()`. C'est celui qu'on oublie

### Tests du client pour US3

- [X] T044 [P] [US3] Test — `apps/game/tests/lib/catalogs.test.ts` : une longueur reçue donne un catalogue résolu ; une longueur **absente** ne donne **aucun** chiffre dérivé, au lieu d'un repli sur le canonique ([G9](./research.md#g9--le-champ-est-optionnel-et-son-absence-vaut-divergence))
- [X] T045 [US3] Test — dans `apps/game/tests/lib/catalogs.test.ts` : la résolution est mémoïsée sur `{ num, den }` : un rendu sans changement de longueur ne re-résout pas. Un catalogue résolu à chaque rendu rendrait les aperçus quadratiques en nombre de cases sans qu'aucun test de correction ne s'en aperçoive
- [X] T046 [US3] Test — `apps/game/tests/features/catalog-notice.test.tsx` : une réponse sans `gong` enveloppe l'écran et masque tout chiffre dérivé, comme une divergence de catalogue
- [X] T046a [US3] Test — `apps/game/tests/lib/catalogs.test.ts` : **le changement se propage en une requête** (SC-004). Rejouer deux instantanés successifs portant `{ 10, 1 }` puis `{ 1, 2 }` sur le même montage, sans remontage ni rechargement, et vérifier que les durées dérivées du second emploient la nouvelle longueur. C'était le seul critère de succès dont la preuve n'existait qu'en manipulation manuelle au § 2 du quickstart — or SC-004 est la promesse d'origine de la tranche, celle qui a fait préférer le transport à la configuration
- [X] T047 [P] [US3] Test lexical — `apps/game/tests/design/gong-hors-du-client.test.ts` : aucun fichier de `apps/game/src/` ne nomme `GONG_CANONICAL`, `GONG_SECONDS`, ni une longueur de gong littérale ([G17](./research.md#g17--le-client-ne-doit-pas-pouvoir-atteindre-le-gong-canonique), SC-005). **Le test échoue s'il a parcouru zéro fichier** — c'est le motif que `apps/game/tests/design/valeurs-en-dur.test.ts` emploie déjà.

  **C'est la seule porte de FR-012**, et non une défense en profondeur : la règle de frontières qui devait la doubler n'est pas réalisable (voir T055). Le vérifier en introduisant délibérément un `const GONG = { num: 10, den: 1 }` dans un fichier du client et en constatant que le test **rougit**, avant de le retirer. Une porte dont on n'a jamais vu l'échec n'est pas une porte

### Implémentation pour US3

- [X] T048 [US3] `packages/contracts/src/v1/planet.ts` : ajouter `gong` **optionnel** — `{ num: entier > 0, den: entier > 0 }` — à `PlanetSnapshotV1`, à côté de `serverInstant` et `catalogVersion`, avec le commentaire qui dit pourquoi il voyage là ([G7](./research.md#g7--la-longueur-du-gong-voyage-dans-linstantané-de-planète)). Aucune borne supérieure : cette règle-là ne s'exprime pas dans un schéma
- [X] T049 [US3] Régénérer `packages/contracts/tests/snapshots/v1-planet.contract.json` et `packages/contracts/tests/snapshots/v1-openapi.contract.json` ; lire et approuver le diff
- [X] T050 [P] [US3] Mettre à jour `packages/contracts/tests/fixtures/v1/planet-fresh.json` et `planet-in-progress.json`
- [X] T051 [US3] Créer `apps/game/src/lib/catalogs.ts` : **le seul endroit du client qui résout** ([G11](./research.md#g11--le-client-résout-son-catalogue-en-un-seul-endroit)) — il prend l'instantané, en tire la longueur, mémoïse, et rend soit un catalogue résolu, soit l'absence explicite
- [X] T052 [US3] `apps/game/src/routes/planet.tsx` : les treize usages de `DEFAULT_CATALOGS` passent au catalogue résolu de T051
- [X] T053 [US3] `apps/game/src/features/grid/GridView.tsx` : le catalogue devient une **propriété** ; l'import de `@zaliba/domain` disparaît
- [X] T054 [US3] `apps/game/src/features/catalog/CatalogNotice.tsx` : l'absence de longueur de gong rejoint la divergence de catalogue, avec son **propre message** — les deux états convergent volontairement, ne rien savoir et se savoir en désaccord appellent la même prudence (FR-013)
- [X] T056 [US3] Vérifier FR-015 : `grep -rn "preview" apps/api/src/routes/` — aucun point d'aperçu côté serveur n'a été créé, le client calcule toujours (R8, [G12](./research.md#g12--r8-et-r15-tiennent-et-ne-sont-pas-remplacés))

> **T055 — retirée. Aucune action, et le motif est à garder.** Une règle
> `client-n-atteint-pas-le-gong-canonique` dans `.dependency-cruiser.cjs`, sur le
> modèle de `game-n-importe-pas-db`, était prévue en défense en profondeur. Elle
> est **irréalisable** : `game-n-importe-pas-db` interdit un paquet entier, ce
> qui est impossible ici puisque `apps/game/src` importe légitimement
> `@zaliba/catalogs` dans quatorze fichiers — dont `RulesContent.tsx`, qui en
> tire la valeur `GRAINS_PER_UNIT` ; et les paquets se résolvant par leur tonneau
> `index.ts`, aucune arête d'import ne désigne `gong.ts`, donc une règle visant
> ce module ne s'évaluerait sur rien. Elle aurait été **verte sans rien
> interdire**, ce qui est la panne que le dépôt a déjà nommée.
>
> `.dependency-cruiser.cjs` n'est donc pas touché par cette tranche, et **T047
> est la seule porte de FR-012** — d'où son exigence d'avoir été vue rougir.
> Le numéro est conservé pour que les renvois d'ailleurs ne cassent pas.

**Checkpoint**: le serveur est la source unique de vérité, et le client n'a plus
d'endroit où mentir.

---

## Phase 6: User Story 1 — Le joueur peut refaire chaque chiffre (Priority: P1)

**Goal**: la page de règles publie la longueur du gong et donne chaque grandeur
dans les deux unités, sans qu'aucune multiplication ne tombe à côté.

**Independent Test**: ouvrir `/rules`, vérifier que la longueur y figure, que
chaque durée est en gongs **et** en secondes, et refaire les quinze
multiplications à la main.

### Tests pour US1 ⚠️

- [X] T057 [P] [US1] Test — `apps/game/tests/rules-generation.test.tsx` : la page **énonce la longueur du gong** du serveur (FR-016)
- [X] T058 [US1] Test — dans `apps/game/tests/rules-generation.test.tsx` : chaque durée est donnée en gongs **et** en secondes, et le produit est exact sur les quinze durées (FR-017)
- [X] T059 [US1] Test — dans `apps/game/tests/rules-generation.test.tsx` : chaque production est donnée par gong **et** par heure, et la conversion est exacte pour les trois extracteurs
- [X] T060 [US1] Test — dans `apps/game/tests/rules-generation.test.tsx` : hors gong canonique, la **base résolue est publiée** et permet de refaire le calcul à la main en une seule troncature (FR-009, [G5](./research.md#g5--hors-gong-canonique-une-troncature-et-la-base-résolue-est-publiée))
- [X] T061 [US1] Test — dans `apps/game/tests/rules-generation.test.tsx` : la page ouverte **sans instantané reçu** publie les gongs déclarés, dit que la longueur du serveur ne lui est pas connue, et n'affiche **aucune seconde** (FR-013, FR-016 et FR-017, dans leur rédaction amendée — voir la décision 3 en tête de ce document)

- [X] T061a [P] [US1] Test lexical — `apps/game/tests/design/gong-hors-des-ecrans.test.ts` : **le gong ne sort pas de la page de règles** (FR-018). Aucun aperçu, aucun panneau de travaux, aucun chantier en cours et aucun compte à rebours ne rend le mot « gong » : partout ailleurs que dans `/rules`, une durée s'affiche en **temps réel**. Le test parcourt les rendus de `apps/game/src/features/{work,grid,resources,regie}/` et **échoue s'il a parcouru zéro fichier**.

  FR-018 était la seule exigence de la spécification à n'apparaître dans aucun autre document — ni plan, ni recherche, ni modèle, ni guide. C'est pourtant le risque direct de T062, qui rend `RulesContent` conscient des gongs : l'unité de déclaration est faite pour être publiée à un endroit et à un seul, et rien n'empêche mécaniquement une durée en gongs de fuir dans un aperçu

### Implémentation pour US1

- [X] T062 [US1] `apps/game/src/features/rules/RulesContent.tsx` : l'énoncé de la longueur, les deux colonnes par durée et par production, la base résolue publiée, et l'arrondi **situé** — un joueur qui refait le calcul et tombe à côté conclut qu'il s'est trompé
- [X] T063 [US1] `apps/game/src/routes/rules.tsx` : se rattache au catalogue résolu de `apps/game/src/lib/catalogs.ts` ; l'import de `DEFAULT_CATALOGS` disparaît
- [X] T064 [US1] Amender l'en-tête documentaire de `RulesContent.tsx` : la page ne publie plus « le catalogue qu'elle embarque » seul, mais le catalogue embarqué **résolu par la longueur du serveur**, et cette nuance change ce qu'elle a à confronter
- [X] T065 [US1] `apps/game/tests/e2e/us8-rules.spec.ts` : le parcours constate la présence de la longueur du gong et des deux colonnes
- [X] T066 [P] [US1] Porte d'accessibilité dans `apps/game/tests/e2e/us8-rules.spec.ts` — le contenu ajouté reste conforme WCAG 2.1 AA (`@axe-core/playwright`), et les nouvelles colonnes gardent leurs en-têtes de portée

**Checkpoint**: aucune formule n'est cachée, et P4 peut tout refaire.

---

## Phase 7: User Story 5 — Le gong appartient au serveur, jamais au joueur (Priority: P2)

**Goal**: rendre l'inégalité **irreprésentable**, pas seulement interdite.

**Independent Test**: chercher tout chemin par lequel la longueur pourrait varier
d'un joueur à l'autre sur un même serveur.

- [X] T067 [P] [US5] Test d'intégration — `apps/api/tests/integration/gong.test.ts` : deux comptes distincts du même serveur reçoivent la **même** longueur (SC-006)
- [X] T068 [P] [US5] Test — `apps/api/tests/integration/command.test.ts` : un corps de commande portant `gong` est refusé à la frontière, pour les quatre natures. Doublon volontaire de T042 : le contrat le dit, l'API le prouve
- [X] T069 [US5] Test — dans `apps/api/tests/integration/gong.test.ts` : la longueur est lue **une fois** au démarrage et ne change pas en cours de vie du processus : deux requêtes successives annoncent la même valeur, quelle que soit la mutation de `process.env` entre les deux
- [X] T070 [US5] Inspection — `packages/contracts/src/v1/planet.ts` et `apps/api/src/routes/v1/` : aucune commande, aucun en-tête, aucun paramètre de requête ne porte de longueur de gong ni rien qui la modifie (FR-014, FR-020). Consigner le constat dans `specs/003-le-gong/quickstart.md` § 2 (US5)

**Checkpoint**: un univers rapide reste possible, un joueur rapide reste
impossible.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: la mémoire du projet, mise à jour au même moment que le code.

- [X] T071 [P] `docs/design/conception-du-jeu.md` § 2 : le **Gong** entre au vocabulaire — l'unité, sa longueur, et le fait qu'elle appartienne au serveur (FR-021)
- [X] T072 [P] `docs/design/conception-du-jeu.md` § 10 : feuille de route décalée — le système solaire passe de 003 à **004**, les quatre suivantes d'autant, avec une note datée du 2026-08-30 sur le modèle de celle du 2026-08-27 (FR-022)
- [X] T073 [P] `docs/design/conception-du-jeu.md` § questions ouvertes : **le gong comme unité native du domaine** ([G1](./research.md#g1--le-gong-est-une-unité-de-déclaration-pas-lunité-native-du-domaine)), avec son coût — rouvrir le cœur de 001 — et son défaut connu : à dix secondes par gong, les compteurs extrapolés de 002 décriraient un état faux entre deux gongs
- [X] T074 [P] `CLAUDE.md` : le repère de navigation — le catalogue déclare en gongs, le serveur résout une fois et annonce, le client reçoit et ne configure rien. Et la ligne du tableau de `packages/catalogs` / `packages/domain`
- [X] T075 [P] `specs/900-les-cinq-doublures/REPRISE.md` : consigner que le levier d'accélération du banc d'essai devient `GONG_SECONDS`, que `{ 1, 2 }` est la valeur recommandée ([G6](./research.md#g6--un-gong-très-court-aplatit-les-écarts-entre-types)) et que 900 dépend désormais de 003
- [X] T075a [P] `specs/003-le-gong/quickstart.md` : ajouter un § « Changer la longueur du gong d'un serveur déjà peuplé », que le cas limite de [spec.md](./spec.md) réclame nommément (« le remède relève de l'exploitation, et **doit être documenté** ») et qu'aucune tâche ne portait. Y dire : les ressources accumulées depuis la dernière consolidation sont créditées au **nouveau** taux — aubaine ou perte, jamais incohérence ; les échéances déjà écrites en base ne bougent pas ([G14](./research.md#g14--un-chantier-en-cours-nest-jamais-recalculé)) ; et le remède, qui est de consolider avant de redémarrer plutôt que de recalculer après
- [X] T076 [P] Relire les commentaires d'unité de `packages/domain/src/kernel/rates.ts` et `packages/domain/src/kernel/resources.ts` : `RatePerHour` reste numériquement un grain par seconde, et il faut dire **pourquoi** le catalogue déclare désormais des grains par gong sans que ce type change
- [ ] T077 Porte finale — exécuter les **onze** portes dans l'ordre du § 3 du [quickstart](./quickstart.md#3-ce-que-chaque-porte-doit-dire) et consigner leur sortie. Onze veut dire onze : `pnpm -w build` d'abord, puis **1** `typecheck`, **2** `lint`, **3** `boundaries` — en vérifiant que le nombre de modules parcourus est **non nul** —, **4** `test` catalogues, **5** `test` domaine, **6** `test` contrats, **7** `test:integration`, **8** `e2e`, **9** `pnpm audit --audit-level moderate`, **10** `gitleaks detect --config .gitleaks.toml --no-banner`, **11** `test:coverage`.

  **Les deux dernières à être oubliées sont 9 et 10**, parce qu'aucun test ne les porte : la liste de cette tâche s'arrêtait à huit et ne les contenait ni l'une ni l'autre. C'est arrivé mot pour mot en 002 (`specs/002-la-regie-approximative/tasks.md`, T102 et T109). L'audit est une porte **bloquante de la constitution**, et le fait que 003 n'ajoute aucune dépendance (G15) n'en dispense pas ; `gitleaks` a pour matière exacte ce que T001 modifie. Si `gitleaks` est absent du PATH, l'installer ou pousser la branche et relever le verdict de la CI — mais consigner laquelle des deux voies a été prise
- [ ] T078 Revue du hors-périmètre, contre le § « Hors périmètre » de [spec.md](./spec.md#hors-périmètre) : aucun équilibrage touché, aucune migration, aucun univers rapide ouvert ou nommé au joueur, aucun point d'aperçu serveur, `packages/db` intact — `git diff --stat packages/db` doit être vide

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance
- **Foundational (Phase 2)** : **bloque tous les récits**. T004 bloque tout le
  reste de la phase, et T016a en est le constat de sortie : si les modules de
  construction ne compilent pas sans être touchés, la phase n'est pas finie
- **US4 (Phase 3)** : dépend de Foundational. **Aucune autre phase ne devrait
  être ouverte avant que T021 passe** — c'est le socle de confiance
- **US2 (Phase 4)** : dépend de Foundational
- **US3 (Phase 5)** : dépend de Foundational ; T051-T054 supposent T048 (le champ
  de contrat)
- **US1 (Phase 6)** : dépend de Foundational et de T051 (le catalogue résolu du
  client)
- **US5 (Phase 7)** : dépend de US2 et de US3 — elle constate ce que les deux ont
  produit
- **Polish (Phase 8)** : dépend de tout

### Ordre des récits, et pourquoi il n'est pas celui des numéros

Quatre récits sont en P1 ; la priorité seule ne les ordonne pas. L'ordre retenu
suit la dépendance et le § 2 du quickstart :

```
Foundational → US4 (rien n'a bougé) → US2 (le serveur bat) → US3 (le client apprend) → US1 (le joueur refait) → US5 (l'équité constatée)
```

US4 d'abord parce que la valeur des trois autres en dépend. US5 en dernier
parce qu'elle n'ajoute rien : elle **constate**.

### À l'intérieur de chaque récit

- Les tests sont écrits et **observés en échec** avant l'implémentation
- Le contrat avant le client qui le consomme
- La fonction pure avant l'appelant

### Parallel Opportunities

**`[P]` veut dire fichiers distincts**, et cette liste s'y tient — elle ne s'y
tenait pas : elle recommandait en salve des tâches qui écrivent toutes dans le
même fichier de test. Deux mains sur un même fichier ne sont pas du parallélisme,
c'est un conflit de fusion.

- T002 et T003 en parallèle de T001
- T005 et T009 : fichiers distincts. **T007 n'est plus parallélisable** avec eux : il porte sur le même paquet que T008, et son assertion change d'unité
- T012 et T013 : deux fichiers de test distincts
- T023, T024 : parallélisables après T022
- US2 — **quatre** tests en parallèle : T027, T028, T029, T030. T031 et T031a suivent T030 (même fichier) ; T032 suit T029 (même fichier)
- US3 — contrats : T040 seul ouvre le fichier ; T041, T042 et T043 y ajoutent **en série**
- US3 — client : T044 et T047 en parallèle ; T045 et T046a suivent T044 (même fichier) ; T046 est sur son propre fichier
- US1 — T057 ouvre `rules-generation.test.tsx` et T058, T059, T060, T061 y ajoutent **en série** ; T061a est parallélisable, il a son propre fichier
- US5 — T067 et T068 en parallèle ; T069 suit T067 (même fichier)
- **Toute la Phase 8 sauf T077 et T078** en parallèle

### Ce qui ne se parallélise surtout pas

- T004 est seul, et avant tout le reste
- T007, T008, T009, T010, T010a, T011 touchent le même paquet et le même
  instantané d'équilibrage
- T017, T017a, T019 réécrivent des dizaines de fichiers de test : deux mains
  dessus se marchent dessus. **T017a est la plus lourde des trois**, et la plus
  facile à croire triviale
- T052 et T053 touchent l'écran de planète et sa grille : une seule main

---

## Parallel Example: User Story 3

Les cinq propriétés de contrat vivent dans **un seul fichier** et ne se
parallélisent donc pas entre elles. Ce qui se parallélise, ce sont les **trois
fichiers** de US3 :

```bash
# Trois fichiers distincts, en même temps :
Task: "packages/contracts/tests/v1/gong.test.ts — les cinq propriétés de contrat, en série dans le fichier (T040 → T043)"
Task: "apps/game/tests/features/catalog-notice.test.tsx — l'absence enveloppe l'écran (T046)"
Task: "apps/game/tests/design/gong-hors-du-client.test.ts — le test lexical, la seule porte de FR-012 (T047)"

# Puis, après T044 qui ouvre le fichier :
Task: "apps/game/tests/lib/catalogs.test.ts — mémoïsation (T045), puis propagation en une requête (T046a)"
```

---

## Implementation Strategy

### MVP d'abord — Foundational + US4

1. Phase 1 : Setup
2. Phase 2 : Foundational — **T004 en premier**, sans exception
3. Phase 3 : US4
4. **ARRÊT ET VALIDATION** : les 240 valeurs sont égales, les dix parcours de 001
   passent. Le jeu se comporte exactement comme avant, et il déclare son temps
   dans une unité neuve

C'est un MVP inhabituel : il ne se démontre pas, il se **prouve**. C'est ce que
demande une tranche dont la promesse est que rien n'a changé.

### Livraison incrémentale

1. Foundational + US4 → l'unité existe, et elle n'a rien déplacé
2. + US2 → un serveur bat au rythme qu'on lui donne, ou refuse de démarrer
3. + US3 → le client apprend le gong au lieu de le deviner ; **c'est ici que la
   tranche tient sa promesse d'origine**
4. + US1 → le joueur peut tout refaire
5. + US5 → l'équité est constatée, pas seulement voulue
6. + Polish → la mémoire du projet est à jour

### Ce qui doit faire arrêter

- **T021 échoue** : l'égalité stricte est tombée. Corriger `kernel/gong.ts`, ne
  **jamais** ajuster une valeur de `packages/catalogs/` pour faire passer un test
  d'égalité — ce serait rééquilibrer en prétendant changer une unité
- **T021 passe en ayant comparé moins de 240 valeurs** : la fixture est amputée,
  et la seule preuve que rien n'a bougé ne couvre pas ce qu'elle prétend couvrir
- **T016a oblige à modifier `demolish.ts` ou `clear.ts`** : le renommage a
  débordé sur les formes résolues. Reprendre T008/T009/T014, jamais ces deux
  fichiers-là
- **T047 passe en ayant lu zéro fichier** : la porte ne mord pas, et SC-005 n'est
  pas tenu
- **T020 compile** un `DeclaredCatalogs` donné à une fonction de domaine : les
  deux types ne sont pas distincts, et la classe d'erreur la plus coûteuse —
  plausible, silencieuse, fausse — reste ouverte

---

## Notes

- `[P]` = fichiers distincts, aucune dépendance
- Commiter après chaque tâche ou groupe logique ; messages en français
- La dérogation au principe IV est **écrite** dans le [Complexity Tracking du
  plan](./plan.md#complexity-tracking) et bornée par un événement nommé —
  l'arrivée de Capacitor. Toute tranche qui introduit un client à cycle de vie
  propre doit rouvrir la question du versionnement de contrat
- Un bundle client antérieur à 003 rejettera la clé inconnue **à l'analyse** :
  c'est assumé ([G8](./research.md#g8--ajouter-un-champ-à-un-schéma-strict-casse-un-bundle-client-périmé)),
  et recompiler suffit
