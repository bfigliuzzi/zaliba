# Phase 0 — Recherche : La Régie approximative

**Branche** : `002-la-regie-approximative` | **Date** : 2026-08-27 |
**Plan** : [plan.md](./plan.md)

Dix-huit décisions, chacune avec son motif et son alternative écartée. La
numérotation est **propre à cette tranche** : les `R` de 001 gardent leur sens
dans leurs documents, et les citer ici se fait toujours avec leur préfixe —
« R8 de 001 ».

Ce que ce document **ne rejoue pas** : les décisions de
[`docs/architecture/2026-08-23-choix-de-stack.md`](../../docs/architecture/2026-08-23-choix-de-stack.md)
et celles de [`specs/001-la-planete-mere/research.md`](../001-la-planete-mere/research.md).
Cette tranche les applique.

---

## R1 — Le mécanisme de style : du CSS global écrit à la main

**Décision.** L'habillage est écrit en **CSS ordinaire**, dans quelques feuilles
globales rangées sous `apps/game/src/design/`, importées une fois depuis
`main.tsx`. Aucun cadre utilitaire, aucun CSS-in-JS, aucun module CSS.

**Motif.** Trois contraintes se rejoignent.

La constitution ne nomme **aucune** technologie de style : sa section « Stack
technique » va du langage au rendu sans jamais franchir la ligne du CSS. Il n'y
a donc pas d'écart à amender — il y a un vide, et le principe V dit comment le
remplir : par la solution la plus simple qui satisfait la spécification.

Ce que la spécification demande est un **jeu de valeurs unique** (FR-001), pas un
moteur de composition de classes. Les propriétés personnalisées CSS font
exactement cela, sans étape de compilation, sans dépendance, et — c'est le point
qui décide — **sans changer ce que Biome lint, ce que `tsc` vérifie et ce
qu'axe mesure**. Toute couche ajoutée entre la valeur et le pixel est une couche
à travers laquelle il faudrait revérifier les onze portes de CI.

Enfin, l'écran habillé est **un** écran. Le coût du CSS global — la collision de
noms — se paie à partir de plusieurs dizaines de composants écrits par plusieurs
personnes. Ici il y en a une, et sept blocs.

**Alternatives écartées.**

| Option | Coût réel | Pourquoi non |
| --- | --- | --- |
| **UnoCSS**, tel que le dossier de design le livre | une dépendance de compilation, un greffon Vite, un vocabulaire de classes atomiques dans tout le JSX, et un second endroit où une valeur visuelle peut vivre | Le dossier livre `uno.config.ts` comme *commodité de prototypage*, et le dit. Adopter le moteur pour lire ses valeurs revient à installer une chaîne complète pour un fichier de constantes. Le principe V l'interdit : le besoin présent est la valeur, pas le moteur. |
| **Modules CSS** (natifs dans Vite, zéro dépendance) | un fichier de style par composant, des noms de classe générés, un typage à ajouter pour `tsc` | Résout la collision de noms, qui n'est pas un problème à cette échelle, et rend plus difficile ce qui est ici l'exigence centrale : lire d'un seul endroit toutes les valeurs employées par l'écran. À rouvrir le jour où un second écran est habillé. |
| **Styles en ligne**, comme les prototypes | aucun | Rend FR-001 invérifiable : une valeur en dur dans un `.tsx` est exactement ce que la règle proscrit. |

---

## R2 — La source unique des valeurs, et la porte qui la rend vraie

**Décision.** `tokens.json` du dossier de design est **versionné tel quel** et
devient la source de référence. `apps/game/src/design/tokens.css` en est la
transcription en propriétés personnalisées. Deux tests mécaniques la tiennent :

1. **Un test de conformité** lit les deux fichiers et échoue si une valeur de
   `tokens.json` est absente de `tokens.css` ou lui est différente. Les **tailles
   de police** font exception à l'égalité littérale : elles sont comparées à
   `max(valeur du dossier, plancher du rôle)`, converti en `rem`. Le plancher est
   une **règle** déclarée dans le test, pas une liste d'exceptions — R14 en donne
   la table et le motif.
2. **Un test de non-régression** parcourt `apps/game/src/**` et échoue si une
   valeur visuelle littérale — code hexadécimal, `rgb(`, `deg`, une longueur en
   pixels hors des exceptions énumérées — apparaît ailleurs que dans
   `tokens.css`.

Les deux **doivent constater qu'ils ont lu quelque chose** : un test qui parcourt
zéro fichier et sort en succès est une porte inerte, et l'inertie prend
l'apparence d'un succès. C'est le constat qui a fait descendre TypeScript à la
ligne 6 (amendement 2.1.0 de la constitution) ; il vaut ici aussi.

**Motif.** FR-001 est une règle sur la *provenance* des valeurs, pas sur leur
apparence. Une règle de provenance qui repose sur la discipline de relecture
dérive au troisième écran. Un générateur aurait le même effet mécanique ; il
coûte une étape de compilation et un fichier engendré à ne pas éditer, pour la
même garantie.

**Alternative écartée.** Engendrer `tokens.css` depuis `tokens.json` par un
script de compilation. Retenu si un jour un second consommateur apparaît (une
application native, un site public) : à un seul consommateur, la transcription à
la main **doublée d'une porte** est plus simple et tout aussi sûre.

---

## R3 — La place du dossier de design dans le dépôt

