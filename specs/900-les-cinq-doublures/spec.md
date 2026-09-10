# Feature Specification: Les cinq doublures — le banc d'essai de la phase de test interne

**Feature Branch**: `900-les-cinq-doublures`

**Created**: 2026-08-29 · **Révisée** : 2026-08-30 (dépendance à 003)

**Status**: Draft — **en attente de la tranche 003**

**Dépend de** : [`specs/003-le-gong/`](../003-le-gong/spec.md). Cette tranche
**n'implémente aucun mécanisme d'accélération** : elle règle la longueur du gong
que 003 a rendue configurable.

**Input**: User description : « Préparer le jeu à une phase de test interne.
Setup plusieurs comptes de tests et diminuer drastiquement les temps de
construction (uniquement valable en local). Parmi ces comptes de tests, tu en
feras à différents stades : P0 compte frais, P1 à P4 correspondant aux quatre
personas, chacun avancé à un stade différent — le P4 étant le pro, c'est le plus
avancé. Je voudrais qu'à la fin de chaque feature, tu mettes à jour ces comptes
pour tenir compte des features développées. »

## Contexte

Les tranches 001 et 002 ont livré un jeu jouable. Rien n'a encore été mis entre
les mains de quelqu'un d'autre que ses auteurs.

Deux obstacles rendaient une séance de test interne impraticable : **le temps**,
et **le point de départ**.

Le premier est résolu **ailleurs**. La tranche 003 a fait du Gong l'unité de
temps déclarée du jeu : chaque serveur choisit la longueur de son gong, et tout
suit — durées de chantier, accumulation de ressources, saturation, pertes. Le
banc d'essai n'a donc **rien à accélérer** : il règle `GONG_SECONDS`, et
l'affichage reste vrai puisque les durées annoncées sont les durées vécues.

Le second reste entier, et c'est l'objet de cette tranche. Un testeur qui crée
un compte se retrouve sur une planète vierge — le seul état que le jeu produise
spontanément. Tout ce qui mérite d'être éprouvé se trouve **après** : la grille
dense, la mine au niveau maximal, la ressource saturée depuis trois jours, le
refus opposé faute de place. Y parvenir demande des heures de jeu, à répéter à
chaque remise à zéro et par chaque testeur.

Cette tranche livre **cinq comptes prêts à l'emploi**, un par persona plus un
compte frais, et la garantie qu'ils resteront à jour tranche après tranche.

