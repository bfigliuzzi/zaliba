# Feature Specification: La planète mère

**Feature Branch**: `001-la-planete-mere`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description:

> Permettre à un nouveau joueur de fonder sa colonie sur une planète et de la
> faire croître dans le temps, en composant avec une surface constructible
> réellement contraignante.
>
> À l'inscription, le joueur s'installe sur sa planète mère, un Berceau : une
> grille régulière de 6 sur 6 cases, dont une dizaine sont obstruées au départ,
> et qui porte une veine de chacune des trois ressources — Camelote, Jus et Bave
> d'étoiles.
>
> Chaque bâtiment occupe une empreinte de forme fixe sur la grille : une case,
> deux en ligne, un carré de quatre, un L, un T, un rectangle de six, un carré
> de neuf. Le joueur peut faire pivoter une empreinte par quart de tour, mais pas
> la retourner. Une empreinte doit tenir entièrement sur des cases libres et
> contiguës. L'empreinte d'un bâtiment ne change jamais quand on l'améliore :
> elle est choisie une fois pour toutes à la pose.
>
> Une case peut porter une veine. Une veine ne produit que si elle est recouverte
> par le bâtiment correspondant : une mine sur une veine de Camelote, un puits
> sur un geyser de Jus. Recouvrir plusieurs veines d'un seul bâtiment est le
> meilleur placement possible, et savoir si c'est réalisable dépend de la forme
> de l'empreinte et des obstacles alentour.
>
> Les cases obstruées peuvent être déblayées contre des ressources et du temps.
> Le type d'obstacle indique ce qu'il libère : du terrain nu, ou une veine. Le
> joueur sait toujours ce qu'il obtiendra avant de payer — rien n'est caché, rien
> n'est tiré au sort.
>
> Le joueur peut démolir un bâtiment et récupérer une partie de son coût, afin de
> réorganiser sa planète quand il débloque de la place.
>
> Un seul chantier à la fois sur la planète, qu'il s'agisse d'une construction,
> d'une amélioration, d'une démolition ou d'un déblaiement.
>
> Les ressources s'accumulent en continu, y compris quand le joueur n'est pas
> connecté. Pendant qu'il joue, ses compteurs progressent sous ses yeux. À sa
> reconnexion, il retrouve exactement ce que le temps écoulé lui devait, à la
> seconde près, quelle qu'ait été la durée de son absence — une heure ou trois
> semaines.
>
> Le joueur doit pouvoir comprendre avant d'agir : le coût exact, la durée exacte
> et le gain de production exact de toute action sont consultables avant la
> décision, jamais découverts après. Les règles de calcul sont exposées et non
> devinées : un joueur doit pouvoir reproduire à la main n'importe quel chiffre
> que le jeu lui affiche.
>
> Toute la manipulation de la grille — sélectionner un bâtiment, le faire
> pivoter, le placer, le démolir — doit être intégralement réalisable au clavier
> seul, et compréhensible par un lecteur d'écran.
>
> Hors périmètre de cette itération : les six autres planètes du système et le
> choix du berceau, la colonisation, la recherche et les technologies, les bonus
> d'adjacence entre bâtiments voisins, le transport entre planètes, les flottes,
> le combat, le marché, les alliances, la diplomatie, les mini-jeux, et toute
> forme de monétisation.

**Arbitrages tranchés avec le responsable du dépôt** : catalogue à trois
extracteurs, entrepôts et énergie ; plafond de stockage par ressource avec perte
à saturation ; propriétaire et occupant modélisés comme deux notions distinctes ;
disposition du Berceau unique et identique pour tous les joueurs.

**Rôle des ressources, tranché avec le responsable du dépôt** : la **Camelote** et
la **Bave d'étoiles** servent à la construction et à la recherche ; le **Jus** sert
à la propulsion des flottes et, éventuellement, à la recherche. L'**énergie** est
une ressource **à part** : instantanée, ni stockée ni plafonnée, produite par un
bâtiment dédié et consommée par tous les autres bâtiments. Le Jus n'est donc
**pas** l'énergie — le conflit lexical du document de conception est clos.

Deux conséquences pour cette itération, la recherche et les flottes étant hors
périmètre : les coûts se libellent en Camelote et en Bave d'étoiles, et le Jus n'y
a aucun emploi. Voir « Assumptions » pour la contrepartie assumée.

**Références** : la mécanique de grille, le vocabulaire et l'ordre des
spécifications sont arrêtés dans
[`docs/design/conception-du-jeu.md`](../../docs/design/conception-du-jeu.md) —
cette spécification est la spécification 001 de sa feuille de route. Les
divergences introduites ici sont recensées en fin de document et le document de
conception doit être corrigé en conséquence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fonder sa colonie et la voir produire (Priority: P1)

