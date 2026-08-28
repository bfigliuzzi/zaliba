# Verdicts d'exécution et recettes humaines — 002

**Branche** : `002-la-regie-approximative`

Ce document rassemble ce que plusieurs tâches demandent de « consigner dans le
journal de la demande de fusion » : les vérifications qui se font **par
exécution** et non par lecture (T004, T093, T100 à T102) et les **quatre
verdicts humains** que `quickstart.md § 7` et `§ 10` prescrivent (T103, T104,
T105, T105a), plus la relecture de constitution du § 12 (T106).

Il existe parce qu'un verdict qui ne vit que dans la description d'une demande
de fusion disparaît à la fusion. Le protocole est celui de R17 de 001 : **le
code de sortie d'un outil ne vaut pas preuve**.

---

## T004 — Les quatre paquets `@fontsource/*`, vérifiés par exécution

**Date** : 2026-08-28. **Méthode** : inventaire de
`apps/game/node_modules/@fontsource/*/files/` après `pnpm install`, et lecture
de `metadata.json` de chaque paquet.

| Famille | Version | Licence | Graisses exigées par R4 | Graisses latines réellement servies | Verdict |
| --- | --- | --- | --- | --- | --- |
| Archivo | 5.3.0 | OFL-1.1 | 400, 500, 600, 700, 800 | 100 → 900, les neuf | ✅ |
| Archivo Narrow | 5.3.0 | OFL-1.1 | 400, 600, 700, **800** | 400, 500, 600, 700 | ⚠️ **800 absente** |
| JetBrains Mono | 5.3.0 | OFL-1.1 | 400, 500, 700 | 100 → 800 | ✅ |
| Saira Stencil One | 5.3.0 | OFL-1.1 | 400 | 400 | ✅ |

Sous-ensemble latin présent pour les quatre. Aucune requête vers un domaine
tiers dans les `@font-face` distribués : les `src` sont des chemins relatifs
vers `./files/*.woff2` (mesuré à nouveau sur le paquet compilé en T093).

### L'écart, et sa résolution

**Archivo Narrow n'a pas de graisse 800, et n'en aura pas** : son axe de
graisse variable s'arrête à 700 (`metadata.json → weights: [400,500,600,700]`).
Ce n'est pas une lacune du paquet Fontsource — c'est la famille elle-même qui
s'arrête là.

Le dossier de design en demande pourtant 800, à deux endroits :
`tokens.json → police.etroit.graisses` l'énumère, et le `README.md` § *La
grille* prescrit « niveau en `font-etroit` 800 » pour le niveau d'un bâtiment
dans sa case.

**Le repli de R4 ne s'applique pas.** Il est écrit pour « un paquet absent,
périmé ou distribuant une licence incompatible » : télécharger et sous-ensembler
un `woff2` à la main ne fait pas apparaître une graisse que le dessinateur de la
police n'a pas dessinée.

**Décision : la graisse est plafonnée à 700**, la plus lourde qui existe, et
`fonts.ts` n'importe que 400, 500, 600 et 700 pour cette famille. Le motif est
qu'une déclaration de `font-weight: 800` sans fichier correspondant ne produit
pas une erreur mais une **graisse synthétique** — le navigateur épaissit le 700
lui-même. C'est un rendu que le dossier n'a jamais mesuré, obtenu en silence, et
la loi du dossier — « l'approximation ne touche jamais la donnée » — vaut aussi
pour le chiffre qui rend un niveau de bâtiment.

**Aucun pas de `typo` n'est touché** : les quatorze pas de `tokens.json`
n'emploient que les graisses 400, 600 et 700. Le 800 ne vivait que dans la liste
des graisses disponibles de la famille et dans une prescription du README.

Consigné au titre de **FR-001a** — « toute autre divergence avec le dossier
MUST être consignée avant d'être appliquée ». C'est le **quatrième** écart de la
tranche, après les trois que `plan.md` énumère.

---

