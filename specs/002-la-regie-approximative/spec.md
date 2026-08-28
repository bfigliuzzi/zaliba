# Feature Specification: La Régie approximative — l'écran de parcelle habillé

**Feature Branch**: `002-la-regie-approximative`

**Created**: 2026-08-27

**Status**: Draft

**Input**: User description: « Je t'ai mis à la racine un dossier de design
`design_handoff_regie_approximative/` que je voudrais que tu analyses et que tu
prévoies l'implémentation maintenant. »

## Contexte

La tranche 001 a livré un écran de parcelle **complet et nu** : la grille, les
compteurs, le chantier, les quatre mécaniques et leurs aperçus fonctionnent, se
pilotent au clavier et s'annoncent à un lecteur d'écran — mais l'écran n'a
aucune identité. Sa feuille de style le dit d'elle-même : « ce fichier ne
définit pas de palette, il définit une géométrie ». Les états de case sont des
caractères (`▓`, `■`, `·`, `◆`), les blocs se succèdent sans hiérarchie, et
rien n'indique au joueur ce qu'il regarde avant qu'il ne l'ait lu.

Le dossier `design_handoff_regie_approximative/` livre la direction retenue :
**La Régie approximative**. Sa fiction porte le style — *cette interface a été
produite par la Régie interplanétaire elle-même, une administration
d'amateurs* — et sa loi porte l'accessibilité : **l'approximation ne touche
jamais la donnée.** Les cadres dépassent aux angles, les étiquettes penchent,
les tampons sont de travers ; les chiffres, eux, restent d'aplomb, en chasse
fixe tabulaire, posés sur du papier, à 12,8:1.

Cette tranche donne son visage au jeu. Elle ne change **aucune règle** : ni
production, ni coût, ni durée, ni validité de placement. Ce qu'elle change est
ce que le joueur voit, entend et atteint.

**Position dans la feuille de route.** Le § 10 de
[`docs/design/conception-du-jeu.md`](../../docs/design/conception-du-jeu.md)
attribuait le numéro 002 au système solaire. Cette tranche s'intercale avant
lui : la direction artistique existe, elle est mesurée, et sept planètes
habillées par un écran sans identité coûteraient sept fois la même reprise.
Le document de conception est à amender en conséquence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — L'écran se lit d'un coup d'œil (Priority: P1)

Le joueur ouvre sa planète sur son téléphone. En une seconde, sans rien lire en
détail, il sait : où il est (le nom de la planète, en gros), ce qu'il possède
(trois compteurs, trois teintes, trois silhouettes), ce qui se construit (une
jauge et un chrono), et où il peut poser (le plan de parcelle).

**Why this priority**: c'est la raison d'être de la tranche. Un écran qui exige
d'être lu pour être compris n'est pas un écran de jeu, c'est un formulaire —
et c'est exactement ce que 001 a livré.

**Independent Test**: ouvrir l'écran de parcelle sur une fenêtre de 430 px de
large et vérifier que les sept blocs apparaissent dans l'ordre prescrit, que
chaque bloc est délimité visuellement, et qu'aucun chiffre ne repose sur un
aplat de couleur de ressource.

**Acceptance Scenarios**:

1. **Given** une planète approvisionnée, **When** le joueur ouvre l'écran de
   parcelle sur 430 px, **Then** l'écran présente, de haut en bas : la plaque
   d'en-tête, les trois compteurs de ressources, la note de bas de page, la
   plaque de chantier, le plan de parcelle, les actions et la mention finale.
2. **Given** l'écran affiché, **When** on mesure le contraste de chaque valeur
   chiffrée contre le fond qu'elle occupe, **Then** aucune n'est en dessous de
   4,5:1, et aucune ne repose directement sur la teinte de sa ressource.
3. **Given** aucun chantier en cours, **When** l'écran s'affiche, **Then** la
   plaque de chantier énonce qu'aucun chantier n'est en cours plutôt que de
   disparaître ou d'afficher une jauge vide sans explication.

---

### User Story 2 — La grille se lit sans distinguer les couleurs (Priority: P1)

Le joueur ne distingue pas le rouge du vert, ou lit son écran en plein soleil,
ou l'a passé en niveaux de gris, ou navigue en mode contrastes forcés. Il
identifie malgré tout chaque case : sa silhouette le lui dit.

**Why this priority**: c'est le contrat qui a produit la direction artistique.
Les hachures de la version précédente ont été supprimées parce qu'elles étaient
laides ; la silhouette les remplace parce qu'elle se lit à quatre pixels de
large et sous n'importe quel filtre. Sans elle, la refonte serait une
régression d'accessibilité par rapport à 001.

