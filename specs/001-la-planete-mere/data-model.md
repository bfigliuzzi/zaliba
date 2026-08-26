# Phase 1 — Modèle de données : La planète mère

**Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md) ·
**Décisions** : [research.md](./research.md)

Ce document décrit **trois modèles distincts**, et la distinction est
intentionnelle :

1. le **modèle de domaine** — les types du noyau, sans framework, sans base ;
2. le **modèle de persistance** — les tables, qui en découlent sans s'y confondre ;
3. le **modèle de contrat** — décrit à part dans
   [contracts/v1-planet.md](./contracts/v1-planet.md), et **redéclaré** plutôt que
   réexporté.

Le troisième point n'est pas un oubli de factorisation. Le document de stack §3 en
fait une règle : si le contrat réexportait le domaine, une refactorisation interne
changerait silencieusement le format transmis et casserait les clients anciens
sans qu'aucune compilation n'échoue. La duplication est ici ce qui rend la rupture
visible.

Identifiants en anglais, identifiants de contenu de jeu en kebab-case français
(R18).

---

## 1. Le modèle de domaine

### 1.1 Grandeurs de base

| Type | Représentation | Invariant |
| --- | --- | --- |
| `Instant` | entier de secondes UTC | ≥ 0 |
| `Duration` | entier de secondes | > 0 pour un chantier |
| `Grains` | entier — `1 grain = 1/3600 unité` (R1) | ≥ 0 |
| `RatePerHour` | entier d'unités par heure (R1, R5) | ≥ 0 |
| `Orientation` | `0`, `1`, `2` ou `3` quarts de tour horaires | — |
| `Cell` | `{ x, y }`, origine en haut à gauche | dans les bornes de la grille |

Les identifiants (`ResourceId`, `BuildingTypeId`, `FootprintId`, `ObstacleId`,
`LayoutId`, `ArchetypeId`, `CurveId`) sont des **unions littérales dérivées du
catalogue**. Conséquence recherchée (doc de stack §5.1) : ajouter une ressource
fait échouer la compilation partout où un traitement exhaustif l'a oubliée.

### 1.2 L'instantané daté — ce qui est persisté

C'est le **seul** état qui existe en base. Il ne contient aucune valeur dérivable.

```
PlanetSnapshot
  planetId       PlanetId
  ownerId        PlayerId          — le propriétaire
  occupantId     PlayerId          — l'occupant courant, notion distincte (FR-006)
  archetypeId    ArchetypeId       — 'berceau' en 001
  layoutId       LayoutId          — 'berceau-v1', renvoie au catalogue (FR-003)
  consolidatedAt Instant           — l'instant du dernier écrit
  holdings       Map<ResourceId, { amount: Grains, lost: Grains }>
  buildings      PlacedBuilding[]
  clearedCells   Cell[]            — les cases déblayées, par écart au catalogue
  work           ScheduledWork | null

PlacedBuilding
  id           BuildingId
  typeId       BuildingTypeId
  variantId    FootprintId         — figée à la pose (FR-010)
  orientation  Orientation         — figée à la pose (FR-010)
  anchor       Cell                — coin haut-gauche de l'empreinte normalisée
  level        int ≥ 1

ScheduledWork
  id         WorkId
  nature     'build' | 'upgrade' | 'demolish' | 'clear'
  target     BuildTarget | BuildingRef | CellRef
  startedAt  Instant
  dueAt      Instant
```

**Ce qui est délibérément absent de l'instantané**, parce que dérivable :

| Absent | Dérivé de |
| --- | --- |
| les cases occupées d'un bâtiment | `variantId` + `orientation` + `anchor` (R6) |
| le coût cumulé d'un bâtiment | son niveau + la courbe de coût (R9) |
| les gisements de la planète | la disposition du catalogue + `clearedCells` |
| l'état obstrué d'une case | la disposition du catalogue + `clearedCells` |
| les plafonds de stockage | les entrepôts posés + la capacité de base |
| les taux de production, l'énergie | les bâtiments + les courbes |
| la quantité *courante* de ressource | `holdings` + `consolidatedAt` + les taux + l'instant demandé |

### 1.3 L'état projeté — ce qui est calculé

```
project(snapshot, catalogs, at: Instant) -> ProjectedState
```