**Décision.** Le dossier est déplacé **entier** vers
`docs/design/2026-08-27-regie-approximative/`, `support.js` compris, et il est
exclu de toutes les portes.

**Motif.** Trois de ses fichiers ont des rôles distincts, et un seul d'entre eux
est opérant.

| Fichier | Rôle après le déplacement |
| --- | --- |
| `tokens.json` | **normatif** — la source de référence de R2, lue par la porte de conformité |
| `README.md` | **normatif** — la copie, les libellés d'accessibilité, le contrat d'accessibilité |
| `GrilleParcelle.dc.html` | **traçabilité** — la spécification d'interaction dont FR-021 et FR-022 sont tirés |
| `Zaliba - Pistes de jeu.dc.html` | **traçabilité** — les dossiers 4 et 5 documentent pourquoi les hachures ont été supprimées |
| `uno.config.ts` | **traçabilité** — le moteur n'est pas adopté (R1), la configuration reste la preuve d'où viennent les valeurs |
| `support.js` | **outil** — sans lui, aucun des deux prototypes ne s'ouvre |

Réduire le dossier à `tokens.json` économiserait 250 Ko et perdrait la seule
chose qui rend la refonte relisible dans six mois : *pourquoi* les hachures ont
disparu, et *quel* canal les remplace.

**Ce que le déplacement oblige à faire.** `uno.config.ts` et `support.js` sont du
TypeScript et du JavaScript : Biome les inclut par défaut (`files.includes`
commence par `**`). Ils doivent être exclus explicitement, faute de quoi la porte
de lint se met à juger du code de prototype que personne ne maintiendra.
`tsc` et `dependency-cruiser` ne les voient pas — le premier n'inclut que
`src` et `tests`, le second ne parcourt que `apps` et `packages`.

**Alternative écartée.** Laisser le dossier à la racine. Il y est arrivé comme
entrée de la spécification, pas comme emplacement voulu : une racine de dépôt qui
accumule les dossiers de livraison finit par ne plus dire ce qu'est le projet.

---

## R4 — Les fontes, auto-hébergées

**Décision.** Quatre paquets `@fontsource/*` en version **5.3.0**, épinglés à
l'exact, importés depuis `main.tsx`, **sous-ensemble latin uniquement**, et
seulement les graisses que le jeu de valeurs nomme :

| Famille | Paquet | Graisses employées |
| --- | --- | --- |
| Archivo | `@fontsource/archivo` | 400, 500, 600, 700, 800 |
| Archivo Narrow | `@fontsource/archivo-narrow` | 400, 600, 700, 800 |
| JetBrains Mono | `@fontsource/jetbrains-mono` | 400, 500, 700 |
| Saira Stencil One | `@fontsource/saira-stencil-one` | 400 |

Chaque famille porte une **pile de repli** déclarée dans `tokens.css`, parce que
le cas limite « les polices ne se chargent pas » est nommé par la spécification.

**Motif.** FR-004 interdit toute requête vers un domaine tiers ; le dossier de
design le sait et le dit. Vite émet les `woff2` dans le paquet compilé et
réécrit les `@font-face` en chemins relatifs : l'auto-hébergement ne demande
aucune configuration.

**La vérification se fait par exécution, jamais par lecture.** C'est le protocole
que R17 de 001 a imposé au projet après avoir cru `dependency-cruiser`
compatible sur la foi de son code de sortie. Deux mesures :

- après compilation, aucune occurrence de `fonts.googleapis.com` ni de
  `fonts.gstatic.com` dans `apps/game/dist/**` ;
- au parcours de bout en bout, **toute** requête sortante est interceptée et son
  origine comparée à celles de la pile locale.

**Repli nommé d'avance.** Si un paquet Fontsource s'avère absent, périmé ou
distribuant une licence incompatible, la famille passe en `woff2`
téléchargé et sous-ensemblé à la main, avec son `@font-face` écrit dans
`tokens.css`. Le repli coûte un fichier binaire versionné et aucune voie de mise
à jour ; il n'est pas pris avant constat.

**Alternative écartée.** `presetWebFonts` du dossier de design, qui charge depuis
Google. Le dossier lui-même la marque comme inacceptable pour ce projet.

---

## R5 — Le vocabulaire de silhouettes : sept formes, deux modificateurs