**Independent Test**: afficher une parcelle portant tous les états simultanément,
la passer en niveaux de gris, et faire nommer chacun d'eux par une personne qui
n'a pas participé à leur conception.

**Acceptance Scenarios**:

1. **Given** une parcelle portant tous les états de case, **When** l'écran est
   rendu en niveaux de gris, **Then** les états énumérés par FR-013 restent
   distinguables deux à deux.
2. **Given** la même parcelle, **When** le mode contrastes forcés du système est
   actif, **Then** les aplats et les ombres disparaissent, et chaque état reste
   identifiable par sa silhouette ou son style de trait.
3. **Given** la même parcelle, **When** une simulation de protanopie puis de
   deutéranopie est appliquée, **Then** aucun couple d'états ne devient
   indistinguable ; le cas connu du refus sous protanopie est documenté dans la
   page de règles du jeu.
4. **Given** l'écran large, **When** le joueur cherche la clé des silhouettes,
   **Then** une légende énumère chaque état avec sa silhouette et son libellé.

---

### User Story 3 — Poser au clavier, et savoir pourquoi c'est refusé (Priority: P1)

Le joueur arme une pose, déplace le curseur au clavier, pivote son empreinte,
et à chaque déplacement l'écran lui dit ce que la case sous le curseur permet —
et, si elle refuse, **pourquoi**.

**Why this priority**: 001 annonce déjà les déplacements ; ce que la tranche
ajoute est la **raison portée par la case elle-même**, visible et énoncée.
Sans elle, un joueur au clavier apprend le refus mais pas sa cause, et il
essaie les trente-six cases.

**Independent Test**: armer une pose, parcourir la grille aux flèches sans
souris, et vérifier que chaque case refusée nomme sa cause, à l'écran comme à
l'oreille.

**Acceptance Scenarios**:

1. **Given** une pose armée, **When** le curseur se déplace sur une case dont
   l'empreinte sortirait de la parcelle, **Then** l'écran marque le refus et
   énonce la cause « sort de la parcelle », avec la direction concernée.
2. **Given** une pose armée, **When** le curseur se déplace sur une case dont
   l'empreinte chevaucherait un bâtiment ou un obstacle, **Then** la cause
   énoncée nomme l'obstacle ou le bâtiment rencontré et sa case.
3. **Given** une pose armée valide, **When** le joueur confirme, **Then** la
   pose est acceptée, annoncée, et le tampon d'état correspondant apparaît.
4. **Given** une pose armée, **When** le joueur demande l'annulation, **Then**
   rien n'est posé et l'annulation est annoncée.
5. **Given** le focus dans la grille, **When** le joueur tabule, **Then** il
   quitte la grille en une seule tabulation, et y revient sur la case où il
   était.

---

### User Story 4 — Demander le relevé (Priority: P2)

À tout moment, le joueur demande à l'écran de lui énoncer l'état courant :
ce qu'il possède, à quel débit, ce qui se construit et pour combien de temps.

**Why this priority**: c'est un besoin d'accessibilité, pas une commodité. Les
compteurs changent en continu ; les annoncer noierait tout le reste, donc ils ne
sont **jamais** annoncés d'eux-mêmes. Le relevé est ce qui rend l'information
malgré tout accessible à qui écoute la page.

**Independent Test**: activer le bouton de relevé au clavier et vérifier que la
région d'annonce énonce l'état courant complet, sans que rien d'autre ne l'ait
énoncé entre-temps.

**Acceptance Scenarios**:

1. **Given** l'écran affiché depuis une minute, **When** le joueur active le
   relevé, **Then** l'état courant des trois ressources, de leur débit et du
   chantier est énoncé une fois.
2. **Given** l'écran affiché sans interaction, **When** une seconde s'écoule et
   les compteurs progressent, **Then** rien n'est annoncé.
3. **Given** un chantier qui s'achève, **When** l'échéance passe, **Then**
   l'événement est annoncé, sans que les compteurs le soient.

---

### User Story 5 — L'interface se corrige devant le joueur (Priority: P2)

Une valeur a changé : l'ancienne reste, rayée d'un trait qui dépasse, et la
nouvelle s'affiche à côté. Le joueur voit ce qui vient de bouger — et il le voit
encore s'il revient à l'écran une minute plus tard.

**Why this priority**: la rature est le second geste signature de la direction,
et c'est **le point le plus facile à casser** : mal balisée, elle fait énoncer
« niveau 2 3 » à un lecteur d'écran, c'est-à-dire une valeur fausse. Elle vaut
donc d'être spécifiée séparément et testée séparément.

**Independent Test**: provoquer un changement de valeur, vérifier que le visuel
rayé est ignoré des technologies d'assistance et qu'une phrase explicite porte
l'information complète.