## T009 / T011 — Trois écarts de plus, constatés à l'écriture des portes

**Date** : 2026-08-28. Tous trois relèvent de **FR-001a** : « toute autre
divergence avec le dossier — y compris une valeur opérante que le dossier ne
porte pas — MUST être consignée avant d'être appliquée ».

### Écart n° 5 — la rature sur papier : le contrat annonce 5,66, le calcul rend 5,68

`contracts/jeu-de-valeurs.md § 3.1` et `data-model.md § INV-R4` portent tous deux
**5,66:1** pour `encre` à 0,72 sur `papier`. Le recalcul par la formule WCAG 2.1
rend **5,68:1**.

L'origine est identifiée : la composition alpha peut s'évaluer **avant** ou
**après** arrondi des composantes à l'octet.

| Convention | 0,80 sur papier | 0,72 sur papier | 0,72 sur pupitre |
| --- | --- | --- | --- |
| composition exacte, sans arrondi | 7,265 | **5,680** | 5,361 |
| composition arrondie à l'octet | 7,274 | **5,665** | 5,356 |
| annoncé par le contrat | 7,27 | **5,66** | 5,36 |

Les deux autres couples concordent sous les deux conventions ; seule la rature
les distingue. Le contrat a donc employé la convention arrondie.

**La porte retient la composition exacte**, et le motif n'est pas la fidélité au
contrat : un arrondi à l'octet imite la précision interne d'un navigateur donné,
alors qu'une porte doit rendre le même verdict sur toutes les machines.

**Sans conséquence sur le seuil** : les deux valeurs sont très au-dessus des
4,5:1 que INV-R4 exige, et l'écart va dans le sens du confort. La porte compare
au **seuil du rôle** et non au nombre annoncé — c'est précisément ce que FR-001a
prescrit, et c'est ce qui fait que ce constat est une note et non un défaut. Les
deux documents sont corrigés en conséquence, datés et motivés.

### Écart n° 6 — l'interlettrage resserré du pas `label`, une valeur opérante absente du dossier

`contracts/jeu-de-valeurs.md § 2` énonce comme une **règle** que « `label` voit
son interlettrage ramené de `.16em` à `.10em` » : à 12 px — le pas relevé à son
plancher d'intitulé —, `.16em` sur des capitales fait déborder « CAMELOTE » de son
étiquette à 320 px.

Le contrat n'admet pourtant qu'**une** exception à l'égalité littérale de la
porte : les tailles de police. Faire de l'interlettrage une seconde exception
contredirait son texte.

**Traitement retenu** : `--typo-label-interlettre` transcrit fidèlement le
`.16em` du dossier, et une **addition** — `--typo-label-interlettre-resserre:
.10em` — porte la valeur opérante. Les intitulés emploient la seconde ; la
première reste lisible à côté d'elle. INV-V1 est donc intact, la porte n'a
toujours qu'une exception, et l'écart est constatable dans le fichier plutôt que
noyé dans un diff. C'est la sixième addition de `tokens.css`, rangée avec les cinq
autres que `data-model.md § 1.2` énumère.

### Écart n° 7 — la notation d'une valeur contre le formateur

Le formateur de Biome normalise la notation CSS : `#1B2220` → `#1b2220`,
`.16em` → `0.16em`, `rgba(27,34,32,.35)` → `rgba(27, 34, 32, 0.35)`. Le dossier
écrit l'autre notation.

Comparer les **caractères** aurait opposé deux portes du dépôt l'une à l'autre —
le lint échouant exactement quand la conformité passe —, et l'une des deux aurait
fini désactivée. La porte compare donc **à la valeur près**, ce qui est le texte
d'INV-V1 : trois normalisations, chacune portant sur une différence dont on peut
démontrer qu'elle ne change pas la valeur (casse d'un hexadécimal, zéro de tête
d'un décimal, espace autour d'une virgule d'argument).