**Décision.** Un composant `Glyphe` unique, `viewBox="0 0 24 24"`,
`fill="currentColor"`, sept formes tirées de `tokens.json` → `glyphes` :
**camelote** (triangle sur socle), **jus** (losange barré), **bave** (disque
évidé), **chantier** (sablier), **obstacle** (triangle plein), **visée**
(croix), **refus** (disque barré d'une croix).

Deux **modificateurs**, qui ne consomment pas de silhouette :

- la **marque d'angle** — une silhouette réduite posée dans le coin d'une case
  qui en porte déjà une autre ;
- le **style de trait** — la même silhouette **pleine** ou **évidée**.

**Motif.** FR-013 énumère douze états, le contrat d'accessibilité en admet cinq à
sept. La tension est réelle et se résout en ouvrant un canal qui n'est ni la
teinte ni une huitième forme. Le README du dossier de design le prévoit :
« si un futur écran multiplie les états, il faudra rouvrir un canal (le mot, la
position) » — la position d'angle et le style de trait sont ces canaux, et ils
survivent au mode contrastes forcés comme au niveau de gris.

**Une correction au dossier de design, assumée.** Deux glyphes de `tokens.json`
— `jus` et `bave` — décrivent leur évidement par une seconde forme peinte à la
teinte du fond. En mode contrastes forcés, cette forme hérite d'une couleur du
système et **rebouche** l'évidement : le losange barré devient un losange plein,
et il se confond avec le triangle de l'obstacle. Les deux glyphes sont redessinés
en **un seul chemin à `fill-rule="evenodd"`**, dont le trou est un vrai trou. Le
README nomme lui-même les teintes en dur des prototypes comme « une dette à ne
pas reprendre » ; c'est la même dette, exprimée dans les valeurs.

**Alternative écartée.** Une huitième et une neuvième silhouette pour les états
manquants. Au-delà de sept, la reconnaissance à quatre pixels de large s'effondre
— c'est le constat qui a produit la contrainte, et le contourner rendrait SC-003
infranchissable pour de bon.

---

## R6 — Les douze états de case, dérivés de ce que 001 expose déjà

**Décision.** Une fonction pure de présentation,
`appearanceOf(cell, buildings, work, pose, catalogs) → CellAppearance`, qui range
chaque case dans l'un des douze états de FR-013 sans introduire la moindre donnée
côté serveur.

| # | État de FR-013 | Ce qui le détermine | Silhouette | Trait / marque | Emprise et niveau |
| --- | --- | --- | --- | --- | --- |
| 1 | case libre | `state === 'free'`, `depositOf === null` | aucune | — | — |
| 2–4 | gisement de camelote / jus / bave | `depositOf !== null`, `buildingId === null` | celle de la ressource | pleine | — |
| 5 | gisement **productif** | `depositOf !== null`, bâtiment dessus, `buildings[type].extracts === depositOf` | aucune | marque d'angle de la ressource, **pleine** | emprise, niveau rendu |
| 6 | gisement **stérile** | idem, `extracts !== depositOf` | aucune | marque d'angle de la ressource, **évidée** | emprise, niveau rendu |
| 7 | obstacle libérant du terrain nu | `state === 'obstructed'`, `obstacles[id].reveals.kind === 'bare-ground'` | obstacle | pleine | — |
| 8 | obstacle libérant un gisement | idem, `reveals.kind === 'deposit'` | obstacle | marque d'angle de la ressource révélée | — |
| 9 | bâtiment posé | `state === 'occupied'`, pas de gisement dessous | aucune | — | emprise, niveau rendu |
| 10 | chantier en cours | la case est sous la cible de `state.work` | chantier | — | emprise du chantier |
| 11 | visée, pose valide | sous l'empreinte, `check.kind === 'ok'` | visée | — | — |
| 12 | visée, pose refusée | sous l'empreinte, case fautive | refus | — | — |

**Le niveau d'un bâtiment n'est pas une silhouette.** La première rédaction de
cette table écrivait « niveau du bâtiment » en colonne *silhouette* pour les
états 5, 6 et 9, ce qui mélangeait deux canaux : le vocabulaire fermé de R5 ne
compte que sept **formes**, et un chiffre n'en est pas une. Ces trois états ne
portent donc **aucune** silhouette centrale ; ce qui les identifie est la marque
d'angle — pour 5 et 6 — et, pour tous les trois, le cadre d'emprise avec le
niveau lisible dessus (FR-017).

**D'où la cinquième colonne, et la correction de l'invariant.** Sans elle, les
états **1** — case libre — et **9** — bâtiment posé — portent le même triplet
(aucune silhouette, aucun trait, aucune marque) et deviennent indistinguables au
regard de l'unicité que SC-003 et SC-009 exigent. Le discriminant est donc un
**quadruplet** : silhouette, trait, marque, emprise. C'est ce que
[data-model.md § 3.3](./data-model.md) fixe en INV-C1.

**Motif.** Les douze états sont douze *lectures* d'une même donnée. Les faire
calculer par une fonction pure du client — et non par le domaine — respecte la
frontière du principe II : « quel glyphe » est une question de présentation. La
question de jeu qui la précède — *ce gisement est-il exploité par ce bâtiment ?*
— se répond avec `catalogs.buildings[typeId].extracts`, que le client importe
déjà.

**Ce qui n'est pas dérivable et se voit.** L'état 8 exige de nommer la ressource
qu'un obstacle libère **avant** de le déblayer. C'est déjà une information
publique du jeu — le document de conception § 2.1 en fait une règle : « qui a
déblayé un `filon-enfoui` sait ce que le prochain donnera » — et la page de
règles la publie déjà. La marque d'angle ne révèle donc rien de nouveau ; elle
rend visible sur la parcelle ce qu'il fallait aller lire ailleurs. C'est
exactement ce que P4 « a besoin de tout savoir » demande.

**Alternative écartée.** Ranger cette fonction dans `packages/domain`. Elle
franchirait la frontière dans le mauvais sens : le domaine se mettrait à
connaître des silhouettes.

---

## R7 — L'adresse courte de case, et ce qu'elle remplace

**Décision.** Une case se désigne par **la lettre de sa colonne suivie du numéro
de sa rangée**, tous deux en base 1 : `A1` en haut à gauche, `F6` en bas à droite
sur le Berceau. `describePosition` de `apps/game/src/lib/labels.ts` **rend
désormais cette adresse** et cesse de rendre « Colonne 4, rangée 1 ».

**Motif.** FR-016 en fait un besoin fonctionnel et non une décoration : les
joueurs s'échangent des plans à l'oral, et « C3 » se dit en une syllabe là où
« colonne trois, rangée trois » en prend sept. La conséquence est que l'adresse
doit être **la même partout** — nom accessible de la case, annonce de curseur,
motif de refus, cible d'un chantier — sans quoi le joueur apprend deux systèmes.

**Ce que cela coûte.** Six fichiers du client citent `describePosition`
aujourd'hui, et une douzaine de tests comparent la phrase produite. Le
changement est mécanique mais large, et il se conduit **test d'abord** : la
nouvelle attente est écrite, observée en échec, puis la table change.

**Au-delà de vingt-six colonnes.** Aucun archétype annoncé ne dépasse dix
colonnes (3 × 10 à 8 × 4). La fonction lève plutôt que de produire une adresse
douteuse : une planète à vingt-sept colonnes est un changement de conception, pas
un cas limite d'affichage.

**Alternative écartée.** Porter les deux formes — « C3 (colonne 3, rangée 3) ».
Double la longueur de chaque annonce de curseur, c'est-à-dire double le temps
d'une exploration au lecteur d'écran, pour une redondance que les bandes de
coordonnées assurent déjà à l'œil.

---

## R8 — La géométrie de la case : des unités de conteneur, pas des paliers

**Décision.** Chaque case est un **conteneur de dimensionnement**
(`container-type: size`), et tout ce qu'elle porte — silhouette, numéro de
niveau, marque d'angle — est dimensionné en `cqmin`. La silhouette occupe
`38cqmin`.

**Motif.** FR-015 exige « environ 35 à 40 % de la case ». Exprimée en paliers de
media queries, cette proportion est vraie à trois largeurs et fausse entre les
trois. Exprimée en `cqmin`, elle est vraie par construction, à toute largeur, sur
toute dimension de parcelle — y compris les 3 × 10 et 8 × 4 à venir, que le cas
limite de la spécification nomme.

**Le second effet est celui qui décide.** Au zoom texte de 200 %, la racine
double mais la fenêtre en pixels ne change pas : une case en pixels reste à
44 px pendant que le numéro de niveau, s'il était en `rem`, passerait de 24 à
48 px et déborderait. En `cqmin`, le contenu suit la case. FR-034 et SC-002 sont
alors tenus **par la géométrie**, et non par une correction ad hoc.

**Le plancher typographique reste vérifié.** À la case minimale de 44 px,
`38cqmin` vaut 16,7 px et le numéro de niveau `40cqmin` vaut 17,6 px : tous deux
au-dessus des 14 px que R14 exige d'un texte porteur d'information, et très
au-dessus des 9,5 px que FR-039 fixe comme plancher absolu.

**Alternative écartée.** Trois paliers de media query. Moins de concepts, et faux
entre les paliers — ce qui est précisément l'endroit où vivent les vraies
fenêtres.

---

## R9 — Le budget de largeur à 320 px

**Décision.** Sous 360 px, les épaisseurs décoratives se resserrent, et la
proportion est **calculée, pas décrétée**. Le budget qui rend SC-001 vrai :

| Poste | Nominal (≥ 360 px) | À 320 px |
| --- | --- | --- |
| Rembourrage de l'écran, deux côtés | 30 px | 12 px |
| Bande de coordonnées (chiffres) | 16 px | 14 px |
| Encadrement de la grille, deux côtés | 6 px | 5 px |
| Rembourrage de la grille, deux côtés | 10 px | 6 px |
| Gouttières, cinq | 25 px | 15 px |
| **Reste pour six cases** | **273 px** | **268 px** |
| **Côté d'une case** | **45,5 px** | **44,7 px** |

**Motif.** Le calcul livré tel quel par le dossier — rembourrage de 15 px,
gouttière de 5 px, bande de 16 px — donne 38,8 px de côté à 320 px. C'est
**sous le plancher de 44 px**, donc sous FR-014 et sous SC-001. Le conflit est
arithmétique, il n'est pas d'appréciation, et il se résout en resserrant le
décor plutôt qu'en rognant la case : le décor est ce qui peut céder, la cible
tactile est ce qui ne le peut pas.

**Ce qui ne cède pas.** Les bandes de coordonnées restent affichées à 320 px.
Les masquer aurait libéré quatorze pixels et violé FR-016, qui n'admet pas de
palier.

**La mesure est un test, pas une intention.** Un parcours à 320 × 640 px mesure
la boîte rendue de chaque case et échoue sous 44 px. Le calcul ci-dessus est le
raisonnement ; le test est la preuve.

---

## R10 — Le palier unique, les trois colonnes, et l'ordre de tabulation

**Décision.** Un seul palier, à **900 px**. Au-delà, une grille
`268px 1fr 320px` avec `grid-template-areas`, l'en-tête sur toute la largeur.
**L'ordre du document ne change pas** ; seul le placement change.

**Motif.** FR-007 exige le palier unique et l'ordre de lecture inchangé. Les
zones de grille nommées font exactement cela : elles déplacent la boîte sans
toucher au document. La propriété `order` aurait le même effet visuel et
dissocierait l'ordre de tabulation de l'ordre visuel — c'est la façon
canonique de casser 2.4.3.

**La divergence visuel/document, et pourquoi elle est sans conséquence ici.** À
900 px et au-delà, le comptoir des ressources se lit à droite alors qu'il précède
le plan dans le document. La question serait sérieuse si le comptoir contenait
des éléments focalisables. **Il n'en contient aucun** : les trois compteurs, la
note, la plaque de chantier et le bloc de signature sont du texte. Le registre et
la légende de la colonne gauche n'en contiennent pas davantage — le registre de
001 compte une seule entrée, celle de la planète courante, et une entrée unique
qui désigne l'écran courant n'est pas un lien (FR-025 interdit la commande sans
effet).

**Conséquence, énoncée plutôt que découverte** : la totalité du parcours clavier
de l'écran vit dans l'en-tête puis la colonne centrale — plan, puis actions. Le
saut visuel gauche-droite n'existe donc pas au clavier. C'est ce qui rend la
disposition en guichet acceptable sans dispositif d'évitement.

---

## R11 — La région d'annonce unique, et le relevé

**Décision.** Une **seule** région `aria-live="polite"` sur l'écran, tenue par un
état d'annonce vivant dans `PlanetScreen`. Elle est écrite par des événements —
entrée dans la grille, déplacement du curseur, pose acceptée, pose refusée et sa
raison, chantier achevé, stockage saturé — et par le bouton **Relevé**. Elle
n'est **jamais** écrite par la progression d'un compteur.

**L'écran en compte deux aujourd'hui**, et c'est un défaut que la tranche
corrige : `GridLiveRegion` porte `role="status"`, et `BuildPanel` en porte un
second à sa ligne 359. Deux régions polies sur une même page se disputent
l'ordre de restitution, et le joueur entend l'une des deux, sans savoir laquelle.
Les régions **assertives** ne sont pas concernées : `RefusalNotice` garde son
`role="alert"`, qui est d'une autre nature et d'une autre urgence.

**Le relevé répété n'a pas besoin d'artifice.** Un lecteur d'écran ne réannonce
pas un texte identique, ce qui rend d'ordinaire nécessaire un jeton invisible
qui change à chaque appui. Ici, la phrase du relevé porte les quantités
détenues, qui changent à la seconde : deux relevés successifs ne produisent pas
le même texte. L'artifice est donc inutile — et le constater vaut mieux que
l'ajouter « au cas où », que le principe V proscrit.

**Deux événements nouveaux à détecter.** « Chantier achevé » et « stockage
saturé » ne sont aujourd'hui annoncés par rien : ce sont des transitions de
l'état extrapolé — `work` qui passe de non nul à nul, `saturatedSince` qui passe
de nul à un instant. Elles se détectent dans un effet qui compare l'état courant
au précédent, et elles écrivent l'annonce. C'est le seul endroit de la tranche
où le client observe le temps qui passe pour en tirer une phrase.

---

## R12 — Les raisons de refus, portées par la case

**Décision.** Une fonction pure de présentation traduit le verdict du domaine en
une raison **par case**, et cette raison entre dans le nom accessible de la case
(FR-021) comme dans l'annonce (FR-022).

| Verdict de `validatePlacement` | Raison portée |
| --- | --- |
| `out-of-grid` | « sort de la parcelle par la droite » — la direction est dérivée des cases hors bornes, et cumulée quand il y en a plusieurs |
| `obstructed` | « la case C3 est obstruée par un éboulis » — le type d'obstacle est nommé, et sa case avec |
| `occupied` | « chevauche la Mine niveau 2 en C3 » — le bâtiment est nommé, et sa case avec |

**Motif.** Le domaine rend déjà l'union fermée et l'énumération complète des
cases fautives ; il ne rend pas de phrase, et il ne doit pas en rendre. La
direction d'un débordement — « par la droite » — est de la géométrie
d'affichage : elle se calcule des cases hors bornes contre les dimensions de la
parcelle, sans que le domaine ait à connaître le mot « droite ».

**Le cas qui n'a pas de case.** Une empreinte qui sort de la parcelle a des cases
hors grille, donc **sans élément dans le document** : leur raison ne peut être
portée par elles. Elle est portée par les cases de l'empreinte qui existent, et
par l'annonce. C'est le seul endroit où la raison ne peut pas être *sur* la case
fautive, et c'est parce que la case fautive n'est pas dessinable.

---

## R13 — La rature : un état de client, jamais une donnée

**Décision.** Un crochet `useRature(valeur)` retient la **dernière valeur
différente** dans une référence, mise à jour dans un effet et non pendant le
rendu. Il rend `{ courante, ancienne | null }`. La rature paraît quand la valeur
change sous les yeux du joueur, subsiste jusqu'au changement suivant, et
disparaît au démontage de l'écran.

Le balisage est celui que le dossier de design impose, et pas un autre :

```
<span class="sr-only">Niveau 3, anciennement niveau 2.</span>
<span aria-hidden="true">niveau <span class="rature">2<i></i></span> <b>3</b></span>
```

**Motif.** FR-029 interdit toute donnée nouvelle persistée ou transmise ; le
client est donc la seule source possible, et « ce que le client affichait
précédemment » est exactement ce qu'une référence retient. FR-029a borne le
suivi aux valeurs qui changent **par saut** — niveau, débit horaire, plafond —
parce qu'une rature sur une quantité qui progresse à la seconde clignoterait au
lieu de corriger.

**Le piège, et pourquoi il justifie une US à lui seul.** `aria-label` sur un
`<p>` ou un `<span>` sans rôle est ignoré par les technologies d'assistance : le
texte rayé serait alors lu comme du contenu ordinaire, et le lecteur d'écran
énoncerait « niveau 2 3 » — une valeur fausse, produite par un balisage qui a
l'air correct. Le contrat est donc : le visuel **entièrement** `aria-hidden`,
et une phrase explicite en `.sr-only` à côté. `<del>`/`<ins>` doublés du même
masquage sont admis ; rien d'autre ne l'est.

**Deux ratures simultanées.** Chacune porte sa propre phrase. Aucune agrégation :
une phrase qui énoncerait deux corrections ensemble obligerait à les ordonner, et
l'ordre du document est déjà cet ordre.

---

## R14 — Le plancher typographique : un seuil par rôle, et tout en `rem`

**Ce qui est constaté.** SC-009 de la tranche 001 porte **trois clauses** — la
planète tient sur 360 × 640 px sans défilement ni zoom, le corps de texte fait au
moins 16 px, toute cible interactive au moins 44 × 44 px. **Seule la deuxième est
en cause ici**, et c'est elle seule qui est amendée ; les deux autres restent en
vigueur telles quelles. Cette clause exige que « le corps de texte
fasse au moins 16 px », et le parcours `apps/game/tests/e2e/mobile.spec.ts` le
mesure sur `p, dd, dt, li, label, button, a`. Le jeu de valeurs de la Régie
plafonne le texte courant à 12 px et descend à 8,5 px sur ses surtitres. Les deux
exigences sont **incompatibles**, et le principe I interdit de laisser l'écart
implicite.

### Ce que la première rédaction de cette décision affirmait de trop

Elle concluait que remonter l'échelle typographique rendait « le budget de
largeur de 320 px négatif », donc que l'arbitrage était forcé. **C'est faux.**

Le budget de 320 px est celui de la **grille** : côté de case, gouttières,
encadrement, rembourrage, bandes de coordonnées. Aucun de ces postes n'est du
texte, et les deux seuls textes qu'une case porte — la silhouette et le numéro
de niveau — sont dimensionnés en `cqmin` (R8), donc ils suivent la case et non la
racine. **Remonter le texte ne touche pas la grille.**

Ce que remonter le texte affecte réellement est la rangée de trois cartes de
ressources. Recalcul à 320 px : `320 − 12` de rembourrage d'écran, moins deux
gouttières de 9 px, donne trois cartes de 96,7 px ; moins les liserés, les marges
et le rembourrage de l'étiquette de papier, il reste **≈ 76 px utiles**. À 14 px,
« Camelote » tient, « Jus » tient, « Bave d'étoiles » passe sur deux lignes, et
la valeur « 18 420 » en 16 px de chasse fixe occupe 58 px. La conséquence n'est
pas un effondrement de mise en page : c'est un renvoi à la ligne.

L'arbitrage n'était donc pas forcé. Il est tranché ci-dessous sur son mérite.

### Le constat qui décide, et que le dossier de design ne voit pas

Le dossier a pour loi « l'approximation ne touche jamais la donnée ». Il la tient
pour les **valeurs** — 16, 22 et 30 px, en chasse fixe tabulaire, à 12,8:1. Il ne
la tient pas pour ce qui rend une valeur intelligible :

| Texte | Corps livré | Porte-t-il de l'information ? |
| --- | --- | --- |
| le nom de la ressource, sur l'étiquette de papier | **8,5 px** | oui — c'est ce qui dit à quoi le nombre se rapporte |
| le débit horaire « +540/h » | **9,5 px** | oui, et c'est un chiffre : FR-002 le concerne |
| l'intitulé « Chantier en cours » | **8,5 px** | oui — c'est le nom du bloc |
| « niveau ~~2~~ 3 » | **11,5 px** | oui |
| la légende des silhouettes | **11,5 px** | oui — SC-003 repose entièrement dessus |
| les entrées du registre | **13 px / 10 px** | oui |
| le bouton « Relevé » | **12 px** | c'est une commande |
| surtitre, notes de bas de page, mentions, tampons | 8,5–9,5 px | **non** — FR-038 le garantit |

La colonne de droite se sépare nettement en deux, et la séparation est **déjà
dans la spécification** : FR-038 interdit à un texte humoristique de porter une
information nécessaire. Le registre lexical de la Régie — le surtitre
administratif, les blagues, les mentions — est précisément ce qui peut rester
petit. Tout le reste, non.

### Ce que 16 px prouve, et ce qu'il ne prouve pas

**Aucun critère de WCAG 2.1 AA ne fixe de taille minimale de police.** Ce qui
décide de la lisibilité d'un texte pour un joueur malvoyant est le critère 1.4.4 :
le texte doit pouvoir doubler sans perte de contenu ni de fonction. Un texte de
12 px exprimé en `rem`, qui devient 24 px quand le joueur augmente la taille de
police du système, sert mieux qu'un texte de 16 px figé en pixels qui ne bouge
pas. **Le garde-fou réel n'est pas un plancher : c'est l'absence de toute taille
de police en pixels dans la feuille de style.**

La règle des 16 px de 001 avait, elle, un motif unique et exact, écrit à deux
endroits — la spécification et le commentaire de `styles.css` : *iOS Safari zoome
de lui-même à la mise au point d'un champ dont le texte est sous 16 px.* Ce
déclencheur est réel, et il porte sur les **champs de saisie**. Le test de 001 l'a
généralisé à sept sélecteurs, dont six que le motif ne couvre pas.

### Décision : un plancher par rôle, et aucune taille de police en pixels

**Quatre seuils**, appliqués comme une règle et non comme une liste d'exceptions :

| Rôle du texte | Plancher | Ce qu'il couvre |
| --- | --- | --- |
| **champ de saisie** | **16 px** | `input`, `select`, `textarea` — partout, écran d'authentification compris |
| **texte porteur d'information** | **14 px** | légende, niveau, registre, texte courant, débit, libellé de commande |
| **intitulé de bloc** | **12 px** | les libellés en capitales espacées, et les bandes de coordonnées |
| **décor sans information** | **9,5 px** | surtitre administratif, notes de bas de page, mentions, tampons |

Et une règle qui vaut autant que les quatre : **aucune taille de police n'est
exprimée en pixels.** `tokens.css` porte les tailles en `rem`, obtenues en
divisant la valeur du dossier par 16. C'est ce qui rend 1.4.4 vrai.

### Ce que cela change dans l'échelle du dossier

Six pas bougent ; huit ne bougent pas, étant déjà au-dessus de leur plancher.

| Pas | Dossier | Rôle | Retenu |
| --- | --- | --- | --- |
| `micro` | 8,5 px | décor | **9,5 px** |
| `note` | 9,5 px | décor | 9,5 px |
| `label` | 10 px | intitulé | **12 px**, interlettrage ramené à `.10em` |
| `menu` | 11,5 px | information | **14 px** |
| `corps` | 12 px | information | **14 px** |
| `item` | 13 px | information | **14 px** |
| `chiffre-xs` | — | information | **14 px**, pas nouveau, pour le débit horaire |
| `fiche`, `chiffre-s/m/l`, `pochoir-s/m`, `titre-m/l` | 16 à 46 px | information | inchangés |

**Un déplacement d'usage plutôt qu'un pas de plus** : le nom de la ressource et
les intitulés de bloc cessent d'employer `micro-titre` et passent à
`label-section`. Le même pas ne peut pas servir un surtitre décoratif et le nom
d'une ressource : ce sont deux rôles, et un plancher se pose sur un rôle.

**Le débit horaire devient un chiffre.** Il était en chasse fixe à 9,5 px, sous
tous les planchers, alors que FR-002 range tout chiffre dans la famille
tabulaire. `chiffre-xs` le range où il appartient.

### Comment la porte l'applique — une règle, pas des exceptions

Le test de conformité du jeu de valeurs ne compare pas `tokens.css` à
`tokens.json` à l'identique sur les tailles. Il vérifie :

```
tokens.css[pas] === max(tokens.json[pas], plancher[rôle du pas]) / 16 rem
```

Chaque pas déclare son rôle dans le test. La différence avec une liste
d'exceptions est ce qui fait tenir la porte dans le temps : **un pas ajouté
demain reçoit son plancher automatiquement**, alors qu'une exception énumérée
serait invisible en revue six mois plus tard.

`tokens.json` n'est pas modifié. Il reste le dossier tel qu'il a été livré, donc
la traçabilité de ce qui a été décidé et de ce qui a été corrigé.

### Ce que la décision produit comme travail

| Artefact | Modification |
| --- | --- |
| `specs/001-la-planete-mere/spec.md` § SC-009, **clause typographique seule** | le plancher de 16 px recentré sur les champs de saisie, daté et motivé ; les clauses de la fenêtre et des cibles ne bougent pas |
| `apps/game/tests/e2e/mobile.spec.ts` | l'assertion des 16 px ne mesure plus que `input, select, textarea` ; une seconde assertion mesure les quatre planchers par rôle |
| `apps/game/src/design/tokens.css` | l'échelle en `rem`, planchers appliqués |
| `apps/game/src/styles.css` | le commentaire qui invoque les 16 px pour le corps de texte est corrigé |

### Les deux alternatives, et leur coût

| Option | Coût |
| --- | --- |
| **Conserver 16 px partout** | Toute l'échelle remonte d'un facteur ≈ 1,33, blagues et surtitres compris. Les notes de bas de page occupent alors le même corps que les données qu'elles commentent, ce qui inverse la hiérarchie que la direction artistique construit. Faisable — la grille tient, les cartes de ressources passent en colonne sous 400 px — mais l'écran perd son registre administratif, qui est la moitié du sujet. |
| **Adopter le dossier tel quel**, plancher à 9,5 px | Conforme à WCAG 2.1 AA à la lettre, aucun critère ne fixant de taille minimale, et le confort repose entièrement sur le zoom texte. C'est vrai en droit et faible en pratique : la légende à 11,5 px est la clé de lecture des douze états, et le nom d'une ressource à 8,5 px est ce qui donne son sens à un nombre affiché à 16. Laisser l'étiquette sous la valeur contredit la loi que le dossier s'est lui-même donnée. |

## R15 — Comment on éprouve un système visuel

**Décision.** La tranche est intégralement conduite en test d'abord, et ce qui
est éprouvé est **l'observable**, jamais l'apparence.

| Ce que la spécification exige | Ce qu'on mesure, et où |
| --- | --- |
| l'ordre des blocs (FR-006) | l'ordre du document, par un test de rendu |
| les silhouettes distinctes (FR-012, SC-003) | l'attribut `data-glyphe` de chaque case, et l'unicité des quadruplets (silhouette, trait, marque, emprise) sur les douze états |
| l'adresse et la raison (FR-016, FR-021) | le nom accessible de la case, par un test de rendu |
| la région unique (FR-022) | le compte d'éléments `aria-live` polis dans le document |
| la rature (FR-027, SC-007) | la présence de la phrase `.sr-only` **et** l'absence du texte rayé de l'arbre d'accessibilité |
| les contrastes (FR-030, SC-004) | deux mesures : un test de calcul WCAG sur les couples de rôles de `tokens.json`, et la règle `color-contrast` d'axe sur l'écran rendu, aux deux largeurs |
| les cibles (FR-031, SC-001) | la boîte rendue, mesurée à 320 px |
| le zoom texte (SC-002) | la largeur de défilement du document à 200 % |
| l'absence de requête sortante (SC-008) | l'interception de toutes les requêtes au parcours |
| le mouvement réduit (SC-010) | les durées calculées d'animation et de transition, sous émulation de la préférence |
| le mode contrastes forcés (SC-009 de 002) | les silhouettes présentes et distinctes sous émulation |

**Ce qui n'est pas mécanisable, et qui est dit tel quel.** SC-003 demande qu'une
personne extérieure nomme les douze états en niveaux de gris ; SC-011 demande un
verdict sous simulation de protanopie et de deutéranopie. Un automate peut
vérifier que **les douze états portent des quadruplets distincts** — il ne peut pas vérifier
qu'un humain les reconnaît. La moitié mécanisable est un test ; la moitié
humaine est une **recette écrite dans `quickstart.md`**, à exécuter une fois et
dont le verdict est consigné. Prétendre l'automatiser serait rendre le critère
vert sans l'avoir tenu.

---

## R16 — L'ordre des blocs, et le déplacement du panneau de construction

**Décision.** L'ordre du document devient celui de FR-006 : en-tête, ressources,
note, chantier, plan, **actions**, mention. Le panneau de construction, qui
précède la grille depuis 001, passe **après** elle, avec les trois autres
mécaniques.

**Motif.** FR-006 est prescriptif. Le motif de 001 — « sélectionner un type,
choisir une empreinte, puis déplacer le curseur » — reste vrai comme séquence
d'apprentissage, et il perd son argument de mise en page dès lors que le plan
devient le sujet visuel de l'écran.

**Ce que le déplacement coûte au clavier, et ce qui le compense.** Le joueur
tabule désormais à travers la grille avant d'atteindre le choix de bâtiment,
puis revient à la grille pour placer. L'aller-retour se paie **une fois par
choix de bâtiment**, et non une fois par placement : la grille conserve sa
confirmation par `Entrée`, donc le déplacement du curseur et la pose se font sans
la quitter. C'est acceptable, et c'est dit ici pour que le contraire se remarque
si un jour la confirmation quitte la grille.

**Les quatre mécaniques restent toutes visibles** (FR-011) : les panneaux
d'amélioration, de démolition et de déblaiement rejoignent la barre d'actions,
sous le plan, sans navigation supplémentaire ni repli derrière un menu.

---

## R17 — Le thème clair seul, et le mode contrastes forcés

**Décision.** `color-scheme: light` déclaré, aucune règle
`prefers-color-scheme: dark`, et les teintes de nuit de `tokens.json` —
`encre-nuit`, `encre-douce`, `bave-nuit`, `visee-nuit` — **transcrites dans
`tokens.css` mais employées par aucune règle**.

**Motif.** FR-036 met le thème sombre hors périmètre, avec un motif qui n'est pas
un manque de temps : le dossier annonce des ratios mesurés et n'en fournit aucun
en sombre. Livrer un thème dont les contrastes ne sont pas mesurés serait une
régression d'accessibilité présentée comme une fonctionnalité.

**Pourquoi les transcrire malgré tout.** La porte de conformité de R2 compare
`tokens.json` et `tokens.css` : en omettre quatre valeurs obligerait à inscrire
quatre exceptions dans la porte, et une exception dans une porte est ce qui
devient invisible en six mois. Elles sont donc présentes, inemployées, et la
porte de non-régression de R2 vérifie qu'aucune règle ne les référence.

**Le mode contrastes forcés est une exigence, pas une politesse.** Les aplats et
les ombres y disparaissent ; ce qui subsiste est la silhouette et le style de
trait. C'est ce qui rend R5 non négociable : un glyphe à teinte en dur y devient
invisible ou uniforme.

---

## R18 — L'amendement de la feuille de route

**Décision.** Le § 10 de
[`docs/design/conception-du-jeu.md`](../../docs/design/conception-du-jeu.md) est
amendé : cette tranche prend le numéro **002**, le système solaire devient
**003**, et les quatre suivantes se décalent d'autant.

**Motif.** Le document de conception attribue 002 au système solaire. La
spécification de cette tranche justifie l'interposition — sept planètes habillées
par un écran sans identité coûteraient sept fois la même reprise — et le § « Où
écrire quoi » de `CLAUDE.md` désigne ce document comme l'endroit de la feuille de
route. Laisser la table dire autre chose que la réalité des branches est
exactement l'écart implicite que le principe I proscrit.

**Ce que l'amendement ne fait pas.** Il ne réordonne rien d'autre : les motifs
d'ordre des tranches 003 à 006 sont inchangés, seuls leurs numéros bougent.