**Acceptance Scenarios**:

1. **Given** un bâtiment amélioré du niveau 2 au niveau 3, **When** l'écran
   l'affiche, **Then** le visuel montre « niveau ~~2~~ 3 » et un lecteur
   d'écran énonce exactement « Niveau 3, anciennement niveau 2 ».
2. **Given** une valeur inchangée, **When** l'écran l'affiche, **Then** aucune
   rature n'apparaît et aucune phrase d'ancienne valeur n'est énoncée.
3. **Given** une rature affichée, **When** on mesure le contraste du texte rayé,
   **Then** il reste au-dessus de 4,5:1.

---

### User Story 6 — Le guichet, sur grand écran (Priority: P2)

Sur un écran large, l'écran de parcelle n'est pas la version mobile étirée : il
gagne un guichet. Le registre et la légende à gauche, le plan au centre, le
comptoir des ressources et le chantier à droite.

**Why this priority**: la métaphore ne tient qu'à cette condition. Une colonne
unique de 1180 px de large serait illisible, et étirer les cases de la grille à
huit centimètres détruirait la lecture d'un coup d'œil qui fait le sujet du jeu.

**Independent Test**: afficher l'écran à 1180 px et vérifier la disposition en
trois colonnes, puis réduire progressivement jusqu'à 320 px en vérifiant qu'il
n'existe qu'un seul palier de bascule et aucun débordement.

**Acceptance Scenarios**:

1. **Given** une fenêtre de 1180 px, **When** l'écran s'affiche, **Then** il
   présente trois colonnes — registre et légende, plan, comptoir — et l'en-tête
   sur toute la largeur.
2. **Given** une fenêtre que l'on réduit, **When** la largeur passe sous le
   palier, **Then** la disposition redevient une colonne unique sans perte de
   contenu et sans changement d'ordre de lecture.
3. **Given** une fenêtre de 320 px, **When** l'écran s'affiche, **Then** aucune
   barre de défilement horizontale n'apparaît et chaque case de la grille
   mesure au moins 44 px de côté.

---

### Edge Cases

- **Une valeur atteint sa longueur maximale.** Un compteur à sept chiffres, un
  nom de planète long, un nom de bâtiment long : l'étiquette de papier
  s'agrandit, elle ne tronque pas et ne réduit pas la taille du texte.
- **Aucun chantier en cours.** La plaque de chantier reste, et dit qu'il n'y en
  a pas — un bloc qui disparaît fait sauter la mise en page à chaque
  achèvement.
- **La parcelle n'est pas carrée.** Les archétypes à venir vont du 3×10 au 8×4 ;
  les bandes de coordonnées, la taille des cases et la disposition doivent
  suivre les dimensions de la parcelle, jamais une constante de 6×6.
- **Un état de case sans silhouette disponible.** Le système admet cinq à sept
  silhouettes lisibles au maximum ; un état supplémentaire exige d'ouvrir un
  autre canal de redondance (le mot, la position), jamais une teinte de plus.
- **Le mouvement est désactivé par le système.** La seule animation du système
  — la frappe de tampon — tombe à 1 ms, sans que l'apparition du tampon soit
  perdue.
- **Le zoom texte est à 200 %.** Aucun bloc ne déborde, aucun texte n'est
  tronqué, aucune cible ne descend sous 44 px.
- **Les polices ne se chargent pas.** L'écran reste lisible et sa mise en page
  ne se disloque pas : chaque famille a sa pile de repli.
- **Deux ratures simultanées.** Un niveau et un relevé changent en même temps :
  chacune porte sa propre phrase explicite, et l'ordre de lecture reste celui du
  document.

## Requirements *(mandatory)*

<!-- Numérotation propre à cette tranche. Les FR de 001 ne sont pas renumérotées. -->

### Le système visuel

- **FR-001**: L'interface MUST employer les valeurs de couleur, de typographie,
  d'espacement, de trait, d'ombre, de rotation et de rayon livrées par le
  dossier de design comme **valeurs de référence uniques**. Aucune valeur
  visuelle ne MUST être écrite en dur ailleurs que dans cette source.
- **FR-001a**: *Amendé le 2026-08-28.* La référence unique porte sur les
  **valeurs**, non sur les nombres que le dossier écrit **à propos** de ses
  valeurs. Deux écarts sont admis, et chacun MUST être vérifié plutôt que cru :
  une taille de police MUST être relevée au plancher de son rôle lorsqu'elle
  passe dessous (FR-039), et les ratios de contraste annoncés par le dossier
  MUST être **recalculés** plutôt que repris — un ratio annoncé est de la
  documentation, jamais une autorisation. Toute autre divergence avec le
  dossier — y compris une valeur opérante que le dossier ne porte pas — MUST
  être consignée avant d'être appliquée.