Un nouveau joueur s'inscrit. Il est installé sur son Berceau : une grille 6×6
dont il voit d'un seul coup d'œil les cases libres, les cases obstruées et les
trois gisements. Il dispose d'un stock de départ et d'une production de base. Ses
compteurs de Camelote, de Jus et de Bave d'étoiles progressent sous ses yeux
pendant qu'il regarde sa planète. Il se déconnecte, revient une heure plus tard
ou trois semaines plus tard, et retrouve exactement ce que les règles publiées
lui devaient pour le temps écoulé, à la seconde près.

**Why this priority**: sans planète qui produit, aucune autre tranche n'a de
sens. C'est le socle de tout le jeu et la validation la moins coûteuse du modèle
de temps, qui est le sujet même du genre.

**Independent Test**: entièrement testable en créant un compte, en relevant les
compteurs, en avançant l'instant d'observation, et en comparant au calcul mené à
la main depuis les règles publiées. Livre de la valeur seule : le joueur possède
une planète vivante.

**Acceptance Scenarios**:

1. **Étant donné** un joueur qui vient de s'inscrire, **quand** il ouvre sa
   planète, **alors** il voit une grille 6×6, 10 cases obstruées, 26 cases
   libres dont trois portant respectivement une veine de Camelote, un geyser de
   Jus et un récif de Bave d'étoiles, et son stock de départ.
2. **Étant donné** deux joueurs qui viennent de s'inscrire, **quand** on compare
   leurs planètes, **alors** les dispositions d'obstacles et de gisements sont
   identiques.
3. **Étant donné** un joueur dont la planète produit, **quand** il observe ses
   compteurs sans agir, **alors** ils progressent de façon continue et cohérente
   avec le taux de production affiché.
4. **Étant donné** un joueur absent depuis trois semaines, **quand** il se
   reconnecte, **alors** chaque compteur vaut exactement le résultat des règles
   publiées appliquées au temps écoulé, plafond compris, sans écart d'une
   seconde.
5. **Étant donné** un joueur dont une ressource a atteint son plafond pendant son
   absence, **quand** il se reconnecte, **alors** cette ressource vaut exactement
   son plafond et le jeu indique depuis combien de temps la saturation dure et
   quelle quantité a été perdue.
6. **Étant donné** un joueur sans aucun bâtiment ni aucune ressource, **quand**
   le temps passe, **alors** la production de base fait croître ses compteurs :
   il n'existe aucun état à partir duquel il soit définitivement bloqué.

---

### User Story 2 - Poser un bâtiment sur la grille (Priority: P2)

Le joueur choisit un type de bâtiment, choisit une variante d'empreinte parmi
celles que ce type propose, la fait pivoter par quarts de tour, la déplace sur la
grille et la pose. Le jeu lui montre, avant de valider, si le placement est
valide, combien de gisements l'empreinte recouvrirait, ce que la construction
coûte et combien de temps elle prend. Toute cette manipulation est réalisable au
clavier seul et restituée à un lecteur d'écran.

**Why this priority**: c'est la mécanique qui donne son identité au jeu. C'est
aussi, de l'avis du document de conception, l'interface la plus difficile du
projet ; la livrer tôt est un choix assumé.

**Independent Test**: testable seule sur la planète initiale, en posant un
extracteur sur son gisement et en vérifiant que la production augmente du montant
annoncé avant la pose.

**Acceptance Scenarios**:

1. **Étant donné** une empreinte sélectionnée, **quand** le joueur demande une
   rotation, **alors** l'empreinte pivote d'un quart de tour et n'atteint jamais
   sa forme miroir, quel que soit le nombre de rotations.
2. **Étant donné** un placement dont une case sortirait de la grille, serait
   obstruée ou serait déjà occupée, **quand** le joueur tente de valider,
   **alors** le placement est refusé et le motif exact est énoncé.
3. **Étant donné** un placement valide recouvrant deux veines de Camelote,
   **quand** le joueur consulte l'aperçu, **alors** la production annoncée est
   exactement le double de celle d'un placement recouvrant une seule veine, tous
   autres facteurs égaux.
4. **Étant donné** une mine posée sur zéro gisement, **quand** le joueur consulte
   sa production, **alors** elle vaut zéro, et cette valeur était annoncée avant
   la pose.
5. **Étant donné** un chantier en cours, **quand** le joueur tente de lancer une
   construction, **alors** elle est refusée avec le motif et l'instant
   d'achèvement du chantier en cours.
6. **Étant donné** un joueur qui n'utilise que le clavier, **quand** il
   sélectionne un type, choisit une variante, pivote, déplace et pose,
   **alors** le parcours aboutit sans qu'aucun dispositif de pointage soit
   nécessaire.
7. **Étant donné** un lecteur d'écran, **quand** le curseur de grille se déplace,
   **alors** la position, le contenu de la case, l'empreinte courante, son
   orientation, la validité du placement et le nombre de gisements recouverts
   sont restitués.

---

### User Story 3 - Alimenter la colonie en énergie (Priority: P3)

**Tous les bâtiments consomment de l'énergie**, sauf la centrale, qui en produit.
Le Berceau en fournit une quantité de base. Quand la consommation dépasse la
production, tout ce qui produit voit son rendement réduit au prorata, dans une
proportion affichée et exacte ; ce qui ne produit rien — l'entrepôt — n'est pas
dégradé, mais sa consommation pèse sur le rapport de toute la planète. Le joueur
voit l'effet énergétique de toute construction ou amélioration avant de la
lancer.