**Vérifié par exécution que la porte mord toujours** : une unité changée
(`em` → `rem`), la casse d'une unité (`px` → `PX`), un nombre changé
(1,5 → 1,6) et un signe changé (−1,1 → 1,1) sont tous quatre relevés.

---

## T093 — Aucun domaine tiers dans le paquet compilé

**Date** : 2026-08-28. **Méthode** : `pnpm --filter @zaliba/game build` sur un
`dist/` vidé, puis recherche dans le paquet produit.

| Ce qui a été mesuré | Résultat |
| --- | --- |
| `grep -r "fonts.googleapis.com\|fonts.gstatic.com" apps/game/dist` | **aucune occurrence** |
| `woff2` émis dans `dist/assets/` | **13** — 5 Archivo, 4 Archivo Narrow, 3 JetBrains Mono, 1 Saira Stencil One |
| forme des `src` dans les `@font-face` compilés | `src:url(/assets/archivo-latin-400-normal-C81ewxNO.woff2)` — **chemins relatifs à l'origine**, aucun domaine |

Les treize fichiers correspondent exactement aux graisses que `fonts.ts` importe :
Archivo 400/500/600/700/800, Archivo Narrow 400/500/600/700 — la 800 n'existant pas
—, JetBrains Mono 400/500/700, Saira Stencil One 400. Aucun poids mort : le point
d'entrée `@fontsource/archivo` aurait chargé les neuf graisses de la famille.

**Confirmé une seconde fois au parcours** (SC-008) : toutes les requêtes sont
interceptées et leur origine comparée à celles de la pile locale. Aucune n'en sort,
et aucune ne va vers `fonts.googleapis.com` ni `fonts.gstatic.com`. Les `woff2`
servis le sont depuis `127.0.0.1`.

C'est le protocole de R4 et de R17 de 001 : **la vérification se fait par exécution,
jamais par lecture.**

---

## T100 à T102 — L'invariance des paquets, et les portes de CI

**Date** : 2026-08-28.

### SC-012 — aucune règle de jeu n'a changé (T100)

```
$ git diff --stat main -- packages/ apps/api/
(aucune sortie)
```

**La sortie est vide.** C'est SC-012 énoncé comme une propriété de structure plutôt
que comme une intention : ni `catalogs`, ni `domain`, ni `contracts`, ni `db`, ni
`apps/api` ne sont touchés.

Et les suites qui les mesurent rendent le même résultat :

| Suite | Résultat |
| --- | --- |
| `--project domain --project contracts --project db --project api` | **849 tests, 45 fichiers, tous verts** |

### T101 — couverture et intégration, inchangées

| Porte | Résultat | Seuil |
| --- | --- | --- |
| `pnpm -w test:coverage` | statements **97,54 %**, branches **88,53 %**, functions **98,85 %**, lines **97,62 %** | 90 / 85 / 90 / 90 |
| `pnpm -w test:integration` | **156 tests, 11 fichiers, tous verts** en 43,8 s | — |

La couverture mesure `packages/domain` **uniquement**, que la tranche ne touche pas :
son invariance est donc attendue, et c'est ce qui la rend informative — un chiffre qui
aurait bougé aurait signalé que quelque chose est entré dans le domaine.

**Une condition d'exécution à consigner** : `test:integration` exige un démon Docker,
et la détection de Testcontainers doit être orientée vers Rancher Desktop —
`DOCKER_HOST="unix://$HOME/.rd/docker.sock"` et
`TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`. Sans cela, un socket
Docker Desktop périmé détourne la détection.

### T102 — les dix commandes du quickstart § 1