- **FR-002**: Toute valeur chiffrée MUST être rendue en chasse fixe à chiffres
  tabulaires, de sorte qu'un compteur qui progresse ne fasse jamais frémir les
  chiffres qui l'entourent.
- **FR-003**: Aucun chiffre ne MUST reposer sur un aplat de couleur de
  ressource ; tout chiffre posé sur un tel aplat MUST l'être sur une étiquette
  de papier.
- **FR-004**: L'écran MUST s'afficher complet sans aucune requête vers un
  domaine tiers ; les fontes MUST être servies par l'application elle-même.
- **FR-005**: Le seul mouvement de l'interface MUST être la frappe de tampon à
  l'apparition d'un tampon d'état. Aucune transition de couleur ne MUST excéder
  120 ms, et aucun élément ne MUST se déplacer, tourner ou changer de taille au
  survol ou à la prise de focus.

### La structure de l'écran

- **FR-006**: *Amendé le 2026-08-28.* Sur écran étroit, l'écran de parcelle MUST
  présenter, dans cet ordre : plaque d'en-tête, compteurs de ressources, note de
  bas de page, plaque de chantier, plan de parcelle, actions, mention finale.
  Cette énumération porte sur les **sept blocs de la Régie** et n'est pas la
  liste complète des nœuds de l'écran : le bloc d'énergie (FR-010), l'alerte de
  refus de commande (FR-022) et l'avertissement de divergence de catalogue
  (FR-011) s'y ajoutent, et leur place dans l'ordre du document MUST être fixée
  par le contrat d'interface. La rédaction précédente se lisait comme
  exhaustive ; trois nœuds réellement rendus n'y figuraient pas, et l'un d'eux —
  l'alerte de refus — n'avait de place fixée nulle part.
- **FR-007**: Au-delà d'un palier de largeur unique, l'écran MUST présenter une
  disposition en trois colonnes — registre et légende, plan de parcelle,
  comptoir des ressources et chantier — sans que l'ordre de lecture du document
  change et sans qu'aucun contenu soit perdu. Le registre MUST énumérer les
  possessions réelles du joueur : en 001 il en compte une, la planète courante,
  et cette entrée unique est vraie — une liste de voisines fictives ne le serait
  pas.
- **FR-008**: La plaque d'en-tête MUST porter l'identité de la planète et le
  surtitre administratif de la Régie. Tant que la planète n'a pas de nom propre,
  c'est le nom de son archétype qui tient ce rôle.
- **FR-008a**: Les zones de la maquette que le modèle de 001 n'alimente pas —
  ancien nom de planète, coordonnées système, possessions multiples — MUST être
  **omises plutôt que remplies d'une valeur inventée**. L'agencement MUST rester
  celui de la cible, de sorte que l'arrivée de ces données avec le système
  solaire ne redispose pas l'écran ; mais aucune structure ne MUST être
  construite pour les accueillir avant qu'elles existent.
- **FR-009**: La plaque de chantier MUST afficher le bâtiment concerné, son
  niveau, une jauge d'avancement et le temps restant au format heures, minutes,
  secondes ; en l'absence de chantier, elle MUST le dire explicitement.
- **FR-010**: Les compteurs de ressources MUST afficher, pour chacune des trois
  ressources, son nom, sa quantité courante et son débit horaire. L'énergie
  MUST rester présentée séparément des trois ressources stockées, sa nature
  étant différente — instantanée, ni stockée ni plafonnée.
- **FR-011**: L'écran MUST conserver l'ensemble des mécaniques livrées par 001 —
  pose, amélioration, démolition, déblaiement, aperçus, avertissement de
  divergence de catalogue, saturation de stockage — sans en retirer ni en
  masquer aucune derrière une navigation supplémentaire.

### Le plan de parcelle

- **FR-012**: *Amendé le 2026-08-28.* Chaque état de case MUST être identifiable
  par au moins un canal **non chromatique** : une **silhouette**, un **style de
  trait**, une **marque d'angle**, un **cadre d'emprise**, ou une combinaison de
  ceux-ci. Deux états MUST se distinguer l'un de l'autre par ces canaux seuls, et
  aucune information ne MUST tenir à la teinte seule. La rédaction précédente
  exigeait de chaque case une silhouette ou un style de trait ; deux états — la
  case libre et le bâtiment posé — n'en portent aucun et se distinguent par
  l'emprise et le niveau lisible dessus, ce que l'exigence rendait irrecevable
  alors que c'est le dessin retenu.
