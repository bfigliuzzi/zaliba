# Implementation Plan: Le Gong — l'unité de temps déclarée du jeu

**Branch**: `003-le-gong` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-le-gong/spec.md`

## Summary

Le catalogue cesse de déclarer ses durées en secondes et ses productions en
unités par heure. Il déclare en **gongs** et en **grains par gong**. Chaque
serveur déclare la longueur de son gong ; il résout son catalogue une fois au
démarrage, et **annonce cette longueur au client dans la réponse qui porte
l'état de la planète**. Le client résout le catalogue qu'il embarque avec la
longueur reçue, et ne détient aucune configuration qui la porterait.

Rien d'autre ne bouge : ni équilibrage, ni modèle de temps, ni schéma de
persistance, ni aucune grandeur sans dimension de temps.

### Le point porteur : résoudre la base, jamais la valeur évaluée

Toute la tranche tient sur une ligne d'arithmétique, exposée en
[G4](./research.md#g4--la-résolution-porte-sur-la-base-de-la-courbe-jamais-sur-la-valeur-évaluée) :

```
base de durée résolue = max(1, ⌊ baseGongs × num ÷ den ⌋)     puis evaluateCurve
base de taux résolue  =        baseGrainsParGong × den ÷ num   puis evaluateCurve
```

Résoudre **après** l'évaluation empilerait deux troncatures et ferait tomber
l'égalité stricte de FR-010. Résoudre la base préserve la règle de R19 — une
seule troncature, en fin de calcul — et rend l'égalité **exacte** au gong
canonique, où résoudre n'est qu'une multiplication par dix.

Vérifié par le calcul et non supposé : **240 valeurs comparées** — 140 durées de
construction (quatre types sur trente niveaux, plus l'entrepôt sur vingt),
5 durées de démolition, 5 de déblaiement, et 90 taux (trois extracteurs sur
trente niveaux) — sont strictement égales aux valeurs d'avant la tranche.

### Un conflit avec le principe IV, tranché ici

`PlanetSnapshotV1` est déclaré `.strict()`
(`packages/contracts/src/v1/planet.ts:184`), et `planetGateway.ts` appelle
`PlanetSnapshotSchema.parse(response.body)` en trois points. Un bundle client
antérieur **rejettera donc la clé inconnue à l'analyse**. L'ajout est
sémantiquement additif, mais techniquement **incompatible** au sens du principe
IV, qui exige alors une nouvelle version de contrat.

Il n'y en aura pas. Le motif, son coût et la condition qui rouvrira la question
sont consignés en [Complexity Tracking](#complexity-tracking) — pas dans un
commentaire.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node 24.19.0 (`.nvmrc`, champ `engines`)

**Primary Dependencies**: **aucune nouvelle** ([G15](./research.md#g15--aucune-dépendance-nouvelle)).
Zod 3.25.76, `ts-rest` 3.52.1, Fastify 5.12.1, React 19.2.8, Vite 8.2.2 —
toutes déjà présentes et épinglées à l'exact.

**Storage**: PostgreSQL via Drizzle — **non touché**. Aucune migration, aucun
changement de schéma, aucune donnée recalculée
([G14](./research.md#g14--un-chantier-en-cours-nest-jamais-recalculé)).

**Testing**: Vitest 4.1.11, projets `catalogs`, `domain`, `contracts`, `api`,
`game`, `game-dom` ; Playwright 1.62.1 et `@axe-core/playwright` 4.13.0 pour les
parcours.

**Target Platform**: navigateur à jour (client) et Node 24 (serveur).

**Project Type**: monorepo pnpm + Turborepo — deux applications, quatre paquets.

**Performance Goals**: la résolution du catalogue est faite **une fois** au
démarrage côté serveur, et **une fois par changement de longueur annoncée** côté
client. Jamais par requête, jamais par rendu — un catalogue résolu à chaque
rendu rendrait les aperçus quadratiques en nombre de cases sans qu'aucun test de
correction ne s'en aperçoive.

**Constraints**: arithmétique entière de bout en bout (R1, R19) ; aucun flottant
dans une grandeur de jeu ; égalité stricte au gong canonique sur les 240 valeurs
comparables ; refus de démarrage si la résolution des taux n'est pas entière.

**Scale/Scope**: 15 durées, 3 courbes de production, 5 types de bâtiment,
5 obstacles, ~15 points d'appel côté client.

## Constitution Check

*GATE : à passer avant la phase 0, puis à revérifier après la phase 1.*

### Principes

| Principe | Verdict | Comment |
| --- | --- | --- |
| **I — Livraison pilotée par la spécification** | ✅ | `spec.md` puis `plan.md` puis `tasks.md`, sur la branche `003-le-gong`. Les décisions portent leur alternative écartée (G1–G17). Le décalage de la feuille de route est **écrit** (FR-022), pas subi. |
| **II — Frontière domaine / interface** | ✅ | La résolution est une fonction **pure** de `packages/domain/src/kernel/`, éprouvable sans serveur, sans navigateur et sans base. Elle ne connaît ni HTTP ni Zod. |
| **III — Test-First** | ✅ | Non négociable. L'égalité stricte de FR-010 s'écrit comme test **avant** la résolution ; le refus de démarrage de FR-006 avant la lecture de configuration ; le test de contrat avant le champ. |
| **IV — Contrats explicites et versionnés** | ⚠️ | Modification **incompatible** de `/v1` sans nouvelle version. Justifiée et datée en [Complexity Tracking](#complexity-tracking). |
| **V — Simplicité délibérée** | ✅ | Une fonction pure et un champ de contrat. La profondeur alternative — le gong comme unité native du domaine — est **écartée** en G1 et consignée comme question ouverte, pas implémentée « au cas où ». |

### Contraintes techniques et sécurité

| Contrainte | Verdict | Comment |
| --- | --- | --- |
| Typage | ✅ | Aucun `any`, aucune suppression de diagnostic. La longueur du gong est une fraction entière typée. |
| Dépendances | ✅ | Aucune ajoutée (G15). |
| Secrets | ✅ | La longueur du gong est **publique** par nature — la page de règles l'énonce (FR-016). |
| Entrées non fiables | ✅ | La longueur du gong vient de la configuration du serveur, validée au démarrage (FR-006, FR-007). Le client ne peut pas en émettre (FR-014). |
| Authentification / autorisation | ✅ | Inchangées. |
| Accessibilité | ✅ | La page de règles gagne du contenu textuel ; aucun nouveau motif d'interaction. WCAG 2.1 AA tenu par les portes existantes. |
| Journalisation | ✅ | La longueur du gong retenue est journalisée au démarrage, sans donnée personnelle. |

### Stack technique

✅ Aucun écart. Rien n'est ajouté à la pile ; aucune technologie différée par
001 n'est avancée.

### Portes de qualité

Les onze portes de CI restent les mêmes et deviennent toutes **bloquantes pour
cette tranche** — en particulier `boundaries` (la résolution ne doit rien
importer d'autre que `catalogs`), les tests de contrat (le champ doit être
couvert par un test qui échoue si sa forme change, principe IV), et le seuil de
couverture du domaine, qui **ne peut que monter**.

**Onze veut dire onze**, et la liste est celle de la table § 7.8 du document de
stack : types, format et lint, frontières, domaine et propriétés, cohérence des
catalogues, contrats, intégration, parcours et accessibilité, **audit de
vulnérabilités**, **`gitleaks`**, seuil de couverture. Les deux qu'aucun test ne
porte sont nommées ici parce qu'elles sont celles qu'une liste abrégée laisse
tomber — c'est arrivé en 002, et l'audit est une porte bloquante de la
constitution. La tranche n'ajoute aucune dépendance (G15) et ne dispense donc
pas de l'audit ; elle ajoute une variable à `.env.example`, ce qui est
précisément la matière de `gitleaks`.

## Project Structure

### Documentation (this feature)

```text
specs/003-le-gong/
├── plan.md              # ce fichier
├── research.md          # phase 0 — G1 à G15
├── data-model.md        # phase 1 — les formes en jeu
├── quickstart.md        # phase 1 — comment prouver que ça marche
├── contracts/
│   └── v1-gong.md       # phase 1 — le delta de contrat
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # phase 2 — produit par /speckit-tasks
```

### Source Code (repository root)

```text
packages/catalogs/src/
├── gong.ts              # NOUVEAU — le gong canonique et le type de longueur
├── buildings.ts         # durées en gongs, production en grains par gong
├── obstacles.ts         # durées de déblaiement en gongs
└── version.ts           # la version de catalogue accompagne le changement d'unité

