# Feature Specification: Le Gong — l'unité de temps déclarée du jeu

**Feature Branch**: `003-le-gong`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description : « Je pense que c'est plus sain de parler de "tick",
ou "gong" si on veut rester dans l'univers loufoque. On peut alors imaginer
1 tick = 60 sec ou 2 sec. On n'a plus besoin de tricher avec les affichages et le
facteur est plus simple à paramétrer. » — issue d'un arbitrage sur la
préparation d'une phase de test interne : *« le serveur doit rester la source
unique de vérité ; si des paramètres côté serveur sont chargés, le client doit
les récupérer et travailler à partir de cela. Avoir un miroir asynchrone
client/serveur peut entraîner des problèmes à la longue avec les clients qui ne
se mettent pas à jour assez vite. »*

## Contexte

Le catalogue de 001 libelle ses durées en **secondes** et ses productions en
**unités par heure**. Ces deux unités sont celles du monde réel, et c'est
précisément le problème : elles rendent impossible de faire battre le jeu plus
vite sans mentir au joueur.

Toutes les tentatives échouent sur le même écueil. Diviser les seules durées de
chantier affame le joueur — une mine de niveau 1 sur deux gisements produit
30 unités par heure, et son niveau 2 en coûte 150 : le chantier durerait deux
secondes et l'attente cinq heures. Accélérer l'horloge du jeu résout la
cohérence mais fait afficher « 2 minutes » là où deux secondes s'écoulent.
Coupler à la main deux transformations inverses — durées divisées, production
multipliée — marche, et c'est une convention que rien n'empêche de casser.

**Le Gong résout les trois d'un coup, parce qu'il n'est pas un réglage mais une
unité.** La Régie ne compte pas en secondes : elle frappe le gong. Un chantier
dure *douze gongs*, une mine produit *cent cinquante grains par gong*. Combien
de temps dure un gong ? C'est une propriété du serveur, et elle est publiée.
Un couplage porté par l'unité ne peut pas diverger, là où une convention le
peut.

**Une découverte a rendu le changement indolore.** Les quinze durées du
catalogue — cinq durées de construction, cinq de démolition, cinq de
déblaiement — ont pour plus grand commun diviseur **exactement dix secondes**.
Le catalogue s'exprime donc en gongs **entiers** sans qu'aucune valeur
d'équilibrage ne bouge, à condition de fixer le gong canonique à dix secondes.

Cette tranche ne change **aucun équilibrage** et **aucune règle**. Elle change
l'unité dans laquelle le jeu déclare son temps, et fait de la longueur du gong
un paramètre du **serveur**, annoncé au client avec l'état qu'il explique.

**Décalage de la feuille de route.** Le § 10 de
[`docs/design/conception-du-jeu.md`](../../docs/design/conception-du-jeu.md)
attribuait le numéro 003 au système solaire. Cette tranche s'intercale avant
lui : elle est un prérequis du banc d'essai de la phase de test interne
(`specs/900-les-cinq-doublures/`), qui ne peut exister sans elle. Le système
solaire devient **004**, et les quatre tranches suivantes se décalent d'autant.
Le document de conception est à amender, ainsi que le vocabulaire du § 2, qui
gagne le Gong.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Le joueur peut refaire chaque chiffre (Priority: P1)

Un joueur qui veut comprendre ouvre la page de règles. Il y lit que le gong dure
dix secondes sur ce serveur, qu'une mine se construit en douze gongs, et que
cela fait cent vingt secondes. Il refait le calcul de tête et tombe juste.

**Why this priority**: c'est le contrat passé avec P4 — *« a besoin de tout
savoir »* — et le principe produit n° 2. Introduire une unité intermédiaire sans
la publier reviendrait à cacher une formule, ce que la constitution proscrit.
L'unité doit rendre le jeu **plus** explicable, pas moins.

**Independent Test**: ouvrir la page de règles **depuis une session établie** et
vérifier que la longueur du gong y figure, que chaque durée y est donnée en
gongs **et** en secondes, et que la multiplication tombe juste sur les quinze
durées. Puis l'ouvrir **sans session** et vérifier qu'elle publie les gongs
déclarés, dit ne pas connaître la longueur du serveur, et n'affiche aucune
seconde.