**Why this priority**: la contrainte d'énergie doit exister avant que le joueur
puisse la déclencher, c'est-à-dire dès qu'il peut poser plusieurs extracteurs.
Livrée après la tranche P2, elle arrive juste à temps.

**Independent Test**: testable en provoquant un déficit et en vérifiant que la
production effective de chaque extracteur vaut sa production nominale multipliée
par le rapport énergie produite sur énergie consommée.

**Acceptance Scenarios**:

1. **Étant donné** une consommation inférieure ou égale à la production
   d'énergie, **quand** le joueur consulte sa production, **alors** le rapport
   d'énergie affiché vaut 1 et aucun rendement n'est réduit.
2. **Étant donné** une production de 60 pour une consommation de 100, **quand**
   le joueur consulte un extracteur, **alors** sa production effective vaut
   exactement 60 % de sa production nominale, et les deux valeurs sont affichées.
3. **Étant donné** une amélioration qui ferait basculer la planète en déficit,
   **quand** le joueur consulte son aperçu, **alors** le nouveau rapport
   d'énergie et la production effective résultante sont annoncés avant paiement.
4. **Étant donné** un entrepôt posé et une planète en déficit d'énergie,
   **quand** le joueur consulte ses plafonds, **alors** ils sont inchangés, et
   **quand** il consulte le détail de l'énergie, **alors** la consommation de
   l'entrepôt y figure et contribue au rapport qui dégrade les extracteurs.

---

### User Story 4 - Améliorer un bâtiment (Priority: P4)

Le joueur porte un bâtiment au niveau suivant. Le coût et la durée croissent
selon des courbes publiées ; l'empreinte, elle, ne change pas d'un pouce. Le gain
de production exact est affiché avant paiement.

**Why this priority**: c'est la voie de progression qui ne consomme pas de
surface, donc celle qui reste disponible quand la grille est saturée.

**Independent Test**: testable seule sur un extracteur déjà posé, en comparant le
gain annoncé au gain constaté et en vérifiant que les cases occupées sont
inchangées.

**Acceptance Scenarios**:

1. **Étant donné** un bâtiment de niveau N, **quand** il atteint le niveau N+1,
   **alors** l'ensemble des cases qu'il occupe est identique, à la case près.
2. **Étant donné** un aperçu d'amélioration, **quand** le joueur le consulte,
   **alors** le coût, la durée, la production actuelle, la production après
   amélioration et la différence entre les deux sont affichés.
3. **Étant donné** des ressources insuffisantes, **quand** le joueur tente
   l'amélioration, **alors** elle est refusée, le manque exact par ressource est
   énoncé, ainsi que le temps restant avant de pouvoir payer au rythme courant.

---

### User Story 5 - Déblayer une case obstruée (Priority: P5)

Le joueur choisit une case obstruée. Le jeu lui indique le coût, la durée et ce
que le déblaiement libérera : du terrain nu, ou un gisement d'une ressource
nommée. Il paie en connaissance de cause. Rien n'est caché, rien n'est tiré au
sort.

**Why this priority**: premier antidote au risque d'une grille figée à vie
identifié par le document de conception. C'est ce qui étale les décisions de
placement dans le temps.

**Independent Test**: testable seule en déblayant une case et en vérifiant que ce
qui apparaît correspond exactement à ce qui était annoncé.

**Acceptance Scenarios**:

1. **Étant donné** une case obstruée, **quand** le joueur la sélectionne,
   **alors** le coût, la durée et la nature exacte du résultat sont affichés
   avant tout paiement.
2. **Étant donné** un déblaiement achevé annonçant un geyser de Jus, **quand** le
   joueur observe la case, **alors** elle est libre et porte un geyser de Jus.
3. **Étant donné** deux joueurs déblayant la même case de leur Berceau, **quand**
   les deux déblaiements s'achèvent, **alors** les deux résultats sont
   identiques : aucun tirage au sort n'intervient.

---

### User Story 6 - Démolir pour réorganiser (Priority: P6)

Le joueur démolit un bâtiment, récupère une partie de son coût cumulé et libère
ses cases, afin de réorganiser sa planète quand du terrain se libère.

**Why this priority**: second antidote à la grille figée. Sans elle, une erreur
de placement est définitive et le puzzle meurt après vingt minutes.

**Independent Test**: testable seule en démolissant un bâtiment et en vérifiant
le remboursement, la libération des cases et la disparition de sa production.

**Acceptance Scenarios**:

1. **Étant donné** un bâtiment de niveau 3, **quand** le joueur consulte l'aperçu
   de démolition, **alors** le remboursement annoncé est la fraction publiée du
   coût cumulé des trois niveaux, et la durée est affichée.