Fonction **pure**. `at` est un argument, jamais un appel d'horloge. Une demande
avec `at < consolidatedAt` est une **erreur de programmation**, pas un cas de jeu :
la projection ne remonte pas le temps.

```
ProjectedState
  at        Instant
  holdings  Map<ResourceId, {
              amount        Grains        — plafonné
              lost          Grains        — cumulé (FR-026)
              cap           Grains        — base du Berceau + entrepôts (FR-025)
              rate          RatePerHour   — effectif, énergie appliquée
              nominalRate   RatePerHour   — avant énergie (FR-024)
              saturationAt  Instant | null — null si taux nul ou déjà saturé (FR-027)
            }>
  energy    { produced, consumed, ratio: { numerator, denominator } }   (FR-021..024)
            — `produced` somme l'énergie de base du Berceau et les centrales (FR-022) ;
              `consumed` somme tous les bâtiments sauf la centrale, entrepôt compris ;
              le rapport ne multiplie que des taux de production (FR-023b, R21)
  grid      CellView[]   — 36 vues : libre / obstruée / occupée, gisement, obstacle
  buildings (PlacedBuilding & { cells, coveredDeposits, nominalRate, effectiveRate })[]
  work      (ScheduledWork & { remaining: Duration }) | null
  catalogVersion string
```

**Segmentation.** Si `work` est échu avant `at`, la projection calcule en **deux
segments** — `[consolidatedAt, dueAt)` aux anciens taux, puis `[dueAt, at)` aux
nouveaux — et applique les effets d'achèvement à `dueAt` (R3, FR-032). Un seul
chantier pouvant être actif (FR-033), il n'y a jamais plus de deux segments.

**Le calcul par segment**, par ressource (R4) :

```
brut  = amount + rate × secondes
amount = min(brut, cap)
lost  += max(0, brut − cap)
```

### 1.4 La grille et les empreintes

```
orientedCells(variantId, orientation) -> Cell[]        — précalculé (R6)
placementCells(variantId, orientation, anchor) -> Cell[]
validatePlacement(grid, cells) -> Ok | PlacementRefusal
```

`PlacementRefusal` est une **union fermée**, parce que FR-013 exige le motif exact
et non un booléen :

| Motif | Signification |
| --- | --- |
| `out-of-grid` | au moins une case sort de la grille |
| `obstructed` | au moins une case est obstruée — les cases fautives sont énumérées |
| `occupied` | au moins une case porte déjà un bâtiment — idem |

La contiguïté n'est jamais à vérifier : les sept empreintes du vocabulaire sont
contiguës par définition, et une translation conserve la contiguïté.

### 1.5 La forme unique d'une commande

Document de stack §5.3 — un module ne mute rien :

```
decide(state: ProjectedState, command: Command, catalogs) -> Result<Effect[], Refusal>
apply(snapshot, effects: Effect[], at: Instant) -> PlanetSnapshot
```

`Command` est une union fermée de quatre intentions, et **rien d'autre** ne peut y
figurer :

| Commande | Charge |
| --- | --- |
| `build` | `typeId`, `variantId`, `orientation`, `anchor` |
| `upgrade` | `buildingId` |
| `demolish` | `buildingId` |
| `clear` | `cell` |

Aucune de ces charges ne contient de coût, de durée, de production ni de résultat :
elles n'ont **pas de champ** pour les porter (FR-055, FR-056, doc de stack §6.3).

`Effect` est l'union fermée détenue par le noyau (R16) : `debit-resources`,
`credit-resources`, `place-building`, `set-building-level`, `remove-building`,
`clear-cell`, `schedule-work`.

Les effets d'un chantier **ne sont pas sérialisés en base**. Ils sont redérivés à
l'achèvement par `effectsOnCompletion(work, snapshotAtDue, catalogs)`, ce qui les
rend déterministes et re-calculables — et évite qu'une charge d'effets stockée
devienne une surface de confiance.

### 1.6 L'aperçu

```
preview(state, command, catalogs) -> Result<Preview, Refusal>

Preview
  cost              Map<ResourceId, Grains>
  duration          Duration
  dueAt             Instant
  shortfall         Map<ResourceId, Grains> | null      — (FR-035, SC-007)
  secondsUntilAffordable  Duration | null               — (US4 scénario 3)
  effect            union discriminée selon la nature :
    build     { coveredDeposits, nominalRate, effectiveRate, energyAfter }
    upgrade   { cellsUnchanged: true, rateBefore, rateAfter, delta, energyAfter }
    demolish  { refund, clippedAmount, cellsFreed, depositsPreserved }
    clear     { reveals: 'bare-ground' | { depositOf: ResourceId } }
```