| # | Commande | Verdict | Ce que la sortie annonce |
| --- | --- | --- | --- |
| 1 | `pnpm -w typecheck` | ✅ | 10 tâches |
| 2 | `pnpm -w lint` | ✅ | **266 fichiers** parcourus |
| 3 | `pnpm -w boundaries` | ✅ | **273 modules** — *non nul*, la porte n'est pas inerte |
| 4 | `pnpm -w test` | ✅ | **1866 tests**, dont 784 pour le client |
| 5 | `pnpm -w test:coverage` | ✅ | 543 tests, seuils tenus |
| 6 | `pnpm -w test:integration` | ✅ | 156 tests |
| 7 | `pnpm -w build` | ✅ | 299 modules transformés |
| 8 | `pnpm -w e2e` | ✅ | **207 passés, 5 ignorés, aucun échec** en 23,3 min |
| 9 | `pnpm audit --audit-level moderate` | ✅ | *No known vulnerabilities found* — **les quatre ajouts de 002 audités** |
| 10 | `gitleaks detect` | ⚠️ **non exécutée** | `gitleaks` est **absent du PATH** de cette machine |

**Les cinq cas ignorés le sont par conception**, et depuis 001 : ce sont ceux de
`mobile.spec.ts` sur le profil `bureau`, qui s'auto-ignorent parce que SC-009 porte sur
la fenêtre de 360 × 640 px — « le lancer sur `bureau` mesurerait une fenêtre que SC-009
ne décrit pas, et il passerait pour de mauvaises raisons ». Les cinq **passent** sur le
profil `mobile`, et sont comptés dans les 207.

**Les deux portes ajoutées par la tranche constatent avoir lu quelque chose**, comme
l'amendement 2.1.0 de la constitution l'exige :

- conformité du jeu de valeurs : le nombre de clés lues est asserté non nul, et la
  porte a été **perturbée volontairement** pour vérifier qu'elle mord — une couleur,
  une taille, une unité, une casse d'unité, un signe et un nombre changés sont tous
  les six relevés ;
- non-régression des valeurs en dur : le nombre de fichiers parcourus est asserté non
  nul, et la porte trouve la source unique à sa place.

### Ce qui n'a pas pu être exécuté ici, et pourquoi

**`gitleaks` (porte 10)** n'est pas installé sur cette machine. La porte est
**bloquante en CI** et elle y tournera ; localement, elle n'a pas pu être reproduite.
C'est une lacune de la reproduction locale, non de la porte — et la dire vaut mieux
que de laisser croire que les dix commandes ont toutes été passées.

Ce que l'on peut affirmer sans elle : la tranche n'ajoute **aucun chemin de
configuration**, aucun fichier d'environnement, et aucune valeur qui ressemble à un
secret. Les quatre dépendances ajoutées sont du contenu statique.

---

## Porte 8 — ce que les parcours ont trouvé, et que rien d'autre n'aurait vu

**Date** : 2026-08-28. Premier passage complet : **199 passés, 8 échoués** — quatre
cas sur deux profils. Deux étaient des **défauts réels de la tranche**, deux des
artefacts de mes propres assertions. Aucune porte plus rapide ne pouvait les voir.

### Défaut 1 — le jeton d'unicité s'appliquait à **toutes** les annonces

Le parcours de 001 qui vérifie qu'« une rotation de carré de quatre n'annonce rien
comme changé » a échoué, et sa sortie était sans ambiguïté :

```
Expected: "A5 : libre, veine de Camelote. … Placement valide, 1 gisement recouvert."
Received: "A5 : libre, veine de Camelote. … Placement valide, 1 gisement recouvert.​"
```

Un caractère de largeur nulle de différence. **Le jeton d'INV-N3a était appliqué à la
région entière**, quelle que soit l'origine : un carré de quatre qui pivote — dont
l'orientation perçue et le verdict de placement ne changent pas — produisait donc une
réénonciation silencieuse. Un lecteur d'écran qui répète quand rien n'a bougé est un
lecteur d'écran qu'on finit par couper, et c'est précisément ce que `reduceCursor`
évite en rendant son état à la référence près.

**Résolution** : le jeton ne sert que l'origine `releve`. FR-023a porte sur *le
relevé* — « énoncé à chaque demande, y compris lorsque son texte est identique » — et
rien n'exige des six autres origines qu'elles réénoncent un contenu inchangé.