2. **Étant donné** une démolition achevée, **quand** le joueur observe la grille,
   **alors** les cases sont libres, les gisements qu'elles portaient sont
   intacts, et la production du bâtiment a cessé à l'instant exact de
   l'achèvement.
3. **Étant donné** un remboursement qui dépasserait le plafond d'une ressource,
   **quand** le joueur consulte l'aperçu, **alors** le montant écrêté est annoncé
   avant confirmation.

---

### User Story 7 - Étendre sa capacité de stockage (Priority: P7)

Le joueur pose et améliore des entrepôts pour relever le plafond de ses
ressources et retarder la saturation. Le jeu affiche, par ressource, la capacité,
le remplissage et le temps restant avant saturation.

**Why this priority**: la saturation est une perte réelle ; le joueur doit pouvoir
la repousser. La capacité de base du Berceau rend cette tranche différable sans
rendre les précédentes injouables.

**Independent Test**: testable seule en posant un entrepôt et en vérifiant que le
plafond et le temps avant saturation augmentent des montants annoncés.

**Acceptance Scenarios**:

1. **Étant donné** un entrepôt posé, **quand** le joueur consulte ses plafonds,
   **alors** chacun a augmenté exactement du montant annoncé avant la pose.
2. **Étant donné** une ressource à 80 % de son plafond, **quand** le joueur
   consulte son tableau de ressources, **alors** le temps restant avant
   saturation est affiché au rythme de production courant.
3. **Étant donné** une ressource saturée, **quand** le temps passe, **alors** la
   quantité stockée n'augmente plus et la quantité perdue est comptabilisée et
   consultable.

---

### User Story 8 - Consulter les règles de calcul (Priority: P8)

Le joueur ouvre les règles du jeu et y trouve les formules, les courbes et les
valeurs de catalogue qui produisent les chiffres qu'il voit. Il peut reprendre
n'importe quel nombre affiché et le retrouver à la main.

**Why this priority**: c'est la promesse faite à P4, « a besoin de tout savoir
pour s'amuser ». Elle est différable parce que chaque tranche précédente affiche
déjà ses propres chiffres exacts avant décision ; cette tranche livre la
référence consolidée.

**Independent Test**: testable seule en prenant un échantillon de chiffres
affichés en jeu et en vérifiant qu'ils se recalculent à la main depuis la seule
page de règles.

**Acceptance Scenarios**:

1. **Étant donné** une production affichée, **quand** le joueur consulte son
   détail, **alors** elle est décomposée en ses facteurs — valeur de base du
   type, facteur de niveau, nombre de gisements recouverts, rapport d'énergie —
   dont le produit redonne la valeur affichée.
2. **Étant donné** un coût ou une durée affichés, **quand** le joueur consulte
   les règles, **alors** il y trouve la courbe nommée, ses paramètres et le
   niveau appliqué, suffisants pour reproduire la valeur.
3. **Étant donné** l'ensemble des chiffres affichés sur la planète, **quand** on
   les recalcule à la main depuis les règles publiées, **alors** aucun écart
   n'apparaît.

---

### Edge Cases

- Aucune empreinte d'un type donné ne tient nulle part sur la grille : le type
  reste consultable, son aperçu énonce l'impossibilité et son motif.
- La grille est entièrement occupée : seules la démolition et le déblaiement
  peuvent libérer de la place, et le jeu le dit.
- Le joueur demande un second chantier : refus, motif, échéance du chantier en
  cours. Aucune file, aucun remplacement implicite.
- Le joueur demande la démolition d'un bâtiment déjà cible du chantier en cours :
  refus avec motif.
- Les ressources deviennent insuffisantes entre l'affichage de l'aperçu et la
  confirmation : l'action est refusée au moment de la confirmation, avec le
  manque exact.
- Une amélioration fait basculer la planète en déficit d'énergie : annoncé avant
  paiement, jamais découvert après.
- Une ressource sature pendant l'absence du joueur : la quantité retrouvée vaut
  exactement le plafond, et la perte est comptabilisée.
- Un remboursement de démolition dépasse un plafond : écrêté, avec le montant
  écrêté annoncé avant confirmation.
- Un chantier arrive à échéance pendant l'absence du joueur : il s'applique à
  l'instant de son échéance, et non à l'instant de la reconnexion. La production
  nouvelle court depuis l'échéance.
- Deux vues du jeu sont ouvertes simultanément : l'unicité du chantier reste
  garantie ; la seconde demande est refusée.
- Le joueur observe sa planète très longtemps sans agir : la consultation ne
  modifie jamais l'état de la planète.

## Requirements *(mandatory)*

### Functional Requirements

Les identifiants sont stables et opposables. `FR-023b` porte un suffixe littéral
parce qu'il a été inséré après coup : renuméroter les quarante exigences suivantes
aurait invalidé les renvois de `research.md`, `data-model.md`, `contracts/` et
`tasks.md`. Le suffixe est assumé, il n'est pas une négligence.

**Fondation et planète**

- **FR-001**: Le système MUST installer tout nouveau joueur sur une planète mère
  de l'archétype Berceau, sans lui demander de choix de planète.
