# Conception du jeu

**Statut** : document vivant. Il consigne les mécaniques arrêtées, les
alternatives écartées et les questions ouvertes, entre la vision produit
([`README.md`](../../README.md)) et les spécifications fonctionnelles
(`specs/`).

**Dernière mise à jour** : 2026-08-23

**Autorité** : ce document précède les spécifications et les alimente. En cas de
divergence avec une `spec.md` déjà écrite, la spécification prévaut pour son
périmètre et ce document doit être corrigé. La
[constitution](../../.specify/memory/constitution.md) prévaut sur les deux.

**Pour les décisions techniques** (stack, modèle de temps, frontières de
paquets, sécurité, tests) : voir
[`docs/architecture/2026-08-23-choix-de-stack.md`](../architecture/2026-08-23-choix-de-stack.md).

---

## 1. Vocabulaire

Le registre lexical du jeu est délibérément décalé. « Métal », « cristal »,
« deutérium » sont écartés comme trop sérieux et trop marqués OGame.

| Terme | Nature | Rôle |
| --- | --- | --- |
| **Camelote** | ressource | matière première de base : construction et recherche |
| **Jus** | ressource | carburant : propulsion des flottes, et recherche |
| **Bave d'étoiles** | ressource | ressource rare : construction et recherche |
| **Énergie** | ressource à part | grandeur instantanée, ni stockée ni transportée (§3.8) |
| **Le Toboggan** | technologie | transport de ressources entre planètes d'un même système |
| **Le Chamboule-Tout** | technologie | permutation de deux planètes dans le système |
| **Berceau** | archétype | la planète mère, polyvalente |
| **Veine** / **geyser** / **récif** | case spéciale | gisement de Camelote / Jus / Bave d'étoiles |
| **Mine** / **puits** / **racloir** | bâtiment | extracteur de Camelote / Jus / Bave d'étoiles |
| **Gong** | unité de temps | l'unité dans laquelle le catalogue déclare ses durées et ses productions (003) |

Les ressources étant des **données déclaratives** et non des colonnes nommées en
dur, tout renommage reste sans coût technique à n'importe quel stade.

**Le Gong**, entré au vocabulaire le 2026-08-31 avec la tranche 003. Le catalogue
ne dit plus « cent vingt secondes » mais « douze gongs », et plus « quinze unités
par heure » mais « cent cinquante grains par gong ». **Chaque serveur déclare la
longueur de son gong**, et cette longueur lui appartient : elle est la même pour
tous ses joueurs, et le client la **reçoit** dans la réponse qui porte l'état de
sa planète — il ne la configure pas.

Le bénéfice tient en une phrase, et c'est ce qui a fait retenir cette forme :
durées et production sont couplées **par l'unité elle-même** et ne peuvent plus
diverger. Un serveur qui bat deux fois plus vite voit ses chantiers *et* son
accumulation de ressources accélérés dans le même rapport — là où un réglage
portant sur les seules durées donnerait des chantiers instantanés et un joueur
affamé.

Le **gong canonique** vaut dix secondes. Ce n'est pas un chiffre rond choisi pour
l'être : c'est le plus grand commun diviseur exact des quinze durées du
catalogue, ce qui permet de changer d'unité sans déplacer aucun chiffre du jeu.
Ce que le joueur voit reste du **temps réel** : le gong n'apparaît que sur la
page de règles, avec sa longueur, pour qu'aucun calcul ne soit caché.

---

## 2. Le système solaire

**Un seul système solaire par joueur, créé pour lui à l'inscription, vierge.**
Sept planètes, le même nombre pour tout le monde.

### 2.1 Les archétypes de planète

Une planète ne se distingue **pas par un bonus chiffré** mais par la **forme de
sa grille** : dimensions, obstacles, gisements. C'est la décision de conception
centrale du jeu.

*Motif* : OGame est monotone parce que ses planètes ne diffèrent que par un
nombre. Si ce qui varie est la géométrie, la spécialisation devient une
contrainte physique et non une préférence — une grille étroite en 3×10 ne *peut
pas* accueillir une empreinte 3×3. La spécialisation cesse d'être imposée par
des bonus artificiels : elle est déduite.

Sept archétypes, à équilibrer, donnés ici à titre indicatif :