- **FR-013**: Les états à distinguer sont au nombre de **douze**, et ce compte
  MUST être celui d'un vocabulaire fermé et énuméré, de sorte qu'un treizième
  état ne puisse pas arriver sans sa clé de légende. Ils MUST être : case libre,
  gisement de chacune des trois ressources, gisement productif — recouvert par
  le bâtiment qui l'exploite —, gisement stérile — recouvert par un bâtiment qui
  ne l'exploite pas —, obstacle libérant du terrain nu, obstacle libérant un
  gisement, bâtiment posé, chantier en cours, case visée par une pose valide,
  case visée par une pose refusée.
- **FR-014**: Une case MUST mesurer au moins 44 px de côté à toute largeur
  d'écran, et rester carrée.
- **FR-015**: Chaque silhouette MUST occuper environ 35 à 40 % de la case.
- **FR-016**: Le plan MUST porter des bandes de coordonnées — lettres en
  colonnes, chiffres en rangées —, et chaque case MUST être désignable par son
  adresse courte, du type « C3 », dans son nom accessible comme dans les
  messages qui la citent.
- **FR-017**: Un bâtiment occupant plusieurs cases MUST voir son emprise
  délimitée visuellement comme un seul objet, et son niveau MUST être lisible
  sur l'emprise.
- **FR-018**: Une légende MUST énumérer chaque état avec sa silhouette et son
  libellé, et MUST être atteignable sur toutes les largeurs d'écran.

### L'interaction

- **FR-019**: La grille MUST constituer un seul arrêt de tabulation ; les
  flèches MUST déplacer le curseur de case en case, et une tabulation MUST
  suffire à en sortir.
- **FR-020**: En mode pose, une commande MUST faire pivoter l'empreinte d'un
  quart de tour, une commande MUST poser, une commande MUST annuler ; les trois
  MUST être atteignables au clavier et par un bouton visible.
- **FR-021**: En mode pose, chaque case MUST indiquer si elle accepte
  l'empreinte, et une case refusée MUST porter la **raison** du refus dans son
  nom accessible.
- **FR-022**: Un seul élément d'annonce polie MUST exister sur l'écran. Il MUST
  énoncer les événements — entrée dans la grille, déplacement du curseur, pose
  acceptée, pose refusée et sa raison, chantier achevé, stockage saturé — et
  MUST **ne jamais** énoncer la progression des compteurs. *Amendé le
  2026-08-28 :* la règle d'unicité porte sur l'annonce **polie**. Un refus de
  commande relève d'une autre urgence et MUST conserver son canal assertif
  distinct ; c'est une exception nommée, non une seconde région d'annonce.
- **FR-023**: Une commande de relevé MUST permettre au joueur d'obtenir, à sa
  demande, l'énoncé de l'état courant : quantités, débits et chantier.
- **FR-023a**: *Nouvelle le 2026-08-28.* Le relevé MUST être énoncé **à chaque
  demande**, y compris lorsque son texte est identique au précédent. Une région
  d'annonce ne réénonce pas un contenu inchangé ; or l'état courant peut ne pas
  bouger d'une demande à l'autre — une ressource saturée, un débit nul, aucun
  chantier —, et le joueur qui redemande n'entendrait alors **rien**, sans
  distinguer le silence d'une panne. Le mécanisme retenu MUST rendre chaque
  énoncé distinct du précédent sans ajouter d'information fausse ni de bruit
  lisible à l'écran. La rédaction précédente supposait que les quantités
  progressent toujours ; c'est faux dès la saturation, que 001 produit déjà.
- **FR-024**: L'indicateur de focus MUST être visible sur tous les fonds de
  l'interface et MUST atteindre 3:1 contre le fond qu'il borde. *Amendé le
  2026-08-28 :* l'indicateur unique que prescrit le dossier de design **ne tient
  pas cette exigence** — il échoue sur trois des fonds focalisables de l'écran,
  dont la case de gisement et le bouton de pose. L'exigence prime sur la
  prescription : l'indicateur MUST être vérifié contre **chacun** des fonds de
  l'interface, et non contre un fond de référence.
- **FR-024a**: En mode contrastes forcés, l'indicateur de focus MUST adopter la
  couleur de mise en évidence du système plutôt qu'une teinte de la palette,
  qui n'y est plus rendue.
- **FR-025**: Tout élément interactif MUST produire un effet réel. Aucun bouton
  ni lien décoratif ne MUST exister — la fiction de la Régie vit dans les textes
  et le décor, jamais dans une commande qui ne fait rien.

### Les ratures

- **FR-026**: Une rature MUST apparaître quand une valeur suivie a changé, et
  MUST afficher l'ancienne valeur barrée à côté de la nouvelle.