- **FR-002**: Le Berceau MUST être une grille rectangulaire de 6 sur 6 cases,
  soit 36 cases.
- **FR-003**: La disposition initiale du Berceau — cases obstruées, types
  d'obstacles et gisements — MUST être identique pour tous les joueurs et MUST
  provenir d'un catalogue de données publié, sans aucun tirage au sort.
- **FR-004**: La disposition initiale MUST comporter 10 cases obstruées et 26
  cases libres, dont exactement une portant une veine de Camelote, une portant un
  geyser de Jus et une portant un récif de Bave d'étoiles.
- **FR-005**: La disposition initiale MUST garantir que chacune des sept
  empreintes du vocabulaire admet au moins un placement valide, et que pour
  chacune des trois ressources il existe au moins un placement valide de
  l'extracteur correspondant recouvrant son gisement.
- **FR-006**: Une planète MUST porter deux notions distinctes, un propriétaire et
  un occupant courant. À l'inscription, le joueur MUST être l'un et l'autre pour
  son Berceau. Aucune mécanique de cette itération ne les dissocie.
- **FR-007**: Toute action modifiant une planète MUST être autorisée d'après
  l'occupant courant constaté au moment de la modification, et non d'après une
  vérification antérieure.

**Empreintes et placement**

- **FR-008**: Le vocabulaire des empreintes MUST être fermé et compter exactement
  sept formes : une case, deux en ligne, un carré de quatre, un L de quatre
  cases, un T de quatre cases, un rectangle de six et un carré de neuf.
- **FR-009**: Le catalogue MUST associer à chaque type de bâtiment une ou
  plusieurs variantes d'empreinte de même surface et de caractéristiques
  identiques : le choix entre variantes MUST être purement géométrique et ne
  MUST jamais porter d'avantage chiffré.
- **FR-010**: Le joueur MUST choisir la variante d'empreinte et son orientation à
  la pose. Les deux MUST être figées pour toute la vie du bâtiment.
- **FR-011**: Une empreinte MUST pouvoir pivoter par quarts de tour. Le
  retournement MUST être impossible : la forme miroir d'une empreinte n'est
  jamais atteignable.
- **FR-012**: Un placement MUST être valide si et seulement si toutes les cases
  de l'empreinte orientée sont dans la grille, libres, non obstruées et non
  occupées par un autre bâtiment.
- **FR-013**: Un placement refusé MUST l'être avec l'énoncé du motif exact.
- **FR-014**: Le catalogue MUST autoriser plusieurs bâtiments d'un même type sur
  une même planète : seule la surface disponible contraint leur nombre.

**Gisements et production**

- **FR-015**: Une case MUST porter au plus un gisement, d'une seule ressource.
- **FR-016**: Un gisement MUST ne produire que s'il est entièrement recouvert par
  l'extracteur correspondant à sa ressource.
- **FR-017**: La production d'un extracteur MUST être proportionnelle au nombre
  de gisements de sa ressource qu'il recouvre ; un extracteur ne recouvrant aucun
  gisement MUST produire zéro.
- **FR-018**: Le Berceau MUST fournir une production de base non nulle pour
  chaque ressource, indépendante des bâtiments et insensible au déficit
  d'énergie, de sorte qu'aucun état de jeu ne soit définitivement bloquant.
- **FR-019**: Le système MUST attribuer à tout nouveau joueur un stock de départ
  suffisant pour construire au moins une centrale et un extracteur de niveau 1.
- **FR-020**: Les gisements MUST être visibles avant toute construction, et un
  gisement recouvert MUST rester visible en tant que tel.

**Énergie**

- **FR-021**: L'énergie MUST être une grandeur instantanée, ni stockée ni
  accumulée.
- **FR-022**: Le Berceau MUST fournir une énergie de base ; les centrales MUST en
  produire davantage selon une courbe publiée ; **tous les autres types de
  bâtiment** MUST en consommer selon une courbe publiée, qu'ils produisent une
  ressource ou non.
- **FR-023**: Lorsque la consommation d'énergie dépasse la production, la
  production de chaque bâtiment producteur MUST être multipliée par le rapport de
  l'énergie produite à l'énergie consommée. Sinon, ce rapport MUST valoir 1.
- **FR-023b**: Le rapport d'énergie MUST ne s'appliquer qu'à la production. La
  capacité de stockage d'un entrepôt MUST rester entière en déficit, alors même
  que l'entrepôt consomme de l'énergie et pèse donc sur le rapport.
- **FR-024**: Le rapport d'énergie, la production nominale et la production
  effective MUST être affichés séparément.

**Stockage et saturation**

- **FR-025**: Chaque ressource MUST avoir un plafond de stockage, égal à la
  capacité de base du Berceau augmentée de celle des entrepôts posés.
- **FR-026**: Lorsqu'une ressource atteint son plafond, sa production MUST être
  perdue et MUST être comptabilisée comme telle.
- **FR-027**: Le système MUST afficher, pour chaque ressource, la quantité
  détenue, le plafond et le temps restant avant saturation au rythme courant.