| Archétype | Grille | Ce qu'elle impose |
| --- | --- | --- |
| **Berceau** | 6×6 régulière, 10 obstacles sur 36, une veine de chaque ressource | Polyvalente. Sert de tutoriel : tout y rentre, rien n'y excelle. |
| **Plaine** | 8×4 très ouverte, trois veines de Camelote alignées | Appelle les grandes empreintes. Exclut le 3×3. |
| **Archipel** | 6×6 fragmentée en quatre poches de 4 à 6 cases | N'accepte que du petit : stockage, laboratoires, utilitaires. |
| **Faille** | 3×10 étroite, geysers de Jus en profondeur | Le 3×3 est physiquement exclu. Industrie en ligne. |
| **Cratère** | 7×7 ceinturé d'obstacles, cœur 3×3 libre | Faite pour un bâtiment unique. Périphérie à conquérir. |
| **Toundra** | large, 60 % d'obstacles au départ | Potentiel élevé, déblocage coûteux. Récompense l'investissement tardif. |
| **Récif** | 4×5 seulement, cinq récifs de Bave d'étoiles | Petite et précieuse. Source de la ressource rare. |

### 2.2 L'équité de départ

**Chaque joueur reçoit exactement les mêmes sept archétypes ; seule leur
disposition dans le système varie.**

Conséquences :

- Aucune plainte possible sur un tirage malheureux.
- Invariant testable par propriété : *la somme des potentiels de tout système
  généré est constante*. On ne calibre pas un générateur aléatoire, on permute un
  ensemble fixe.
- **La permutation est contrainte** : seules sont générées les dispositions dont
  le coût total — la somme des distances entre planètes complémentaires — égale
  une valeur de référence. Nécessaire dès lors que la portée du Toboggan est
  limitée (§5), sans quoi la distance entre planètes complémentaires devient un
  facteur de puissance non choisi.

### 2.3 Le choix du berceau

**Le joueur choisit sa planète mère parmi les sept à l'inscription.**

Trois bénéfices : tout désavantage de disposition devient un désavantage choisi ;
le choix oblige à lire les sept archétypes, donc enseigne le système sans
tutoriel ; et il sert le gradient de personas — P1 prend celui qui est
recommandé, P4 calcule le départ optimal.

### 2.4 Propriété et occupation

Une planète peut être **occupée** par un autre joueur, jamais **perdue**. Le
propriétaire et l'occupant courant sont **deux notions distinctes**, à modéliser
comme telles dès la première spécification qui les touche.

*Motif* : les rattraper une fois le marché et les alliances en place serait une
migration douloureuse. Conséquence de sécurité : l'autorisation doit être
vérifiée dans la transaction de mutation, l'occupant pouvant changer entre la
vérification et l'écriture.

---

## 3. La planète : la grille, le stockage et l'énergie

### 3.1 Format

- **Autour de 30 à 40 cases utilisables** par planète. Jamais 240.
- **Contrainte dure** : la grille doit tenir sur un écran de téléphone sans
  zoom. Une grille lisible d'un coup d'œil est aussi une grille dont on comprend
  le puzzle.
- Explicitement écarté : le modèle OGame où chaque niveau de bâtiment consomme
  une case sur 240 — absurde et sans décision.

### 3.2 Les empreintes

Chaque bâtiment occupe une **forme fixe**, prise dans un vocabulaire fermé et
petit pour rester reconnaissable à l'œil :

| Empreinte | Cases | Vocation typique |
| --- | --- | --- |
| 1×1 | 1 | utilitaires, relais |
| 1×2 | 2 | annexes, petits stockages |
| 1×3 | 3 | conduits, lignes — non retenue en 001 |
| L, T | 4 | bâtiments qui épousent les recoins |
| 2×2 | 4 | le standard |
| 2×3 | 6 | grosses industries |
| 3×3 | 9 | bâtiments uniques |

**Rotation par quart de tour, pas de symétrie miroir.** Convention de Tetris,
comprise sans explication.

**Un type de bâtiment peut proposer plusieurs variantes d'empreinte**, de même
surface et de caractéristiques identiques — le carré de quatre, le L et le T sont
interchangeables pour un même bâtiment. Le joueur choisit la variante et
l'orientation à la pose ; les deux sont figées pour la vie du bâtiment. Le choix
reste ainsi purement géométrique, jamais chiffré, cohérent avec le refus des
bonus d'archétype (§2.1).

