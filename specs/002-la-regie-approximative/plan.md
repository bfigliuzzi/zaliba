# Implementation Plan: La Régie approximative — l'écran de parcelle habillé

**Branch**: `002-la-regie-approximative` | **Date**: 2026-08-27 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-la-regie-approximative/spec.md`

**Références opposables** : la [constitution](../../.specify/memory/constitution.md)
prévaut. Les décisions de stack et les frontières de paquets sont arrêtées dans
[`docs/architecture/2026-08-23-choix-de-stack.md`](../../docs/architecture/2026-08-23-choix-de-stack.md) ;
la direction artistique et son contrat d'accessibilité sont arrêtés dans le
dossier de design. Ce plan ne rejoue ni l'un ni l'autre : il les applique. Les
décisions propres à cette tranche sont dans [research.md](./research.md).

## Summary

Donner son visage à l'écran de parcelle, **sans changer une seule règle de jeu**.

001 a livré un écran complet et nu : la feuille de style dit d'elle-même qu'elle
« ne définit pas de palette, elle définit une géométrie », les états de case sont
les caractères `▓ ■ · ◆`, et les sept blocs se succèdent sans hiérarchie. Cette
tranche livre le système visuel de **La Régie approximative** : un jeu de valeurs
unique, sept silhouettes qui identifient les états sans la couleur, une adresse
courte par case, la raison d'un refus portée par la case elle-même, une région
d'annonce unique et un relevé à la demande, la rature comme état de client, et un
guichet à trois colonnes au-delà d'un palier unique.

L'approche tient en six points :

1. **Rien ne bouge sous `apps/game`.** Ni `catalogs`, ni `domain`, ni
   `contracts`, ni `db`, ni `apps/api`. SC-012 n'est pas une intention à
   surveiller : c'est une propriété de la structure du diff, et `git diff --stat`
   la vérifie.
2. **Les douze états de case sont douze *lectures*** de ce que la projection de 001
   rend déjà. Aucune donnée nouvelle, ni côté serveur, ni au contrat.
3. **Le jeu de valeurs est une source unique, tenue par une porte**, pas par la
   discipline : `tokens.json` versionné, `tokens.css` transcrit, et deux tests
   qui échouent à la première divergence.
4. **Du CSS ordinaire**, aucune dépendance de style. Ce que la spécification
   demande est un jeu de valeurs, pas un moteur de composition de classes.
5. **La géométrie est calculée, pas décrétée** : les silhouettes en unités de
   conteneur, et un budget de largeur qui rend 44 px de côté vrai à 320 px.
6. **Tout est éprouvé sur l'observable** — ordre du document, nom accessible,
   crochet `data-*`, boîte rendue, durée calculée — jamais sur l'apparence.

### Trois constats de planification qui obligent à corriger le dossier de design

Ils ne sont pas des détails d'exécution : chacun rend une exigence de la
spécification infranchissable si on livre le dossier tel quel.

| Constat | Conséquence | Où il est traité |
| --- | --- | --- |
| **L'indicateur de focus Camelote échoue à FR-024** sur trois fonds focalisables — Jus (2,31:1), Bave (1,26:1), Carton (2,80:1) — dont la case de gisement et le bouton `JE POSE ÇA` | l'indicateur devient composite : deux anneaux contigus encre et papier, vérifiés contre les huit fonds | [contracts/jeu-de-valeurs.md § 4](./contracts/jeu-de-valeurs.md) |
| **Deux silhouettes rebouchent leur évidement** en mode contrastes forcés : le losange barré du Jus et le disque évidé de la Bave peignent leur trou à la teinte du fond, qui devient une couleur système | les deux sont redessinées en chemin unique à `fill-rule="evenodd"` : un trou est un trou | [research.md § R5](./research.md) |
| **Le budget de largeur du dossier donne 38,8 px de côté à 320 px**, sous le plancher de 44 px de FR-014 et de SC-001 | le décor se resserre sous 360 px selon un budget chiffré, qui rend 44,7 px | [research.md § R9](./research.md) |

### Un conflit avec une tranche fusionnée, tranché : le plancher typographique

**La clause typographique de SC-009 de 001 exige que le corps de texte fasse au
moins 16 px.** SC-009 de 001 en porte trois — la fenêtre de 360 × 640 px, les
16 px, les cibles de 44 × 44 px —, et **seule la deuxième est en cause ici** :
les deux autres restent en vigueur telles quelles. Le jeu de
valeurs de la Régie plafonne le texte courant à 12 px et descend à 8,5 px sur ses
surtitres. Les deux sont incompatibles, et le principe I interdit de laisser
l'écart implicite.

**Le plan retient un plancher par rôle plutôt qu'un nombre unique**, et une règle
qui pèse plus lourd que le plancher : *aucune taille de police n'est exprimée en
pixels*.

| Rôle du texte | Plancher | Ce qu'il couvre |
| --- | --- | --- |
| champ de saisie | **16 px** | `input`, `select`, `textarea` — le déclencheur du zoom automatique d'iOS Safari, seul motif que 001 invoque |
| texte porteur d'information | **14 px** | légende, niveau, registre, texte courant, débit horaire, libellé de commande |
| intitulé de bloc | **12 px** | libellés en capitales espacées, bandes de coordonnées |
| décor sans information | **9,5 px** | surtitre administratif, notes de bas de page, mentions, tampons — FR-038 garantit qu'ils ne portent rien |

**Le motif est dans la loi que le dossier s'est donnée** : « l'approximation ne
touche jamais la donnée ». Il la tient pour les valeurs — 16 à 30 px, en chasse
fixe, à 12,8:1 — et ne la tient pas pour ce qui les rend intelligibles : le nom
d'une ressource à 8,5 px, son débit à 9,5, la légende des douze états à
11,5. Le plancher étend la loi de la valeur à son étiquette. Le registre
administratif de la Régie, lui, garde son corps 9 : c'est là qu'il vit, et
FR-038 garantit qu'on peut jouer sans en lire une ligne.

**Et ce qui rend 1.4.4 réellement vrai** : `tokens.css` porte les tailles en
`rem`, obtenues en divisant la valeur du dossier par 16. Un texte de 14 px qui
double avec le réglage système sert mieux qu'un texte de 16 px figé qui ne bouge
pas — et aucun critère de WCAG 2.1 AA ne fixe de taille minimale.

Six pas de l'échelle bougent : `micro` 8,5 → 9,5 ; `label` 10 → 12 ; `menu`
11,5 → 14 ; `corps` 12 → 14 ; `item` 13 → 14 ; et un pas nouveau `chiffre-xs` à
14 px range le débit horaire dans la famille tabulaire, où FR-002 le veut. Les
huit autres sont déjà au-dessus de leur plancher. `tokens.json` n'est pas
modifié : la porte applique la règle, ce qui fait qu'un pas ajouté demain reçoit
son plancher tout seul.

**La clause typographique de SC-009 de 001 est amendée** en conséquence,
recentrée sur les champs de saisie, et son assertion de parcours réécrite. Les
deux autres clauses du critère ne sont pas touchées. Le raisonnement complet, le
recalcul du budget de 320 px et les deux alternatives chiffrées sont en
[research.md § R14](./research.md).

## Technical Context

**Language/Version** : TypeScript 6.0.3, inchangé. Aucun paquet ne change de
version.

**Primary Dependencies** : celles de 001, inchangées. Quatre ajouts, tous dans
`apps/game`, tous du contenu statique :

| Dépendance | Version | Justification | Alternative écartée |
| --- | --- | --- | --- |
| `@fontsource/archivo` | 5.3.0 | FR-004 interdit toute requête vers un domaine tiers ; le dossier de design charge ses polices depuis Google et le signale comme inacceptable ici. Vite émet les `woff2` dans le paquet compilé sans configuration. | `presetWebFonts` (viole FR-004) ; `woff2` téléchargé et sous-ensemblé à la main (aucune voie de mise à jour, binaire versionné) — retenu **en repli** si un paquet s'avère absent ou sous licence incompatible. |
| `@fontsource/archivo-narrow` | 5.3.0 | idem | idem |
| `@fontsource/jetbrains-mono` | 5.3.0 | idem — et `tabular-nums` est obligatoire partout où il y a un chiffre (FR-002) | idem |
| `@fontsource/saira-stencil-one` | 5.3.0 | idem | idem |

**Aucune dépendance de style.** Ni UnoCSS, ni Tailwind, ni CSS-in-JS, ni module
CSS : [research.md § R1](./research.md) en donne le motif et le coût de chaque
option écartée. Les quatre versions ci-dessus sont à reporter à la table § 8 du
document de stack, relevées à l'installation.

**Storage** : aucun changement. Aucune table, aucune colonne, aucune migration.

**Testing** : Vitest — projets `game` et `game-dom` — pour les fonctions pures,
le rendu et les portes du jeu de valeurs ; Playwright et axe-core pour les
parcours, les mesures de boîte, les émulations de préférence et l'interception
des requêtes. Les suites `domain`, `contracts`, `db`, `api` et `api-integration`
sont **inchangées, et leur invariance est le test de SC-012**.

**Target Platform** : navigateurs modernes, **mobile d'abord**. Deux largeurs de
référence — **430 px** et **1180 px** — et une largeur plancher éprouvée —
**320 px**. Le palier de bascule est unique, à 900 px.

**Project Type** : monorepo web. Cette tranche ne touche qu'une application sur
deux et zéro paquet sur quatre.

**Performance Goals** : inchangés. Une contrainte s'ajoute — les quatre familles
de police en sous-ensemble latin, `font-display: swap`, et une pile de repli par
famille : le cas limite « les polices ne se chargent pas » est nommé par la
spécification et la mise en page ne doit pas s'y disloquer.

**Constraints** :

- WCAG 2.1 AA mesuré et bloquant, aux **trois** largeurs éprouvées — 320, 430 et
  1180 px. La largeur plancher n'était pas auditée jusqu'au 2026-08-28, alors que
  c'est celle où le budget de R9 resserre le décor ;
- 44 px de côté par case et 48 px de hauteur de bouton, **à toute largeur** ;
- **14 px** de plancher pour tout texte porteur d'information, et 9,5 px pour le
  seul décor — la table par rôle ci-dessus fait foi. *Corrigé le 2026-08-28* :
  cette ligne écrivait 9,5 px pour le texte porteur d'information, c'est-à-dire
  exactement ce que R14 refuse et que le plan démontre trois paragraphes plus
  haut ;
- aucune requête sortante vers un domaine tiers ;
- une seule région d'annonce polie, jamais écrite par un compteur ;
- aucune règle de jeu modifiée.

**Scale/Scope** : un écran remaquetté, sept blocs, douze états de case, sept
silhouettes, une largeur de bascule. Deux autres écrans — authentification et
règles — reçoivent le jeu de valeurs et restent lisibles, sans être remaquettés.

## Constitution Check

*GATE : à passer avant la phase 0, à repasser après la phase 1.*

### Principes

| Porte | Verdict | Comment elle est tenue et vérifiée |
| --- | --- | --- |
| **I. Livraison pilotée par la spécification** | ✅ | `spec.md` existe et sa liste de contrôle passe. Les quatre points qu'elle renvoie au plan y sont tranchés (R1 à R4, R18). Les **quatre écarts constatés** — trois avec le dossier de design, un avec SC-009 de 001 — sont résolus explicitement, jamais laissés implicites. |
| **II. Frontière domaine / interface** | ✅ | `packages/domain` n'est **pas touché**. La dérivation des douze états est de la présentation et vit dans `apps/game` : le domaine ne se met pas à connaître des silhouettes. Vérifié par `dependency-cruiser`, dont le compte de modules parcourus doit être non nul. |
| **III. Test-First (non négociable)** | ⚠️ → ✅ | Le risque est réel sur un habillage : « on verra à l'œil » est la façon habituelle d'y échapper. Il est désamorcé en rendant **tout** observable — ordre du document, nom accessible, `data-*`, boîte rendue, durée calculée, compte de régions live — et en écrivant chaque attente avant le composant. La table complète est en [research.md § R15](./research.md). |
| **IV. Contrats explicites et versionnés** | ✅ | Aucun contrat HTTP ne bouge, et c'est vérifiable : `packages/contracts` inchangé, instantanés de JSON Schema identiques. Les contrats de la tranche sont ceux de l'**écran** — [contracts/ui-parcelle.md](./contracts/ui-parcelle.md) et [contracts/jeu-de-valeurs.md](./contracts/jeu-de-valeurs.md) — et chacun a ses tests. |
| **V. Simplicité délibérée** | ✅ | Quatre dépendances, toutes du contenu statique, toutes exigées par FR-004. **Zéro dépendance de style.** Les renoncements sont explicites : pas de moteur utilitaire, pas de module CSS, pas de générateur de valeurs, pas de thème sombre, pas de structure construite d'avance pour des données qui n'existent pas (FR-008a). |

### Contraintes techniques et sécurité

| Porte | Verdict | Comment elle est tenue |
| --- | --- | --- |
| Typage bout en bout | ✅ | Inchangé. Le CSS n'est pas typé et n'a pas à l'être ; c'est la porte de conformité du jeu de valeurs qui joue ce rôle. |
| Dépendances épinglées et justifiées | ✅ | Quatre ajouts, versions exactes, justifiés ci-dessus, à reporter au § 8 du document de stack. |
| Secrets | ✅ | Sans objet — aucun chemin de configuration touché. |
| Entrées non fiables | ✅ | Sans objet — aucun schéma d'entrée touché. Le client continue de n'émettre que des intentions. |
| Authentification et autorisation | ✅ | Sans objet — aucune route touchée. |
| **Accessibilité** | ✅ | C'est le sujet de la tranche. Douze critères de succès, huit entièrement mécanisés, **quatre à moitié humaine** — SC-003, SC-009, SC-011 (recettes du [quickstart § 10](./quickstart.md)) et **SC-007**, dont le balisage est mécanisé mais dont la restitution vocale réelle ne l'est pas ([quickstart § 7](./quickstart.md)). Chacune a sa recette écrite et son verdict à consigner. *Corrigé le 2026-08-28 : SC-007 manquait à ce compte, et sa recette n'avait pas de tâche.* Le dire est la seule façon honnête de ne pas rendre vert un critère qu'on n'a pas tenu. |
| Journalisation | ✅ | Sans objet. |

### Stack technique

**Un vide, pas un écart.** La section « Stack technique » de la constitution va
du langage au rendu sans jamais nommer de technologie de style. Il n'y a donc
aucun écart à amender ; il y a une décision à prendre, et le principe V dit
comment : la solution la plus simple qui satisfait la spécification. C'est du CSS
ordinaire ([research.md § R1](./research.md)).

Le § 2.6 du document de stack — « DOM et SVG pour l'interface, canvas 2D
ciblé » — est respecté à la lettre : les sept silhouettes sont du SVG en ligne,
et le plan de parcelle reste du document. Aucun canvas n'apparaît.

### Portes de qualité

Les onze portes de CI livrées par 001 restent en place, inchangées et
bloquantes — **y compris les deux qu'aucun test ne porte** : l'audit de
vulnérabilités (porte 9) et la fuite de secrets (porte 10). Cette tranche ajoute
quatre dépendances : la porte 9 la concerne directement, et
[quickstart.md § 1](./quickstart.md) l'exécute désormais localement, ce qu'il
omettait jusqu'au 2026-08-28. **Le décompte opposable est celui de
`.github/workflows/ci.yml`** ; les commandes du quickstart en sont la
reproduction locale et ne se comptent pas de la même façon.

La tranche ajoute deux portes, dans le projet `game` :

| Porte ajoutée | Ce qu'elle refuse | Ce qui la rend non inerte |
| --- | --- | --- |
| conformité du jeu de valeurs | une clé de `tokens.json` absente ou divergente de `tokens.css` ; un couple de rôles sous son seuil WCAG | le test échoue si le nombre de clés lues est nul |
| non-régression des valeurs en dur | une valeur visuelle littérale hors de `tokens.css` ; une teinte de nuit référencée ; un `aria-label` sur un élément sans rôle | le test échoue si le nombre de fichiers parcourus est nul |

Les deux portent la leçon de l'amendement 2.1.0 de la constitution : **exécuter
ne suffit pas, il faut vérifier que l'outil a produit un résultat non vide.**

## Project Structure

### Documentation (this feature)

```text
specs/002-la-regie-approximative/
├── spec.md                      # Le quoi et le pourquoi (déjà écrit)
├── checklists/
│   ├── requirements.md          # Validation de la spécification (déjà écrite)
│   ├── a11y.md                  # Revue de qualité — accessibilité (2026-08-28)
│   └── design-system.md         # Revue de qualité — système visuel (2026-08-28)
├── plan.md                      # Ce fichier
├── research.md                  # Phase 0 — dix-huit décisions et leurs alternatives
├── data-model.md                # Phase 1 — les six entités d'un habillage
├── contracts/
│   ├── README.md                # Phase 1 — aucun contrat HTTP ne bouge, et pourquoi
│   ├── ui-parcelle.md           # Phase 1 — l'observable de l'écran
│   └── jeu-de-valeurs.md        # Phase 1 — la porte de conformité et les ratios recalculés
├── quickstart.md                # Phase 1 — comment constater que la tranche tient
└── tasks.md                     # Phase 2 — produit par /speckit-tasks, pas ici
```

### Source Code (repository root)

Les emplacements marqués **[+]** sont créés par cette tranche, **[~]** modifiés,
**[=]** intacts.

```text
zaliba/
├── apps/
│   ├── game/
│   │   ├── src/
│   │   │   ├── design/                      # [+] le système visuel, et rien d'autre
│   │   │   │   ├── tokens.css               # [+] les valeurs, source unique côté CSS
│   │   │   │   ├── base.css                 # [+] corps, focus composite, sr-only,
│   │   │   │   │                            #     mouvement réduit, contrastes forcés
│   │   │   │   ├── regie.css                # [+] les gestes signature : cadre-main,
│   │   │   │   │                            #     rature, plaque, étiquette, tampon
│   │   │   │   ├── parcelle.css             # [+] la mise en page des sept blocs
│   │   │   │   │                            #     et le guichet à trois colonnes
│   │   │   │   ├── fonts.ts                 # [+] les quatre familles auto-hébergées
│   │   │   │   └── Glyphe.tsx               # [+] les sept silhouettes, currentColor
│   │   │   ├── features/
│   │   │   │   ├── grid/
│   │   │   │   │   ├── GridView.tsx         # [~] silhouettes, adresse, bandes, data-*
│   │   │   │   │   ├── appearance.ts        # [+] les douze états, fonction pure
│   │   │   │   │   ├── refusal.ts           # [+] la raison portée par la case
│   │   │   │   │   ├── Legende.tsx          # [+] la clé des silhouettes
│   │   │   │   │   ├── announce.ts          # [~] adresses courtes
│   │   │   │   │   ├── GridLiveRegion.tsx   # [~] devient la région unique
│   │   │   │   │   ├── FootprintGhost.tsx   # [~] silhouettes au lieu de caractères
│   │   │   │   │   └── useGridCursor.ts     # [~] Échap annule la pose
│   │   │   │   ├── regie/                   # [+] les blocs de la Régie
│   │   │   │   │   ├── PlaqueEnTete.tsx     # [+] identité, surtitre, tampon
│   │   │   │   │   ├── Comptoir.tsx         # [+] les trois compteurs sur étiquette
│   │   │   │   │   ├── PlaqueChantier.tsx   # [+] jauge, chrono HH:MM:SS
│   │   │   │   │   ├── Registre.tsx         # [+] les possessions réelles
│   │   │   │   │   ├── Rature.tsx           # [+] le balisage exact, sr-only compris
│   │   │   │   │   └── useRature.ts         # [+] l'ancienne valeur, côté client
│   │   │   │   ├── announce/                # [+] l'annonce unique et le relevé
│   │   │   │   │   ├── useAnnonce.ts        # [+] l'état d'annonce et ses origines
│   │   │   │   │   └── releve.ts            # [+] la phrase d'état courant
│   │   │   │   ├── resources/               # [~] rendu réécrit, calculs intacts
│   │   │   │   ├── work/                    # [~] rendu réécrit, dont la seconde
│   │   │   │   │                            #     région polie de BuildPanel, retirée
│   │   │   │   └── rules/RulesContent.tsx   # [~] l'angle mort de FR-035 documenté
│   │   │   ├── lib/labels.ts                # [~] describePosition rend « C3 »
│   │   │   ├── routes/planet.tsx            # [~] ordre des blocs, guichet, annonce
│   │   │   ├── styles.css                   # [~] réduit à ce que 002 ne reprend pas
│   │   │   └── main.tsx                     # [~] importe les polices et le design
│   │   └── tests/
│   │       ├── design/                      # [+] conformité, contrastes, valeurs en dur
│   │       ├── features/                    # [~] attentes réécrites, test d'abord
│   │       └── e2e/
│   │           ├── mobile.spec.ts           # [~] le plancher de 16 px recentré (R14)
│   │           ├── us1-planet.spec.ts       # [~] l'adresse courte remplace
│   │           ├── us2-build.spec.ts        # [~]   « Colonne N, rangée M » dans
│   │           ├── us5-clear.spec.ts        # [~]   ces trois parcours (FR-016)
│   │           └── us9-regie.spec.ts        # [+] 320 px, zoom, mouvement, requêtes,
│   │                                        #     contrastes forcés, trois largeurs
│   └── api/                                 # [=]
├── packages/                                # [=] catalogs, domain, contracts, db
├── docs/
│   ├── design/
│   │   ├── conception-du-jeu.md             # [~] § 10 : la feuille de route amendée
│   │   └── 2026-08-27-regie-approximative/  # [+] le dossier de design, déplacé entier
│   └── architecture/
│       └── 2026-08-23-choix-de-stack.md     # [~] § 8 : les quatre polices épinglées
├── specs/001-la-planete-mere/spec.md        # [~] SC-009 amendé, daté, motivé
├── biome.json                               # [~] le dossier de design exclu du lint
└── playwright.config.ts                     # [=] les largeurs sont dans les specs
```

**Structure Decision** : le découpage de 001 est conservé sans exception. La
tranche crée deux répertoires sous `apps/game/src` — `design/`, qui n'est pas
une fonctionnalité mais un système, et `features/regie/`, qui l'est. Aucun
paquet n'est ajouté : un `packages/design-system` pour un seul consommateur
serait la couche d'indirection que le principe V proscrit.

### Ce que 002 apporte, couche par couche

| Couche | Apport de 002 |
| --- | --- |
| `catalogs` | **rien** |
| `domain/kernel` | **rien** |
| `domain/modules/construction` | **rien** |
| `db` | **rien** |
| `contracts` | **rien** |
| `api` | **rien** |
| `game` | le jeu de valeurs, les sept silhouettes, les douze états, l'adresse courte, la raison de refus par case, la région d'annonce unique et le relevé, la rature, la légende, le registre, le guichet à trois colonnes, les polices auto-hébergées |
| `docs` | le dossier de design archivé, la feuille de route amendée, les quatre polices épinglées |
| `specs/001` | SC-009 amendé |

Cette colonne de « rien » est le résumé le plus exact de la tranche.

## Étagement de la stack

Rien de ce que 001 différait n'est installé ici, et la table de son plan reste
valable telle quelle : ni Capacitor, ni `vite-plugin-pwa`, ni `pixi.js`, ni
`@dnd-kit/core`, ni Astro. Deux points méritent d'être redits parce que cette
tranche est celle où la tentation existe :

| Brique | Toujours différée | Motif, au regard de 002 |
| --- | --- | --- |
| `pixi.js` | oui | Un plan de parcelle habillé reste du document et du SVG. Le § 2.6 du document de stack et le « hors périmètre » de la spécification l'écrivent tous deux ; peindre la grille rendrait douze états inatteignables au clavier. |
| `@dnd-kit/core` | oui | L'interaction retenue reste le curseur. Le glisser-déposer est explicitement hors périmètre. |

Et une brique qui ne sera **jamais** installée pour ce besoin :

| Brique | Statut | Motif |
| --- | --- | --- |
| UnoCSS, Tailwind, ou tout moteur utilitaire | écartée, pas différée | Le besoin est un jeu de valeurs, pas un moteur. À rouvrir seulement si un second consommateur des valeurs apparaît — et alors ce sera un générateur, pas un moteur de classes ([research.md § R1, § R2](./research.md)). |

## Phase 0 — Recherche

Sortie : [research.md](./research.md). Dix-huit décisions, chacune avec son motif
et son alternative écartée. Les cinq qui commandent le reste :

- **R1** — du CSS ordinaire, aucune dépendance de style ;
- **R2** — une source unique de valeurs, tenue par une porte qui doit constater
  avoir lu quelque chose ;
- **R5** — sept silhouettes, deux modificateurs, et la correction des deux
  glyphes dont l'évidement ne survit pas au mode contrastes forcés ;
- **R9** — le budget de largeur qui rend 44 px de côté vrai à 320 px ;
- **R14** — le plancher typographique par rôle, et l'amendement de SC-009 de 001
  qu'il entraîne.

Aucun marqueur `NEEDS CLARIFICATION` ne subsiste : les trois de la première
rédaction ont été levés dans la spécification, et les quatre points qu'elle
renvoyait au plan sont tranchés en R1, R2, R3, R4 et R18.

**Une vérification reste à mener par exécution** et non par raisonnement : que
les quatre paquets `@fontsource/*` en 5.3.0 servent bien un sous-ensemble latin
complet pour les graisses employées, et que le paquet compilé ne référence aucun
domaine tiers. Le repli est nommé d'avance en R4. C'est le protocole que R17 de
001 a imposé au projet, et il vaut ici comme ailleurs.

## Phase 1 — Conception

Sorties :

- [data-model.md](./data-model.md) — les six entités d'un habillage, leurs
  invariants, et la colonne de « rien » qui borne la tranche ;
- [contracts/README.md](./contracts/README.md) — pourquoi aucun contrat HTTP ne
  bouge, et ce qui est contractuel à sa place ;
- [contracts/ui-parcelle.md](./contracts/ui-parcelle.md) — l'ordre du document,
  la grammaire des noms accessibles, les crochets `data-*`, le clavier, la
  région d'annonce, les ratures, les commandes, et ce que le contrat interdit ;
- [contracts/jeu-de-valeurs.md](./contracts/jeu-de-valeurs.md) — la
  correspondance JSON ⇄ CSS, les couples de contraste **recalculés**, et les
  trois écarts relevés avec les ratios annoncés ;
- [quickstart.md](./quickstart.md) — comment constater que la tranche tient, y
  compris les trois recettes humaines.

### Constitution Check après conception

Repassé après rédaction des artefacts. Les cinq principes tiennent, les sept
contraintes techniques tiennent, aucun écart de stack. Trois points méritent
d'être dits plutôt que cochés :

- **Principe III** — la conception a été faite pour rendre le test d'abord
  *possible* sur un habillage. Chaque exigence visuelle de la spécification a été
  traduite en observable dans `contracts/ui-parcelle.md` avant qu'aucun composant
  ne soit prévu. C'est ce qui distingue un habillage éprouvé d'un habillage
  relu.
- **Principe I** — quatre recettes de `quickstart.md` ne sont **pas** mécanisables
  (SC-003, SC-009 de 002, SC-011, et l'écoute de SC-007 au § 7). Elles sont
  écrites comme des recettes, avec un verdict à consigner, plutôt que déguisées
  en tests qui passeraient sans rien prouver. Un critère vert qu'on n'a pas tenu
  est pire qu'un critère rouge.
- **Principe V** — la seule complexité ajoutée est le doublement de la source de
  valeurs (JSON de référence, CSS opérant) et la porte qui les tient ensemble.
  Elle est enregistrée en « Complexity Tracking » avec le coût de l'option
  simple.

### Ce que la conception oblige à amender ailleurs

Quatre documents, quatre tâches, aucune découverte en route :

| Document | Amendement | Motif |
| --- | --- | --- |
| `docs/design/conception-du-jeu.md` § 10 | 002 devient La Régie approximative, le système solaire devient 003, les suivantes se décalent | la feuille de route dit autre chose que la réalité des branches (R18) |
| `docs/architecture/2026-08-23-choix-de-stack.md` § 8 | les quatre `@fontsource/*` en 5.3.0 | toute dépendance épinglée y figure |
| `specs/001-la-planete-mere/spec.md` § SC-009 | le plancher de 16 px recentré sur les champs de saisie, remplacé par les quatre planchers par rôle, daté et motivé | conflit constaté, résolu explicitement (R14) |
| `CLAUDE.md` § État du dépôt | `apps/game` gagne `design/` ; le dossier de design est archivé sous `docs/design/` | le tableau de navigation doit rester vrai |

**Et un cinquième, amendé le 2026-08-28** : `spec.md` de cette tranche. La revue
de qualité des exigences — [`checklists/a11y.md`](./checklists/a11y.md) et
[`checklists/design-system.md`](./checklists/design-system.md) — a relevé que
plusieurs décisions tranchées ici ne figuraient que dans le plan, alors que le
principe I les veut dans un document opposable.

| Exigence | Amendement | Motif |
| --- | --- | --- |
| **FR-001a** *(nouvelle)* | la référence unique porte sur les valeurs, pas sur les nombres écrits à leur propos ; deux écarts nommés — relèvement au plancher, recalcul des ratios | un ratio annoncé faux de quatre centièmes se lisait comme une autorisation |
| **FR-012** | l'identification passe par un canal **non chromatique** — silhouette, trait, marque, cadre d'emprise — et non par une silhouette obligatoire par case | deux états sur douze n'en portent aucune : l'exigence rendait irrecevable le dessin retenu |
| **FR-013** | le compte est **douze**, et c'est un vocabulaire fermé et énuméré | le texte en énumérait douze, tous les autres documents en comptaient onze, et le test de légende en dépend |
| **FR-022** | le canal assertif des refus de commande devient une exception nommée | le contrat la pratiquait sans que l'exigence l'admette |
| **FR-024**, **FR-024a** *(nouvelle)* | l'indicateur est vérifié contre chacun des fonds ; en contrastes forcés il prend la couleur système | l'indicateur du dossier échoue sur trois fonds focalisables |
| **FR-039**, **FR-039a** *(nouvelle)* | quatre planchers par rôle, le rôle inscrit dans le document, et aucune taille en pixels | la spécification disait 9,5 px là où le contrat exige 14 |
| § Success Criteria | convention de désignation des identifiants entre tranches | « SC-009 » désignait deux critères différents selon le document |

**Et un second tour d'amendements, le 2026-08-28**, après l'analyse de cohérence
croisée entre `spec.md`, `plan.md` et `tasks.md`. Elle a relevé un manquement au
principe III et quatre lacunes de couverture ; ce qui ne pouvait pas se corriger
dans une tâche seule a été porté dans la spécification.

| Exigence | Amendement | Motif |
| --- | --- | --- |
| **FR-005**, **FR-015**, **FR-017** | inchangées dans leur texte, **dotées d'un test** (T053a, T040b, T040a) | les trois n'atteignaient qu'une tâche d'implémentation. Sur une tranche dont l'argument est que tout a été rendu observable avant d'être écrit, trois `MUST` allaient être livrés à l'œil |
| **FR-006** | l'énumération porte sur les **sept blocs de la Régie** et renvoie au contrat pour l'énergie, l'alerte de refus et l'avertissement de catalogue | elle se lisait comme exhaustive et ne l'était pas ; l'alerte de refus n'avait de place fixée nulle part |
| **FR-023a** *(nouvelle)* | le relevé est énoncé à chaque demande, même à texte identique | une région `aria-live` ne réénonce pas un contenu inchangé : sur une planète saturée, le second appui était **silencieux** |
| **FR-026a** *(nouvelle)* | une rature ne s'efface sur aucune minuterie | US5 disait « reste un instant », le modèle la gardait jusqu'au rechargement : deux lectures incompatibles, et aucune tâche pour trancher |
| **FR-030** | le seuil de 3:1 s'étend aux **objets graphiques porteurs d'information**, silhouettes comprises | le seul élément dont l'illisibilité perdrait l'information n'avait pas de seuil |
| **SC-004**, **SC-005** | audités aux **trois** largeurs, 320 px compris | la largeur où le budget de R9 resserre le décor était la seule à échapper à la mesure |
| § Success Criteria | SC-009 de 001 se cite **par sa clause** | le raccourci « SC-009 de 001 — le plancher typographique » laissait croire qu'un critère à trois clauses était amendé en entier |

Les corrections de rédaction que la même revue a relevées — le compte de
transitions, la mesure de contraste de la rature, l'origine d'annonce de la
rotation, la colonne *silhouette* de R6 — sont appliquées dans
`data-model.md`, `research.md` et les deux contrats. Le détail est consigné au
§ « Résolutions » de chaque liste.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| **Deux représentations du jeu de valeurs** — `tokens.json` de référence et `tokens.css` opérant — plus une porte pour les tenir ensemble | FR-001 fait des valeurs du dossier de design la **source de référence unique**. Une seule représentation obligerait soit à faire lire du JSON au navigateur, soit à perdre la traçabilité vers le dossier reçu. La porte remplace la vigilance : elle échoue à la première divergence, y compris six mois plus tard. | Transcrire les valeurs en CSS et **jeter** le JSON : simple, et rend FR-001 invérifiable — plus rien ne dit d'où vient un `#C4552A`. Engendrer le CSS depuis le JSON : même garantie, plus une étape de compilation et un fichier engendré à ne pas éditer, pour un seul consommateur. |
| **Une dérivation d'apparence à douze états** dans le client, plutôt que trois classes CSS sur `data-state` | FR-013 énumère douze états dont six ne sont pas dans `CellState` : productif, stérile, les deux natures d'obstacle, et les deux visées. Ils se dérivent de `depositOf`, du type du bâtiment et du type de l'obstacle, et la dérivation doit être **testable sans DOM** — c'est ce qui rend SC-003 et SC-009 mécanisables à moitié. | S'en remettre au CSS sur `data-state` couvrirait trois états sur douze. Les neuf autres retomberaient sur la teinte, c'est-à-dire sur exactement ce que FR-012 interdit. |
| **Le déplacement de `describePosition` vers l'adresse courte**, qui fait churn sur une douzaine de tests de 001 | FR-016 fait de l'adresse un besoin fonctionnel — les joueurs s'échangent des plans à l'oral — et exige la **même** désignation partout. Deux systèmes de désignation coexistants obligeraient le joueur à apprendre les deux. | Ajouter l'adresse **à côté** de « colonne 4, rangée 1 » : aucun test ne casse, et chaque annonce de curseur double de longueur, c'est-à-dire que l'exploration au lecteur d'écran double de durée. |
| **Un attribut `data-role-texte` sur les blocs de décor**, et une porte qui applique un plancher par rôle | FR-038 sépare déjà le texte qui porte de l'information de celui qui n'en porte pas ; sans marque dans le document, cette séparation n'existe que dans la tête de qui écrit le composant, et la porte ne peut rien mesurer. Le **défaut est le côté exigeant** : un nœud non marqué est présumé porteur, donc un oubli échoue le test au lieu de passer. | Un plancher unique — 16 px partout, ou 9,5 px partout — n'a besoin d'aucune marque, et se trompe dans un sens ou dans l'autre sur la moitié de l'écran : soit les blagues occupent le corps des données, soit la légende des douze états reste à 11,5 px. |
| **Un indicateur de focus composite à deux anneaux**, là où le dossier en prescrit un seul | FR-024 exige 3:1 contre le fond bordé, et l'écran comporte huit fonds dont trois sont focalisables et échouent avec l'anneau Camelote unique. Aucune couleur de la palette ne tient seule contre les huit. | Un anneau unique dans une autre teinte : le calcul montre qu'aucune n'y parvient — `encre` échoue sur `bave` (2,87), `papier` échoue sur `jus` (1,53). Le couple est la solution minimale, pas une élégance. |