**Ce qui l'a attrapé** : un parcours de **001**, écrit pour une exigence de 001. C'est
l'argument du filet de sécurité, vérifié une fois.

### Défaut 2 — le compte de frappes de SC-001 de 001, dépassé de deux

Le parcours a compté **dix-sept** frappes pour poser un extracteur sur son gisement,
là où SC-001 de 001 en admet **quinze**.

La cause était double, et entièrement due à 002 :

- **R16** déplace le panneau de construction *après* la grille, ce qui allonge le
  chemin — R16 le documentait, sans le chiffrer ;
- la **barre d'actions** ajoutait deux arrêts de tabulation *avant* le sélecteur de
  type : `JE POSE ÇA` et `Relevé`, tous deux toujours actifs.

**Résolution, en deux gestes qui se justifient chacun seul** :

1. **Le sélecteur de bâtiment passe avant les commandes** dans le bloc des actions.
   C'est l'ordre de la séquence que R16 décrit — *choisir un type, choisir une
   empreinte, puis poser* —, et le sélecteur redevient le premier arrêt du bloc.
2. **`BuildPanel` perd son bouton de confirmation.** Le § 6 du contrat d'interface
   nomme **une** commande de pose, `JE POSE ÇA`, et conclut « aucune autre commande
   n'existe » : deux boutons visibles qui posent sont deux commandes de pose. Les
   propriétés `onConfirm` et `pending` partent avec lui — les garder aurait laissé deux
   propriétés mortes (principe V) — et l'état « en vol » rejoint la barre d'actions,
   `aria-busy` compris.

Et **le harnais `tabToGrid` reçoit une direction**. Il tabulait vers l'avant, ce qui
avait un sens quand le panneau précédait la grille ; depuis FR-006, le chemin naturel
depuis le sélecteur est `Maj+Tab` — c'est l'aller-retour que R16 décrit en propres
termes, « puis **revient** à la grille pour placer ». Tabuler vers l'avant aurait
traversé les quatre mécaniques, le registre et la légende, puis bouclé sur le document
entier : le compte aurait mesuré le harnais et non l'écran.

**Résultat** : le parcours passe, et SC-001 de 001 n'a **pas** eu à être amendé. C'est
le point important — la première inclination était d'amender le critère, et il n'y en
avait pas besoin.

### Les deux artefacts, pour mémoire

- **`us5-clear`** : mes assertions de T017a cherchaient `/\bD1\b/` dans le texte
  concaténé du bloc de chantier. La plaque porte l'avancement juste après la cible, et
  `textContent` rend « …DéblaiementD11 % » : plus de frontière de mot. Les deux valeurs
  vivent dans des éléments distincts — un lecteur d'écran les sépare, l'œil les voit sur
  deux lignes —, et l'assertion porte désormais sur l'élément de la cible.
- **`us9-regie`**, trois cas : `hover()` **fait défiler** l'élément dans la fenêtre, ce
  qui change son `y` sans que rien n'ait bougé (le relevé indiquait `y: 1664` puis
  `y: 405` pour un bouton immobile) ; `ouvrirA` crée un compte et ne peut donc pas être
  appelé deux fois dans un même cas ; et le relevé de troncature signalait `.ecran`,
  dont l'`overflow: hidden` existe pour que les cadres tracés à la main ne débordent
  pas de l'écran, non pour tronquer un texte.

### Défaut 3 — le tampon à 3,54:1, trouvé par l'audit d'accessibilité

Relevé par axe-core aux largeurs de 320 et 430 px : `color-contrast (serious)` sur
`.tampon > span`. La Camelote sur papier mesure **3,54:1**, sous les 4,5 du texte
normal.

Le tampon est décoratif et `aria-hidden`, et WCAG 1.4.3 exempte la décoration pure —
mais il reste **visible**, et `aria-hidden` le cache aux technologies d'assistance, pas
aux yeux. Un joueur malvoyant le voit sans le lire.