**L'empreinte ne change jamais avec le niveau.** Elle est choisie une fois pour
toutes à la pose. Réserve pour plus tard : des *paliers d'empreinte* — un
bâtiment qui grandit physiquement à un niveau donné — constituent le levier de
relance si le puzzle s'essouffle (§9).

### 3.3 Les gisements

Certaines cases portent un gisement. **Un gisement ne produit que s'il est
recouvert par le bâtiment correspondant.** Recouvrir plusieurs gisements d'un
seul bâtiment est le meilleur placement possible ; savoir si c'est réalisable
dépend de la forme de l'empreinte et des obstacles alentour.

*Motif* : c'est ce qui relie la géométrie à la vocation. La vocation d'une
planète est **annoncée** (les gisements sont visibles avant installation), sa
réalisation est **méritée**. Sans gisements, une grille à empreintes n'est qu'un
test de rangement.

### 3.4 Les obstacles

Les cases obstruées se déblaient contre des ressources et du temps.

**Le type d'obstacle indique ce qu'il libère** — terrain nu, ou gisement. Coût,
durée et résultat sont connus avant paiement.

*Alternative écartée* : la case surprise. Tentante, mais elle contredirait la
promesse de transparence faite à P4 (§7). Un pari sur une information cachée
n'est pas de la profondeur. La décision reste intéressante sans mystère :
déblayer coûte des ressources maintenant contre du potentiel plus tard.

### 3.5 Démolition

Un bâtiment peut être démoli contre un **remboursement partiel**, afin de
permettre la réorganisation quand de la place se libère.

### 3.6 File de chantier

**Un seul chantier à la fois par planète**, qu'il s'agisse d'une construction,
d'une amélioration, d'une démolition ou d'un déblaiement.

Un chantier lancé n'est **ni annulable ni remplaçable** ; une confirmation
explicite, postérieure à l'affichage du coût et de la durée, tient lieu de
garde-fou contre l'erreur de manipulation.

### 3.7 Stockage et saturation

Chaque ressource a un **plafond**, somme d'une capacité de base de la planète et
de celle des entrepôts posés. **À saturation, la production est perdue.**

*Tension assumée* : la perte contredit le principe produit 5 du README, « le temps
n'est pas une taxe d'attention ». Trois contreparties la rendent tenable — le
temps restant avant saturation est affiché avant la déconnexion, la capacité est
améliorable, et aucun achat ne peut lever un plafond ni compenser une perte. La
promesse faite au joueur devient : *exactement ce que les règles publiées donnent,
saturation incluse*. À réexaminer à l'équilibrage (§11).

### 3.8 L'énergie

**L'énergie est une ressource à part**, et elle n'est pas le Jus. Elle est
**instantanée** : ni stockée, ni accumulée, ni transportée. Elle n'a ni plafond,
ni gisement, ni entrepôt. Elle est produite par un **bâtiment dédié**, la
centrale, en plus d'une quantité de base fournie par la planète — et
**consommée par tous les autres bâtiments**, pas seulement par les extracteurs.

En déficit, la production de chaque bâtiment producteur est multipliée par le
**rapport de l'énergie produite à l'énergie consommée**.

*Ce que le rapport ne touche pas.* Un bâtiment qui ne produit rien — un entrepôt —
consomme quand même, mais sa capacité n'est **pas** réduite. Sa consommation n'est
pas gratuite pour autant : elle pèse sur le dénominateur, donc elle dégrade le
rapport de toute la planète. Le coût est réel, il est simplement payé par les
autres bâtiments. Cette dissymétrie est délibérée : un plafond qui rétrécit
pourrait passer sous la quantité détenue, ce qui obligerait à décider du sort du
surplus et rendrait la saturation dépendante de l'énergie.

*Motif du choix de règle* : ce rapport unique est affichable et reproductible à la
main, contrairement à un empilement de pourcentages par niveau — même raisonnement
que pour la célérité du Toboggan (§5.1).

---

## 4. L'adjacence