- **FR-028**: Aucun achat, sous aucune forme, MUST pouvoir relever un plafond,
  accélérer un chantier ou compenser une perte par saturation.

**Temps et accumulation**

- **FR-029**: Les ressources MUST s'accumuler de façon continue, que le joueur
  soit connecté ou non.
- **FR-030**: À toute consultation, la quantité de chaque ressource MUST être
  exactement le résultat des règles publiées appliquées au temps écoulé depuis la
  dernière transition, à la seconde près, indépendamment de la durée d'absence.
- **FR-031**: Une consultation MUST ne modifier aucun état de jeu.
- **FR-032**: L'achèvement d'un chantier MUST prendre effet à l'instant de son
  échéance et non à l'instant où il est constaté ; les effets de production MUST
  courir depuis cette échéance.

**Chantier**

- **FR-033**: Une planète MUST porter au plus un chantier actif à la fois, que ce
  soit une construction, une amélioration, une démolition ou un déblaiement.
- **FR-034**: Toute demande de chantier alors qu'un chantier est actif MUST être
  refusée, avec le motif et l'instant d'achèvement du chantier en cours.
- **FR-035**: Le lancement d'un chantier MUST exiger une confirmation explicite,
  postérieure à l'affichage du coût, de la durée et de l'effet.
- **FR-036**: Le coût d'un chantier MUST être débité à son lancement.
- **FR-037**: Un chantier lancé MUST ne pouvoir être ni annulé ni remplacé dans
  cette itération.
- **FR-038**: Le système MUST afficher le chantier en cours, sa nature, sa cible
  et le temps restant.

**Amélioration**

- **FR-039**: Un bâtiment MUST pouvoir être porté au niveau suivant, sans jamais
  changer ni la variante d'empreinte, ni l'orientation, ni les cases occupées.
- **FR-040**: Le coût et la durée d'une amélioration MUST suivre des courbes
  nommées et paramétrées, publiées avec leurs paramètres.
- **FR-041**: L'aperçu d'une amélioration MUST afficher le coût, la durée, la
  production actuelle, la production résultante et leur différence.

**Déblaiement**

- **FR-042**: Chaque case obstruée MUST porter un type d'obstacle déterminant son
  coût, sa durée et son résultat.
- **FR-043**: Le résultat d'un déblaiement MUST être soit du terrain nu, soit un
  gisement d'une ressource nommée, et MUST être annoncé avant tout paiement.
- **FR-044**: Un déblaiement MUST être déterministe : deux déblaiements de la même
  case dans le même état donnent le même résultat.
- **FR-045**: À l'achèvement, la case MUST devenir libre et porter le cas échéant
  le gisement annoncé.

**Démolition**

- **FR-046**: Un bâtiment MUST pouvoir être démoli, contre une durée et un
  remboursement d'une fraction publiée de son coût cumulé, tous niveaux payés
  compris.
- **FR-047**: À l'achèvement d'une démolition, les cases occupées MUST redevenir
  libres et les gisements qu'elles portaient MUST rester intacts.
- **FR-048**: La production d'un bâtiment démoli MUST cesser à l'instant exact de
  l'achèvement de la démolition.
- **FR-049**: Un remboursement dépassant un plafond MUST être écrêté, et le
  montant écrêté MUST être annoncé avant confirmation.

**Transparence**

- **FR-050**: Le coût exact, la durée exacte et l'effet exact de toute action MUST
  être consultables avant la décision.
- **FR-051**: Aucune valeur de coût, de durée ni d'effet MUST être découverte
  après l'action.
- **FR-052**: Aucune mécanique de cette itération MUST comporter de tirage au
  sort ni d'information cachée.
- **FR-053**: Toute production affichée MUST être décomposable en ses facteurs,
  dont le produit redonne la valeur affichée.
- **FR-054**: Les formules, les courbes nommées et leurs paramètres MUST être
  consultables en jeu, en quantité suffisante pour qu'un joueur reproduise à la
  main n'importe quel chiffre affiché.

**Intégrité**

- **FR-055**: Le système MUST n'accepter du joueur qu'une intention : un type, une
  variante, une orientation, une position, une cible.
- **FR-056**: Aucune valeur de coût, de durée, de production, de quantité ni de
  résultat fournie par le joueur MUST influencer un résultat ; toutes MUST être
  recalculées par le système.
- **FR-057**: Aucune horloge fournie par le joueur MUST servir de référence
  temporelle.

**Accessibilité**

- **FR-058**: La sélection d'un type, le choix d'une variante, la rotation, le
  déplacement, la pose, l'amélioration, la démolition et le déblaiement MUST être
  intégralement réalisables au clavier seul.
- **FR-059**: La position du curseur de grille, le contenu de la case,
  l'empreinte courante, son orientation, la validité du placement et le nombre de
  gisements recouverts MUST être restitués à un lecteur d'écran.
- **FR-060**: Le résultat de toute action — succès, refus et motif, achèvement de
  chantier — MUST être annoncé de façon perceptible sans dépendre de la couleur
  ni de la position seules.