**Position hors feuille de route.** Numéro **900** : la bande `9xx` désigne
l'outillage, la bande `0xx` les tranches de jeu. Elle ne figure pas dans la
feuille de route de `docs/design/conception-du-jeu.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Un testeur commence là où le jeu devient intéressant (Priority: P1)

Un testeur reçoit cinq identifiants. Il se connecte avec celui qu'on lui a
assigné et se trouve immédiatement devant l'état qu'il doit éprouver : une
planète naissante, une planète encombrée, ou une planète au bord de ses limites.
Il n'a rien construit pour y arriver, et il n'attendra rien pour recommencer.

**Why this priority**: c'est la raison d'être de la tranche. Sans elle, chaque
testeur passe ses deux premières heures à refaire le même début de partie, et
personne n'atteint jamais les états où les défauts se logent.

**Independent Test**: se connecter successivement aux cinq comptes sur une pile
locale fraîchement semée, et constater sur chacun l'état annoncé — sans avoir
lancé le moindre chantier.

**Acceptance Scenarios**:

1. **Given** une pile locale semée, **When** le testeur se connecte au compte
   **P0**, **Then** il n'a aucune planète et le parcours de création lui est
   proposé, grille intacte et obstacles en place.
2. **Given** une pile locale semée, **When** le testeur se connecte au compte
   **P4**, **Then** il trouve une planète densément bâtie, un type au niveau
   maximal, une ressource saturée de longue date avec des pertes accumulées, un
   chantier en cours et une démolition dans l'histoire de la planète.
3. **Given** les cinq comptes semés, **When** on les parcourt de P0 à P4,
   **Then** chaque compte est strictement plus avancé que le précédent — nombre
   de bâtiments, niveaux atteints et cases occupées ne décroissent jamais.
4. **Given** une pile déjà semée, **When** le semis est relancé, **Then** les
   cinq comptes retrouvent exactement le même état, sans doublon ni erreur.

---

### User Story 2 — Le banc d'essai bat à un gong court (Priority: P1)

Le testeur lance une construction et la voit s'achever quelques secondes plus
tard — et l'écran annonçait bien ces quelques secondes. Le temps de réunir de
quoi payer la suivante, il l'a déjà. En vingt minutes il a parcouru ce qui
demanderait une journée au gong canonique.

**Why this priority**: sans ce réglage, les cinq comptes ne servent qu'à
*observer* des états ; ils ne permettent pas d'éprouver les **transitions**.

**Independent Test**: régler `GONG_SECONDS` sur la valeur du banc d'essai, puis
mesurer la durée d'un chantier **et** le temps nécessaire pour réunir de quoi
lancer le suivant.

**Acceptance Scenarios**:

1. **Given** le banc d'essai configuré, **When** le testeur lance une
   construction, **Then** elle s'achève dans le délai que l'écran annonçait, à
   la seconde près.
2. **Given** le banc d'essai configuré, **When** le testeur attend de pouvoir
   payer l'amélioration suivante, **Then** ce délai est réduit dans le **même
   rapport** que les chantiers.
3. **Given** le banc d'essai configuré, **When** on compare les bases résolues
   des cinq types de bâtiment, **Then** elles restent **distinctes** — un gong
   trop court les aplatirait et rendrait l'équilibrage intestable.
4. **Given** le banc d'essai, **When** on cherche un mécanisme d'accélération
   qui lui serait propre, **Then** il n'en existe **aucun** : la longueur du
   gong est le seul levier, et il appartient à 003.

---

### User Story 3 — Aucun compte ne montre un état que le jeu ne sait pas produire (Priority: P1)

Un testeur remonte un défaut observé sur le compte P3. Le développeur qui
l'instruit sait, sans avoir à le vérifier, que l'état de départ était
atteignable en jouant : il peut chercher le défaut dans le jeu, et non dans la
fabrication du compte.

**Why this priority**: c'est ce qui distingue un banc d'essai d'un décor. Un
état fabriqué de toutes pièces — un stock incohérent avec l'énergie, un niveau
qu'aucune dépense n'a payé, une case déblayée sans chantier — produit des
rapports de défauts fantômes, et chacun coûte plus cher à réfuter qu'un vrai
défaut à corriger.

**Independent Test**: rejouer les cinq progressions et constater qu'aucune étape
n'est refusée par les règles du jeu — le rejeu s'exécute sans base de données,
sans réseau et sans horloge système.

**Acceptance Scenarios**:

1. **Given** les cinq progressions, **When** elles sont rejouées, **Then**
   chaque étape est acceptée par les règles du jeu, et l'état obtenu est celui
   que le compte annonce.
2. **Given** une progression dont une étape deviendrait illégale, **When** elle
   est rejouée, **Then** le rejeu s'interrompt en nommant le persona, le rang de
   l'étape et le motif du refus.
3. **Given** les cinq progressions, **When** elles sont rejouées deux fois,
   **Then** elles produisent deux états identiques.
4. **Given** le banc d'essai réglé sur un gong donné, **When** le semis rejoue,
   **Then** il emploie le catalogue **résolu à ce même gong** — sans quoi les
   chantiers semés porteraient des durées d'un autre serveur.

---

### User Story 4 — Les comptes suivent les fonctionnalités, sans qu'on ait à y penser (Priority: P2)

Une tranche future modifie une consommation d'énergie, ajoute un type de
bâtiment, change une empreinte. Avant que la fusion ne soit possible, quelqu'un
est averti que les cinq comptes ne reflètent plus le jeu — et il sait lequel, et
pourquoi.

**Why this priority**: c'est l'exigence explicite du demandeur, et elle vaut sur
la durée. Un banc d'essai qui décrit un jeu vieux de trois tranches est pire
qu'aucun banc d'essai, parce qu'il inspire encore confiance.

**Independent Test**: modifier une valeur d'équilibrage qui invalide une étape
d'un scénario, puis exécuter la suite de tests et constater le refus nommé.

**Acceptance Scenarios**:

1. **Given** une modification de règle qui rend une étape illégale, **When** la
   suite de tests s'exécute, **Then** elle échoue en nommant le persona,
   l'étape et le motif.
2. **Given** une tranche qui livre une mécanique nouvelle, **When** ses tâches
   sont produites, **Then** l'une d'elles impose d'étendre les progressions des
   personas à cette mécanique.
3. **Given** la suite de tests, **When** elle s'exécute, **Then** elle ne
   demande **ni base de données, ni conteneur, ni réseau**.

---

### User Story 5 — Le semis ne peut pas s'échapper (Priority: P2)

Les cinq comptes n'existent que sur le poste du développeur. Aucune manipulation
ordinaire ne laisse le semis produire un dégât ailleurs.

**Why this priority**: un semis pointé sur une base partagée en effacerait le
contenu. La faute se commet par distraction ; c'est donc au mécanisme de la
refuser, pas à la vigilance.

**Independent Test**: tenter un semis contre une base non locale.

**Acceptance Scenarios**:

1. **Given** une base de données dont l'hôte n'est pas local, **When** le semis
   est lancé, **Then** il refuse d'agir et n'écrit rien.
2. **Given** le dépôt, **When** on le parcourt, **Then** aucun mot de passe de
   compte de test n'y figure.
3. **Given** des comptes semés sous un gong donné, **When** la longueur du gong
   change, **Then** la marche à suivre documentée est une remise à zéro.

### Edge Cases

- **Un semis interrompu en cours de route.** Chaque compte est écrit
  intégralement ou pas du tout : un compte à moitié semé serait précisément
  l'état inatteignable que l'US3 proscrit.
- **Un compte de test dont la planète existe déjà.** Le semis remet l'état décrit
  par le scénario, sans créer de seconde planète.
- **Un compte déjà présent dans le service d'authentification.** Le semis le
  réutilise plutôt que d'échouer, et conserve son identifiant.
- **Une progression qui exige plus de place que la grille n'en offre.** Le rejeu
  refuse : le scénario est faux, pas le jeu.
- **Un gong si court que deux types se résolvent sur la même base.** Le banc
  d'essai devient inutilisable pour éprouver l'équilibrage relatif. Le choix de
  la longueur doit préserver les écarts.

## Requirements *(mandatory)*

### Functional Requirements

**Les cinq comptes**

- **FR-001**: Le banc d'essai MUST fournir **cinq** comptes aux stades distincts :
  P0 sans planète, puis P1 à P4 par avancement croissant.
- **FR-002**: **P0** MUST être dépourvu de planète, afin que le parcours de
  création reste éprouvable à volonté.
- **FR-003**: **P1** MUST présenter un début guidé — quelques bâtiments de bas
  niveau, une case déblayée, des réserves confortables, aucun déficit d'énergie
  et aucun refus atteignable.
- **FR-004**: **P2** MUST présenter un stade intermédiaire comportant un
  entrepôt, un chantier en cours et un premier déficit d'énergie.
- **FR-005**: **P3** MUST présenter une planète travaillée sur plusieurs axes :
  grille dense, les trois empreintes de mine employées, plusieurs déblaiements,
  un déficit d'énergie assumé et une ressource en saturation.
- **FR-006**: **P4** MUST présenter les cas limites : un type au niveau maximal,
  une grille presque pleine, une saturation prolongée avec pertes accumulées, une
  démolition dans l'histoire de la planète et un chantier en cours.
- **FR-007**: Les refus `max-level-reached`, `no-space` et `work-in-progress`
  MUST être observables sur au moins un compte **sans avoir à jouer**.
- **FR-008**: Les identifiants des cinq comptes MUST être **stables** d'une
  exécution à l'autre.
- **FR-009**: Le mot de passe MUST provenir de l'environnement et MUST NOT
  figurer dans le dépôt.
- **FR-010**: Le semis MUST être rejouable : deux exécutions successives
  produisent le même état, sans doublon.
- **FR-011**: Le semis MUST offrir une remise à zéro explicite.

**L'atteignabilité**

- **FR-012**: Chaque état MUST être obtenu en **rejouant une suite d'intentions
  de jeu** à travers les règles du jeu elles-mêmes, depuis une planète vierge.
- **FR-013**: Le rejeu MUST employer une horloge fournie, jamais l'horloge
  système, et MUST être exécutable sans base, sans réseau et sans navigateur.
- **FR-014**: Tout refus rencontré pendant un rejeu MUST l'interrompre en nommant
  le persona, le rang de l'étape et le motif.
- **FR-015**: Un même scénario rejoué deux fois MUST produire deux états
  identiques.

**Le rythme du banc d'essai**

- **FR-016**: Le banc d'essai MUST obtenir son rythme en réglant la **longueur du
  gong** définie par la tranche 003, et MUST NOT introduire de mécanisme
  d'accélération qui lui soit propre.
- **FR-017**: La longueur retenue MUST laisser les bases résolues des cinq types
  de bâtiment **distinctes**, faute de quoi l'équilibrage relatif devient
  intestable.
- **FR-018**: Le semis MUST rejouer avec le catalogue **résolu à la longueur de
  gong du serveur qu'il alimente**.

**Les garde-fous**

- **FR-019**: Le semis MUST refuser d'agir si la base de données visée n'est pas
  locale.
- **FR-020**: Chaque compte MUST être écrit intégralement ou pas du tout.
- **FR-021**: L'outillage MUST être hors de tout chemin d'exécution du jeu, et
  cette séparation MUST être vérifiée mécaniquement.

**La tenue à jour**

- **FR-022**: Une porte de qualité MUST rejouer les cinq progressions à chaque
  exécution de la suite de tests, et échouer si l'une devient illégale.
- **FR-023**: Cette porte MUST NOT exiger de base, de conteneur ni de réseau.
- **FR-024**: La porte MUST vérifier que chaque compte atteint bien l'état qu'il
  annonce, et non seulement qu'il se rejoue.
- **FR-025**: Le modèle de production des tâches MUST imposer, à toute tranche
  future, une tâche d'extension des progressions aux mécaniques qu'elle livre.
- **FR-026**: Le guide de développement MUST porter le rappel correspondant.

### Key Entities

- **Compte de doublure** : un joueur fictif rattaché à un persona, doté d'un
  identifiant stable, d'une adresse et d'un stade décrit. P0 en est le cas
  dégénéré — un compte sans planète.
- **Progression** : la suite ordonnée et datée des intentions de jeu qui mène une
  planète vierge jusqu'au stade d'un persona. C'est l'unique description d'un
  compte : l'état n'est jamais décrit directement, il est **obtenu**.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un développeur passe d'une pile locale vierge à cinq comptes
  connectables par **une seule commande**, en moins de deux minutes.
- **SC-002**: Au rythme du banc d'essai, une planète vierge atteint le stade de
  P2 en moins d'un quart d'heure, chantiers et accumulation compris.
- **SC-003**: 100 % des états semés sont atteignables : aucune des cinq
  progressions ne produit de refus.
- **SC-004**: Les trois refus `max-level-reached`, `no-space` et
  `work-in-progress` sont observables sans jouer, chacun sur au moins un compte.
- **SC-005**: Une modification d'équilibrage qui invalide une progression est
  signalée **avant la fusion**, avec persona, étape et motif nommés.
- **SC-006**: La porte de vérification s'exécute en moins de cinq secondes et
  sans dépendance externe.
- **SC-007**: Il n'existe **aucun** chemin permettant de semer une base non
  locale.
- **SC-008**: Le dépôt ne contient aucun mot de passe de compte de test.
- **SC-009**: Un testeur qui n'a pas participé au développement identifie, pour
  chacun des cinq comptes, le stade qu'il représente, à la seule lecture de
  l'écran de parcelle.
- **SC-010**: Le banc d'essai n'ajoute **aucune** ligne de code d'accélération :
  son rythme tient entièrement dans une valeur de configuration.

## Assumptions

- **La tranche 003 est livrée.** Sans le Gong, cette tranche n'a pas de levier de
  rythme et son US2 tombe.
- **La phase de test interne se déroule sur des postes de développement**, contre
  la pile Supabase locale. Aucun environnement partagé n'est livré.
- **Le périmètre jouable est celui de 001 et 002.** Les stades des personas
  s'expriment dans ce vocabulaire et s'enrichiront par l'effet de FR-025.
- **L'état des cinq comptes n'a aucune valeur à conserver.** Ils sont
  reconstructibles à volonté ; changer la longueur du gong impose de les resemer.
- **Un seul compte par persona**, sans génération aléatoire.

## Hors périmètre

- Aucun environnement de recette, aucun jeu de données hébergé.
- Aucun changement de règle, d'équilibrage, de catalogue, de contrat ni de
  schéma de persistance.
- **Aucun mécanisme d'accélération** : il appartient à 003.
- Aucune remise à zéro automatique ou périodique.
- Aucun outil de « voyage dans le temps » sur une planète existante.
- Aucune télémétrie ni collecte de retours.