**Acceptance Scenarios**:

1. **Given** un serveur quelconque et un instantané reçu, **When** le joueur
   ouvre la page de règles, **Then** elle énonce la longueur du gong de ce
   serveur.
2. **Given** la page de règles, **When** le joueur lit une durée, **Then** elle
   est donnée en gongs et en secondes, et le produit des deux est exact.
3. **Given** la page de règles, **When** le joueur lit une production, **Then**
   elle est donnée par gong et par heure, et la conversion est exacte.
4. **Given** la page de règles ouverte **sans session**, donc sans instantané,
   **When** le joueur la lit, **Then** elle publie les gongs déclarés, énonce
   qu'elle ne connaît pas la longueur de ce serveur, et n'affiche aucune
   seconde.

---

### User Story 2 — Un serveur peut battre plus vite, et tout suit (Priority: P1)

Un serveur déclare un gong court. Sur celui-là, les chantiers s'achèvent plus
vite, les ressources s'accumulent plus vite, les entrepôts saturent plus vite et
les pertes s'accumulent plus vite — **dans le même rapport**, sans qu'aucune
valeur d'équilibrage n'ait été touchée.

**Why this priority**: c'est ce qui rend possible une séance de test interne, et
c'est aussi la graine des univers rapides. Un levier qui n'accélérerait qu'une
moitié du jeu déséquilibrerait le tout.

**Independent Test**: exécuter le même scénario de jeu sur deux serveurs dont
les gongs diffèrent, et vérifier que les délais mesurés sont dans le rapport des
longueurs de gong — durées de chantier **et** temps d'accumulation.

**Acceptance Scenarios**:

1. **Given** deux serveurs dont les gongs sont dans un rapport de 1 à 60,
   **When** le même chantier est lancé sur chacun, **Then** le second s'achève
   soixante fois plus vite — exactement lorsque la base de durée se résout sans
   reste, et à la troncature de cette base près sinon (SC-002).
2. **Given** ces deux serveurs, **When** on mesure le temps nécessaire pour
   réunir le coût d'une même amélioration, **Then** il est lui aussi soixante
   fois plus court.
3. **Given** un gong plus court, **When** le joueur consulte les coûts, les
   capacités et le rapport d'énergie, **Then** ils sont **inchangés** : le gong
   ne touche que ce qui a une dimension de temps.
4. **Given** un gong plus court, **When** une durée résolue tomberait sous la
   seconde, **Then** elle vaut une seconde — un chantier instantané n'est pas un
   chantier.

---

### User Story 3 — Le client apprend le gong du serveur, il ne le devine pas (Priority: P1)

Le client calcule ses aperçus lui-même, comme aujourd'hui. Mais la longueur du
gong qu'il emploie est celle que le serveur vient de lui annoncer, dans la même
réponse que l'état qu'elle explique. Aucune configuration locale du client
n'intervient.

**Why this priority**: c'est l'exigence qui a motivé la tranche. Une longueur de
gong lue de part et d'autre depuis deux configurations est un **miroir
asynchrone** : rien ne garantit qu'elles s'accordent, et un client compilé avant
un changement afficherait des chiffres faux sans que rien ne le détecte. Une
valeur transportée par la réponse ne peut pas être périmée de plus d'une requête.

**Independent Test**: modifier la longueur du gong du serveur sans rien changer
au client, et vérifier que les aperçus du client suivent dès la réponse
suivante.

**Acceptance Scenarios**:

1. **Given** un serveur dont le gong change, **When** le client reçoit sa
   réponse suivante, **Then** ses aperçus, ses compteurs et sa page de règles
   emploient la nouvelle longueur, sans rechargement ni recompilation.
2. **Given** le client, **When** on cherche d'où il tire la longueur du gong,
   **Then** il n'existe **aucune** configuration locale qui la porte.