Calculé par le client comme par le serveur, avec le même code (R8). C'est ce qui
satisfait FR-050 et FR-051 sans aller-retour réseau.

### 1.7 Les invariants — la liste des tests de propriété

Ces énoncés ne sont pas des commentaires : ils deviennent des tests fast-check,
et ce sont eux qui portent la valeur de la tranche.

| # | Invariant | Exigence servie |
| --- | --- | --- |
| I-1 | `0 ≤ amount ≤ cap`, pour toute suite de commandes légales | FR-025, FR-026 |
| I-2 | `project(t₀→t₁→t₂)` = `project(t₀→t₂)`, **quantité et perte cumulée** | SC-003, R4 |
| I-3 | Dépenser puis projeter = projeter puis dépenser, au même instant | doc de stack §7.1 |
| I-4 | **Aucune suite de commandes légales ne crée de ressource à partir de rien** | garde-fou anti-exploit |
| I-5 | Les cases de deux bâtiments d'une même planète sont disjointes | FR-012 |
| I-6 | Aucune suite de rotations ne produit le miroir d'une empreinte chirale — `l-4` est la seule du vocabulaire | FR-011 |
| I-7 | Une amélioration laisse l'ensemble des cases occupées identique | FR-039, US4-1 |
| I-8 | Une case déblayée ne redevient jamais obstruée | FR-045 |
| I-9 | Au plus un chantier non résolu par planète | FR-033 |
| I-10 | La production reste strictement positive depuis un état vide | FR-018, US1-6 |
| I-11 | `project` ne dépend d'aucune horloge : deux appels au même `at` sont égaux | FR-031, constitution |
| I-12 | Un extracteur ne recouvrant aucun gisement produit zéro | FR-017, US2-4 |
| I-13 | La production d'un extracteur est proportionnelle aux gisements recouverts | FR-017, US2-3 |

### 1.8 Tests de cohérence de catalogue

Les données de jeu se **valident**, elles ne se testent pas au sens habituel (doc
de stack §7.2). Ces contrôles sont l'autorité sur les exigences de disposition :

| Contrôle | Exigence |
| --- | --- |
| La disposition du Berceau compte 36 cases, 10 obstruées, 26 libres | FR-002, FR-004 |
| Elle porte exactement un gisement de chacune des trois ressources | FR-004 |
| **Chacune des sept empreintes admet au moins un placement valide** | FR-005 |
| **Chaque extracteur admet un placement recouvrant le gisement de sa ressource** | FR-005 |
| Chaque case obstruée porte un type d'obstacle existant | FR-042 |
| Une case porte au plus un gisement, et d'une seule ressource | FR-015 |
| L'énergie de base du Berceau est non nulle | FR-022 |
| Le catalogue n'impose aucune limite d'exemplaires par type sur une planète | FR-014 |
| Chaque type porte un niveau maximal, une durée de démolition et une fraction de remboursement | FR-040, FR-046 |
| Les variantes d'un même type ont la même surface et des courbes identiques | FR-009 |
| Le stock de départ couvre une centrale et un extracteur de niveau 1 | FR-019 |
| **Aucun coût du catalogue n'est libellé en Jus** | FR-062, R22 |
| Tout type sauf la `centrale` porte une courbe de consommation d'énergie | FR-022, R21 |
| La production de base du Berceau est non nulle pour les trois ressources | FR-018 |
| La capacité de base du Berceau est non nulle pour les trois ressources | FR-025 |
| Les coûts sont strictement croissants avec le niveau | doc de stack §7.2 |
| Tout identifiant référencé existe ; aucun orphelin, aucun doublon | doc de stack §7.2 |
| Instantané d'équilibrage des coûts, durées et productions, niveaux 1 à 30 | doc de stack §7.2 |

---

## 2. Le modèle de persistance

Schéma **`game`**, délibérément **absent des schémas exposés** de PostgREST (doc de
stack §6.1). RLS activée sur toutes les tables, **refus par défaut**, aucune
politique permissive : deuxième ligne de défense en cas d'exposition accidentelle.