**Les bâtiments voisins se bonifient** : une raffinerie adossée à une mine gagne
du rendement, un laboratoire entouré d'habitations accélère, un dépôt collé à une
industrie réduit ses pertes.

Trois motifs :

**Elle transforme le rangement en optimisation.** Sans adjacence, la question est
« est-ce que ça rentre ». Avec, elle devient « quelle est la meilleure
disposition parmi celles qui rentrent » — question sans réponse triviale.

**Elle sert le gradient de personas.** P1 fait rentrer ses bâtiments et joue très
bien. P3 découvre que sa mine gagne du rendement en touchant sa raffinerie. P4
calcule la disposition optimale de sa planète entière. **La même grille, quatre
profondeurs de jeu** — la divulgation progressive obtenue sans construire quatre
interfaces.

**Elle crée une raison de redéployer.** Débloquer une case ne sert pas seulement
à ajouter un bâtiment, mais peut justifier de réorganiser pour gagner une
adjacence.

---

## 5. La logistique interne : le Toboggan

Une **technologie** permettant de faire transiter des ressources d'une planète à
une autre au sein du même système, moyennant du temps.

**Alternative écartée : le stock commun au système.** Elle rendait la
spécialisation utile immédiatement et sans code, mais elle *offrait* l'économie
intégrée au lieu de la faire construire. Le Toboggan crée un arc de progression :
au début sept îles isolées à développer chacune pour elle-même, plus tard une
économie intégrée. Il produit aussi la même idée à deux échelles — sur la
planète, le placement compte à cause des gisements et de l'adjacence ; dans le
système, à cause de la portée.

### 5.1 Portée et célérité

- **La portée sature.** Sept planètes en ordre orbital comptent six pas d'un
  bout à l'autre : la portée plafonne donc à 6, au-delà duquel tout le système
  est atteignable depuis n'importe quelle position.
- **La célérité continue.** Les niveaux au-delà de la saturation de portée
  augmentent la vitesse, indéfiniment.
- **Le temps se calcule comme `distance ÷ célérité`.** *Alternative écartée* :
  une réduction en pourcentage par niveau. Les pourcentages s'empilent, le
  plafond réel devient inénonçable, et la formule cesse d'être affichable à P4.
- *Évolution possible* : scinder en deux technologies distinctes, Portée et
  Célérité. Plus de leviers pour P3 et P4, deux courbes à équilibrer. Facile à
  faire plus tard, inutile pour démarrer.

### 5.2 Deux routes différenciées

Les flottes peuvent également transporter au sein du système. Pour qu'aucune des
deux routes ne meure, l'arbitrage doit être réel :

| | Le Toboggan | Les flottes |
| --- | --- | --- |
| **Force** | Aucune flotte requise, aucun risque, ne mobilise rien | Rapide, grosse capacité |
| **Coût** | Lent, capacité limitée par envoi | Consomme du Jus |
| **Coût d'opportunité** | aucun | **Les vaisseaux ne défendent ni n'attaquent pendant ce temps** |

Le coût d'opportunité sur la flotte est ce qui maintient l'arbitrage vivant. P1
utilise le Toboggan et joue très bien ; P3 et P4 calculent quand la vitesse vaut
de laisser une planète nue.

### 5.3 Modélisation

Un transfert est **exactement un événement daté** : ressources débitées au
départ, créditées à la résolution de l'échéance. Même machinerie que
l'achèvement d'un chantier et l'arrivée d'une flotte — aucune architecture
nouvelle.

Les ressources en transit sont dans un **troisième état**, porté par le transfert
lui-même. **Question ouverte** : un transfert en cours est-il pillable ? À
trancher avec le combat ; ouvre une mécanique de brigandage.

---

## 6. Le rattrapage : le Chamboule-Tout

Une technologie **très coûteuse** permettant à un joueur ayant mal choisi son
départ de se corriger plus tard.

*Motif* : un mauvais choix initial qui plombe un joueur pendant des mois est ce
qui fait abandonner, et c'est un défaut structurel du genre que « modernisé »
doit corriger.

### 6.1 Une seule opération élémentaire

**Permuter deux planètes de position**, répétable.

Les bâtiments ne bougent pas, les grilles ne changent pas : seules les distances
changent. Rayon d'impact minimal, et cela répond précisément au problème posé.
Toute permutation s'atteignant par une suite d'échanges, l'expressivité complète
est obtenue sans mécanique supplémentaire.

