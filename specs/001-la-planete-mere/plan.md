# Implementation Plan: La planète mère

**Branch**: `001-la-planete-mere` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-la-planete-mere/spec.md`

**Références opposables** : la [constitution](../../.specify/memory/constitution.md)
prévaut. Les décisions de stack, le modèle de temps, les frontières de paquets et
la stratégie de test sont arrêtés dans
[`docs/architecture/2026-08-23-choix-de-stack.md`](../../docs/architecture/2026-08-23-choix-de-stack.md) ;
ce plan ne les rejoue pas, il les applique. Les décisions propres à cette
itération sont dans [research.md](./research.md).

## Summary

Livrer une planète Berceau 6×6 qui produit dans le temps : une grille à
empreintes pilotable intégralement au clavier, quatre natures de chantier sous
règle d'unicité (construction, amélioration, démolition, déblaiement), un plafond
de stockage avec perte comptabilisée, une contrainte d'énergie instantanée, et la
transparence intégrale des règles de calcul.

Cette tranche est aussi l'**amorçage du monorepo** : aucun code applicatif
n'existe à ce jour.

L'approche technique tient en cinq points :

1. **On persiste un instantané daté, jamais un état courant.** L'état courant est
   une projection — fonction pure de `(instantané, catalogues, instant)`.
2. **Le même code de projection tourne sur le serveur et dans le client**, importé
   depuis `packages/domain`. C'est ce qui rend les aperçus du client exacts par
   construction plutôt que par vérification.
3. **Aucun ordonnanceur.** Un chantier échu est appliqué *par la projection*, à
   l'instant de son échéance. Rien en 001 ne doit être connu d'un tiers, donc rien
   n'exige de boucle de résolution.
4. **Les quantités sont des entiers en sous-unités de 1/3600 d'unité**, ce qui rend
   la production sur *s* secondes exacte, additive et reproductible à la main.
5. **Le client n'envoie qu'une intention.** Coût, durée et effet sont absents des
   schémas d'entrée, calculés localement pour l'aperçu, et recalculés dans la
   transaction de mutation sur l'état verrouillé.

## Technical Context

**Language/Version** : TypeScript de bout en bout, Node.js LTS 24.x côté serveur.
Versions exactes : table du document de stack, §8. Ajouts propres à 001 justifiés
plus bas.

**Primary Dependencies** : React + Vite (client), Fastify (serveur), Drizzle
(PostgreSQL), Zod + `ts-rest` (contrats versionnés), TanStack Router et Query
(client), `@supabase/supabase-js` (**client d'authentification uniquement** — le
client n'accède jamais à la base), Vitest + fast-check (domaine), Testcontainers
(intégration), Playwright + axe-core (parcours et accessibilité), Biome (lint et
format), dependency-cruiser (frontières de paquets). Toutes figurent déjà à la
table §8 du document de stack : aucune ne demande de justification nouvelle.

**Ajouts de dépendances propres à 001** — justification exigée par la constitution :

| Dépendance | Paquet | Justification | Alternative écartée |
| --- | --- | --- | --- |
| `jose` | `apps/api` | Vérifier localement la signature d'un JWT Supabase par JWKS, sans appel réseau par requête (doc de stack §6.2). Aucune brique de la table §8 ne le fait. | Secret partagé HS256 : place une clé de *signature* symétrique dans l'API, donc capable de forger un jeton. Refusé. |
| `postgres` (postgres.js) | `apps/api`, `packages/db` | Drizzle exige un pilote ; celui-ci est le pilote recommandé et gère le pooler Supabase. | `pg` : viable, mais requêtes préparées et pooler moins bien traités. |
| `@fastify/cors` | `apps/api` | Le client est servi depuis une autre origine que l'API en production. | Reverse proxy d'origine unique : décision d'exploitation non prise (doc de stack §9). |

Ces trois ajouts doivent être reportés dans la table des versions épinglées du
document de stack, avec la version exacte relevée à l'installation.

**Storage** : PostgreSQL fourni par Supabase. Les tables de jeu vivent dans un
schéma `game` **non déclaré aux schémas exposés** de PostgREST (doc de stack
§6.1). Migrations par `drizzle-kit`. Aucun accès direct du client à la base.

**Testing** : Vitest partout ; fast-check sur les invariants du domaine ;
instantanés d'équilibrage sur les catalogues ; instantanés de JSON Schema sur les
contrats ; Testcontainers pour l'intégration sur un vrai PostgreSQL ; Playwright
+ axe-core sur deux parcours.

**Target Platform** : navigateurs modernes, **mobile d'abord** (SC-009 : grille
lisible sans zoom sur téléphone). Serveur : conteneur applicatif long.

**Project Type** : monorepo web — client SPA, serveur autoritaire, quatre paquets
partagés.

**Performance Goals** :

- projection d'une planète en moins d'une milliseconde (O(bâtiments), ≤ 20) ;
- `GET` de l'état sous 200 ms au 95ᵉ centile ;
- compteurs animés par extrapolation locale, **sans un seul appel réseau** ;
- joueur inactif : zéro écriture, zéro calcul.

**Constraints** :

- exactitude **à la seconde**, pour une absence d'une heure comme de trois
  semaines (SC-003) ;
- aucune fonction de domaine n'appelle l'horloge système ;
- aucune valeur dérivable présente dans un schéma d'entrée ;
- WCAG 2.1 AA sur les parcours livrés, mesuré et bloquant.

**Scale/Scope** : alpha. Une planète par joueur, 36 cases, ≤ 20 bâtiments par
planète. Deux écrans (planète, règles), trois routes HTTP, un archétype, cinq
types de bâtiment, sept empreintes, trois ressources.

## Constitution Check

*GATE : à passer avant la phase 0, à repasser après la phase 1.*

### Principes

| Porte | Verdict | Comment elle est tenue et vérifiée |
| --- | --- | --- |
| **I. Livraison pilotée par la spécification** | ✅ | `spec.md` existe et est validée par sa liste de contrôle. Ce plan est l'étape 2 ; `tasks.md` suivra. Les décisions structurantes de 001 sont consignées dans [research.md](./research.md) avec leur alternative écartée. |
| **II. Frontière domaine / interface** | ✅ | `packages/domain` n'importe que `catalogs`. Vérifié **mécaniquement** par dependency-cruiser en porte bloquante, pas par relecture. Toute la logique — projection, placement, plafonds, énergie, courbes — y vit et se teste sans serveur, navigateur ni base. |
| **III. Test-First (non négociable)** | ✅ | `tasks.md` ordonnera test → échec observé → implémentation, tâche par tâche. Les invariants économiques passent par fast-check dès la première tranche, y compris « aucune séquence de commandes légales ne crée de ressource à partir de rien ». |
| **IV. Contrats explicites et versionnés** | ✅ | Routes `/v1/…` via `ts-rest`, schémas Zod fermés dans `packages/contracts`, qui **n'importe pas `domain`** (duplication volontaire, doc de stack §3). Instantané de JSON Schema par contrat + échantillon enregistré par version. |
| **V. Simplicité délibérée** | ✅ | Sept renoncements explicites et motivés : pas d'ordonnanceur, pas d'endpoint d'aperçu, pas d'endpoint de catalogue, pas de glisser-déposer, pas de `apps/site`, pas de canvas, pas de WebSocket. Détail en [research.md](./research.md) et section « Étagement de la stack ». |

### Contraintes techniques et sécurité

| Porte | Verdict | Comment elle est tenue |
| --- | --- | --- |
| Typage bout en bout | ✅ | TypeScript partout, `tsc --noEmit` sur tous les paquets en porte bloquante. Aucune échappatoire prévue ; toute occurrence portera son commentaire justificatif. |
| Dépendances épinglées et justifiées | ✅ | Versions exactes, aucune plage. Les trois ajouts de 001 sont justifiés ci-dessus. |
| Secrets | ✅ | La clé `service_role` et l'URL de base vivent en variables d'environnement de `apps/api` exclusivement. `gitleaks` en porte bloquante. La clé `anon` n'est pas un secret et n'est jamais traitée comme tel. |
| Entrées non fiables | ✅ | Chaque requête est **analysée** par son schéma Zod, jamais transtypée. Schémas fermés (refus des clés inconnues), bornes entières sur tous les nombres, clé d'idempotence obligatoire sur toute commande. Requêtes paramétrées par Drizzle. |
| Authentification et autorisation | ✅ | Authentification louée à Supabase, JWT vérifié localement. **L'autorisation se vérifie à l'intérieur de la transaction de mutation, sur la ligne de planète verrouillée** — jamais dans le jeton, jamais avant. Test d'intégration obligatoire : commande sur une planète dont l'occupant a changé entre-temps, rejetée. |
| Accessibilité | ✅ | Parcours clavier intégral testé sous Playwright, axe-core en porte bloquante. FR-058 à FR-061 sont des tests, pas des intentions. |
| Journalisation | ✅ | Journal structuré (pino, fourni par Fastify), identifiant de corrélation par requête, liste noire explicite : jetons, adresses de courriel, clé de service. |

### Stack technique

Aucun écart. Chaque brique employée en 001 est celle que la constitution nomme.
Les briques **non installées en 001** sont différées, pas remplacées : voir
« Étagement de la stack ».

### Portes de qualité

Les portes de CI sont livrées **avec** cette tranche : c'est la première, donc il
n'existe aucune CI à ce jour. Table complète : doc de stack §7.8. Toutes
bloquantes.

## Project Structure

### Documentation (this feature)

```text
specs/001-la-planete-mere/
├── spec.md                  # Le quoi et le pourquoi (déjà écrit)
├── checklists/
│   └── requirements.md      # Validation de la spécification (déjà écrite)
├── plan.md                  # Ce fichier
├── research.md              # Phase 0 — décisions de 001 et alternatives écartées
├── data-model.md            # Phase 1 — entités de domaine et schéma de persistance
├── contracts/
│   ├── README.md            # Phase 1 — politique de version, erreurs, idempotence
│   └── v1-planet.md         # Phase 1 — routes et schémas de la version 1
├── quickstart.md            # Phase 1 — comment valider la tranche de bout en bout
└── tasks.md                 # Phase 2 — produit par /speckit-tasks, pas ici
```

### Source Code (repository root)

```text
zaliba/
├── apps/
│   ├── game/                     # SPA Vite + React — seul client de 001
│   │   ├── src/
│   │   │   ├── routes/            # planet.tsx, rules.tsx
│   │   │   ├── features/
│   │   │   │   ├── auth/          # inscription, connexion, provisionnement au 1er accès
│   │   │   │   ├── grid/          # GridView, cursor, footprint ghost, live region
│   │   │   │   ├── resources/     # compteurs extrapolés localement
│   │   │   │   ├── work/          # chantier en cours, confirmation
│   │   │   │   └── rules/         # page de règles générée depuis catalogs
│   │   │   ├── lib/               # client ts-rest, session, décalage d'horloge, animation
│   │   │   └── main.tsx
│   │   └── tests/                 # unitaires ciblés (voir doc de stack §7.5)
│   └── api/                       # Fastify — serveur autoritaire
│       ├── src/
│       │   ├── plugins/           # auth (JWT/JWKS), cors, corrélation, erreurs
│       │   ├── routes/v1/         # enregistrement des routes ts-rest
│       │   ├── command/           # la forme unique de commande (doc de stack §4.5)
│       │   └── mapping/           # persistance ⇄ domaine ⇄ contrat : les trois formes
│       └── tests/
│           └── integration/       # Testcontainers : concurrence, idempotence, autorisation
├── packages/
│   ├── catalogs/                  # contenu de jeu déclaratif et typé — n'importe rien
│   │   ├── src/
│   │   │   ├── resources.ts       # camelote, jus, bave-etoiles
│   │   │   ├── footprints.ts      # les sept formes du vocabulaire fermé
│   │   │   ├── curves.ts          # vocabulaire fermé de courbes nommées
│   │   │   ├── buildings.ts       # mine, puits, racloir, centrale, entrepot
│   │   │   ├── obstacles.ts       # types d'obstacle : coût, durée, résultat
│   │   │   └── layouts/berceau.ts # la disposition unique, identique pour tous
│   │   └── tests/                 # cohérence + instantané d'équilibrage
│   ├── domain/                    # règles du jeu, fonctions pures — importe catalogs
│   │   ├── src/
│   │   │   ├── kernel/
│   │   │   │   ├── time.ts        # Instant en secondes, Duration
│   │   │   │   ├── resources.ts   # sous-unités, plafonnement, pertes
│   │   │   │   ├── curves.ts      # évaluation des courbes nommées
│   │   │   │   ├── grid.ts        # cases, empreintes orientées, validité de placement
│   │   │   │   ├── energy.ts      # rapport, production nominale et effective
│   │   │   │   ├── rates.ts       # taux de production dérivés de l'instantané
│   │   │   │   ├── projection.ts  # project(snapshot, catalogs, at)
│   │   │   │   └── effects.ts     # vocabulaire fermé d'effets, détenu par le noyau
│   │   │   └── modules/
│   │   │       └── construction/  # build, upgrade, demolish, clear, preview
│   │   └── tests/                 # unitaires + fast-check
│   ├── contracts/                 # schémas Zod et routes versionnées — n'importe PAS domain
│   │   ├── src/v1/
│   │   └── tests/                 # instantanés de JSON Schema, échantillons par version
│   └── db/                        # schéma Drizzle et migrations — importe catalogs
│       ├── src/schema.ts
│       ├── src/conversions.ts     # grains et instants, à la frontière du paquet
│       ├── src/repository/        # chargement d'instantané, écriture d'instantané
│       └── migrations/
├── .dependency-cruiser.cjs        # le principe II rendu mécanique
├── biome.json
├── turbo.json
├── pnpm-workspace.yaml
└── .github/workflows/ci.yml       # les portes bloquantes
```

**Structure Decision** : le découpage est celui du document de stack §3, amputé de
`apps/site` (différé, voir plus bas).

**Un écart tranché, et par où.** Ce diagramme plaçait d'abord le dépôt d'instantané
dans `apps/api/src/repository/`. Il vit dans `packages/db/src/repository/`, où T071,
T098, T132 et T140 l'ont écrit, et c'est le code qui a raison : le § 3 du document de
stack range le schéma de persistance parmi les préoccupations d'infrastructure, et un
dépôt qui rendrait des formes de domaine ferait suivre au modèle de jeu la forme des
tables. `apps/api` garde à la place le `mapping/` qui traduit entre les **trois**
formes — persistance, domaine, contrat —, et qui est le seul endroit où elles se
rencontrent. Le principe I interdisant de laisser l'écart implicite, il est tranché
ici : le diagramme est amendé, le code ne bouge pas. Les règles de dépendance de sa table §3 sont
écrites dans `.dependency-cruiser.cjs` et vérifiées en CI, ainsi que les deux
règles de module de sa §5.2 :

- `kernel` n'importe **jamais** un module ;
- le graphe entre modules est déclaré et acyclique.

`packages/domain/src/modules/construction` est le seul module de 001. La grille,
les ressources, les plafonds, l'énergie et la projection appartiennent au
**noyau** : ce sont des préoccupations de planète, pas de mécanique.

### Ce que 001 apporte, couche par couche

Application de la table « une mécanique, sept endroits » du document de stack §5.5 :

| Couche | Apport de 001 |
| --- | --- |
| `catalogs` | ressources, sept empreintes, courbes nommées, cinq types de bâtiment, types d'obstacle, disposition du Berceau |
| `domain/kernel` | temps, projection, ressources et plafonds, énergie, grille, effets |
| `domain/modules/construction` | validation et effets des quatre natures de chantier, et leurs aperçus |
| `db` | schéma `game`, sept tables, migration initiale |
| `contracts` | trois routes `/v1`, schémas fermés, union fermée de motifs de refus |
| `api` | la forme unique de commande, le greffon d'authentification, l'enregistrement des routes |
| `game` | authentification et provisionnement au premier accès, écran de planète, grille au clavier, compteurs extrapolés, page de règles |
| `site` | **différé** — FR-054 exige la consultation *en jeu* |

## Étagement de la stack

Ce que la constitution nomme et que 001 **n'installe pas**. Aucun de ces points
n'est un écart : la constitution contraint *quelle* technologie servira le besoin,
pas *à quelle tranche* elle est installée. Le principe V interdit précisément
d'installer une dépendance pour un besoin anticipé.

| Brique | Différée à | Motif |
| --- | --- | --- |
| Capacitor | la tranche qui vise les magasins d'applications | Exige les chaînes Xcode et Android SDK. Aucune exigence de 001 ne la réclame. Rien dans la structure ne l'empêche : `apps/game` reste un paquet client statique. |
| `vite-plugin-pwa` | idem | Aucune exigence de 001 ne porte sur l'installabilité ni sur le hors-ligne. L'accumulation hors connexion est **serveur**, pas client. |
| `pixi.js` | la carte galactique (002) et le simulateur de bataille | 001 n'a aucun canvas : une grille de 36 cases est du DOM et du SVG. La règle « le canvas est une vue » ne trouve pas d'objet ici. |
| `@dnd-kit/core` | la tranche qui en aura besoin, s'il y en a une | L'interaction retenue est un **curseur**, pas un glisser-déposer — décision R14 de [research.md](./research.md). |
| `astro`, `@astrojs/starlight` | le site public | FR-054 exige des règles consultables **en jeu**. Le site public n'a aucun contenu à publier avant 002. |
| WebSocket / modèle B | la tranche qui a un tiers à informer | En 001, rien n'est observable par un autre joueur. Le client extrapole localement : pousser un événement n'apporterait rien. |
| Boucle de résolution d'événements | idem | Décision R3 : les chantiers échus sont appliqués par la projection. Aucun tiers à informer, donc aucun processus de fond. |
| Journal d'audit des transferts | la première tranche qui transfère quelque chose | Aucun transfert en 001. Cette mesure est la seule non rattrapable (doc de stack §6.5) : à ouvrir **avec** le premier chemin de transfert, pas avant. |

## Phase 0 — Recherche

Sortie : [research.md](./research.md). Vingt-deux décisions, chacune avec son motif
et son alternative écartée. Les quatre qui commandent tout le reste :

- **R1** — quantités en sous-unités de 1/3600 d'unité, pour une production exacte
  et additive à la seconde ;
- **R3** — les chantiers échus sont appliqués par la projection, sans ordonnanceur ;
- **R7** — une disposition de Berceau concrète, vérifiée contre FR-004 et FR-005 ;
- **R8** — les aperçus sont calculés par le client avec le code du serveur, donc
  aucun endpoint d'aperçu.

R21 et R22 ont été ajoutées après la première rédaction, sur arbitrage du rôle de
chaque ressource : en déficit d'énergie seule la production est dégradée, et le Jus
n'a aucun débouché en 001. Ni l'une ni l'autre ne touche à la structure du plan.

Aucun marqueur `NEEDS CLARIFICATION` ne subsiste. Trois vérifications de
compatibilité restent à mener **au moment de l'amorçage** et non par le
raisonnement — elles sont énoncées avec leur repli en R17.

## Phase 1 — Conception

Sorties :

- [data-model.md](./data-model.md) — entités de domaine, invariants, transitions
  d'état, et le schéma de persistance qui en découle ;
- [contracts/README.md](./contracts/README.md) — politique de version, modèle
  d'erreur, idempotence, stratégie de test des contrats ;
- [contracts/v1-planet.md](./contracts/v1-planet.md) — les trois routes de la
  version 1 et leurs schémas ;
- [quickstart.md](./quickstart.md) — comment valider la tranche de bout en bout.

### Constitution Check après conception

Repassé après rédaction des artefacts de phase 1. Rien n'a bougé : les cinq
principes tiennent, les sept contraintes techniques tiennent, aucun écart de stack.
Deux points méritent d'être dits explicitement plutôt que cochés :

- **Principe IV** — `packages/contracts` redéclare ses types au lieu de réexporter
  ceux de `domain`. C'est une duplication **volontaire** : sans elle, une
  refactorisation interne changerait silencieusement le format transmis. Le
  document de stack §3 en fait une règle ; `data-model.md` et
  `contracts/v1-planet.md` la matérialisent en décrivant deux modèles distincts
  pour les mêmes notions.
- **Principe V** — la seule redondance de conception assumée est la table dérivée
  `building_cells`. Elle est enregistrée en « Complexity Tracking » avec le coût de
  l'option simple qu'elle remplace.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Six paquets et deux applications pour une seule fonctionnalité | Le découpage est **imposé** par la section « Stack technique » de la constitution et par le document de stack §3. C'est aussi ce qui rend le principe II vérifiable par `dependency-cruiser` au lieu d'une relecture. | Un paquet unique rendrait le principe II invérifiable et imposerait, dès 002, une refactorisation transverse sur un projet mené par une seule personne — exactement le risque que le document de stack place au-dessus de l'élégance. |
| Table dérivée `building_cells`, redondante avec `buildings` | La non-superposition des bâtiments est **l'invariant central** de la fonctionnalité. Une clé primaire `(planet_id, x, y)` la rend impossible à violer, y compris par un futur chemin d'écriture qui aurait oublié la validation. Coût : deux instructions dans la même transaction. | S'en remettre à la validation du domaine dans la transaction verrouillée est correct **aujourd'hui**, et le reste tant que personne n'ajoute un second chemin d'écriture. La garantie ne se dégrade pas avec la fatigue ; la discipline, si. |
| Représentation des quantités en sous-unités de 1/3600 plutôt qu'en unités | SC-003 exige un écart **nul** sur trois semaines d'absence, et la projection doit être additive : consolider deux fois ne doit jamais donner un résultat différent de consolider une fois. Les entiers en sous-unités le garantissent par construction. | Les flottants introduisent un écart qui dépend du nombre de consolidations : le joueur qui agit souvent perdrait ou gagnerait des ressources. C'est-à-dire un exploit ou une injustice, selon le sens de l'arrondi. |