`owner_id` et `occupant_id` portent des identifiants issus de `auth.users`, **sans
clé étrangère** vers ce schéma géré par le fournisseur. Contrepartie assumée :
aucune suppression en cascade depuis la suppression d'un compte, à traiter comme
une opération explicite le jour où elle existera.

### `game.planets`

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | uuid | clé primaire |
| `owner_id` | uuid | non nul, **unique** — une planète par joueur en 001 (R11) |
| `occupant_id` | uuid | non nul, indexé |
| `archetype_id` | text | non nul |
| `layout_id` | text | non nul |
| `consolidated_at` | timestamptz | non nul |

L'unicité sur `owner_id` est ce qui rend `POST /v1/me/planet` idempotente sous
concurrence.

### `game.planet_resources`

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `planet_id` | uuid | clé primaire composée, référence `planets` |
| `resource_id` | text | clé primaire composée |
| `amount_grains` | bigint | non nul, `≥ 0` |
| `lost_grains` | bigint | non nul, défaut 0, `≥ 0` |

Une ligne par ressource, jamais une colonne par ressource : les ressources sont des
données déclaratives (doc de conception §1), donc tout renommage ou ajout reste
sans coût de migration.

`bigint` en base, converti en `number` à la frontière de `packages/db` avec une
**assertion de sûreté** — les grains restent très loin de `2⁵³` aux échelles du jeu,
et l'assertion transforme un dépassement futur en erreur bruyante.

### `game.buildings`

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | uuid | clé primaire |
| `planet_id` | uuid | non nul, référence `planets`, indexé |
| `type_id` | text | non nul |
| `variant_id` | text | non nul |
| `orientation` | smallint | non nul, `entre 0 et 3` |
| `anchor_x`, `anchor_y` | smallint | non nuls, `≥ 0` |
| `level` | integer | non nul, `≥ 1` |

Ni coût cumulé (R9), ni cases occupées : dérivés.

### `game.building_cells`

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `planet_id` | uuid | **clé primaire composée** |
| `x`, `y` | smallint | **clé primaire composée** |
| `building_id` | uuid | non nul, référence `buildings`, suppression en cascade |

Table **dérivée**, écrite dans la même transaction que `buildings`. Sa clé
primaire rend la superposition de deux bâtiments impossible à écrire — pas
seulement interdite (R10). Redondance enregistrée en « Complexity Tracking » du
plan.

### `game.cleared_cells`

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `planet_id` | uuid | clé primaire composée, référence `planets` |
| `x`, `y` | smallint | clé primaire composée |
| `cleared_at` | timestamptz | non nul |

L'état obstrué d'une case est donc *disposition du catalogue moins ces lignes*.
Aucune table de 36 lignes par planète, et une case déblayée ne peut pas redevenir
obstruée : il n'existe aucun chemin d'écriture pour cela (I-8).

### `game.works`

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | uuid | clé primaire |
| `planet_id` | uuid | non nul, référence `planets` |
| `nature` | text | non nul, `parmi build, upgrade, demolish, clear` |
| `started_at`, `due_at` | timestamptz | non nuls, `due_at > started_at` |
| `resolved_at` | timestamptz | nullable |
| `target_building_id` | uuid | nullable |
| `target_x`, `target_y` | smallint | nullables |
| `type_id`, `variant_id` | text | nullables |
| `orientation` | smallint | nullable, `entre 0 et 3` |

Deux contraintes portent des règles de jeu, et non de la validation défensive :

- **`unique (planet_id) where resolved_at is null`** — FR-033 devient une
  contrainte de base. Deux vues du jeu ouvertes simultanément ne peuvent pas
  lancer deux chantiers : la seconde transaction échoue, et le refus renvoyé est
  `work-in-progress`. C'est exactement le cas limite « deux vues ouvertes » de la
  spécification, traité par la base plutôt que par un raisonnement.
- une contrainte de cohérence liant `nature` aux colonnes de cible renseignées :
  un `clear` porte une case et rien d'autre, un `build` porte type, variante,
  orientation et ancre.

Les lignes résolues **restent** : elles sont l'histoire de la planète, et le
support d'une enquête ultérieure.

### `game.command_receipts`

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `player_id` | uuid | clé primaire composée |
| `idempotency_key` | text | clé primaire composée |
| `response` | jsonb | non nul — la réponse à rejouer |
| `created_at` | timestamptz | non nul |