Trois issues existaient : désactiver la règle (ce que SC-005 interdit et
`apps/game/tests/e2e/axe.ts` refuse en propres termes), plaider l'exemption (vrai en
droit, faible en pratique), ou **relever la teinte**. `camelote-brique` — la variante
d'échelle de la même famille — rend **5,94:1**.

**Et le couple est ajouté à la porte de contraste**, pour être *tenu* et non seulement
corrigé : sans cela, revenir à la Camelote ne ferait rougir que l'audit de bout en
bout, c'est-à-dire la porte la plus lente et la plus tardive du lot.

### Défaut 4 — `signUp` attendait « Ma planète »

Le harnais d'inscription — appelé par **tous** les parcours, ceux de 001 compris —
attendait `getByRole('heading', { name: /ma planète/i })`. FR-008 remplace ce titre par
l'identité de la planète. **Aucune tâche ne le nommait** : T017a listait les trois
parcours qui affirment une position de case, et celui-ci affirme un titre.

Sans cette correction, la porte 8 échouait **en entier**, sur son premier maillon, pour
une raison sans rapport avec ce que chaque cas mesure.

---

## Les quatre verdicts humains — **non conduits**

**Date du constat** : 2026-08-28.

Les quatre recettes ci-dessous exigent **une personne**, et aucune ne peut être
remplacée par un automate. Elles ne sont **pas** conduites, et le dire est la seule
façon honnête de ne pas rendre vert un critère qu'on n'a pas tenu — c'est le § 12 du
quickstart, et c'est le principe I.

**Ce qui est prêt pour chacune** est indiqué ; ce qui manque est le jugement humain.

### T103 — SC-003 : les douze états en niveaux de gris

*Recette : [`quickstart.md § 10.1`](./quickstart.md).*

**Statut : non conduite.** Il faut *une personne qui n'a pas participé à la
conception*, la seule légende sous les yeux.

| Ce qui est prêt | Où |
| --- | --- |
| la parcelle portant les douze états | `apps/game/tests/fixtures/planet-douze-etats.json` — **dix états** dans l'instantané, vérifiés par exécution ; les deux visées viennent de la pose armée |
| la légende à douze entrées | `src/features/grid/Legende.tsx`, montée sur l'écran |
| la moitié mécanique | `tests/features/grid/appearance.test.ts` — **les douze quadruplets sont distincts deux à deux**, et l'unicité ne contient aucune couleur (INV-C1, INV-C4) |

**À consigner** : combien des douze sont nommés sans erreur, lesquels ont hésité, et
sur quoi portait l'hésitation. *Une hésitation qui n'est pas une erreur se consigne
quand même : c'est le signal d'avance de la prochaine régression.*

### T104 — SC-009 de 002 : le mode contrastes forcés **réel**

*Recette : [`quickstart.md § 10.2`](./quickstart.md).*

**Statut : non conduite.** Il faut activer le mode réel du système — Windows,
*Paramètres → Accessibilité → Thèmes de contraste* — et **regarder**.

**La moitié mécanique est verte** : le parcours `us9-regie.spec.ts` émule
`forced-colors: active` et constate que chaque case porte toujours son canal non
chromatique, que les silhouettes **héritent de la couleur de texte courante** — la
couleur calculée du tracé comparée à celle du texte de sa case —, que les quadruplets
présents restent distincts, et qu'**aucune ombre portée ne subsiste**.

**À consigner** : que les aplats et les ombres ont disparu, et que les silhouettes et
les styles de trait subsistent. L'émulation de Chromium n'est pas le mode d'un système
réel, et c'est pourquoi la recette existe.

### T105 — SC-011 : protanopie et deutéranopie

*Recette : [`quickstart.md § 10.3`](./quickstart.md).*

**Statut : non conduite. Aucune moitié mécanique n'existe** — un automate peut
appliquer la matrice, il ne peut pas juger si deux états deviennent confusables.