*Alternative écartée* : remodeler une planète (changer son archétype ou sa
grille), qui invaliderait les bâtiments déjà posés.

### 6.2 Un coût croissant, pas seulement élevé

Le coût **croît à chaque usage, définitivement**, et l'opération dure longtemps.

*Motif* : un coût élevé en ressources devient dérisoire quand la production a
décuplé. Un coût croissant aligne le prix sur l'intention — le joueur qui a
planté son départ paie un premier échange abordable et se rattrape, celui qui
voudrait réoptimiser tous les mois paie une addition exponentielle. Filet de
sécurité sans boucle d'optimisation permanente.

### 6.3 Deux verrous anti-exploit

- **Aucun échange tant qu'un mouvement concerne les planètes visées** — ni
  transfert, ni flotte en route. Sinon il faudrait décider ce qu'une flotte fait
  quand sa destination change de coordonnées en vol, et toutes les réponses sont
  mauvaises.
- **Aucun échange sous menace** : une flotte hostile en approche interdit
  l'opération. Sans cette règle, le Chamboule-Tout devient un bouclier
  anti-attaque.

### 6.4 Effet sur l'équité

Cette technologie **lève le plafond** de l'invariant du §2.2 : les dispositions
de départ sont d'égale valeur, une disposition optimisée vaut mieux qu'elles.
Ce n'est pas une inégalité mais un objectif de long terme accessible à tous —
l'invariant ne vaut qu'à la génération.

---

## 7. Principes de conception transversaux

**Transparence totale des règles.** Le coût, la durée et le gain exacts de toute
action sont consultables avant décision, jamais découverts après. Critère de
vérification retenu : **un joueur doit pouvoir reproduire à la main n'importe
quel chiffre que le jeu lui affiche.** Plus exigeant qu'il n'y paraît, cela
interdit les formules composées opaques. C'est la promesse faite à P4, qui « a
besoin de tout savoir pour s'amuser ».

**Une seule interface, quatre profondeurs.** Les personas P1 à P4 sont un
gradient, pas quatre publics. Toute mécanique doit être jouable en surface par P1
et optimisable en profondeur par P4 — sans mode expert séparé.

**Désamorcer par la conception plutôt que par la police.** Un comportement
indésirable se combat en le rendant non rentable, pas en le sanctionnant. Une
règle de jeu ne se trompe pas et n'exige pas d'arbitrage humain.