3. **Given** une réponse du serveur, **When** elle n'annonce aucune longueur de
   gong, **Then** le client la traite comme il traite une divergence de
   catalogue : il ne présente aucun chiffre dérivé plutôt qu'un chiffre douteux.
4. **Given** le client, **When** il émet une commande, **Then** il ne peut y
   faire figurer aucune longueur de gong — le serveur ne l'accepterait pas.

---

### User Story 4 — Rien ne change pour le joueur d'aujourd'hui (Priority: P1)

Sur un serveur au gong canonique, chaque chiffre affiché, chaque durée, chaque
taux et chaque refus sont identiques à ce qu'ils étaient avant cette tranche.

**Why this priority**: le Gong est un changement d'unité, pas d'équilibrage. La
seule preuve acceptable qu'il n'a rien déplacé est l'égalité stricte, valeur par
valeur, et pas une inspection.

**Independent Test**: comparer, au gong canonique, l'intégralité des durées et
des taux résolus aux valeurs du catalogue d'avant la tranche.

**Acceptance Scenarios**:

1. **Given** le gong canonique, **When** on résout les quinze durées du
   catalogue à tous les niveaux admissibles, **Then** chacune est **égale** à la
   valeur d'avant la tranche.
2. **Given** le gong canonique, **When** on résout les taux de production à tous
   les niveaux admissibles, **Then** chacun est **égal** à la valeur d'avant.
3. **Given** le gong canonique, **When** on rejoue les parcours de bout en bout
   de 001, **Then** ils passent sans modification.

---

### User Story 5 — Le gong appartient au serveur, jamais au joueur (Priority: P2)

Deux joueurs d'un même serveur battent au même gong. Aucun réglage, aucun achat,
aucune option ne permet à l'un d'aller plus vite que l'autre.

**Why this priority**: c'est la ligne rouge du projet. Un univers rapide est
légitime — tout le monde y joue les mêmes règles. Un **joueur** rapide sur un
serveur normal est du pay2win, et ce serait la première fois que le jeu en
offrirait le moyen.

**Independent Test**: chercher tout chemin par lequel la longueur du gong
pourrait varier d'un joueur à l'autre sur un même serveur.

**Acceptance Scenarios**:

1. **Given** un serveur, **When** deux joueurs différents demandent leur état,
   **Then** la longueur de gong annoncée est la même.
2. **Given** le contrat, **When** on l'inspecte, **Then** aucune commande ne
   comporte de longueur de gong, ni rien qui la modifie.
3. **Given** une longueur de gong, **When** le serveur démarre, **Then** elle
   vaut pour toute la durée de vie du processus et pour tous ses joueurs.

### Edge Cases

- **Une longueur de gong qui ne résout pas en nombres entiers.** Les taux
  doivent rester exprimables sans fraction, sous peine de ruiner l'exactitude à
  la seconde promise par 001. Une longueur qui n'y parvient pas est refusée au
  démarrage, avec la raison nommée.
- **Une longueur de gong absente ou mal formée.** Le démarrage s'arrête plutôt
  que de retomber en silence sur une valeur par défaut : un serveur qui bat au
  mauvais rythme est indétectable de l'intérieur.
- **Une durée résolue sous la seconde.** Elle vaut une seconde. Le jeu conserve
  la notion d'attente, et le modèle de temps refuse une durée nulle.
- **Un changement de longueur de gong sur une base déjà peuplée.** Les
  ressources accumulées depuis la dernière consolidation sont créditées au
  nouveau taux : c'est une aubaine ou une perte, jamais une incohérence. Le
  remède relève de l'exploitation, et doit être documenté.
- **Un client qui reçoit une longueur de gong inconnue de lui.** Il l'applique :
  la longueur est une donnée du serveur, pas une valeur à valider contre une
  liste embarquée qui serait, elle, périmable.
- **Un chantier lancé avant un changement de gong.** Son échéance est déjà
  fixée : elle ne bouge pas. Une échéance qui se recalculerait rétroactivement
  serait une règle rétroactive.

## Requirements *(mandatory)*

### Functional Requirements

**L'unité**