**À consigner** : tout couple devenu confusable, le cas connu de FR-035 excepté. Ce
cas est désormais **publié dans le jeu** : la page de règles porte une section « Lire
le plan sans distinguer les couleurs » qui énonce l'angle mort, sa cause et pourquoi
il n'est pas corrigé (T095).

### T105a — SC-007 : les ratures à l'oreille

*Recette : [`quickstart.md § 7`](./quickstart.md).*

**Statut : non conduite.** Il faut provoquer une amélioration, attendre son
achèvement, et **écouter** à VoiceOver puis à NVDA.

**C'est le seul point du système dont la casse produit une valeur *fausse*** — « niveau
2 3 » — plutôt qu'une gêne, et c'est pourquoi il a son propre verdict.

La moitié mécanique est verte, et elle mesure le **texte atteignable** : le contenu du
bloc privé de tout ce qui vit sous un `aria-hidden`. Elle établit que « 2 » et « 3 » ne
sont jamais adjacents dans ce qui est lu, que la phrase explicite existe et n'est
rendue qu'une fois, qu'aucun `aria-label` n'est employé, et qu'aucune minuterie
n'efface la rature (dix minutes d'horloge avancées).

**Ce qu'elle ne peut pas dire** : ce qu'une synthèse vocale prononce réellement.

**À consigner** : ce qui a été entendu, sur quel lecteur d'écran, et sur quelle valeur.

---

## T106 — La relecture contre les cinq principes

*Liste de [`quickstart.md § 12`](./quickstart.md). Conduite le 2026-08-28. La
constitution prescrit que cette relecture soit celle de **l'auteur**, les portes
automatiques de CI en étant le second relecteur.*

### I — La spécification est opposable au code

**Chaque fichier touché se rattache-t-il à une tâche ?** Oui. Trois tâches ont été
**ajoutées** à `tasks.md` pour du travail qu'aucune ne portait, plutôt que livrées en
douce :

| Tâche ajoutée | Ce qu'elle couvre |
| --- | --- |
| **T010a** | les types de Node au client, et la règle `dependency-cruiser` qui referme la porte que cela ouvre |
| **T018a** | les cinq `describePosition(...).toLowerCase()`, qui rendaient l'adresse `a5` ici et `A5` là — INV-A1 faux, et **aucune porte ne l'aurait vu** |

**Chaque écart constaté a-t-il été résolu explicitement ?** Oui — **sept écarts**, tous
consignés ci-dessus, et quatre ont entraîné une correction de document :

| Écart | Résolution |
| --- | --- |
| Archivo Narrow n'a pas de 800 | graisse plafonnée à 700, consignée, reportée au § 8 du document de stack |
| la rature mesure 5,68 et non 5,66 | les deux documents corrigés, datés, motivés |
| l'interlettrage resserré du `label` | une **addition** nommée, la porte gardant une seule exception |
| la notation contre le formateur | la porte compare *à la valeur près*, trois normalisations démontrées |
| **le tampon à 3,54:1** | teinte relevée à `camelote-brique` (5,94:1), **et le couple ajouté à la porte de contraste** pour être tenu |
| T017 se disait vérifiée et omettait **trois** assertions | liste corrigée dans `tasks.md`, avec le défaut de méthode retenu |
| `account.ts` attendait « Ma planète » | corrigé — **le harnais de tous les parcours**, qu'aucune tâche ne nommait |

**Un écart de méthode vaut d'être retenu** : une liste d'assertions établie par
recherche de texte sur un libellé ne trouve pas les assertions qui *composent* ce
libellé. `grid-view.test.tsx:115` comparait `${x + 1}` sans jamais écrire « Colonne ».

### II — La frontière domaine / interface

`packages/domain` est **intact** : `git diff --stat main -- packages/ apps/api/` rend
une sortie vide. La dérivation des douze états vit dans `apps/game` — « quel glyphe »
est une question de présentation, et le domaine ne s'est pas mis à connaître des
silhouettes.

`boundaries` a parcouru **273 modules** — non nul, donc la porte n'est pas inerte.