- **FR-026a**: *Nouvelle le 2026-08-28.* Une rature MUST subsister jusqu'au
  **prochain changement de la même valeur** ou jusqu'au rechargement de l'écran,
  et MUST **ne pas** s'effacer sur une minuterie. Une correction qui disparaît
  d'elle-même se manque : le joueur qui regardait ailleurs pendant les quelques
  secondes d'affichage n'apprend jamais ce qui a bougé, et une disparition
  programmée est un mouvement de plus là où FR-005 n'en admet qu'un.
- **FR-027**: Le visuel raturé MUST être entièrement masqué aux technologies
  d'assistance, et une phrase explicite MUST porter l'information complète, du
  type « Niveau 3, anciennement niveau 2 ».
- **FR-028**: Le texte raturé MUST rester au-dessus du seuil de contraste du
  texte normal.
- **FR-029**: L'ancienne valeur d'une rature MUST être **celle que le client
  affichait précédemment**. La rature apparaît quand la valeur change sous les
  yeux du joueur et disparaît au rechargement de l'écran ; aucune donnée
  nouvelle ne MUST être persistée ni transmise pour la porter.
- **FR-029a**: Seules les valeurs qui changent **par saut** MUST être suivies —
  le niveau d'un bâtiment, le débit horaire d'une ressource, un plafond de
  stockage. Les quantités détenues, qui progressent à la seconde, ne MUST
  **jamais** l'être : une rature par seconde ne corrigerait rien, elle
  clignoterait.

### L'accessibilité

- **FR-030**: *Amendé le 2026-08-28.* Le texte normal MUST atteindre 4,5:1, le
  texte large 3:1, la bordure d'un composant navigable 3:1, et **tout objet
  graphique porteur d'information — au premier rang desquels les silhouettes de
  FR-012 — 3:1**, mesurés couleur calculée contre fond calculé. La rédaction
  précédente ne couvrait que du texte et des bordures, alors que la silhouette
  porte à elle seule le canal non chromatique dont dépendent SC-003, SC-009 et
  SC-011 : le seul élément dont l'illisibilité perdrait l'information n'avait
  pas de seuil.
- **FR-031**: Toute cible interactive MUST mesurer au moins 44 px dans les deux
  dimensions ; les boutons MUST en faire 48.
- **FR-032**: Aucune rotation d'élément ne MUST excéder 1,5°, ni s'appliquer à
  un bloc de texte long, ni être déclenchée par la prise de focus, ni être
  animée. Les tampons décoratifs, qui ne portent aucune information, échappent
  à ce plafond.
- **FR-033**: En mode contrastes forcés, les aplats et les ombres MUST
  disparaître sans que la distinction des états soit perdue ; chaque silhouette
  MUST hériter de la couleur de texte courante.
- **FR-034**: L'interface MUST rester utilisable sans débordement ni troncature
  à 320 px de large et à 200 % de zoom texte.
- **FR-035**: L'angle mort connu — le refus, sous protanopie, se rapproche de la
  teinte de la Camelote — MUST être documenté dans la page de règles du jeu.
- **FR-036**: L'écran MUST être livré en thème clair. Les teintes de nuit du jeu
  de valeurs MUST rester en réserve et ne MUST être employées par aucun écran
  tant que leurs ratios de contraste n'ont pas été mesurés. Le dossier annonce
  des ratios mesurés et n'en fournit aucun en sombre : un thème sombre non
  mesuré serait une régression d'accessibilité déguisée en fonctionnalité.

### La copie

- **FR-037**: Les textes de la Régie — surtitre, notes de bas de page, mentions,
  tampons, libellés de boutons — MUST être repris tels quels du dossier de
  design, à l'exception des valeurs qui relèvent des données de jeu.
- **FR-038**: Aucun texte humoristique ne MUST porter d'information nécessaire,
  ni être cliquable, ni excéder le rôle de décor.
- **FR-039**: *Amendé le 2026-08-28.* Le plancher de taille de texte se pose sur
  le **rôle** du texte, et non sur un nombre unique : un champ de saisie MUST
  atteindre 16 px, un texte porteur d'information 14 px, un intitulé de bloc
  12 px, et un décor sans information 9,5 px. Le rôle d'un texte MUST être
  inscrit dans le document, et un texte non marqué MUST être présumé **porteur
  d'information** — l'oubli échoue du côté exigeant. La rédaction précédente
  fixait 9,5 px pour tout texte porteur d'information ; elle laissait la légende
  des douze états et le nom d'une ressource sous le corps des valeurs qu'ils
  rendent intelligibles, ce qui contredit la loi que le dossier de design s'est
  donnée — l'approximation ne touche jamais la donnée. **La clause typographique
  de SC-009 de 001**, qui exigeait 16 px pour tout le corps de texte, est amendée
  en conséquence et recentrée sur les champs de saisie — le seul motif qu'elle
  invoquait. Les deux autres clauses de ce critère — la fenêtre de 360 × 640 px
  et les cibles de 44 × 44 px — ne sont pas touchées. Le conflit entre les deux
  tranches est ainsi résolu dans les deux spécifications, non contourné dans un
  plan.