- **FR-001**: Le catalogue MUST exprimer toutes ses durées — construction,
  démolition, déblaiement — en **gongs entiers**.
- **FR-002**: Le catalogue MUST exprimer ses productions **par gong**.
- **FR-003**: Le gong canonique MUST valoir **dix secondes**, valeur pour
  laquelle le catalogue actuel s'exprime en gongs entiers sans rééquilibrage.
- **FR-004**: Le gong MUST NOT toucher une grandeur sans dimension de temps :
  coûts, capacités, consommation et production d'énergie, empreintes et règles
  de placement restent inchangés.

**La longueur du gong**

- **FR-005**: Chaque serveur MUST déclarer la longueur de son gong, exprimée
  exactement — jamais par une valeur approchée.
- **FR-006**: Une longueur de gong MUST NOT être acceptée si elle ne permet pas
  de résoudre les taux du catalogue en nombres entiers ; le serveur refuse alors
  de démarrer en nommant la raison.
- **FR-007**: Une longueur de gong absente ou mal formée MUST empêcher le
  démarrage.
- **FR-008**: Une durée résolue MUST valoir au moins une seconde.
- **FR-009**: La résolution d'une durée ou d'un taux MUST rester **refaisable à
  la main** par le joueur, à partir des valeurs publiées.
- **FR-010**: Au gong canonique, chaque durée et chaque taux résolus MUST être
  **égaux** aux valeurs du jeu d'avant cette tranche.

**L'annonce au client**

- **FR-011**: Le serveur MUST annoncer la longueur de son gong dans la réponse
  qui porte l'état de la planète, avec cet état.
- **FR-012**: Le client MUST employer la longueur annoncée par le serveur, et
  MUST NOT disposer d'aucune configuration locale la portant.
- **FR-013**: Une réponse sans longueur de gong MUST être traitée par le client
  comme une divergence : aucun chiffre dérivé ne lui est présenté. L'**absence
  de toute réponse** — un écran ouvert hors session — appelle la même prudence
  et le même refus d'afficher un chiffre dérivé, avec son propre message : ne
  rien savoir n'est pas la même chose que se savoir en désaccord.
- **FR-014**: Le contrat MUST NOT offrir au client le moyen d'émettre ni
  d'influencer une longueur de gong : aucune commande n'en comporte.
- **FR-015**: Le client MUST continuer de calculer ses aperçus localement : la
  tranche ne crée aucun point d'aperçu côté serveur.

**La publication**

- **FR-016**: La page de règles MUST énoncer la longueur du gong du serveur dès
  qu'un instantané a été reçu. **Tant qu'aucun ne l'a été** — la page est
  lisible sans compte et n'appelle aucune route —, elle MUST dire qu'elle ne
  connaît pas la longueur de ce serveur, plutôt que d'en supposer une.
- **FR-017**: La page de règles MUST donner chaque durée en gongs **et** en
  secondes, et chaque production par gong **et** par heure. Tant qu'aucun
  instantané n'a été reçu, elle MUST publier la colonne des **gongs déclarés**
  seule — ce sont des valeurs du catalogue embarqué, pas des chiffres dérivés —
  et n'afficher **aucune seconde** (FR-013).
- **FR-018**: Les durées présentées ailleurs dans l'interface — aperçus,
  chantier en cours, compte à rebours — MUST être exprimées en **temps réel**,
  et non en gongs.

**L'invariant d'équité**

- **FR-019**: La longueur du gong MUST être une propriété du serveur, identique
  pour tous ses joueurs.
- **FR-020**: Le jeu MUST NOT offrir de chemin par lequel la longueur du gong
  varierait d'un joueur à l'autre sur un même serveur.

**La documentation**

- **FR-021**: Le vocabulaire de `docs/design/conception-du-jeu.md` MUST gagner
  le Gong.
- **FR-022**: La feuille de route du même document MUST être décalée : le
  système solaire passe en 004, et les tranches suivantes d'autant.

### Key Entities

- **Gong** : l'unité de temps dans laquelle le jeu déclare ses durées et ses
  productions. Un chantier dure un nombre entier de gongs ; un extracteur produit
  un nombre entier de grains par gong.