Doc de stack §6.4 : la cible est une application mobile sur réseau instable ; une
requête réémise ne doit jamais dépenser deux fois. La seconde tentative retourne
le premier résultat, à l'identique.

### La forme unique de toute mutation

Doc de stack §4.5, sans exception et dans une seule transaction :

```
verrouiller la planète (SELECT … FOR UPDATE)
  → vérifier l'autorisation sur l'état verrouillé  (FR-007)
  → résoudre le chantier échu, s'il y en a un      (FR-032)
  → projeter à l'instant de transaction            (now() de PostgreSQL)
  → decide() : le domaine dit oui ou non           (FR-056)
  → apply() : les effets
  → écrire l'instantané daté + le reçu d'idempotence
```

L'autorisation est vérifiée **à l'intérieur** de la transaction, sur la ligne
verrouillée, jamais avant (doc de stack §6.2). En 001 aucune mécanique ne dissocie
propriétaire et occupant — mais le contrôle porte déjà sur `occupant_id`, ce qui
est précisément l'objet de FR-007.

L'instant de référence est le `now()` de la transaction PostgreSQL, tronqué à la
seconde (R2). L'horloge du client n'est jamais une source de vérité.

---

## 3. Transitions d'état d'un chantier

```
   (aucun chantier)
        │  lancement : débit du coût, écriture de works, due_at = now + durée
        ▼
     planifié ─────────── échéance atteinte ──────────▶ échu, non consolidé
        │                                                      │
        │ (aucune annulation : FR-037)                          │ prochaine mutation
        ▼                                                      ▼
       — ◀───────────────────────────────────────────────── résolu
```

Trois propriétés de cette machine méritent d'être dites :

- **« échu, non consolidé » est un état lisible mais non écrit.** La projection le
  traite ; la base ne le connaît pas. C'est ce qui permet à un `GET` de rester pur
  après trois semaines d'absence (FR-031).
- **L'achèvement s'applique à `due_at`, pas à l'instant de constatation** (FR-032).
  La production nouvelle court depuis l'échéance.
- **Il n'existe aucune transition sortante depuis « planifié » autre que
  l'échéance** : ni annulation, ni remplacement, ni file (FR-037). Le garde-fou
  contre l'erreur de manipulation est la confirmation explicite exigée avant
  lancement (FR-035).

---

## 4. Traçabilité : où vit chaque groupe d'exigences

| Exigences | Où elles sont satisfaites | Ce qui le prouve |
| --- | --- | --- |
| FR-001 à FR-005 (fondation, disposition) | `catalogs/layouts/berceau` | tests de cohérence de catalogue (§1.8) |
| FR-006, FR-007 (propriétaire / occupant) | `db` + la transaction de mutation | test d'intégration : occupant changé entre-temps, commande rejetée |
| FR-008 à FR-014 (empreintes, placement) | `domain/kernel/grid` | I-5, I-6, I-7 + unitaires par motif de refus |
| FR-015 à FR-020 (gisements, production) | `domain/kernel/rates`, `catalogs` | I-10, I-12, I-13 |
| FR-021 à FR-024, FR-023b (énergie) | `domain/kernel/energy` | unitaires sur le rapport et sur la capacité non dégradée, US3 |
| FR-062, FR-063 (économie de l'itération) | `catalogs` | cohérence de catalogue : aucun coût en Jus |
| FR-025 à FR-028 (stockage, saturation) | `domain/kernel/resources` | I-1, I-2 |
| FR-029 à FR-032 (temps, accumulation) | `domain/kernel/projection` | I-2, I-11, SC-003 |
| FR-033 à FR-038 (chantier) | `db` (index unique) + `modules/construction` | I-9 + intégration de concurrence |
| FR-039 à FR-041 (amélioration) | `modules/construction/upgrade` | I-7 |
| FR-042 à FR-045 (déblaiement) | `catalogs/obstacles` + `modules/construction/clear` | I-8 + cohérence de catalogue |
| FR-046 à FR-049 (démolition) | `modules/construction/demolish` | unitaires sur remboursement et écrêtement |
| FR-050 à FR-054 (transparence) | `preview()` + écran de règles généré | SC-002, parcours Playwright |
| FR-055 à FR-057 (intégrité) | `contracts` — les champs **n'existent pas** | instantané de JSON Schema |
| FR-058 à FR-061 (accessibilité) | `game/features/grid` | parcours clavier Playwright + axe-core |