- **FR-061**: Les parcours de cette spécification MUST respecter les critères
  WCAG 2.1 niveau AA.

**Économie de l'itération**

- **FR-062**: Les coûts de construction, d'amélioration et de déblaiement de cette
  itération MUST être libellés en Camelote et en Bave d'étoiles uniquement.
- **FR-063**: Le Jus MUST être produit, stocké et plafonné exactement comme les
  deux autres ressources, sans emploi dans cette itération : ses débouchés — la
  propulsion des flottes et la recherche — sont hors périmètre.

### Key Entities

- **Joueur** : titulaire d'un compte, propriétaire et occupant initial de son
  Berceau.
- **Planète** : une grille, un propriétaire, un occupant courant, un archétype.
  Dans cette itération, un seul archétype existe : le Berceau.
- **Case** : une position de la grille ; libre ou obstruée ; portant au plus un
  gisement ; occupée par au plus un bâtiment.
- **Obstacle** : ce qui rend une case inutilisable ; d'un type déterminant coût,
  durée et résultat de son déblaiement.
- **Gisement** : veine de Camelote, geyser de Jus ou récif de Bave d'étoiles ;
  productif seulement sous l'extracteur correspondant.
- **Empreinte** : une des sept formes du vocabulaire fermé, avec son ensemble
  d'orientations obtenues par quarts de tour.
- **Type de bâtiment** : mine, puits, racloir, centrale, entrepôt ; ses variantes
  d'empreinte, ses courbes de coût, de durée, de production, de consommation ou
  de capacité.
- **Bâtiment** : une instance posée : son type, sa variante d'empreinte, son
  orientation, sa position, son niveau, son coût cumulé.
- **Chantier** : l'unique travail actif d'une planète : sa nature, sa cible, son
  échéance.
- **Ressource détenue** : une quantité par ressource, bornée par un plafond, avec
  sa production perdue cumulée.
- **Énergie** : ressource **à part**, instantanée — ni stockée, ni accumulée, ni
  plafonnée, ni extraite d'un gisement. Produite par la centrale et par une base de
  planète, consommée par tous les autres bâtiments ; production, consommation,
  rapport.
- **Catalogue** : les données publiées du jeu : dispositions de planète, types
  d'obstacles, types de bâtiments, courbes nommées et leurs paramètres.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: depuis l'écran de planète, poser un extracteur sur son gisement
  demande au plus **quinze frappes de clavier** — sélection du type, sélection de
  la variante, déplacements du curseur, rotations, confirmation — sans consulter
  d'aide extérieure et sans qu'aucun sous-menu s'interpose. Le parcours automatisé
  compte les frappes.
- **SC-002**: 100 % des chiffres affichés sur la planète — coûts, durées,
  productions, capacités, temps avant saturation — se reproduisent à la main
  depuis les seules règles publiées en jeu.
- **SC-003**: l'écart entre les ressources retrouvées après une absence et le
  résultat des règles publiées est nul, pour des absences d'une heure comme de
  trois semaines.
- **SC-004**: 100 % des interactions de la grille sont réalisables au clavier
  seul, sans aucun recours à un dispositif de pointage.
- **SC-005**: aucun écart WCAG 2.1 niveau AA n'est constaté sur les parcours de
  cette spécification.
- **SC-006**: 100 % des secondes demandes de chantier sont refusées avec un motif
  lisible et l'échéance du chantier en cours.
- **SC-007**: 100 % des actions refusées énoncent leur motif exact et, en cas de
  ressources insuffisantes, le manque par ressource.
- **SC-008**: deux comptes créés indépendamment reçoivent une planète initiale
  identique, disposition d'obstacles et de gisements comprises.
- **SC-009**: sur une fenêtre d'affichage de **360 × 640 px**, les 36 cases de la
  grille sont visibles **sans défilement ni zoom**, le corps de texte fait au moins
  **16 px** et toute cible interactive au moins **44 × 44 px**.
- **SC-010**: aucune valeur transmise par le joueur ne modifie un coût, une durée
  ou un résultat : les tentatives sont sans effet.

## Assumptions

- Le L et le T du vocabulaire d'empreintes comptent quatre cases chacun. La liste
  de l'énoncé se lit par taille croissante — 1, 2, 4, 4, 4, 6, 9 — et le document
  de conception autorise « 3 à 4 » ; cette itération retient 4.
- Le vocabulaire de cette itération ne comporte pas l'empreinte de trois cases en
  ligne, absente de l'énoncé bien que présente dans le document de conception.
- Le catalogue initial associe : la mine à quatre cases en carré, en L ou en T ;
  le puits au rectangle de six ; le racloir au carré de neuf ; la centrale aux
  deux cases en ligne ; l'entrepôt à la case unique. Les surfaces et les courbes
  restent des données d'équilibrage.
- « Racloir » est un nom proposé pour l'extracteur de Bave d'étoiles ; « mine » et
  « puits » viennent de l'énoncé. Le nom reste à valider dans le document de
  conception.
