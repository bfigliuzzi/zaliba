# Phase 0 — Recherche : Le Gong

**Plan** : [plan.md](./plan.md) · **Spec** : [spec.md](./spec.md)

Les décisions de cette tranche sont numérotées **G1 à G15**, et non `R…` : les
`R` appartiennent à 001 et 002, et deux séries homonymes se confondraient dans
une revue. Chaque décision porte son alternative écartée et le motif du choix,
comme le principe I l'exige.

---

## G1 — Le gong est une unité de déclaration, pas l'unité native du domaine

**Décision.** Le catalogue déclare en gongs ; le serveur résout en secondes au
chargement. `packages/domain/src/kernel/time.ts`, `rates.ts`, `resources.ts`,
`projection.ts`, les conversions de `packages/db` et `instantSchema` du contrat
ne sont **pas touchés**. L'instant du jeu reste un entier de secondes UTC.

**Motif.** La profondeur alternative — `Instant` devenant un indice de gong, la
projection comptant en gongs — est plus pure, et c'est probablement le bon
modèle à terme. Mais elle rouvre le cœur de 001, et surtout elle change le
*ressenti* : à dix secondes par gong, l'état vrai n'avance qu'une fois toutes
les dix secondes, et les compteurs extrapolés livrés par 002 — qui bougent
chaque seconde — décriraient un état faux entre deux gongs. Pour P4, qui refait
les calculs, c'est un défaut. Cette question relève de la conception du jeu et
mérite sa propre discussion.

**Alternative écartée.** Le gong comme unité de temps du domaine. Consignée
comme **question ouverte** dans `docs/design/conception-du-jeu.md` plutôt que
perdue.

---

## G2 — Le gong canonique dure dix secondes

**Décision.** `GONG_CANONIQUE = 10 secondes`.

**Motif.** Ce n'est pas un choix de goût, c'est une propriété de la donnée
existante. Le plus grand commun diviseur des quinze durées du catalogue vaut
exactement dix :

| Grandeur | Secondes | Gongs |
| --- | --- | --- |
| `buildDuration` (mine, puits, racloir, centrale, entrepôt) | 120, 150, 200, 90, 100 | 12, 15, 20, 9, 10 |
| `demolitionSeconds` (idem) | 300, 420, 600, 240, 180 | 30, 42, 60, 24, 18 |
| `durationSeconds` (les cinq obstacles) | 300, 900, 1800, 2700, 3600 | 30, 90, 180, 270, 360 |

Le catalogue s'exprime donc en gongs **entiers**, sans qu'aucune valeur
d'équilibrage ne bouge. Les taux suivent : une production de 15 unités par heure
vaut 15 grains par seconde (R1), donc **150 grains par gong** — entier lui aussi.

**Alternatives écartées.** Soixante secondes, qui obligerait à rééquilibrer
(150 s ne fait pas un compte rond de gongs) ; une seconde, qui n'apporterait
rien sur la déclaration actuelle et plafonnerait l'accélération.

---

## G3 — La longueur du gong est une fraction entière de secondes

**Décision.** Elle s'exprime `{ num, den }`, jamais en flottant. Canonique :
`{ num: 10, den: 1 }`. Un gong de `{ num: 1, den: 6 }` fait battre le serveur
soixante fois plus vite.

**Motif.** Bornée à la seconde entière, la longueur du gong plafonnerait
l'accélération à **×10** — et ×10 ne suffit pas : réunir les 150 unités que
coûte une mine de niveau 2, à 30 unités par heure, demanderait encore une
demi-heure réelle. Le dépôt possède déjà le motif (`Fraction { num, den }` dans
`packages/catalogs/src/buildings.ts`) et R19 interdit les flottants dans toute
grandeur de jeu.

**Alternative écartée.** Un « facteur d'accélération » entier. C'est le même
nombre écrit autrement, mais il redevient un *réglage* au lieu d'une *unité* —
et c'est précisément ce glissement qui autorisait deux transformations inverses
à diverger.

---

## G4 — La résolution porte sur la base de la courbe, jamais sur la valeur évaluée

**Décision.** C'est la décision porteuse de la tranche.

```
base de durée résolue = max(1, ⌊ baseGongs × num ÷ den ⌋)     puis evaluateCurve
base de taux résolue  =        baseGrainsParGong × den ÷ num   puis evaluateCurve
```