- **Longueur du gong** : la durée réelle d'un gong sur un serveur donné,
  exprimée exactement — donc éventuellement **fractionnaire**. Dix secondes est
  la valeur canonique ; une valeur plus courte fait battre le serveur plus vite.
  Le caractère fractionnaire n'est pas un détail : borner la longueur du gong à
  la seconde entière plafonnerait l'accélération à un facteur dix, ce qui ne
  suffit pas à traverser une progression pendant une séance de test.
- **Catalogue résolu** : le catalogue tel qu'il vaut sur un serveur donné, une
  fois sa longueur de gong appliquée. C'est lui que le jeu emploie, et c'est lui
  que la page de règles publie.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Au gong canonique, **100 %** des durées et des taux résolus sont
  égaux à ceux du jeu d'avant la tranche, à tous les niveaux admissibles.
- **SC-002**: Sur deux serveurs dont les gongs sont dans un rapport de 1 à N,
  tout délai du jeu — chantier comme accumulation de ressources — est accéléré
  dans le **même rapport**, et jamais l'un sans l'autre. Deux précisions, sans
  lesquelles le critère n'est pas vérifiable :
  - les **taux** et les **bases de durée** suivent le rapport **exactement**,
    dès lors que la base se résout sans reste ;
  - une base qui ne se résout pas sans reste tronque **une fois** (FR-008,
    FR-009), et la courbe reporte cet écart ; le délai résolu reste alors dans
    le rapport à `courbe(niveau)` près, borné et calculable. Au **gong
    canonique**, aucune troncature n'a lieu et le rapport est exact partout.
- **SC-003**: Un joueur refait à la main n'importe quelle durée et n'importe
  quel taux affichés, à partir des seules valeurs publiées par la page de
  règles.
- **SC-004**: Un changement de longueur de gong sur le serveur se reflète dans
  le client en **une requête**, sans rechargement ni recompilation.
- **SC-005**: Il n'existe **aucune** configuration côté client portant une
  longueur de gong.
- **SC-006**: Il n'existe **aucun** chemin permettant à deux joueurs d'un même
  serveur de battre à des gongs différents.
- **SC-007**: Aucune longueur de gong produisant un taux fractionnaire ne permet
  au serveur de démarrer.
- **SC-008**: Les parcours de bout en bout de 001 passent sans modification au
  gong canonique.

## Assumptions

- **Le gong canonique vaut dix secondes**, parce que c'est le plus grand commun
  diviseur des quinze durées du catalogue actuel. Le choix est dicté par la
  donnée existante, non par le goût : toute autre valeur imposerait de
  rééquilibrer.
- **Les serveurs rapides visés par cette tranche sont locaux.** La tranche rend
  les univers rapides *possibles* ; elle ne les spécifie pas, ne les nomme pas
  au joueur et n'en ouvre aucun. Leur conception — équilibrage, durée de vie,
  place dans le produit — reste à faire.
- **La longueur du gong est publique.** Elle gouverne ce que le joueur voit
  s'écouler, et la page de règles l'énonce.
- **Le contrat `/v1` évolue par ajout**, la longueur du gong s'ajoutant à côté
  des valeurs que la réponse porte déjà pour la même raison — l'instant serveur
  et la version de catalogue.
- **Le mécanisme de divergence de catalogue reste en place** et garde son rôle :
  le client embarque toujours le catalogue de base, dont seule la version est
  comparée. Le gong ne le remplace pas.

## Hors périmètre

- Aucune modification d'équilibrage : ni coût, ni capacité, ni énergie, ni
  courbe de production, ni durée exprimée en gongs.
- Aucun univers rapide ouvert, nommé ou proposé au joueur.
- Aucun changement du modèle de temps interne : l'instant du jeu reste un entier
  de secondes, et la projection continue de compter en secondes. Faire du gong
  l'unité **native** du domaine est une question ouverte, consignée comme telle.
- Aucun point d'aperçu côté serveur : le client continue de calculer.
- Aucune migration de données : les durées déjà fixées ne sont pas recalculées.