- **FR-039a**: Aucune taille de police ne MUST être exprimée en pixels. Les
  tailles MUST suivre le réglage de taille de texte du système, faute de quoi le
  plancher protège la lecture par défaut sans protéger celle du joueur qui a
  réglé son appareil.
- **FR-040**: Le vocabulaire du jeu — Camelote, Jus, Bave d'étoiles, veine,
  geyser, récif, mine, puits, racloir — MUST rester celui du document de
  conception ; la Régie ajoute un registre lexical, elle n'en remplace aucun.

### Key Entities

- **Jeu de valeurs visuelles** : la liste nommée des couleurs, tailles,
  espacements, traits, ombres et rotations, avec pour chaque couleur son rôle et
  ses ratios de contraste mesurés. Source unique.
- **État de case** : la qualification visuelle d'une case du plan, dérivée de ce
  que le domaine expose déjà — contenu, gisement, bâtiment, chantier — et de ce
  que l'interaction en cours ajoute — visée, refus et sa raison. N'introduit
  aucune donnée nouvelle côté serveur.
- **Silhouette** : la forme dessinée qui identifie un état sans recourir à la
  couleur. Vocabulaire fermé, de cinq à sept formes, chacune héritant de la
  couleur de texte courante.
- **Adresse de case** : la désignation courte d'une case, lettre de colonne
  suivie du numéro de rangée. Elle est un besoin fonctionnel — les joueurs
  s'échangent des plans à l'oral — et non une décoration.
- **Rature** : l'affichage d'une valeur qui vient de changer. Porte l'ancienne
  valeur, la nouvelle, et la phrase explicite qui les énonce ensemble.
- **Annonce** : le texte unique qu'énonce la région d'annonce polie. Écrit par
  des événements, jamais par la progression d'un compteur.

## Success Criteria *(mandatory)*

**Convention de désignation.** Les identifiants de critères de succès sont
propres à chaque tranche et se répètent d'une tranche à l'autre : il existe un
SC-009 en 001 et un SC-009 en 002 — le mode contrastes forcés. **Cité hors de sa
propre spécification, un critère se désigne toujours avec sa tranche** :
« SC-009 de 001 », « SC-009 de 002 ». À l'intérieur des documents d'une tranche,
un identifiant nu désigne celui de la tranche courante.

**Et un critère à trois clauses se cite par sa clause.** SC-009 de 001 en porte
trois : la planète tient sur 360 × 640 px sans défilement ni zoom, le corps de
texte fait au moins 16 px, et toute cible interactive au moins 44 × 44 px. Cette
tranche n'en amende **que la deuxième**, et la désigne partout « la clause
typographique de SC-009 de 001 » : le raccourci « SC-009 de 001 — le plancher
typographique » laissait croire que le critère entier était en cause, alors que
ses deux autres clauses restent en vigueur telles quelles.

### Measurable Outcomes

- **SC-001**: Sur une fenêtre de 320 × 640 px, l'ensemble des cases de la
  parcelle est visible sans défilement ni zoom, chaque case mesure au moins
  44 px de côté, et aucune barre de défilement horizontale n'apparaît.
- **SC-002**: À 200 % de zoom texte, aucun bloc ne déborde de la fenêtre et
  aucun texte n'est tronqué.
- **SC-003**: Rendu en niveaux de gris, l'écran laisse une personne extérieure
  au projet nommer sans erreur chacun des états de case énumérés par FR-013, à
  l'aide de la seule légende.
- **SC-004**: *Amendé le 2026-08-28.* Le contrôle automatique de contraste ne
  relève aucune valeur sous 4,5:1 pour du texte normal, sous 3:1 pour du texte
  large, sous 3:1 pour la bordure d'un composant navigable et sous 3:1 pour une
  silhouette, aux **trois** largeurs éprouvées — 320 px, 430 px et 1180 px.
- **SC-005**: *Amendé le 2026-08-28.* L'audit automatique d'accessibilité ne
  relève aucune violation sur l'écran de parcelle, aux **trois** largeurs
  éprouvées — 320 px, 430 px et 1180 px.

  *Motif de l'amendement des deux critères.* La rédaction précédente n'auditait
  que les deux largeurs de référence, et laissait 320 px hors mesure alors que
  SC-001 en fait une largeur normative et que c'est **précisément là que le
  décor se resserre** — rembourrages, encadrement et gouttières réduits pour
  tenir les 44 px de côté. La largeur la plus exposée à une régression était la
  seule à n'être jamais auditée.