**Motif.** Résoudre *après* l'évaluation empilerait deux troncatures, et
l'égalité stricte exigée par FR-010 tomberait sur certains niveaux. Résoudre la
base préserve la règle de R19 — *une seule troncature, en fin de calcul* — et
rend l'égalité **exacte** au gong canonique, où la résolution n'est qu'une
multiplication par dix.

**Vérifié, non supposé.** Les 240 valeurs comparables — 140 durées de
construction (quatre types sur trente niveaux, plus l'entrepôt sur vingt),
5 durées de démolition, 5 de déblaiement, 90 taux (trois extracteurs sur trente
niveaux) — sont **strictement égales** aux valeurs d'avant la tranche au gong
canonique. Le compte a d'abord été écrit « 230 », qui omettait la démolition et
le déblaiement ; FR-010 dit « chaque durée ».

**Alternative écartée.** Évaluer puis diviser. Plus intuitif, faux.

---

## G5 — Hors gong canonique, une troncature, et la base résolue est publiée

**Décision.** À une longueur de gong non canonique, la résolution d'une base de
durée peut tronquer une fois. La base résolue est alors **publiée par la page de
règles**, et c'est elle qui sert de point de départ au calcul du joueur.

**Motif.** FR-009 promet un chiffre refaisable à la main. Il l'est dès lors que
le joueur part de la valeur publiée : la chaîne « base résolue → courbe →
durée » ne comporte qu'une troncature, exactement comme aujourd'hui. Au gong
canonique il n'y en a aucune, puisque multiplier par dix est exact.

---

## G6 — Un gong très court aplatit les écarts entre types

**Constat, à ne pas redécouvrir.** Plus le gong est court, plus la troncature de
G4 rapproche les bases. À `{ 1, 6 }`, c'est-à-dire ×60 :

| Type | Gongs | Base résolue | Niveau 1 | Niveau 5 |
| --- | --- | --- | --- | --- |
| mine | 12 | **2 s** | 2 s | 7 s |
| puits | 15 | **2 s** | 2 s | 7 s |
| racloir | 20 | 3 s | 3 s | 11 s |
| centrale | 9 | **1 s** | 1 s | 3 s |
| entrepôt | 10 | **1 s** | 1 s | 3 s |

La mine et le puits deviennent indiscernables, la centrale et l'entrepôt aussi.
L'équilibrage relatif disparaît. **Sans conséquence pour un banc d'essai**, où
l'on éprouve des transitions et non un équilibre — **décisif** le jour où des
univers rapides seraient ouverts à des joueurs.

**Le corollaire qui contraint SC-002.** La troncature de base n'est pas seulement
un rapprochement : c'est un écart au rapport d'accélération annoncé, et la
courbe géométrique l'**amplifie**. La centrale déclare 9 gongs ; à `{ 1, 6 }` sa
base résolue vaut `max(1, ⌊9 ÷ 6⌋) = 1` seconde au lieu de 1,5 — soit ×90 et non
×60. Au niveau 30, la courbe `7/5` multiplie cet écart par `⌊1,4²⁹⌋ ≈ 17 300` :

| | gong `{10,1}` | gong `{1,6}` | attendu à ×60 | écart |
| --- | --- | --- | --- | --- |
| centrale, niveau 1 | 90 s | 1 s | 1,5 s | 0,5 s |
| centrale, niveau 30 | ≈ 1 556 730 s | ≈ 17 297 s | ≈ 25 946 s | **≈ 8 650 s** |

Le rapport est donc **exact sur les bases résolues** et seulement là. Sur une
valeur de courbe, l'écart est celui de la troncature de base, multiplié par la
courbe : borné, calculable, et très supérieur à la seconde. C'est ce qui a fait
reformuler SC-002, qui promettait « à la seconde près » un rapport que
l'arithmétique entière ne peut pas tenir. Au **gong canonique**, aucune
troncature n'a lieu et la question ne se pose pas.

**Recommandation.** Pour le banc d'essai de `900-les-cinq-doublures`, préférer
`{ 1, 2 }` — ×20 — qui laisse les cinq bases distinctes (6, 7, 10, 4, 5) tout en
ramenant l'attente d'une amélioration de mine de cinq heures à quinze minutes.
Le choix appartient à cette tranche-là ; il est documenté ici pour qu'elle n'ait
pas à refaire le calcul.

---

## G7 — La longueur du gong voyage dans l'instantané de planète

**Décision.** Elle est annoncée dans `PlanetSnapshotV1`, à côté de
`serverInstant` et `catalogVersion` (`packages/contracts/src/v1/planet.ts`).

**Motif.** C'est l'exigence qui a motivé la tranche : *le serveur est la source
unique de vérité*. Et le véhicule existe déjà, pour la même raison — le client
ne date rien et ne dérive rien sans que le serveur le lui ait dit d'abord. La
conséquence est meilleure qu'un point de configuration séparé : **la réponse qui
porte l'état porte les règles qui l'expliquent**, dans le même message. Il
n'existe aucun instant où le client détient un état sans les règles qui vont
avec, et la péremption est bornée à une requête.

**Alternatives écartées.** Un `GET /v1/config` : deux récupérations, donc une
fenêtre pendant laquelle l'état et les règles peuvent se contredire. Une
variable d'environnement côté client : le *miroir asynchrone* explicitement
rejeté — deux lecteurs d'une même valeur restent deux sources, et un bundle
compilé avant un changement afficherait des chiffres faux sans que rien ne le
détecte.

---

## G8 — Ajouter un champ à un schéma `.strict()` casse un bundle client périmé

**Constat, assumé.** `PlanetSnapshotV1` est déclaré `.strict()`
(`packages/contracts/src/v1/planet.ts:184`), et `planetGateway.ts` analyse
réellement la réponse — *« la réponse est analysée, jamais transtypée »*. Un
bundle client antérieur rejettera donc la clé inconnue **à l'analyse**. Son mode
de défaillance passe de l'avis de divergence, lisible, à une erreur d'analyse,
qui ne l'est pas.

**Décision : accepté.** Le client est servi avec l'API, `/v1` n'a aucun
consommateur externe, et R15 tient déjà un bundle périmé pour indigne de
confiance. L'ajout reste sémantiquement additif ; c'est la rigueur du schéma qui
le rend rupteur, et cette rigueur a été choisie délibérément.

**Alternatives écartées.** `passthrough()` : `.strict()` existe pour qu'une clé
inconnue échoue à la frontière plutôt que trois composants plus loin. Un `/v2` :
disproportionné pour un champ, sur un contrat sans consommateur externe.

---

## G9 — Le champ est optionnel, et son absence vaut divergence

**Décision.** Optionnel dans le schéma. Le client qui ne le reçoit pas
**n'affiche aucun chiffre dérivé**, exactement comme sur une divergence de
catalogue.

**Motif.** FR-013. Un repli silencieux sur le gong canonique afficherait des
chiffres d'apparence exacte pour un monde peut-être différent — la faute que
`catalogVersion.ts` a déjà nommée : *« croire à l'accord sur la foi d'une
absence ferait afficher des chiffres faux précisément quand on ne sait rien »*.

---

## G10 — `buildApi` dérive ce qu'il annonce de ce qu'il applique

**Décision.** `apps/api/src/app.ts` cesse de lire `CATALOG_VERSION` par import
séparé et lit `catalogs.version` ; la longueur du gong annoncée est lue de la
même source que celle qui a résolu le catalogue.

**Motif.** Aujourd'hui, `catalogVersion: options.catalogVersion ?? CATALOG_VERSION`
laisse représentable un serveur qui annonce autre chose qu'il n'applique. Dériver
rend cet état **impossible à écrire**, ce qui vaut mieux qu'un test qui vérifie
qu'il ne se produit pas.

---

## G11 — Le client résout son catalogue en un seul endroit

**Décision.** Les quinze appels à `DEFAULT_CATALOGS`
(`apps/game/src/routes/planet.tsx`, `features/grid/GridView.tsx`,
`routes/rules.tsx`) se rattachent à un catalogue résolu unique, alimenté par la
longueur annoncée.

**Motif.** Faire descendre la longueur du gong par propriétés jusqu'à quinze
points d'appel, c'est quinze occasions d'en oublier un — et un oubli
n'afficherait pas une erreur, mais un chiffre plausible et faux.

**Alternative écartée.** Le passage par propriétés.

---

## G12 — R8 et R15 tiennent, et ne sont pas remplacés

**Décision.** Aucun point d'aperçu côté serveur : le client continue de calculer
ses aperçus avec le code du domaine (R8). Le client continue d'embarquer le
catalogue de base, dont la **version** est comparée comme aujourd'hui (R15).

**Motif.** Le gong règle la péremption d'un *paramètre*, pas celle du catalogue.
Laisser croire qu'il remplace R15 conduirait à retirer la seule protection
existante contre un client resté en arrière après un rééquilibrage.

---

## G13 — L'énergie, les coûts et les capacités ne sont pas touchés

**Décision.** Explicitement hors du champ de la résolution.

**Motif.** Aucune de ces grandeurs n'a de dimension de temps : un coût est un
nombre de grains, une capacité un plafond de grains, le rapport d'énergie un
rapport sans unité. Les inclure changerait l'équilibrage sous couvert de
changer une unité. La décision est écrite pour qu'un futur lecteur ne « corrige »
pas l'omission.

**Amendement du 2026-08-31, à l'implémentation.** Cette décision et le § « Ce que
la résolution ne touche jamais » du modèle de données écartaient **les
dispositions en bloc**. C'était trop large, et le test d'accumulation de T030 l'a
montré par le calcul : `Layout.baseProductionPerHour` est un **taux**, donc il a
une dimension de temps, et il est la **seule source de revenu d'une planète
fraîche**. Le laisser hors de la résolution faisait battre le premier écran du
jeu au rythme canonique sur un serveur rapide — exactement le défaut qui avait
fait écarter le premier design de la tranche 900 : des chantiers instantanés et
un joueur affamé.

SC-002 l'interdit nommément — *« tout délai du jeu, chantier **comme
accumulation de ressources**, dans le même rapport, et jamais l'un sans
l'autre »* — et FR-004, qui énumère ce qui ne bouge pas, ne mentionne pas la
production de base. La spécification était donc juste ; ce sont les documents de
conception qui avaient rangé de travers.

**Ce qui est résolu dans une disposition** : `baseProductionPerGong` →
`baseProductionPerHour`, sur le même dédoublement que les bâtiments — le nom dit
l'unité, et `DeclaredLayout` est inassignable à `Layout`. **Ce qui ne l'est
pas** : la géométrie, les gisements, le plafond de base, l'énergie de base et le
stock de départ, dont aucun n'a de dimension de temps. Au gong canonique, `200`
grains par gong redonnent exactement les `20` unités par heure d'avant la
tranche.

---

## G14 — Un chantier en cours n'est jamais recalculé

**Décision.** `dueAt` est fixé à la décision et stocké ; un changement de
longueur de gong ne le rejoue pas.

**Motif.** Recalculer rétroactivement l'échéance d'un chantier déjà lancé, c'est
appliquer une règle en arrière. Le jeu ne remonte pas le temps — `secondsBetween`
le refuse déjà par une `RangeError`.

**Conséquence assumée.** Après un changement de gong, les chantiers en cours
gardent l'ancien rythme et les nouveaux prennent le nouveau. Sur une base de
développement, le remède est de resemer.

---

## G15 — Aucune dépendance nouvelle

**Décision.** La tranche n'ajoute aucun paquet npm. Rien à épingler, rien à
justifier au titre des contraintes techniques de la constitution.

---

## G16 — Le catalogue déclaré et le catalogue résolu sont deux types distincts

**Décision.** `DeclaredCatalogs` et `Catalogs` sont deux types séparés.
`resolveCatalogs(declared, gong): Catalogs` est le seul pont entre les deux, et
les fonctions du domaine n'acceptent que le second. `DEFAULT_CATALOGS` devient
`DECLARED_CATALOGS`.

**Motif.** Les deux faisceaux ont **presque la même forme et pas le même sens** :
`base: 12` signifie douze gongs avant résolution, cent vingt secondes après. Un
seul type laisserait passer, à la compilation comme à la revue, un catalogue
déclaré donné à `previewBuild` — qui ne planterait pas, mais annoncerait douze
secondes au lieu de cent vingt. C'est la classe d'erreur la plus coûteuse :
plausible, silencieuse, et fausse.

**Ce qui rend la distinction réelle, et pas seulement voulue.** Les champs à
dimension de temps **changent de nom** en changeant d'unité :
`demolitionGongs` / `durationGongs` du côté déclaré, `demolitionSeconds` /
`durationSeconds` du côté résolu. Un nom qui dit son unité ne peut pas mentir,
et deux formes qui diffèrent par un nom obligatoire sont **structurellement
inassignables** l'une à l'autre — la vérification n'a pas à reposer sur le seul
champ `gong` ajouté au résolu.

Le corollaire est ce qui rend la tranche petite : `demolish.ts` et `clear.ts`
lisent `.demolitionSeconds` et `.durationSeconds` **sur un catalogue résolu**, et
ne changent donc pas d'une ligne. Le renommage porte sur ce que le catalogue
**déclare**, jamais sur ce que le domaine **consomme**.

Le dépôt emploie déjà ce procédé pour `Instant` et `Duration`
(`packages/domain/src/kernel/time.ts`), et pour la même raison — une seconde et
une durée sont deux `number`.

**Conséquence heureuse, et sa limite exacte.** Les tests de domaine existants
passent `resolveCatalogs(DECLARED_CATALOGS, GONG_CANONIQUE)` et retrouvent, par
FR-010, **exactement** les valeurs qu'ils affirment aujourd'hui.

Aucune assertion d'équilibrage n'est à réécrire, mais **la source change** :
treize fichiers de test calculent leur attendu depuis le catalogue *déclaré* —
`evaluateCurve(BUILDINGS.mine.buildDuration, 2)`,
`BUILDINGS[id].demolitionSeconds`, `OBSTACLES[id].durationSeconds` — et doivent
lire `CATALOGS.buildings[…]` / `CATALOGS.obstacles[…]`. C'est un remplacement
mécanique de la source, pas une réécriture de l'attendu, et il n'est pas
facultatif : laissé tel quel, un test comparerait douze gongs à cent vingt
secondes. Le compte et la liste sont en T017 et T019.

**La seule vraie réécriture d'assertion** est dans `packages/catalogs/tests/`,
qui ne peut pas résoudre — le paquet n'importe rien (règle
`catalogs-n-importe-rien`). Ces tests-là éprouvent le catalogue *déclaré* et
changent donc d'unité : `300` devient `30`. Deux fichiers, T007 et T010a.

