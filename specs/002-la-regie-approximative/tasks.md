# Tasks: La Régie approximative — l'écran de parcelle habillé

**Input**: documents de conception de `/specs/002-la-regie-approximative/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests** : **obligatoires**, et écrits d'abord. Le principe III de la
constitution est non négociable, et le plan (§ Constitution Check) désamorce le
risque propre à un habillage — « on verra à l'œil » — en rendant *tout*
observable. Chaque tâche de test énonce ce qu'elle doit constater **en échec**
avant que l'implémentation existe.

**Organisation** : les tâches sont groupées par histoire utilisateur, de sorte
que chacune soit implémentable et éprouvable seule.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : parallélisable — fichiers distincts, aucune dépendance sur une tâche
  inachevée. **Deux tâches qui écrivent le même fichier ne portent jamais toutes
  deux `[P]`** : la seconde s'écrit après la première, et le dire ici évite une
  résolution de conflit sur un fichier de test.
- **[Story]** : l'histoire que la tâche sert (US1 … US6)
- Chaque description porte son chemin de fichier exact
- **Identifiants suffixés — `T017a`, `T040a`, `T053a`, `T105a`** : tâches
  ajoutées le 2026-08-28 par l'analyse de cohérence, insérées à leur place
  logique. Le suffixe plutôt qu'une renumérotation : renuméroter cent six tâches
  invaliderait toutes les références croisées du plan, des contrats et de la
  section « Dépendances », ce qui coûterait plus cher que la lecture d'un `a`.
  C'est la convention que `spec.md` emploie déjà pour FR-001a et FR-008a.

## Conventions de chemins

Monorepo pnpm. **Cette tranche ne touche qu'une application sur deux et zéro
paquet sur quatre** :

- `apps/game/src/**` — le client, seul emplacement de code modifié
- `apps/game/tests/**` — projets Vitest `game` (`.ts`, node) et `game-dom`
  (`.tsx`, jsdom) ; `tests/e2e/**` pour Playwright
- `docs/**`, `specs/**`, `biome.json` — documentation et portes
- `packages/**` et `apps/api/**` — **intacts**. C'est SC-012, et
  `git diff --stat main -- packages/ apps/api/` doit rester vide.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose** : installer les quatre polices, ranger le dossier de design, et
constater par exécution ce que R4 refuse de croire sur parole.

- [X] T001 Ajouter les quatre `@fontsource/*` en version exacte `5.3.0` — `archivo`, `archivo-narrow`, `jetbrains-mono`, `saira-stencil-one` — aux `dependencies` de `apps/game/package.json`, puis `pnpm install`
- [X] T002 [P] Déplacer le dossier de design **entier** de `design_handoff_regie_approximative/` vers `docs/design/2026-08-27-regie-approximative/` par `git mv`, `support.js` et les deux prototypes `.dc.html` compris (R3)
- [X] T003 [P] Exclure le dossier de design des portes dans `biome.json` : ajouter `"!docs/design/2026-08-27-regie-approximative"` à `files.includes`, faute de quoi le lint se met à juger `uno.config.ts` et `support.js` (R3)
- [X] T004 Vérifier **par exécution** que les quatre paquets Fontsource servent bien le sous-ensemble latin pour les graisses du § 5 de [`contracts/jeu-de-valeurs.md`](./contracts/jeu-de-valeurs.md) : lister les `woff2` de `node_modules/@fontsource/*/files/`, et consigner le verdict dans le journal de la demande de fusion ; si un paquet manque ou distribue une licence incompatible, appliquer le repli nommé en R4 plutôt que de l'improviser
- [X] T005 [P] Créer `apps/game/src/design/fonts.ts` important les seules graisses latines nommées par R4 (FR-004) — Archivo 400/500/600/700/800, Archivo Narrow 400/600/700/800, JetBrains Mono 400/500/700, Saira Stencil One 400
- [X] T006 Constater que `pnpm -w lint`, `pnpm -w typecheck` et `pnpm -w boundaries` restent verts après T002 et T003, et que `boundaries` annonce un **nombre non nul** de modules parcourus (quickstart § 1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose** : le jeu de valeurs et ses deux portes, le vocabulaire de
silhouettes, l'adresse courte, et les deux amendements sans lesquels les portes
de 001 se mettraient à refuser 002.

**⚠️ CRITICAL** : aucune histoire ne commence avant la fin de cette phase.

### Les deux portes du jeu de valeurs — écrites avant `tokens.css`

- [X] T007 [P] Écrire le test de conformité du jeu de valeurs (INV-V1) dans `apps/game/tests/design/tokens.test.ts` : toute clé de `docs/design/2026-08-27-regie-approximative/tokens.json` a sa propriété personnalisée dans `apps/game/src/design/tokens.css` à la valeur près ; les clés `$description`, `$note`, `$regle`, `$viewBox` sont ignorées par une **liste nommée dans le test** ; le nombre de clés lues est **non nul**. Il doit échouer d'abord parce que `tokens.css` n'existe pas
- [X] T008 *(même fichier que T007, donc après elle et sans `[P]`)* Ajouter à `apps/game/tests/design/tokens.test.ts` la règle typographique de R14 (INV-V5) : pour chaque pas de `typo`, `tokens.css` porte `max(valeur du dossier, plancher du rôle) ÷ 16` en `rem` — le rôle de chaque pas est déclaré dans le test, **et la règle est calculée, jamais une liste d'exceptions** ; le pas `chiffre-xs` (14 px, information) est ajouté sans exister dans `tokens.json`
- [X] T009 [P] Écrire le test de contraste dans `apps/game/tests/design/contrastes.test.ts` : recalculer les couples du § 3 de [`contracts/jeu-de-valeurs.md`](./contracts/jeu-de-valeurs.md) par la formule WCAG 2.1 depuis les hexadécimaux de `tokens.json`, comparer au seuil du **rôle** — 4,5 texte normal, 3 texte large, 3 bordure, **3 silhouette** (FR-030 amendé, INV-V4) —, refuser les quatre couples interdits du § 3.3, et vérifier que l'indicateur composite `encre` + `papier` atteint 3:1 sur **chacun** des huit fonds du § 4 (FR-024). Le rôle `silhouette` n'est pas une redite du texte : c'est ce qui donne à la porte quelque chose à quoi comparer une **forme**, et la silhouette est le seul élément dont l'illisibilité perdrait l'information (FR-012)
- [X] T010 [P] Écrire le test de non-régression des valeurs en dur (INV-V2) dans `apps/game/tests/design/valeurs-en-dur.test.ts` : aucun hexadécimal, `rgb(`, `deg` ni longueur en pixels hors exceptions énumérées dans `apps/game/src/**` en dehors de `tokens.css` ; **aucune taille de police en pixels nulle part** (FR-039a) ; les quatre teintes de nuit transcrites et référencées par aucune règle (FR-036, INV-V3) ; aucun `aria-label` sur un élément sans rôle (R13) ; le nombre de fichiers parcourus est **non nul**
- [X] T010a *(ajoutée le 2026-08-28 à l'implémentation)* Déclarer les types de Node au client — `"types": ["vite/client", "node"]` dans `apps/game/tsconfig.json` — **et refermer la porte que cela ouvre** : les trois portes du jeu de valeurs lisent `tokens.json` et parcourent `src/**` sur le disque, donc `node:fs` et `node:path`, que `types: ["vite/client"]` rendait invisibles (`tsc` échouait en TS2591). Élargir `types` cesse d'interdire au **client** d'importer un module Node, faute qui ne se verrait qu'à la compilation ; la règle `game-src-sans-module-node` de `.dependency-cruiser.cjs` la refuse donc explicitement, et son morsure est **vérifiée par exécution** — une sonde important `node:fs` dans `src/` fait échouer la porte 3, et son retrait la fait reverdir. Le typage a cessé de tenir une frontière : elle est rendue là où elle est mesurée
- [X] T011 Écrire `apps/game/src/design/tokens.css` — la source unique de valeurs de FR-001, transcription du § 1 de [`contracts/jeu-de-valeurs.md`](./contracts/jeu-de-valeurs.md), l'échelle en `rem` planchers appliqués, les quatre piles de repli de police, le côté minimal d'une case, les épaisseurs resserrées de R9, le palier de 900 px et le pas `chiffre-xs` — jusqu'à faire passer T007, T008, T009 et T010
- [X] T012 Écrire `apps/game/src/design/base.css` : `color-scheme: light`, corps et fond, `.sr-only`, l'indicateur de focus **composite** du § 4 de [`contracts/jeu-de-valeurs.md`](./contracts/jeu-de-valeurs.md), sa bascule sur `Highlight` en `forced-colors: active` (FR-024a), `font-variant-numeric: tabular-nums` sur la famille mono, `prefers-reduced-motion: reduce` ramenant toute durée à 1 ms, et aucune transition de couleur au-delà de 120 ms
- [X] T013 Importer `./design/fonts.js`, `./design/tokens.css` et `./design/base.css` depuis `apps/game/src/main.tsx`, **après** `./styles.css`, pour que la géométrie de 001 reste en place tant que 002 ne l'a pas reprise

### Le vocabulaire de silhouettes

- [X] T014 [P] Écrire `apps/game/tests/design/glyphe.test.tsx` : les **sept** formes de R5 sont rendues, chacune sur `viewBox="0 0 24 24"` et en `fill="currentColor"` (INV-S1) ; `jus` et `bave` sont **un seul chemin à `fill-rule="evenodd"`** et ne portent aucune seconde forme peinte (INV-S2) ; le vocabulaire ne dépasse pas sept entrées (INV-S4). Il doit échouer d'abord parce que `Glyphe` n'existe pas
- [X] T015 Écrire `apps/game/src/design/Glyphe.tsx` — `<Glyphe nom taille trait />`, les sept formes tirées de `tokens.json → glyphes`, avec `jus` et `bave` **redessinés** en chemin unique à trou (la correction assumée de R5) — jusqu'à faire passer T014

### L'adresse courte, et la douzaine de tests de 001 qu'elle déplace

- [X] T016 [P] Écrire `apps/game/tests/lib/labels.test.ts` : `adresseOf({x:2,y:2})` rend `« C3 »`, `describePosition` rend l'adresse et non plus « Colonne 4, rangée 1 », la fonction **lève** au-delà de vingt-six colonnes (INV-A3), et `describeCell` suit la grammaire du § 2.3 de [`contracts/ui-parcelle.md`](./contracts/ui-parcelle.md) sur les onze exemples normatifs qu'elle énumère
- [X] T017 Réécrire les attentes des tests unitaires de 001 qui comparent la phrase produite — **liste corrigée le 2026-08-28 à l'implémentation, après recomptage sur le contenu réel** : `apps/game/tests/features/grid/grid-view.test.tsx` (lignes 115, 174, 186, 199, 211), `apps/game/tests/features/grid/live-region.test.ts` (51, 149, 158, 167, 181, 182, 223), `apps/game/tests/features/work/current-work.test.tsx` (77, 113, 150), `apps/game/tests/features/work/upgrade-panel.test.tsx` (100) et `apps/game/tests/features/work/refusal-notice.test.tsx` (95, 96) — et les **observer en échec** avant T018. La rédaction précédente listait `ghost.test.ts`, `clear-panel.test.tsx` et `demolish-panel.test.tsx`, **qui ne portent aucune assertion de position** et n'ont rien à réécrire, et **omettait `refusal-notice.test.tsx`, qui en porte deux**. Elle se disait « vérifiée sur le contenu réel » et **omettait trois assertions de plus** : `live-region.test.ts` 182 et 223, et surtout `grid-view.test.tsx` 115, qui comparait `${x + 1}` **sans jamais écrire le mot « Colonne »** — donc invisible à un relevé par recherche de texte. C'est le défaut de méthode à retenir : une liste établie par `grep` sur un libellé ne trouve pas les assertions qui composent ce libellé
- [X] T018a *(ajoutée le 2026-08-28 à l'implémentation, sans laquelle INV-A1 est faux)* Retirer les cinq `describePosition(...).toLowerCase()` de `apps/game/src/features/resources/EnergyPanel.tsx` (50), `features/work/CurrentWork.tsx` (67), `features/work/DemolishPanel.tsx` (48 et 209) et `features/work/UpgradePanel.tsx` (41). Ils mettaient en minuscules une phrase — « colonne 1, rangée 5 » — dont la casse ne portait rien ; ils mettent désormais en minuscules une **adresse**, et rendent « Mine niveau 2, a5 » là où la grille dit `A5`. INV-A1 exige l'adresse **identique partout** : deux casses sont deux désignations. Les tests de 001 comparant en insensible à la casse, **aucune porte n'aurait vu l'écart**
- [X] T017b *(ajoutée le 2026-08-28, sur constat de la porte 8)* Réécrire les deux attentes de titre de `apps/game/tests/e2e/account.ts` — `signUp` (97) et `signIn` (155) —, qui cherchent « Ma planète » là où FR-008 met l'identité de la planète. **C'est le harnais de tous les parcours**, ceux de 001 compris : sans cette correction, la porte 8 échoue **en entier** sur son premier maillon. T017a listait les trois parcours qui affirment une **position de case** ; celui-ci affirme un **titre**, et aucune tâche ne le nommait. Même classe d'omission que `grid-view.test.tsx:115`, et même leçon : une liste établie par recherche de texte ne trouve pas ce qui est formulé autrement
- [X] T017a Réécrire les **trois parcours e2e de 001** qui affirment « Colonne N, rangée M » — `apps/game/tests/e2e/us1-planet.spec.ts` (81, 92, 175), `us2-build.spec.ts` (40, 223), `us5-clear.spec.ts` (165, 196) — selon l'adresse courte, et les observer en échec avant T018. Sans cette tâche, **la porte 8 vire au rouge sans qu'aucune tâche ne porte le travail** : T018 change le nom accessible de chaque case, et ces trois parcours l'affirment mot pour mot. `us8-rules.spec.ts` n'est pas concerné — son occurrence du mot « colonnes » désigne celles d'une table de la page de règles
- [X] T018 Implémenter `adresseOf` et réécrire `describePosition` et `describeCell` dans `apps/game/src/lib/labels.ts` selon la grammaire du contrat, jusqu'à faire passer T016, T017 et T017a ; l'adresse est la **même partout** — nom accessible, annonce, aperçu, alerte de refus (INV-A1) ; `RESOURCE_LABELS`, `DEPOSIT_LABELS`, `OBSTACLE_LABELS`, `BUILDING_LABELS` et `FOOTPRINT_LABELS` restent **inchangés** (FR-040)

### Les deux amendements bloquants

- [X] T019 [P] Amender `specs/001-la-planete-mere/spec.md` § SC-009, **clause typographique seule** : le plancher de 16 px recentré sur les champs de saisie, remplacé par les quatre planchers par rôle, **daté du 2026-08-28 et motivé** par R14. Les **deux autres clauses du critère — la fenêtre de 360 × 640 px et les cibles de 44 × 44 px — ne sont pas touchées** : SC-009 de 001 en porte trois, et amender le critère entier retirerait deux exigences que personne n'a proposé de retirer. L'écart entre deux tranches se résout dans les deux spécifications, jamais dans un plan (principe I)
- [X] T020 Amender `apps/game/tests/e2e/mobile.spec.ts` : l'assertion des 16 px ne mesure plus que `input, select, textarea`, et son commentaire cite l'amendement de T019 ; les assertions de la fenêtre de 360 × 640 px et des cibles de 44 × 44 px **restent en place** — sans quoi la porte 8 de 001 refuserait 002 pour une exigence qui n'existe plus, ou laisserait passer deux exigences qui existent toujours

**Checkpoint** : le jeu de valeurs est tenu par deux portes non inertes, les sept
silhouettes existent, l'adresse est la même partout, et les portes de 001 disent
la vérité. Les six histoires peuvent commencer.

---

## Phase 3: User Story 1 — L'écran se lit d'un coup d'œil (Priority: P1) 🎯 MVP

**Goal** : sur 430 px, les sept blocs dans l'ordre de FR-006, chacun délimité,
et aucun chiffre posé sur un aplat de ressource.

**Independent Test** : ouvrir l'écran de parcelle sur une fenêtre de 430 px,
constater que les sept blocs apparaissent dans l'ordre prescrit, que chaque bloc
est délimité, et qu'aucune valeur chiffrée ne repose sur la teinte de sa
ressource.

### Tests pour US1 — écrits d'abord ⚠️

- [X] T021 [P] [US1] Écrire `apps/game/tests/features/regie/ordre-du-document.test.tsx` : l'ordre des nœuds correspondants est celui des § 1 et § 1.1 de [`contracts/ui-parcelle.md`](./contracts/ui-parcelle.md) — plaque d'en-tête, compteurs, **énergie**, note, plaque de chantier, plan, actions, **alerte de refus de commande**, mention, puis registre et légende. Les trois nœuds que FR-006 n'énumère pas sont assertés comme les sept autres : l'énergie garde son bloc distinct après les compteurs (FR-010), l'alerte de refus suit les boutons de pose au lieu de rester entre le plan et les compteurs comme en 001 (§ 1.1), et `CatalogNotice` **enveloppe** l'écran sans occuper de rang (FR-011)
- [X] T022 [P] [US1] Écrire `apps/game/tests/features/regie/plaque-chantier.test.tsx` : **sans chantier**, le `role="group"` nommé « Chantier » est présent et énonce explicitement qu'aucun chantier n'est en cours ; avec chantier, il porte le bâtiment, son niveau, une jauge et un chrono au format `HH:MM:SS` (US1-AC3, FR-009)
- [X] T023 [P] [US1] Écrire `apps/game/tests/features/regie/comptoir.test.tsx` : chacune des trois ressources porte son nom, sa quantité et son débit horaire ; **toute valeur chiffrée est rendue sur l'étiquette de papier** et non sur l'aplat de la ressource, constaté par le crochet de l'étiquette et non par une couleur (FR-003, FR-010)
- [X] T024 [P] [US1] Écrire `apps/game/tests/features/regie/plaque-en-tete.test.tsx` : un `<h1>` porte l'identité de la planète — le nom d'archétype tant qu'il n'y a pas de nom propre (FR-008) —, le surtitre de la Régie porte `data-role-texte="decor"`, le tampon « VU, MAIS / PAS LU » est `aria-hidden`, et **aucun nœud n'existe** pour l'ancien nom, les coordonnées système ou les possessions multiples (FR-008a)

### Implémentation de US1

- [X] T025 [US1] Écrire `apps/game/src/design/regie.css` — les gestes signature : `.cadre-main` et sa variante `--fort` en deux pseudo-éléments qui dépassent aux angles, `.plaque`, `.etiquette`, `.tampon`, `.note-regie`, toutes rotations sous le plafond de 1,5° sauf le tampon décoratif (FR-032)
- [X] T026 [US1] Écrire `apps/game/src/design/parcelle.css` — la colonne unique de FR-006 : conteneur, pile verticale, espacements du jeu de valeurs, délimitation de chaque bloc. Le guichet à trois colonnes est **hors périmètre de cette histoire** et arrive en US6
- [X] T027 [P] [US1] Écrire `apps/game/src/features/regie/PlaqueEnTete.tsx` — identité, surtitre marqué `data-role-texte="decor"`, tampon `aria-hidden` —, jusqu'à faire passer T024
- [X] T028 [P] [US1] Écrire `apps/game/src/features/regie/Comptoir.tsx` — les trois compteurs, l'étiquette de papier portant nom, valeur et débit horaire en `chiffre-xs` tabulaire —, jusqu'à faire passer T023
- [X] T029 [P] [US1] Écrire `apps/game/src/features/regie/PlaqueChantier.tsx` — bâtiment, niveau, jauge d'avancement, chrono, et l'énoncé explicite d'absence de chantier —, jusqu'à faire passer T022
- [X] T030 [US1] Ajouter le formatage `HH:MM:SS` du temps restant dans `apps/game/src/lib/format.ts`, en chasse fixe tabulaire (FR-002), et le brancher sur `PlaqueChantier`
- [X] T031 [US1] Réécrire le rendu de `apps/game/src/features/resources/ResourcePanel.tsx` et `apps/game/src/features/resources/EnergyPanel.tsx` pour employer `Comptoir` et le jeu de valeurs, **sans toucher aux calculs** — l'énergie reste un bloc distinct (FR-010)
- [X] T032 [US1] Réécrire le rendu de `apps/game/src/features/work/CurrentWork.tsx` pour employer `PlaqueChantier`, sans toucher à la dérivation de l'état
- [X] T033 [US1] Réordonner `apps/game/src/routes/planet.tsx` selon FR-006 et le § 1.1 du contrat : le `BuildPanel` passe **après** la grille avec les trois autres mécaniques (R16), `RefusalNotice` **quitte sa place de 001 entre le plan et les compteurs** pour suivre les boutons de pose — un message d'échec loin du bouton qui a échoué oblige à le chercher —, `CatalogNotice` reste l'**enveloppe** de l'écran, la note de bas de page et la mention finale de la Régie sont ajoutées en `data-role-texte="decor"`, et les quatre mécaniques restent toutes visibles sans navigation supplémentaire (FR-011) — jusqu'à faire passer T021
- [X] T034 [US1] Reprendre la copie de la Régie **telle quelle** depuis `docs/design/2026-08-27-regie-approximative/README.md` — surtitre, note de bas de page, mention finale, libellés de boutons, tampon — à l'exception des valeurs qui relèvent des données de jeu (FR-037), et vérifier qu'aucun de ces textes n'est cliquable ni porteur d'information (FR-038)

**Checkpoint** : l'écran de parcelle a une identité sur 430 px, ses sept blocs
sont dans l'ordre, et aucun chiffre ne repose sur une teinte de ressource.

---

## Phase 4: User Story 2 — La grille se lit sans distinguer les couleurs (Priority: P1)

**Goal** : les douze états de FR-013, chacun identifiable par un canal non
chromatique, et une légende qui en donne la clé.

**Independent Test** : afficher une parcelle portant les douze états
simultanément, la passer en niveaux de gris, et faire nommer chacun d'eux par
une personne qui n'a pas participé à leur conception.

### Tests pour US2 — écrits d'abord ⚠️

- [X] T035 [P] [US2] Écrire `apps/game/tests/features/grid/appearance.test.ts` : `appearanceOf` range chaque case dans l'un des douze états de la table de R6, pour les douze lignes — y compris gisement **productif** contre **stérile** par `catalogs.buildings[type].extracts`, et les deux natures d'obstacle par `catalogs.obstacles[id].reveals.kind`
- [X] T036 [US2] *(même fichier que T035, donc après elle et sans `[P]`)* Ajouter à `apps/game/tests/features/grid/appearance.test.ts` l'assertion d'unicité d'INV-C1 et d'INV-C4 : les douze états portent douze **quadruplets** (silhouette, trait, marque, emprise) distincts deux à deux — le triplet ne suffit pas, « case libre » et « bâtiment posé » ayant leurs trois premiers champs vides
- [X] T037 [P] [US2] Créer `apps/game/tests/fixtures/planet-douze-etats.json` — une parcelle portant les douze états simultanément, que la recette humaine de [`quickstart.md § 10.1`](./quickstart.md) exige et que les tests de rendu réemploient
- [X] T038 [P] [US2] Écrire dans `apps/game/tests/features/grid/grid-view.test.tsx` les attentes sur les crochets de 002 : chaque case porte `data-adresse`, `data-etat`, et — quand l'état en porte — `data-glyphe`, `data-trait`, `data-marque`, `data-emprise` ; **aucun crochet de 001 n'est retiré** (`data-index`, `data-state`, `data-deposit`, `data-ghost`)
- [X] T039 [P] [US2] Écrire `apps/game/tests/features/grid/legende.test.tsx` : le nombre d'entrées de la légende est **égal à la taille de l'union `EtatDeCase` — douze** ; chaque entrée porte la silhouette **rendue par `Glyphe`** et son libellé ; chaque `data-glyphe` de la légende apparaît dans la table des états (§ 7 du contrat d'interface)
- [X] T040 [US2] *(même fichier que T038, donc après elle et sans `[P]`)* Écrire dans `apps/game/tests/features/grid/grid-view.test.tsx` le cas d'une parcelle **non carrée** — 3 × 10 puis 8 × 4 — : bandes de coordonnées présentes (INV-A2), adresses et disposition suivent les dimensions, jamais une constante de 6 × 6
- [X] T040a [US2] *(même fichier, après T040)* Écrire dans `apps/game/tests/features/grid/grid-view.test.tsx` les attentes de **FR-017 et INV-C3**, qu'aucun test ne portait : l'emprise d'un bâtiment multi-cases se délimite comme **un seul objet** — les cases de l'emprise portent `data-emprise` en `debut`/`milieu`/`fin` et forment un cadre continu —, et **son niveau n'est rendu qu'une fois**, sur l'emprise, jamais une fois par case. C'est le discriminant qui sépare « case libre » de « bâtiment posé » dans le quadruplet d'INV-C1 : sans lui, SC-003 et SC-009 reposent sur un rendu que rien ne vérifie. À observer en échec avant T043
- [X] T040b [P] [US2] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` l'attente de **FR-015 et INV-S3**, qu'aucun test ne portait : la boîte rendue d'une silhouette occupe **35 à 40 %** du côté de sa case, **aux trois largeurs** — 320, 430, 1180 px. En dessous elle cesse de se lire à quatre pixels de large, au-dessus elle mange le cadre d'emprise. En Playwright et non en jsdom : c'est une mesure de mise en page, et jsdom ne dispose rien — `38cqmin` déclaré n'est pas 38 % rendu. À observer en échec avant T044

### Implémentation de US2

- [X] T041 [US2] Écrire `apps/game/src/features/grid/appearance.ts` — `appearanceOf(cell, buildings, work, pose, catalogs)`, fonction **pure**, l'union fermée `EtatDeCase` à douze noms et l'interface `CellAppearance` du § 3.1 de [data-model.md](./data-model.md) — jusqu'à faire passer T035 et T036
- [X] T042 [US2] Réécrire `apps/game/src/features/grid/GridView.tsx` : `glyphOf` et ses caractères `▓ ■ · ◆` **disparaissent** au profit de `Glyphe`, les crochets `data-*` de 002 sont posés, la structure du § 2.1 du contrat est adoptée — bandes `aria-hidden` **hors** de `role="grid"`, `aria-label` de grille énonçant les dimensions et les bornes d'adresse — jusqu'à faire passer T038 et T040
- [X] T043 [US2] Rendre l'emprise d'un bâtiment multi-cases comme **un seul objet**, son niveau lisible une seule fois dessus, dans `apps/game/src/features/grid/GridView.tsx` et `apps/game/src/design/parcelle.css` (FR-017, INV-C3) — jusqu'à faire passer T040a
- [X] T044 [US2] Compléter `apps/game/src/design/parcelle.css` pour la grille : `container-type: size` sur la case, silhouette à `38cqmin` (FR-015, INV-S3, R8), case carrée et jamais sous le côté minimal (INV-C2), gouttières d'encre, encadrement, bandes de coordonnées présentes à **toute** largeur (FR-016, INV-A2) — jusqu'à faire passer T040b
- [X] T045 [US2] Écrire `apps/game/src/features/grid/Legende.tsx` — une entrée par état de l'union, silhouette rendue et libellé, atteignable à toutes les largeurs (FR-018) — jusqu'à faire passer T039
- [X] T046 [US2] Réécrire `apps/game/src/features/grid/FootprintGhost.tsx` pour employer les silhouettes `visee` et `refus` au lieu des caractères, sans changer `ghostMarkOf` ni `ghostSuffix`
- [X] T047 [US2] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` le cas **contrastes forcés** (SC-009 de 002) : sous émulation `forced-colors: active`, chaque case porte toujours son canal non chromatique, les silhouettes héritent de la couleur de texte courante, et les douze quadruplets restent distincts (FR-033)

**Checkpoint** : les douze états sont douze lectures pures, distinctes sans la
couleur, et la légende en donne la clé.

---

## Phase 5: User Story 3 — Poser au clavier, et savoir pourquoi c'est refusé (Priority: P1)

**Goal** : chaque case refusée nomme sa cause, à l'écran comme à l'oreille, et
les trois commandes de pose sont atteignables au clavier **et** par un bouton.

**Independent Test** : armer une pose, parcourir la grille aux flèches sans
souris, et vérifier que chaque case refusée nomme sa cause.

### Tests pour US3 — écrits d'abord ⚠️

- [X] T048 [P] [US3] Écrire `apps/game/tests/features/grid/refusal.test.ts` : la traduction du verdict de `validatePlacement` en raison **par case**, selon la table de R12. Il n'y a **jamais qu'une cause à traduire** : `validatePlacement` rend un seul verdict, selon une priorité fixée dans le domaine — hors parcelle, puis obstrué, puis occupé (`packages/domain/src/kernel/grid.ts:154-176`). Aucune règle d'agrégation n'est à écrire côté client, et le test le constate plutôt que de le supposer — `out-of-grid` nomme la direction, dérivée des cases hors bornes et **cumulée** quand il y en a plusieurs ; `obstructed` nomme l'obstacle et sa case ; `occupied` nomme le bâtiment, son niveau et sa case
- [X] T049 [P] [US3] Ajouter à `apps/game/tests/features/grid/refusal.test.ts` le cas qui n'a pas de case : une empreinte qui sort de la parcelle porte sa raison sur les cases de l'empreinte **qui existent**, la case fautive n'étant pas dessinable (R12)
- [X] T050 [US3] *(`grid-view.test.tsx` est déjà écrit par T038, T040 et T040a en US2 : pas de `[P]`, et à mener après elles ou en acceptant une résolution de conflit)* Écrire dans `apps/game/tests/features/grid/grid-view.test.tsx` les trois derniers exemples normatifs du § 2.3 du contrat : le nom accessible d'une case visée refusée porte `« refusé : … »` avec sa raison (FR-021)
- [X] T051 [P] [US3] Écrire dans `apps/game/tests/features/grid/cursor.test.ts` que `Échap` **annule la pose armée** et que rien n'est posé (US3-AC4, § 3 du contrat)
- [X] T052 [P] [US3] Écrire `apps/game/tests/features/regie/actions.test.tsx` : les boutons **Poser**, **Pivoter** et **Annuler** existent, portent les libellés du contrat, produisent un effet réel, et mesurent au moins 48 px de hauteur (FR-020, FR-025, FR-031)
- [X] T053 [P] [US3] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` le parcours clavier complet de [`quickstart.md § 6`](./quickstart.md) (SC-006, FR-019) : un seul arrêt de tabulation pour entrer, une frappe pour sortir, le retour **sur la case où on était**, la cause énoncée à chaque case refusée, la rotation, la pose, puis l'annulation par `Échap`
- [X] T053a [P] [US3] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` les attentes de **FR-005**, qu'aucun test ne portait : **hors** émulation de mouvement réduit — c'est-à-dire dans les conditions ordinaires —, aucune durée calculée de transition n'excède **120 ms** sur les éléments de l'écran, et **aucun élément ne se déplace, ne tourne ni ne change de taille au survol ou à la prise de focus** — boîte rendue comparée avant et après `hover` puis `focus`, sur les boutons d'action, les cases de la grille et les entrées du registre. T091 ne mesure que sous mouvement réduit, où tout est ramené à 1 ms : il ne peut par construction rien dire du comportement ordinaire, qui est justement ce que FR-005 borne. À observer en échec avant T058

### Implémentation de US3

- [X] T054 [US3] Écrire `apps/game/src/features/grid/refusal.ts` — fonction pure de présentation, la direction d'un débordement calculée des cases hors bornes contre les dimensions de la parcelle, sans que le domaine connaisse le mot « droite » — jusqu'à faire passer T048 et T049
- [X] T055 [US3] Brancher la raison sur le nom accessible de la case dans `apps/game/src/features/grid/GridView.tsx` et `apps/game/src/features/grid/appearance.ts` (`raisonDeRefus`), jusqu'à faire passer T050
- [X] T056 [US3] Ajouter la prise en charge d'`Échap` dans `apps/game/src/features/grid/useGridCursor.ts` et le désarmement de la sélection dans `apps/game/src/routes/planet.tsx`, jusqu'à faire passer T051
- [X] T057a *(ajoutée le 2026-08-28, sur constat de la porte 8)* Placer le **sélecteur de bâtiment avant les commandes** dans le bloc des actions, et **retirer le bouton de confirmation de `BuildPanel`** — avec ses propriétés `onConfirm` et `pending`, devenues mortes. Le parcours de comptage a mesuré **dix-sept** frappes là où SC-001 de 001 en admet quinze : R16 allonge le chemin en déplaçant le panneau après la grille, et la barre d'actions ajoutait deux arrêts de tabulation *avant* le sélecteur. Le § 6 du contrat nomme **une** commande de pose — `JE POSE ÇA` — et conclut « aucune autre commande n'existe » : le bouton de `BuildPanel` en était un second. `tabToGrid` reçoit en outre une **direction**, `Maj+Tab` étant le chemin naturel depuis le sélecteur depuis que le plan le précède — c'est l'aller-retour que R16 décrit. **SC-001 de 001 n'a pas eu à être amendé**
- [X] T057 [US3] Ajouter la barre d'actions — `JE POSE ÇA`, `Pivoter`, `Annuler` — dans `apps/game/src/routes/planet.tsx`, sous le plan, avec les panneaux des quatre mécaniques, jusqu'à faire passer T052
- [X] T058 [US3] Habiller la barre d'actions dans `apps/game/src/design/parcelle.css` et `apps/game/src/design/regie.css` : cible d'au moins 48 px, survol et focus **sans mouvement ni changement de taille**, transition de couleur sous 120 ms (FR-005, FR-031) — jusqu'à faire passer T053a

**Checkpoint** : le parcours de pose se conduit au clavier seul, et un refus dit
toujours pourquoi.

---

## Phase 6: User Story 4 — Demander le relevé (Priority: P2)

**Goal** : une région d'annonce **unique**, écrite par des événements et jamais
par un compteur, et un relevé à la demande.

**Independent Test** : activer le bouton de relevé au clavier et vérifier que la
région d'annonce énonce l'état courant complet, sans que rien d'autre ne l'ait
énoncé entre-temps.

### Tests pour US4 — écrits d'abord ⚠️

- [X] T059 [P] [US4] Écrire `apps/game/tests/features/announce/region-unique.test.tsx` : l'écran de parcelle rendu ne contient **qu'un seul** élément `aria-live` poli (INV-N1) ; les régions assertives — `RefusalNotice` en `role="alert"` — ne sont pas comptées, l'exception étant nommée par FR-022
- [X] T060 [P] [US4] Écrire `apps/game/tests/features/announce/releve.test.ts` : la phrase du relevé énonce les trois quantités, les trois débits et le chantier, une seule fois par appel (INV-N3) ; et **deux appuis successifs produisent deux énoncés distincts sur un état qui n'a pas bougé** — une planète dont les trois ressources sont **saturées**, dont le débit net est nul et qui n'a aucun chantier (FR-023a, INV-N3a). La rédaction précédente affirmait que deux relevés diffèrent « les quantités ayant progressé » : c'est faux dès la saturation, que 001 produit déjà, et la région d'annonce serait alors **silencieuse** au second appui. Le cas saturé est le cas de test, pas le cas de bord
- [X] T061 [P] [US4] Écrire `apps/game/tests/features/announce/annonce.test.ts` : les sept origines de `OrigineAnnonce` écrivent l'annonce, **aucune** ne correspond à la progression d'un compteur (INV-N2), et la rotation de l'empreinte réécrit l'annonce sous l'origine `curseur` sans origine propre
- [X] T062 [US4] *(même fichier que T061, donc après elle et sans `[P]`)* Écrire dans `apps/game/tests/features/announce/annonce.test.ts` la détection des deux transitions de R11 : `work` qui passe de non nul à nul donne `chantier-acheve`, `saturatedSince` qui passe de nul à un instant donne `stockage-sature` — détectées par comparaison avec l'état précédent, **jamais** par une échéance d'horloge lue directement (INV-N4)
- [X] T063 [P] [US4] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` que l'écran affiché **sans interaction** pendant que les compteurs progressent ne produit **aucune** annonce (US4-AC2) ; et que le bouton **Relevé** existe, mesure au moins 48 px de hauteur, s'atteint au clavier et **écrit réellement** dans la région d'annonce à chaque appui, y compris au second (FR-023, FR-023a, FR-025, FR-031)

### Implémentation de US4

- [X] T064 [US4] Écrire `apps/game/src/features/announce/useAnnonce.ts` — l'état d'annonce, ses sept origines et la détection des deux transitions — jusqu'à faire passer T061 et T062
- [X] T065 [US4] Écrire `apps/game/src/features/announce/releve.ts` — la phrase d'état courant, fonction pure, portant le **jeton d'unicité** d'INV-N3a : un compteur d'appuis tenu **hors du texte lu**, qui rend deux énoncés successifs distincts pour la région `aria-live` sans ajouter un mot au relevé ni un bruit à l'écran — jusqu'à faire passer T060
- [X] T065a *(ajoutée le 2026-08-28, sur constat de la porte 8)* Réserver le **jeton d'unicité à l'origine `releve`**. La première rédaction l'appliquait à la région entière : une rotation de carré de quatre — dont l'orientation perçue et le verdict de placement ne changent pas — produisait alors une réénonciation silencieuse, un caractère de largeur nulle de différence. FR-023a porte sur *le relevé*, et rien n'exige des six autres origines qu'elles réénoncent un contenu inchangé. **Attrapé par un parcours de 001**, écrit pour une exigence de 001
- [X] T066 [US4] Faire de `apps/game/src/features/grid/GridLiveRegion.tsx` la région **unique** de l'écran, alimentée par `useAnnonce` plutôt que par le seul curseur
- [X] T067 [US4] **Retirer** la seconde région polie de `apps/game/src/features/work/BuildPanel.tsx` (le `<p role="status">` de la ligne 359) et faire porter son message par l'annonce unique, jusqu'à faire passer T059 ; mettre à jour `apps/game/tests/features/work/build-panel.test.tsx` en conséquence, **d'abord**
- [X] T068 [US4] Ajouter le bouton **Relevé** (`Relevé` en étroit, `Relevé complet` en large) à la barre d'actions de `apps/game/src/routes/planet.tsx`, câblé sur `releve.ts` et l'annonce unique
- [X] T069 [US4] Brancher les origines `pose-acceptee`, `pose-refusee`, `entree-grille` et `curseur` depuis `apps/game/src/routes/planet.tsx` sur `useAnnonce`, sans que la progression des compteurs y touche jamais

**Checkpoint** : une seule voix polie sur l'écran, et le joueur peut lui demander
l'état courant quand il le veut.

---

## Phase 7: User Story 5 — L'interface se corrige devant le joueur (Priority: P2)

**Goal** : la rature, avec le balisage exact — le visuel masqué, une phrase
explicite à côté.

**Independent Test** : provoquer un changement de valeur, vérifier que le visuel
rayé est ignoré des technologies d'assistance et qu'une phrase explicite porte
l'information complète.

### Tests pour US5 — écrits d'abord ⚠️

- [X] T070 [P] [US5] Écrire `apps/game/tests/features/regie/use-rature.test.tsx` : `useRature` rend `{ courante, ancienne: null }` tant que rien n'a changé, retient la **dernière valeur différente** au changement, et repart de `null` au démontage (§ 5.3 de [data-model.md](./data-model.md))
- [X] T071 [P] [US5] Écrire `apps/game/tests/features/regie/rature.test.tsx` : le balisage du § 5 du contrat d'interface — le visuel rayé **entièrement** `aria-hidden` et absent du nom accessible calculé du bloc, une phrase `.sr-only` du type « Niveau 3, anciennement niveau 2. », et **jamais** d'`aria-label` sur un `<p>` ou un `<span>` sans rôle (INV-R1 à INV-R3). C'est la moitié mécanisable de **SC-007** : le nom accessible calculé ne doit **jamais** contenir les deux valeurs collées. L'autre moitié — ce qu'une synthèse vocale prononce réellement — est la recette du [quickstart § 7](./quickstart.md), conduite en T105a
- [X] T072 [US5] *(même fichier que T071, donc après elle et sans `[P]`)* Ajouter à `apps/game/tests/features/regie/rature.test.tsx` : aucune rature quand la valeur n'a pas changé (US5-AC2), **deux ratures simultanées** portant chacune sa phrase, dans l'ordre du document (INV-R5), et **aucune minuterie ne retire une rature** — après avoir avancé l'horloge de test bien au-delà de toute durée d'affichage plausible, la rature est toujours là, et elle ne disparaît qu'au changement suivant de la même valeur (FR-026a)
- [X] T073 [US5] *(`comptoir.test.tsx` est déjà écrit par T023 en US1 : pas de `[P]`, et à mener après elle)* Écrire dans `apps/game/tests/features/regie/comptoir.test.tsx` que la **quantité détenue n'est jamais suivie** — seuls le niveau d'un bâtiment, le débit horaire et le plafond de stockage le sont (FR-029a, § 5.2 de [data-model.md](./data-model.md))

### Implémentation de US5

- [X] T074 [US5] Écrire `apps/game/src/features/regie/useRature.ts` — la référence mise à jour dans un effet, jamais pendant le rendu (R13), **et aucune minuterie** : les deux seules sorties sont le changement suivant de la même valeur et le démontage (FR-026a) — jusqu'à faire passer T070 et T072
- [X] T075 [US5] Écrire `apps/game/src/features/regie/Rature.tsx` — le balisage exact du dossier de design, et pas un autre : l'ancienne valeur barrée à côté de la nouvelle (FR-026), le visuel masqué et la phrase explicite (FR-027), l'ancienne valeur étant **celle que le client affichait** et rien de persisté (FR-029) — jusqu'à faire passer T071 et T072
- [X] T076 [US5] Ajouter la règle `.rature` à `apps/game/src/design/regie.css` : trait en enfant absolu qui dépasse et penche (jamais un `text-decoration`), opacité plancher de 0,72 mesurée à 5,66:1 sur papier (FR-028, INV-R4)
- [X] T077 [US5] Appliquer la rature au **niveau d'un bâtiment** dans `apps/game/src/features/regie/PlaqueChantier.tsx`, au **débit horaire** et au **plafond de stockage** dans `apps/game/src/features/regie/Comptoir.tsx`, jusqu'à faire passer T073

**Checkpoint** : une valeur qui change se corrige devant le joueur, et un lecteur
d'écran énonce la bonne.

---

## Phase 8: User Story 6 — Le guichet, sur grand écran (Priority: P2)

**Goal** : trois colonnes au-delà d'un palier unique, l'ordre du document
inchangé, et 44 px de côté par case jusqu'à 320 px.

**Independent Test** : afficher l'écran à 1180 px et vérifier la disposition en
trois colonnes, puis réduire jusqu'à 320 px en vérifiant qu'il n'existe qu'un
seul palier de bascule et aucun débordement.

### Tests pour US6 — écrits d'abord ⚠️

- [X] T078 [US6] *(`ordre-du-document.test.tsx` est déjà écrit par T021 en US1 : pas de `[P]`, et à mener après elle)* Écrire dans `apps/game/tests/features/regie/ordre-du-document.test.tsx` que l'ordre des nœuds est **le même** quelle que soit la largeur : le guichet déplace des boîtes par zones de grille nommées, jamais par `order` (R10, FR-007)
- [X] T079 [P] [US6] Écrire `apps/game/tests/features/regie/registre.test.tsx` : le registre énumère les **possessions réelles** — une seule en 001, la planète courante — et son entrée active **n'est pas un lien** (INV-P1, INV-P2, FR-025)
- [X] T080 [P] [US6] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` le cas **1180 px** : trois colonnes — registre et légende, plan, comptoir et chantier —, l'en-tête sur toute la largeur, et aucun contenu perdu (US6-AC1)
- [X] T081 [P] [US6] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` le cas **320 × 640 px** (SC-001, FR-014, INV-C2) : les cases toutes visibles sans défilement ni zoom, **chaque case au moins 44 px de côté et carrée** mesurée sur la boîte rendue, et aucune barre de défilement horizontale
- [X] T082 [P] [US6] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` le cas **zoom texte 200 %** (SC-002, FR-034) : les tailles calculées ont bien **doublé** — ce qui distingue une échelle en `rem` d'une échelle figée —, aucun bloc ne déborde, aucun texte n'est tronqué, et les silhouettes gardent leur proportion dans la case
- [X] T083 [P] [US6] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` que le palier de bascule est **unique** : à 899 px la colonne est unique, à 901 px le guichet est en place, et aucune autre largeur ne change la disposition (US6-AC2)

### Implémentation de US6

- [X] T084 [US6] Écrire `apps/game/src/features/regie/Registre.tsx` — les possessions réelles, l'entrée active désignant l'écran courant sans être un lien —, jusqu'à faire passer T079
- [X] T085 [US6] Ajouter le guichet à `apps/game/src/design/parcelle.css` : palier **unique** à 900 px, grille `268px 1fr 320px` par `grid-template-areas`, en-tête sur toute la largeur, la légende passant dans la colonne de gauche **sans changer sa position dans le document** — jusqu'à faire passer T078, T080 et T083
- [X] T086 [US6] Appliquer le budget de largeur de R9 dans `apps/game/src/design/tokens.css` et `apps/game/src/design/parcelle.css` : sous 360 px, rembourrages, encadrement, gouttières et bandes se resserrent selon la table chiffrée, les bandes de coordonnées **restant affichées** — jusqu'à faire passer T081
- [X] T087 [US6] Vérifier dans `apps/game/src/design/parcelle.css` et `apps/game/src/design/regie.css` que rien n'empêche le renvoi à la ligne — « Bave d'étoiles » sur deux lignes plutôt que tronqué, aucune étiquette en `text-overflow: ellipsis`, aucun `white-space: nowrap` sur un texte long — jusqu'à faire passer T082
- [X] T088 [US6] Monter `Registre` et `Legende` dans `apps/game/src/routes/planet.tsx`, après la mention finale, dans l'ordre du § 1 du contrat d'interface

**Checkpoint** : les six histoires tiennent, aux trois largeurs, sans qu'aucune
n'ait cassé les précédentes.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose** : les portes qui mesurent l'écran entier, les quatre documents à
amender, et les **quatre** verdicts humains à consigner.

### Les portes de bout en bout

- [X] T089 [P] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` l'audit d'accessibilité aux **trois largeurs éprouvées** — 320 px, 430 px et 1180 px — via `apps/game/tests/e2e/axe.ts`, sur `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, **aucune règle désactivée** (SC-004, SC-005 amendés). Le 320 px n'était pas audité : c'est pourtant la largeur que SC-001 rend normative et **celle où le budget de R9 resserre rembourrages, encadrement et gouttières** pour tenir les 44 px de côté. La largeur la plus exposée à une régression de contraste ou de cible était la seule à échapper à la mesure
- [X] T090 [P] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` la mesure du **plancher typographique par rôle** aux trois largeurs : la taille **calculée** de chaque nœud de texte est comparée au plancher de son `data-role-texte`, un nœud non marqué étant **présumé porteur d'information** — l'oubli échoue du côté exigeant (FR-039, § 8 du contrat d'interface)
- [X] T091 [P] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` le cas **mouvement réduit** (SC-010) : sous émulation de `prefers-reduced-motion: reduce`, aucune durée calculée d'animation ni de transition n'excède 1 ms, **et le tampon d'état apparaît quand même**
- [X] T092 [P] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` le cas **aucune requête sortante** (SC-008) : toutes les requêtes sont interceptées et leur origine comparée à celles de la pile locale, polices comprises
- [X] T093 Compiler le client et constater qu'aucune occurrence de `fonts.googleapis.com` ni de `fonts.gstatic.com` n'apparaît dans `apps/game/dist/**` (quickstart § 8) ; consigner la sortie
- [X] T094 [P] Écrire dans `apps/game/tests/e2e/us9-regie.spec.ts` que la mise en page **ne se disloque pas** quand les quatre familles de police sont neutralisées — le cas limite est nommé par la spécification, et chaque famille a sa pile de repli

### Les documents à amender

- [X] T095 [P] Documenter l'angle mort de FR-035 dans `apps/game/src/features/rules/RulesContent.tsx` : sous protanopie, le refus se rapproche de la teinte de la Camelote, l'état restant identifiable par sa silhouette mais alertant faiblement
- [X] T096 [P] Amender le § 10 de `docs/design/conception-du-jeu.md` : 002 devient La Régie approximative, le système solaire devient 003, les quatre suivantes se décalent, les motifs d'ordre restant inchangés (R18)
- [X] T097 [P] Reporter les quatre `@fontsource/*` en 5.3.0 au § 8 « Versions épinglées » de `docs/architecture/2026-08-23-choix-de-stack.md`
- [X] T098 [P] Amender le § « État du dépôt » de `CLAUDE.md` : `apps/game` gagne `design/`, le dossier de design est archivé sous `docs/design/2026-08-27-regie-approximative/`

### Le nettoyage, et la preuve que rien n'a bougé ailleurs

- [X] T099 Réduire `apps/game/src/styles.css` à ce que 002 ne reprend pas, corriger le commentaire qui invoque les 16 px pour le corps de texte (R14), et retirer les règles devenues mortes — en constatant qu'aucun parcours de 001 ne casse
- [X] T100 Constater que `git diff --stat main -- packages/ apps/api/` rend une sortie **vide** (SC-012), et que `pnpm -w test --project domain --project contracts --project db --project api` rend le même résultat qu'avant la tranche
- [X] T101 Constater que `pnpm -w test:coverage` et `pnpm -w test:integration` rendent des résultats **identiques** à ceux d'avant la tranche — les portes 5 et 6 mesurent des paquets que 002 ne touche pas (quickstart § 1)
- [X] T102 Faire verdir les **dix commandes** de [`quickstart.md § 1`](./quickstart.md) dans l'ordre — c'est-à-dire les **onze portes de CI**, dont l'audit de vulnérabilités et la fuite de secrets qu'aucun test ne porte —, en vérifiant que `boundaries` annonce un **nombre non nul** de modules et que les deux portes ajoutées annoncent un nombre non nul de clés et de fichiers. `pnpm audit --audit-level moderate` **doit être exécuté** : T001 ajoute quatre dépendances, la constitution fait de cet audit une porte bloquante, et la liste précédente de « huit portes » ne le contenait pas — une tranche qui ajoute des dépendances se serait déclarée close sans jamais les auditer

### Les quatre verdicts humains

- [ ] T103 [P] Conduire la recette de [`quickstart.md § 10.1`](./quickstart.md) (SC-003) : les douze états en niveaux de gris, nommés par une personne extérieure au projet, la seule légende sous les yeux ; consigner combien sont nommés sans erreur, lesquels ont hésité, et sur quoi
- [ ] T104 [P] Conduire la recette de [`quickstart.md § 10.2`](./quickstart.md) (SC-009 de 002) : le mode contrastes forcés **réel** du système ; consigner que les aplats et les ombres ont disparu et que les silhouettes subsistent
- [ ] T105 [P] Conduire la recette de [`quickstart.md § 10.3`](./quickstart.md) (SC-011) : les matrices de protanopie et de deutéranopie appliquées, les douze états parcourus deux à deux ; consigner tout couple devenu confusable, le cas connu de FR-035 excepté
- [ ] T105a [P] Conduire la recette de [`quickstart.md § 7`](./quickstart.md) (**SC-007**) : provoquer une amélioration, attendre son achèvement, et écouter la rature à **VoiceOver puis NVDA** ; consigner ce qui a été entendu, sur quel lecteur d'écran et sur quelle valeur. Le balisage est mécanisé par T071 ; **ce qu'une synthèse vocale prononce réellement ne l'est pas**, et c'est le seul point du système dont la casse produit une valeur **fausse** — « niveau 2 3 » — plutôt qu'une gêne. SC-007 n'avait aucune tâche : sa moitié humaine avait sa recette écrite et personne pour la conduire
- [X] T106 Conduire la relecture de [`quickstart.md § 12`](./quickstart.md) contre les cinq principes de la constitution, et consigner le verdict dans la description de la demande de fusion

---

## Dependencies & Execution Order

### Dépendances de phase

- **Setup (Phase 1)** : aucune dépendance — commence immédiatement
- **Foundational (Phase 2)** : dépend du Setup — **bloque toutes les histoires**
- **US1 à US6 (Phases 3 à 8)** : dépendent de la phase Foundational
- **Polish (Phase 9)** : dépend des six histoires

### Dépendances entre histoires

- **US1 (P1)** — aucune dépendance sur une autre histoire. C'est le MVP.
- **US2 (P1)** — indépendante d'US1 ; toutes deux consomment `Glyphe` (T015) et
  l'adresse (T018), livrés en phase Foundational.
- **US3 (P1)** — s'appuie sur les crochets `data-*` de T042 pour ses assertions
  de nom accessible, et **T050 écrit `grid-view.test.tsx`, que T038, T040 et
  T040a ont ouvert en US2** : la mener après elles, ou accepter une résolution
  de conflit. La dépendance reste de **test**, non de production : `refusal.ts`
  (T054) s'écrit et s'éprouve seul.
- **US4 (P2)** — T067 touche `BuildPanel`, dont US1 réordonne le montage (T033).
  Les deux se croisent dans `planet.tsx` : les mener en séquence, ou accepter une
  résolution de conflit.
- **US5 (P2)** — T077 applique la rature à `PlaqueChantier` et `Comptoir`, livrés
  par US1. À mener après US1.
- **US6 (P2)** — T085 étend `parcelle.css`, écrit par US1 et complété par US2.

### À l'intérieur de chaque histoire

- Les tests sont écrits **et vus en échec** avant l'implémentation (principe III)
- Les fonctions pures avant les composants ; les composants avant leur montage
  dans `planet.tsx`
- Aucune histoire n'est déclarée close avant que son *Independent Test* soit
  conduit

### Occasions de parallélisme

- T002, T003 et T005 en Setup
- **Les quatre tests de porte de la phase Foundational** — T007 à T010 — portent
  sur quatre fichiers distincts et s'écrivent ensemble
- T014 et T016 en parallèle des portes du jeu de valeurs
- Les blocs de test de chaque histoire, **à l'exception des tâches qui écrivent
  un fichier déjà écrit par une autre** — corrigé le 2026-08-28, six couples
  avaient gardé `[P]` sur un fichier partagé :

  | Fichier | Tâches qui l'écrivent | Ce qui s'applique |
  | --- | --- | --- |
  | `tokens.test.ts` | T007 → T008 | T008 sans `[P]` |
  | `appearance.test.ts` | T035 → T036 | T036 sans `[P]` |
  | `grid-view.test.tsx` | T038 → T040 → T040a → T050 | seule T038 garde `[P]` ; T050 traverse en plus la frontière US2 → US3 |
  | `annonce.test.ts` | T061 → T062 | T062 sans `[P]` |
  | `rature.test.tsx` | T071 → T072 | T072 sans `[P]` |
  | `comptoir.test.tsx` | T023 (US1) → T073 (US5) | T073 sans `[P]` |
  | `ordre-du-document.test.tsx` | T021 (US1) → T078 (US6) | T078 sans `[P]` |
  | `us9-regie.spec.ts` | T040b, T047, T053, T053a, T063, T080 à T083, T089 à T092, T094 | les écrire ensemble, les valider en séquence |

- T027, T028 et T029 en US1 : trois composants, trois fichiers
- En Polish : T089 à T094 sont six cas d'un même fichier — les écrire ensemble,
  les valider en séquence ; T095 à T098 touchent quatre documents distincts ;
  T103 à T105a sont quatre recettes indépendantes

---

## Parallel Example: User Story 2

```bash
# Quatre fichiers distincts, donc quatre tâches réellement parallèles :
Task: "T035 appearance.test.ts — les douze états de la table de R6"
Task: "T037 planet-douze-etats.json — la parcelle de recette"
Task: "T038 grid-view.test.tsx — les crochets data-* de 002"
Task: "T039 legende.test.tsx — douze entrées, chacune sa silhouette"
Task: "T040b us9-regie.spec.ts — la silhouette à 35–40 % de la case"

# Puis, en séquence sur les fichiers déjà ouverts — ce que l'exemple
# précédent proposait à tort de mener en parallèle :
#   T036 dans appearance.test.ts, après T035
#   T040 puis T040a dans grid-view.test.tsx, après T038

# Puis l'implémentation, en séquence : appearance.ts avant GridView,
# GridView avant Legende — la légende compare ses entrées à l'union.
```

---

## Implementation Strategy

### MVP d'abord (US1 seule)

1. Phase 1 : Setup — les polices, le dossier rangé
2. Phase 2 : Foundational — **critique**, bloque tout le reste
3. Phase 3 : US1
4. **ARRÊT et VALIDATION** : ouvrir l'écran à 430 px, constater les sept blocs
   dans l'ordre, chacun délimité, aucun chiffre sur un aplat
5. L'écran a une identité. C'est déjà la raison d'être de la tranche.

### Livraison incrémentale

1. Setup + Foundational → le jeu de valeurs est tenu par deux portes
2. + US1 → l'écran se lit d'un coup d'œil **(MVP)**
3. + US2 → il se lit sans distinguer les couleurs
4. + US3 → un refus dit toujours pourquoi
5. + US4 → une seule voix, et un relevé à la demande
6. + US5 → les valeurs qui changent se corrigent devant le joueur
7. + US6 → le guichet sur grand écran
8. + Polish → les portes de l'écran entier, les quatre documents, les **quatre**
   verdicts humains

Les trois histoires **P1** — US1, US2, US3 — sont la livraison minimale
défendable : sans US2, la refonte serait une **régression d'accessibilité** par
rapport à 001, dont les caractères `▓ ■ · ◆` se lisaient en noir et blanc.

### Stratégie d'équipe

Après la phase Foundational, US1, US2 et US3 se mènent en parallèle par trois
personnes — leurs fichiers de production ne se croisent que dans
`apps/game/src/routes/planet.tsx`, dont le montage est la dernière tâche de
chacune. US4 à US6 suivent, dans cet ordre, pour les motifs de la section
« Dépendances entre histoires ».

---

## Notes

- `[P]` = fichiers distincts, aucune dépendance
- Le libellé `[Story]` rattache chaque tâche à son histoire — c'est la
  traçabilité que le principe I exige
- **Vérifier que le test échoue avant d'implémenter.** Sur un habillage, c'est le
  point où la discipline se perd : un test de rendu écrit après le composant
  passe toujours, et ne prouve rien
- Livrer par tâche ou par groupe cohérent
- **La colonne de « rien »** — `catalogs`, `domain`, `contracts`, `db`, `api` —
  est le résumé le plus exact de la tranche. Si un fichier y apparaît dans le
  diff, la question n'est pas « est-ce grave » mais « pourquoi »
- Les deux portes ajoutées doivent constater **avoir lu quelque chose** : une
  porte qui parcourt zéro entrée et sort en succès est pire qu'une porte absente
  (amendement 2.1.0 de la constitution)