- **SC-006**: Le parcours complet — armer une pose, la déplacer, la pivoter, la
  poser, puis l'annuler sur une seconde tentative — se conduit au clavier seul,
  sans piège de focus, et sans qu'aucune commande n'exige la souris.
- **SC-007**: Sur chaque rature de l'écran, la restitution vocale énonce la
  valeur courante et l'ancienne dans une phrase intelligible, et n'énonce jamais
  les deux valeurs collées l'une à l'autre.
- **SC-008**: L'écran se charge complètement sans aucune requête sortante vers
  un domaine tiers.
- **SC-009**: En mode contrastes forcés, les états de case énumérés par FR-013
  restent distinguables deux à deux.
- **SC-010**: Sous préférence de mouvement réduit, aucune animation ni
  transition n'excède 1 ms.
- **SC-011**: Sous simulation de protanopie et de deutéranopie, aucun couple
  d'états de case ne devient indistinguable ; le seul cas d'alerte affaiblie
  connu est celui documenté par FR-035.
- **SC-012**: Aucune règle de jeu ne change : les résultats des tests de domaine
  et de contrat de 001 sont identiques avant et après la tranche.

## Assumptions

- **L'écran de parcelle est le seul écran habillé par cette tranche.** L'écran
  d'authentification et la page de règles reçoivent le jeu de valeurs et
  restent lisibles, mais ne sont pas remaquettés : le dossier de design ne les
  couvre pas.
- **Le dossier 6 du fichier de pistes est la cible.** Les dossiers 4 et 5 sont
  de la traçabilité de décision, l'option 6c une réserve d'idées ; aucun des
  trois n'est à construire.
- **Les prototypes ne sont pas du code à reprendre.** Leur structure, leurs
  styles en ligne et leur mécanique de rendu sont hors sujet ; seules les
  valeurs, la copie, les libellés d'accessibilité, la géométrie des silhouettes
  et les règles du contrat d'accessibilité sont normatifs.
- **La maquette est une cible, pas un état des lieux.** Ce qui en est normatif
  est le *look and feel*, le jeu de valeurs et **l'agencement** ; ce qu'elle
  montre de données que le projet n'a pas encore n'est pas une commande de les
  inventer. Les zones concernées sont omises, et l'agencement les accueillera
  sans avoir à être redisposé.
- **Les données de maquette ne sont pas des données de jeu.** « Fond de
  Tiroir », « 18 420 de Camelote », « Parcelle n° 4-B bis (ter) », « 25 cases,
  dont 25 en pente » illustrent la mise en page ; l'écran affiche les valeurs
  réelles de la planète du joueur.
- **La grille est de 6 × 6 en 001**, et la mise en page ne présume d'aucune
  dimension : les archétypes à venir vont du 3 × 10 au 8 × 4.
- **Les obstacles de 001 sont au nombre de cinq** — éboulis, rocher, filon
  enfoui, poche scellée, croûte calcifiée — là où le prototype n'en montre que
  deux. Ils se répartissent en deux silhouettes selon ce que leur déblaiement
  libère : du terrain nu, ou un gisement. C'est l'information dont le joueur a
  besoin pour décider.
- **La production, les coûts, les durées et la validité des placements ne
  changent pas.** Le serveur reste seul arbitre, l'horloge reste un paramètre,
  et le client continue de n'émettre que des intentions.
- **Le tampon décoratif « VU, MAIS PAS LU » est une exception assumée** au
  plafond de rotation : il ne porte aucune information et est masqué aux
  technologies d'assistance.

## Dépendances

- La tranche 001 est fusionnée : l'écran de parcelle, ses quatre mécaniques et
  leurs tests existent et servent de socle et de filet.
- Le dossier `design_handoff_regie_approximative/` fait partie des entrées de
  cette spécification. Sa place définitive dans le dépôt — conservé tel quel,
  déplacé sous `docs/design/`, ou réduit à ses valeurs — est une décision de
  plan.

## Hors périmètre

- Le système solaire, les sept archétypes et le choix du berceau.
- La carte galactique, le combat, le marché, les flottes.
- L'installation d'un moteur de rendu graphique : le plan de parcelle reste du
  document et du dessin vectoriel, jamais un canevas.
- Le site public et sa documentation générée.
- Le thème sombre, tant que ses contrastes ne sont pas mesurés.
- Le glisser-déposer à la souris : l'interaction retenue reste le curseur.