- L'entrepôt est d'un type unique et relève simultanément le plafond des trois
  ressources, plutôt que trois types d'entrepôts spécialisés.
- Les centrales ne consomment aucune ressource pour produire de l'énergie : elles
  ne brûlent pas de Jus. Un flux continu de consommation ferait tomber à zéro une
  ressource en cours de segment, ce qui changerait les taux au milieu du segment et
  détruirait la propriété « au plus deux segments » du modèle de temps.
- **Contrepartie assumée : le Jus n'a aucun débouché en 001** (FR-062, FR-063). Ses
  deux emplois — propulsion des flottes, recherche — sont hors périmètre. Le joueur
  produit donc du Jus, le stocke, et finit par le saturer sans pouvoir le dépenser.
  Le puits, le geyser de la case (1,1) et la part Jus de l'entrepôt sont, en 001,
  d'un intérêt purement anticipé. Trois raisons de le retenir malgré tout : la
  disposition du Berceau et les trois extracteurs sont déjà arrêtés, les mécaniques
  de gisement et de plafond se valident identiquement sur les trois ressources, et
  ouvrir un débouché artificiel au Jus créerait une règle à retirer en 002. À
  réexaminer dès que la première mécanique consommatrice de Jus est spécifiée.
- **SC-001 a été requalifié.** Sa formulation d'origine — « pose son premier
  bâtiment en moins de deux minutes » — n'était pas falsifiable sans un protocole
  d'utilisabilité (combien de sujets, quel échantillon, quelle médiane) hors de
  proportion pour une alpha menée par une seule personne. Le critère retenu mesure
  la même promesse — *c'est immédiat* — par ce qui la détruirait réellement : une
  interface à sous-menus imbriqués. Un chronomètre mesurait surtout la vitesse de
  lecture du sujet. À réexaminer si une phase de test utilisateur s'ouvre.
- Le remboursement de démolition vaut la moitié du coût cumulé, valeur de
  catalogue ajustable.
- Un chantier lancé n'est pas annulable ; la confirmation explicite exigée avant
  lancement tient lieu de garde-fou contre l'erreur de manipulation.
- Les 26 cases initialement libres passent à 36 par déblaiement, ce qui place le
  Berceau dans la fourchette de 30 à 40 cases utilisables du document de
  conception.
- **Tension assumée** : le plafond avec perte à saturation contredit
  littéralement le principe produit 5 du README, « le temps n'est pas une taxe
  d'attention », ainsi que la formulation « il retrouve exactement ce que le temps
  écoulé lui devait ». La promesse retenue est : *exactement ce que les règles
  publiées donnent, saturation incluse*. Trois contreparties la rendent tenable —
  le temps restant avant saturation est affiché avant la déconnexion, la capacité
  est améliorable, et aucun achat ne peut lever un plafond (FR-028). Cette
  tension doit être réexaminée à l'équilibrage.

## Hors périmètre

Énoncés par le responsable du dépôt : les six autres planètes du système et le
choix du berceau, la colonisation, la recherche et les technologies, les bonus
d'adjacence, le transport entre planètes, les flottes, le combat, le marché, les
alliances, la diplomatie, les mini-jeux, toute forme de monétisation.

Ajoutés par cette spécification : la file de chantiers, l'annulation d'un
chantier en cours, les notifications d'achèvement, les paliers d'empreinte, et
toute mécanique dissociant effectivement le propriétaire de l'occupant.

## Divergences avec le document de conception

Le document de conception précède les spécifications et les alimente ; une
spécification prévaut pour son périmètre, et le document doit alors être corrigé.
Les points suivants sont à reporter dans
[`docs/design/conception-du-jeu.md`](../../docs/design/conception-du-jeu.md) :

1. **Empreintes** : le L et le T sont fixés à quatre cases, et l'empreinte de
   trois cases en ligne n'est pas retenue en 001.
2. **Variantes d'empreinte** : la lecture retenue de « l'empreinte est choisie une
   fois pour toutes à la pose » est que le catalogue propose, pour un même type,
   plusieurs formes de même surface et de caractéristiques identiques.
3. **Plafond de stockage et saturation** : mécanique absente du document de
   conception, arrêtée ici, avec sa tension documentée ci-dessus.
4. **Énergie** : contrainte absente du document de conception, arrêtée ici. Le
   conflit lexical avec le Jus est **clos** : l'énergie est une ressource à part,
   le Jus est un carburant de propulsion. Le §3.8 du document de conception est
   réécrit en conséquence — l'énergie est produite par un bâtiment dédié et
   consommée par **tous** les autres, et le rapport ne dégrade que la production.
5. **Nombre d'obstacles du Berceau** : 10 sur 36, là où le document parle de
   « peu d'obstacles ».
6. **Rôle des ressources** : le §1 du document de conception décrivait le Jus
   comme « énergie et carburant » ; il est corrigé. Camelote et Bave d'étoiles
   servent la construction et la recherche, le Jus la propulsion et la recherche.