**Alternative écartée.** Un seul type et de la discipline. La discipline ne se
dégrade pas au premier oubli, elle se dégrade à la fatigue du troisième mois.

---

## G17 — Le client ne doit pas pouvoir atteindre le gong canonique

**Décision.** Une porte refuse que `apps/game/src/` importe le gong canonique ou
un catalogue résolu d'avance.

**Motif.** FR-012 exige qu'aucune configuration locale du client ne porte de
longueur de gong. Une constante exportée est une configuration locale déguisée :
il suffirait d'un composant qui « ne veut pas attendre la réponse » pour
rétablir le miroir asynchrone que toute la tranche cherche à supprimer — et le
symptôme serait des chiffres plausibles et faux, jamais une erreur.

La porte est mécanique parce qu'une convention ne tient pas. Elle est en
revanche **lexicale** et non structurelle, et c'est un constat, pas une
préférence : `dependency-cruiser` ne peut pas la porter. La règle
`game-n-importe-pas-db` interdit un **paquet entier**, ce qui est impossible ici
— `apps/game/src` importe légitimement `@zaliba/catalogs` dans quatorze
fichiers, dont `RulesContent.tsx` qui en tire la valeur `GRAINS_PER_UNIT`. Et
comme les paquets se résolvent par leur tonneau `index.ts`, l'arête d'import ne
désigne jamais `gong.ts` : une règle visant ce module ne s'évaluerait sur rien.

Une porte de frontière qui ne peut pas échouer est pire qu'une porte absente,
parce que son vert passe pour une preuve. La porte est donc le test lexical
`apps/game/tests/design/gong-hors-du-client.test.ts`, sur le motif déjà employé
par `apps/game/tests/design/valeurs-en-dur.test.ts` — **et il échoue s'il a
parcouru zéro fichier**.

**Alternative écartée.** S'en remettre à la revue. Une valeur de repli est
exactement ce qu'on ajoute un vendredi soir pour faire taire un écran vide.