**Et la tranche a resserré cette frontière plutôt que de l'entamer** : la règle
`game-src-sans-module-node` refuse désormais un module Node dans le client, parce que
le typage a cessé de l'interdire quand les portes du jeu de valeurs ont eu besoin de
lire le disque. Sa morsure est **vérifiée par exécution**.

### III — Test d'abord

**Pour chaque comportement observable ajouté, le test a-t-il été vu en échec avant le
composant ?** Oui, et les échecs ont été relevés à chaque étape : trois portes du jeu
de valeurs avant `tokens.css`, quinze crochets de grille avant `GridView`, vingt-et-une
raisons de refus avant `refusal.ts`, dix-sept assertions de rature avant `Rature.tsx`.

**Trois exigences n'atteignaient qu'une tâche d'implémentation** et ont reçu leur
mesure : FR-005 (T053a), FR-015 (T040b), FR-017 (T040a).

**Une porte est verte d'emblée, et il faut le dire** : la porte de contraste (T009). Son
sujet — la palette — est une donnée déjà livrée, donc il n'y avait rien à implémenter
après elle. C'est une porte de **non-régression**, et sa valeur s'est démontrée dès
l'audit : c'est elle qui tient désormais le couple du tampon.

**Une porte a été perturbée volontairement** pour vérifier qu'elle mord : une couleur,
une taille, une unité, la casse d'une unité, un nombre et un signe changés sont tous
les six relevés.

### IV — Contrats explicites et versionnés

`packages/contracts` est **inchangé**. Aucune route, aucun schéma, aucun instantané de
JSON Schema touché. Les contrats de la tranche sont ceux de l'**écran**, et chacun a
ses tests : l'ordre du document, la grammaire du nom accessible sur ses **onze
exemples normatifs**, les crochets `data-*`, l'unicité de la région d'annonce, les
ratures, les commandes.

### V — Simplicité délibérée

**Quatre dépendances**, toutes du contenu statique, toutes exigées par FR-004, toutes
en version exacte et reportées au § 8 du document de stack. **Zéro dépendance de
style.**

**Deux dépendances ont été refusées en cours de route**, et l'alternative écrite à la
place :

- `jest-dom`, pour un `toBeDisabled` — remplacé par `HTMLButtonElement.disabled` ;
- `dom-accessibility-api`, pour un nom accessible calculé — remplacé par une mesure du
  **texte atteignable**, qui capture exactement la propriété en jeu et qui, de surcroît,
  ne repose pas sur le hissage de pnpm.

**Ce qui a été retiré plutôt que conservé** : `ghostSuffix` et le composant
`FootprintGhost`, que la grammaire du § 2.3 et les douze états ont rendus sans objet.
Les garder aurait laissé deux façons de nommer une case visée, dont une que le contrat
ne prescrit plus.

**Ce qui n'a pas été ajouté** : les mouchetures d'encre du dossier de design — trois
points décoratifs qu'aucune exigence ne réclame.

**Une complexité assumée et non enregistrée au plan** : `Rature` porte une propriété
`montrerEtiquette`. Elle existe parce qu'une liste de définitions nomme déjà sa valeur
par son `<dt>`, et que répéter l'étiquette dans le visuel faisait énoncer « Plafond
plafond 5 000 ». C'est une duplication qu'on n'entend qu'en écoutant, et qu'on ne voit
jamais en relisant.

### Ce que la relecture laisse ouvert

- **`gitleaks` (porte 10) n'a pas pu être exécutée** localement — absente du PATH.
  Elle est bloquante en CI.
- **Les quatre verdicts humains ne sont pas conduits.** Trois critères de succès —
  SC-003, SC-009 de 002, SC-011 — et la moitié audible de SC-007 restent donc
  **ouverts**. Leurs moitiés mécaniques sont vertes ; ce n'est pas la même chose, et
  les confondre serait rendre vert ce qu'on n'a pas tenu.
