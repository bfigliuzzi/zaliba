# Phase 1 — Les formes en jeu : Le Gong

**Plan** : [plan.md](./plan.md) · **Recherche** : [research.md](./research.md)

Aucune table, aucune migration, aucune colonne. Ce document décrit des **formes
en mémoire** — et la frontière qui les sépare, qui est l'essentiel.

---

## 1. La longueur du gong

```
LongueurDeGong = { num: entier > 0, den: entier > 0 }        # en secondes
```

Une **fraction exacte**, jamais un flottant ([G3](./research.md#g3--la-longueur-du-gong-est-une-fraction-entière-de-secondes)).
Le dépôt emploie déjà ce motif pour le remboursement de démolition
(`Fraction { num, den }`, `packages/catalogs/src/buildings.ts`).

| Valeur | Sens | Rapport au canonique |
| --- | --- | --- |
| `{ 10, 1 }` | le **gong canonique** — dix secondes | ×1 |
| `{ 1, 2 }` | une demi-seconde | ×20 |
| `{ 1, 6 }` | un sixième de seconde | ×60 |

**Validée au démarrage**, et un échec arrête le processus (FR-006, FR-007) :

1. `num` et `den` entiers strictement positifs ;
2. la résolution de **chaque** courbe de production tombe sur un entier — sinon
   l'exactitude à la seconde de R1 s'effondre, en silence.

La seconde règle est la seule qui demande de connaître le catalogue. Elle
appartient donc à la validation du catalogue résolu, pas à la lecture de
configuration.

---

## 2. Deux faisceaux, deux types

C'est la frontière porteuse de la tranche
([G16](./research.md#g16--le-catalogue-déclaré-et-le-catalogue-résolu-sont-deux-types-distincts)).
Les deux faisceaux ont **presque la même forme et pas le même sens**.

```
DeclaredCatalogs  ──resolveCatalogs(declared, gong)──▶  Catalogs
   déclaré en gongs                                       résolu en secondes
   et en grains par gong                                  et en grains par seconde
   DeclaredBuilding.demolitionGongs                       Building.demolitionSeconds
   DeclaredObstacle.durationGongs                         Obstacle.durationSeconds
   (pas de champ `gong`)                                  gong: LongueurDeGong
```

Les fonctions du domaine n'acceptent que `Catalogs`. Donner un catalogue déclaré
à `previewBuild` ne compile pas — au lieu d'annoncer douze secondes là où le jeu
en met cent vingt.

**Deux choses rendent l'inassignabilité réelle**, et il en fallait au moins une :
le catalogue résolu porte un champ `gong` que le déclaré n'a pas, et les champs
à dimension de temps **changent de nom en changeant d'unité**. La seconde est la
plus utile, parce qu'elle vaut aussi à la lecture : un champ nommé
`demolitionGongs` qui contiendrait des secondes serait visible à l'œil nu.

**Le renommage porte sur ce que le catalogue déclare, jamais sur ce que le
domaine consomme.** `Building` et `Obstacle` — les formes *résolues*, celles que
`Catalogs` transporte — gardent `demolitionSeconds` et `durationSeconds`. C'est
pourquoi `packages/domain/src/modules/construction/demolish.ts` et `clear.ts`,
qui les lisent, **ne changent pas d'une ligne**. Les formes *déclarées* sont
neuves et se nomment `DeclaredBuilding` et `DeclaredObstacle`.

### Ce que le catalogue déclare

Ces champs appartiennent désormais à `DeclaredBuilding` et `DeclaredObstacle` —
les formes que `packages/catalogs` exporte.

| Champ déclaré | Avant 003 | Après 003 |
| --- | --- | --- |
| `DeclaredBuilding.buildDuration` | courbe, base en **secondes** | courbe, base en **gongs** |
| `DeclaredBuilding.demolitionSeconds` | entier de secondes | `demolitionGongs`, entier de **gongs** |
| `DeclaredBuilding.production` | courbe, base en **unités par heure** | courbe, base en **grains par gong** |
| `DeclaredObstacle.durationSeconds` | entier de secondes | `durationGongs`, entier de **gongs** |

### Ce que la résolution produit

Ces champs-là ne changent **ni de nom ni d'unité** : ce sont ceux que le domaine
lit déjà aujourd'hui.

| Champ résolu | Résolution |
| --- | --- |
| `Building.buildDuration` | `base ← max(1, ⌊ baseGongs × num ÷ den ⌋)` puis la courbe inchangée |
| `Building.demolitionSeconds` | `max(1, ⌊ demolitionGongs × num ÷ den ⌋)` |
| `Obstacle.durationSeconds` | `max(1, ⌊ durationGongs × num ÷ den ⌋)` |
| `Building.production` | `base ← baseGrainsParGong × den ÷ num` puis la courbe inchangée |
| `Catalogs.gong` | la longueur employée, recopiée — le serveur ne peut annoncer que ce qu'il applique ([G10](./research.md#g10--buildapi-dérive-ce-quil-annonce-de-ce-quil-applique)) |

**La courbe elle-même n'est jamais touchée** : ni son `num`, ni son `den`, ni sa
nature. Seule sa base est résolue, et c'est ce qui laisse une **unique
troncature en fin de calcul** (R19), donc un chiffre refaisable à la main
([G4](./research.md#g4--la-résolution-porte-sur-la-base-de-la-courbe-jamais-sur-la-valeur-évaluée),
[G5](./research.md#g5--hors-gong-canonique-une-troncature-et-la-base-résolue-est-publiée)).

### Ce que la résolution ne touche jamais

Coûts, capacités, consommation et production d'énergie, empreintes, variantes,
niveaux maximaux, fraction de remboursement, gisements, et la **géométrie** des
dispositions
([G13](./research.md#g13--lénergie-les-coûts-et-les-capacités-ne-sont-pas-touchés)).
Aucune de ces grandeurs n'a de dimension de temps. L'omission est **écrite** pour
qu'un futur lecteur ne la « corrige » pas.

**Une exception, et une seule : la production de base d'une disposition.**
Ce document écartait d'abord « les dispositions » en bloc ; c'était trop large,
et l'implémentation l'a corrigé (amendement du 2026-08-31 en G13).
`baseProductionPerGong` est un **taux** et se résout comme les autres —

| Champ déclaré | Champ résolu | Résolution |
| --- | --- | --- |
| `DeclaredLayout.baseProductionPerGong` | `Layout.baseProductionPerHour` | `grainsParGong × den ÷ num` |

— parce qu'elle est la seule source de revenu d'une planète fraîche : ne pas la
résoudre ferait battre le premier écran du jeu au rythme canonique sur un
serveur rapide, ce que SC-002 interdit. Le plafond de base, l'énergie de base et
le stock de départ, eux, restent intacts : ce sont des quantités, pas des taux.

---

## 3. Le catalogue au gong canonique — la table de vérité

C'est la table qu'un test tient, valeur par valeur (FR-010, SC-001).

**Le compte est de 240**, et il est décomposé ici pour n'avoir pas à être
redevine : 140 durées de construction (quatre types sur trente niveaux, plus
l'entrepôt sur vingt), 5 durées de démolition, 5 durées de déblaiement, et
90 taux (trois extracteurs sur trente niveaux). Les durées de démolition et de
déblaiement sont **incluses** — FR-010 dit « chaque durée », et les exclure
laisserait dix valeurs hors de la seule preuve que rien n'a bougé.

| Type | Construction | Démolition |
| --- | --- | --- |
| mine | 12 gongs → 120 s | 30 gongs → 300 s |
| puits | 15 gongs → 150 s | 42 gongs → 420 s |
| racloir | 20 gongs → 200 s | 60 gongs → 600 s |
| centrale | 9 gongs → 90 s | 24 gongs → 240 s |
| entrepôt | 10 gongs → 100 s | 18 gongs → 180 s |

| Obstacle | Gongs | Secondes |
| --- | --- | --- |
| les cinq du Berceau | 30, 90, 180, 270, 360 | 300, 900, 1800, 2700, 3600 |

| Extracteur | Grains par gong | Grains par seconde | Unités par heure |
| --- | --- | --- | --- |
| mine | 150 | 15 | 15 |
| puits | 80 | 8 | 8 |
| racloir | 40 | 4 | 4 |

La dernière colonne rappelle pourquoi tout tombe juste : `GRAINS_PER_UNIT = 3600`
rend *une unité par heure* exactement égale à *un grain par seconde* (R1).

---

## 4. Ce que le client détient, et ce qu'il reçoit

| Donnée | Origine | Pourquoi |
| --- | --- | --- |
| le catalogue **déclaré** | embarqué dans le bundle | R8 : le client calcule ses aperçus avec le code du domaine |
| la **version** du catalogue | embarquée, comparée à celle annoncée | R15 : une divergence est détectée, non subie |
| la **longueur du gong** | **reçue du serveur**, à chaque instantané | G7 : la réponse qui porte l'état porte les règles qui l'expliquent |
| le catalogue **résolu** | dérivé des deux précédents, en un seul endroit | G11 : quinze points d'appel, une seule décision |

Le client ne détient **aucune** longueur de gong par-devers lui, et une porte le
vérifie ([G17](./research.md#g17--le-client-ne-doit-pas-pouvoir-atteindre-le-gong-canonique)).

### Les trois états du client

| État | Ce qu'il fait |
| --- | --- |
| longueur reçue, version concordante | il résout et affiche des chiffres exacts |
| **longueur absente** | il n'affiche **aucun** chiffre dérivé (FR-013, G9) |
| version divergente | comportement inchangé de R15 : il n'affiche aucun chiffre dérivé et propose de recharger |

Les deux derniers états convergent volontairement : ne rien savoir et savoir que
l'on est en désaccord appellent la même prudence.

---

## 5. Ce qui n'existe pas dans ce modèle

- **Aucune persistance du gong.** Il n'est pas stocké : c'est un paramètre du
  processus, pas un état de partie. Les échéances déjà écrites en base gardent
  leur valeur ([G14](./research.md#g14--un-chantier-en-cours-nest-jamais-recalculé)).
- **Aucun gong par joueur.** La longueur est une propriété du serveur (FR-019,
  FR-020) ; aucune structure de ce modèle ne la porte à l'échelle d'un joueur, et
  c'est ce qui rend l'inégalité **irreprésentable** plutôt qu'interdite.
- **Aucun catalogue résolu côté serveur par requête.** La résolution a lieu une
  fois, au démarrage.