**Pas d'information cachée comme substitut de profondeur.** Un pari sur une
information dissimulée n'est pas de la profondeur. L'aléa non plus : le combat
est déterministe (voir le document d'architecture).

---

## 8. Monétisation : lignes rouges

**Aucun achat ne modifie l'équilibre du jeu**, ni directement ni par
accélération. Un gain de temps payant est un pay2win déguisé.

**Les droits cosmétiques ne sont structurellement pas transférables** : ils
vivent dans une table sans aucun chemin de transfert. Aucun code ne peut les
déplacer. Formulation nécessaire car dès qu'un marché libre existe, tout objet
achetable en argent réel et échangeable rend l'argent réel convertible en
puissance.

**Le Chamboule-Tout n'est jamais achetable, ni accélérable, ni contournable
contre de l'argent réel.** Un mécanisme de rattrapage est exactement ce que les
jeux free-to-play monétisent : c'est le premier endroit où la promesse sera
testée, y compris de l'intérieur, un soir où les revenus manqueront.

---

## 9. Risques identifiés

**Le puzzle peut mourir après vingt minutes.** C'est le risque principal de la
mécanique de grille. Si l'empreinte ne change jamais avec le niveau et qu'on ne
démolit pas, un joueur prend quelques décisions de placement puis la grille est
figée à vie : le mécanisme devient du contenu mort.

Quatre antidotes, dans l'ordre où ils sont mobilisés : le **déblaiement étalé**
dans le temps, la **démolition** avec remboursement partiel, l'**adjacence** qui
rend la réorganisation rentable, et en réserve les **paliers d'empreinte**.

**La grille est l'interface la plus difficile du jeu.** Poser des polyominos par
glisser-déposer sur téléphone, pilotable entièrement au clavier et annonçable à
un lecteur d'écran, est l'écran le plus exigeant du projet — et il est prévu en
premier. Faisable, mais ce n'est pas l'écran facile pour démarrer.

**Le marché libre est la mécanique la plus risquée du projet**, sur la sécurité
comme sur la promesse « sans pay2win ». Voir la section 6.5 du document
d'architecture. Il mérite sa propre spécification, avant le marché lui-même.

---

## 10. Feuille de route

| Spéc. | Contenu | Motif de l'ordre |
| --- | --- | --- |
| **001** | **La planète mère** — grille à empreintes, gisements, obstacles déblayables, démolition, production dans le temps, transparence des coûts | Tout le jeu repose sur l'hypothèse que ranger des polyominos est amusant. La valider sur une planète avant d'en faire l'ossature de sept. |
| **002** | **La Régie approximative** — le système visuel de l'écran de parcelle : jeu de valeurs unique, silhouettes non chromatiques, adresse courte, raison du refus portée par la case, annonce unique et relevé, ratures, guichet à trois colonnes | *Interposée le 2026-08-27.* La direction artistique existe et elle est mesurée ; **sept planètes habillées par un écran sans identité coûteraient sept fois la même reprise**. Et sans elle, la refonte à venir serait une régression d'accessibilité par rapport aux caractères `▓ ■ · ◆` de 001, qui se lisaient en noir et blanc. Aucune règle de jeu ne change. |
| **003** | **Le Gong** — l'unité de temps déclarée du jeu : le catalogue déclare en gongs et en grains par gong, chaque serveur déclare la longueur de la sienne et l'annonce au client | *Interposée le 2026-08-30.* Le temps cesse d'être un réglage pour devenir une **unité**, ce qui couple durées et production par construction. Aucune valeur d'équilibrage ne bouge : au gong canonique, les 240 chiffres comparables sont strictement inchangés. Elle débloque le banc d'essai de la tranche 900, qui n'a pas de levier de rythme sans elle. |
| **004** | **Le système solaire** — les sept archétypes, choix du berceau, installation sur les autres planètes | Rend la spécialisation réelle |
| **005** | **La recherche** — laboratoire et arbre technologique | Prérequis de tout ce qui suit |
| **006** | **Le Toboggan** — logistique interne | Rend la spécialisation *payante*. Doit suivre le système solaire de près, sinon celui-ci est une contrainte sans récompense. |
| **007** | **L'adjacence** | Approfondissement, pas un prérequis. Relance si le puzzle s'essouffle. |
| **008** | **Le Chamboule-Tout** | Après les flottes, dont dépendent ses verrous anti-exploit |

*Décalage du 2026-08-27 (R18 de 002).* Le système solaire portait le numéro 002 ;
il devient 003, et les quatre tranches suivantes se décalent d'autant. **Les motifs
d'ordre sont inchangés** : seuls les numéros bougent, et la seule dépendance
réordonnée est celle du Toboggan, qui suit toujours le système solaire.
Laisser cette table dire autre chose que la réalité des branches est exactement
l'écart implicite que le principe I de la constitution proscrit.

*Décalage du 2026-08-30 (003 — Le Gong).* Le système solaire portait le numéro
003 ; il devient **004**, et les quatre tranches suivantes se décalent d'autant.
**Les motifs d'ordre sont inchangés** : seuls les numéros bougent, et aucune
dépendance n'est réordonnée — le Toboggan suit toujours le système solaire.

Le Gong entre ici plutôt que dans la bande outillage parce qu'il est du
**vocabulaire de jeu** : il touche le catalogue, le contrat, le domaine et la
page de règles. C'est cette distinction qui a fait scinder le besoin d'origine en
deux tranches — 003 pour l'unité, **900** pour le banc d'essai qui s'en sert.
Les specs `0xx` sont le jeu, les `9xx` l'outillage ; c'est ce qui évite de
décaler la feuille de route du jeu pour un besoin d'atelier.

Non encore ordonnancés : flottes, colonisation, combat, marché, alliances,
échanges, diplomatie, mini-jeux, monétisation cosmétique.

---

## 11. Questions ouvertes

- **Un transfert en cours est-il pillable ?** À trancher avec le combat (§5.3).
- **Attaquer une planète touche-t-il ses seules réserves, ou celles du
  système ?** Conséquence du refus du stock commun ; à trancher avec le combat.
- **Équilibrage des sept archétypes.** Les grilles du §2.1 sont indicatives.
- **Nombre exact de cases utilisables par archétype**, et traduction de la
  surface en cases.
- **Scinder le Toboggan en Portée et Célérité ?** Reporté (§5.1).
- **Paliers d'empreinte** : à activer seulement si le puzzle s'essouffle (§9).
- **Plafonds et taxes du marché libre**, indexés sur l'écart de développement
  entre les parties.
- **La perte par saturation est-elle tenable ?** Elle est en tension avec le
  principe produit 5 du README (§3.7). À réexaminer à l'équilibrage.
- **Le gong doit-il devenir l'unité *native* du domaine ?** Ouverte le
  2026-08-31 par la tranche 003, qui a délibérément arrêté le gong à la
  **déclaration** : le catalogue est en gongs, le domaine reste en secondes, et
  `resolveCatalogs` fait le pont une fois au démarrage.

  *Le bénéfice d'aller plus loin* : le temps du jeu s'exprimerait dans une seule
  unité de bout en bout, et la résolution disparaîtrait — avec elle la classe
  d'erreur « un catalogue déclaré passé là où un résolu est attendu », que le
  typage tient aujourd'hui mais qu'il faut tenir.

  *Le coût* : rouvrir `kernel/time.ts` et `kernel/projection.ts`, c'est-à-dire le
  cœur de 001, et sa réponse la plus éprouvée. *Le défaut connu*, qui est le vrai
  motif du report : à dix secondes par gong, les compteurs extrapolés de 002
  décriraient un état **faux** entre deux gongs — le joueur verrait des
  ressources qui n'existent pas encore, ou pas celles qui existent. Il faudrait
  soit afficher par paliers de dix secondes, soit réintroduire une conversion à
  l'affichage, c'est-à-dire refaire à la sortie ce qu'on aurait supprimé à
  l'entrée.

  À rouvrir seulement si un besoin le réclame ; la profondeur n'a pas été
  implémentée « au cas où » (principe V).

---

## 12. Journal des modifications

| Date | Modification |
| --- | --- |
| 2026-08-23 | Création. Consigne les décisions de la session de conception initiale : vocabulaire, sept archétypes et équité par permutation contrainte, grille à empreintes, gisements, obstacles, adjacence, Toboggan, Chamboule-Tout, lignes rouges de monétisation, risques et feuille de route. |
| 2026-08-23 | Corrections induites par la spécification 001 : nom des extracteurs, Berceau à 10 obstacles, L et T fixés à quatre cases, 1×3 écartée en 001, variantes d'empreinte, chantier non annulable, ajout du stockage avec saturation (§3.7) et de l'énergie (§3.8), trois questions ouvertes nouvelles. |
| 2026-08-23 | Rôle des ressources tranché (§1) : Camelote et Bave d'étoiles pour la construction et la recherche, Jus pour la propulsion des flottes et la recherche. **Le conflit lexical Jus / énergie est clos** : l'énergie est une ressource à part, le Jus est un carburant. §3.8 réécrit — l'énergie est produite par un bâtiment dédié et consommée par **tous** les autres bâtiments, et le rapport ne dégrade que la production. |
| 2026-08-23 | **Nom de l'extracteur de Bave d'étoiles tranché : « racloir ».** La proposition issue de la spécification 001 est retenue ; la question ouverte du §11 est close. C'était la dernière question de vocabulaire en suspens. |
| 2026-08-31 | **Le Gong entre au vocabulaire** (§1), tranche 003. Le catalogue déclare ses durées en gongs et ses productions en grains par gong ; chaque serveur déclare la longueur de la sienne, l'applique et l'annonce au client. Le gong canonique vaut dix secondes — le PGCD exact des quinze durées —, donc **aucun chiffre du jeu n'a bougé**. La feuille de route se décale : le système solaire passe de 003 à **004** (§10). Une question ouverte s'ajoute (§11) : faire du gong l'unité *native* du domaine, écartée pour l'instant parce qu'elle rendrait les compteurs extrapolés de 002 faux entre deux gongs. |