packages/domain/src/kernel/
└── gong.ts              # NOUVEAU — resolveCatalogs(catalogs, gong) : fonction pure

packages/contracts/src/v1/
└── planet.ts            # le champ de longueur de gong dans PlanetSnapshotV1

apps/api/src/
├── main.ts              # lit et valide la longueur ; refuse un démarrage fautif
└── app.ts               # résout une fois ; dérive ce qu'il annonce de ce qu'il applique

apps/game/src/
├── lib/catalogs.ts      # NOUVEAU — le catalogue résolu, décidé en un seul endroit
├── routes/planet.tsx    # se rattache au catalogue résolu
├── routes/rules.tsx     #   idem
├── features/grid/GridView.tsx  # idem
└── features/rules/RulesContent.tsx  # publie le gong, en gongs ET en secondes

packages/domain/tests/
├── catalogs.ts          # NOUVEAU — le CATALOGS résolu partagé par les tests
├── fixtures/avant-le-gong.json  # NOUVEAU — les 240 valeurs d'avant la tranche
└── …                    # ~13 fichiers rattachés au catalogue résolu (T017)

apps/game/tests/design/
└── gong-hors-du-client.test.ts   # NOUVEAU — la porte lexicale de FR-012

docs/design/conception-du-jeu.md   # §2 vocabulaire, §10 feuille de route décalée
.env.example                        # la longueur du gong, avec son sens
.github/workflows/ci.yml            # GONG_SECONDS dans l'environnement des serveurs
specs/001-la-planete-mere/quickstart.md  # § 1 — la variable dans la pile locale
```

`.dependency-cruiser.cjs` n'apparaît pas dans cette liste, et c'est délibéré :
voir « Constitution Check après conception » ci-dessous.

**Structure Decision**: aucune structure nouvelle. La tranche se coule dans le
découpage existant, et le seul paquet qui gagne un module de règle est
`packages/domain`, là où les règles vivent.

### Ce que 003 apporte, couche par couche

| Couche | Apport |
| --- | --- |
| `catalogs` | change d'**unité de déclaration** ; aucune valeur d'équilibrage ne bouge. Les champs à dimension de temps changent de nom avec leur unité : `demolitionGongs`, `durationGongs` |
| `domain` | une fonction pure `resolveCatalogs`, et les formes **résolues** — qui gardent `demolitionSeconds` et `durationSeconds`, donc les modules de construction ne bougent pas. Le reste du noyau est intact |
| `contracts` | un champ en lecture seule dans l'instantané |
| `api` | lit, valide, résout une fois, annonce ce qu'il applique |
| `game` | résout en un point, publie le gong dans les règles, affiche partout ailleurs du **temps réel** |
| `db` | **rien** |

## Phase 0 — Recherche

Terminée. **Dix-sept** décisions, chacune avec son alternative écartée :
[research.md](./research.md). Aucun marqueur `NEEDS CLARIFICATION` ne subsiste.

Les deux dernières sont arrivées avec le découpage et pèsent autant que les
quinze premières : **G16** — le catalogue déclaré et le catalogue résolu sont
deux types distincts, et les champs à dimension de temps changent de nom en
changeant d'unité — et **G17** — le client ne doit pas pouvoir atteindre le gong
canonique, et la porte qui le tient est **lexicale**, faute de pouvoir être
structurelle.

Les deux décisions à lire avant toute autre sont **G4** — résoudre la base, pas
la valeur — et **G7** — la longueur voyage avec l'état qu'elle explique. La
première décide de l'exactitude, la seconde de la source unique de vérité.

Deux constats y sont consignés pour n'être pas redécouverts : **G6**, un gong
très court aplatit les écarts entre types de bâtiment ; **G8**, l'ajout casse un
bundle client périmé.

## Phase 1 — Conception

- [data-model.md](./data-model.md) — les formes en jeu : longueur de gong,
  catalogue déclaré, catalogue résolu, et ce qui reste hors résolution.
- [contracts/v1-gong.md](./contracts/v1-gong.md) — le delta de contrat, son
  caractère optionnel, et l'interdiction faite au client d'en émettre un.
- [quickstart.md](./quickstart.md) — comment prouver que la tranche fonctionne.

### Constitution Check après conception

Inchangé. Le seul écart reste celui du principe IV, et la conception ne l'a ni
aggravé ni résorbé : le champ reste un ajout à un schéma strict.

La conception a en revanche **renforcé** le principe II : la résolution ne
dépend que de `catalogs`, `dependency-cruiser` le vérifiera par la règle
`domain-n-importe-que-catalogs` déjà en place, sans règle nouvelle.

**Aucune règle de frontière n'est ajoutée, et c'est un constat, pas une
économie.** La garde de FR-012 — le client n'atteint pas le gong canonique —
avait d'abord été imaginée sur le modèle de `game-n-importe-pas-db`. Elle est
irréalisable : `apps/game/src` importe légitimement `@zaliba/catalogs` dans
quatorze fichiers, et les paquets se résolvant par leur tonneau `index.ts`,
aucune arête d'import ne désigne `gong.ts`. La règle serait verte sans rien
interdire, ce qui est la forme de panne que le dépôt a déjà nommée. La porte est
donc **lexicale** ([G17](./research.md#g17--le-client-ne-doit-pas-pouvoir-atteindre-le-gong-canonique)),
et elle échoue si elle a parcouru zéro fichier.

### Ce que la conception oblige à amender ailleurs

| Document | Amendement |
| --- | --- |
| `docs/design/conception-du-jeu.md` §2 | le **Gong** entre au vocabulaire |
| `docs/design/conception-du-jeu.md` §10 | feuille de route décalée : système solaire 003 → **004**, et les suivantes d'autant, avec une note datée du 2026-08-30 sur le modèle de celle du 2026-08-27 |
| `docs/design/conception-du-jeu.md` § questions ouvertes | **le gong comme unité native du domaine** (G1), avec son coût et son bénéfice |
| `CLAUDE.md` | le repère de navigation : le catalogue déclare en gongs, le serveur résout et annonce |
| `.env.example` | une **troisième section** — « `apps/api` — configuration non secrète » — et l'en-tête du fichier, dont la règle actuelle ne prévoit que le secret et le client. La longueur du gong y entre avec son sens et le fait qu'elle soit publique |
| `.github/workflows/ci.yml` | `GONG_SECONDS=10` dans l'environnement des deux serveurs, sans quoi la porte de parcours ne démarre plus |
| `specs/001-la-planete-mere/quickstart.md` §1 | la variable dans la pile locale |
| `specs/900-les-cinq-doublures/` | à réécrire : son levier d'accélération devient la longueur du gong, et la tranche dépend de 003 |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Modification incompatible de `/v1` sans nouvelle version de contrat** (principe IV). `PlanetSnapshotV1` est `.strict()` et le client appelle `.parse()` : un bundle antérieur rejette la clé inconnue. | Le seul consommateur de `/v1` est le client servi par le **même déploiement** ; il n'existe aujourd'hui aucun train de livraison indépendant, donc aucune fenêtre de compatibilité à tenir. Le rationale du principe IV — *« front et back évoluent à des rythmes distincts »* — n'est pas encore vrai ici. | Ouvrir `/v2` dupliquerait l'intégralité du contrat de planète, ses schémas et sa surface de test pour **un champ**, et imposerait de servir deux versions sans qu'aucun client ne consomme l'ancienne. `passthrough()` a été écarté séparément (G8) : `.strict()` existe pour qu'une clé inconnue échoue à la frontière. |
| **Condition de réouverture, à ne pas oublier** | La table « Étagement de la stack » de 001 diffère **Capacitor** à une tranche ultérieure. Le jour où une application installée existe, le client cesse d'être livré avec le serveur : le rationale du principe IV redevient vrai, et cette dérogation **cesse de l'être**. | — La dérogation est donc bornée par un événement nommé, pas par une intention. Toute tranche introduisant un client à cycle de vie propre MUST rouvrir la question du versionnement de contrat. |
