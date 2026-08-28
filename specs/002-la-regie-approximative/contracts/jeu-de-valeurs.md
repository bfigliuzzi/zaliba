# Contrat du jeu de valeurs

**Branche** : `002-la-regie-approximative` | **Date** : 2026-08-27

Ce document fige ce que la porte de conformité vérifie, et consigne les **trois
écarts mesurés** entre les ratios que le dossier de design annonce et ceux que le
calcul rend. Les valeurs ci-dessous ont été recalculées le 2026-08-27 sur la
formule WCAG 2.1, à partir des codes hexadécimaux de `tokens.json`.

---

## 1. La correspondance JSON ⇄ CSS

| Source | Rôle |
| --- | --- |
| `docs/design/2026-08-27-regie-approximative/tokens.json` | la référence |
| `apps/game/src/design/tokens.css` | ce que le navigateur lit |

Transcription mécanique, sans réinterprétation :

```
couleur.<nom>            → --couleur-<nom>
typo.<nom>.<propriété>   → --typo-<nom>-<propriété>
espacement.<nom>         → --espacement-<nom>
trait.<nom>              → --trait-<nom>
ombre.<nom>              → --ombre-<nom>
rotation.<nom>           → --rotation-<nom>
arrondi.<nom>            → --arrondi-<nom>
cible_tactile.<nom>      → --cible-<nom>
```

**Ce que la porte vérifie** — et elle échoue si l'un des quatre manque :

1. toute clé de `tokens.json` a sa propriété personnalisée, à la valeur près ;
2. **les tailles de police font exception à l'égalité littérale** : elles valent
   `max(valeur du dossier, plancher du rôle) ÷ 16`, en `rem` — voir § 2 ;
3. le nombre de clés lues est **non nul** — une porte qui parcourt zéro entrée
   et sort en succès est pire qu'une porte absente ;
4. aucune valeur visuelle littérale n'apparaît dans `apps/game/src/**` hors de
   `tokens.css`, **et aucune taille de police en pixels nulle part**.

Les clés `$description`, `$note`, `$regle`, `$viewBox` sont de la documentation
et sont ignorées ; l'exclusion est nommée dans le test, jamais devinée d'un
préfixe.

---

## 2. Le plancher typographique, et la conversion en `rem`

Quatre planchers, posés sur le **rôle** du texte et non sur son pas :

| Rôle | Plancher | Ce qu'il couvre |
| --- | --- | --- |
| champ de saisie | **16 px** | `input`, `select`, `textarea`, partout dans l'application |
| texte porteur d'information | **14 px** | légende, niveau, registre, texte courant, débit, libellé de commande |
| intitulé de bloc | **12 px** | libellés en capitales espacées, bandes de coordonnées |
| décor sans information | **9,5 px** | surtitre administratif, notes, mentions, tampons |

L'échelle qui en résulte. `tokens.json` **n'est pas modifié** : la colonne
« retenu » est ce que `tokens.css` porte, en `rem`.

| Pas | Dossier | Rôle | Retenu | En `rem` |
| --- | --- | --- | --- | --- |
| `micro` | 8,5 px | décor | **9,5 px** | 0,5938 |
| `note` | 9,5 px | décor | 9,5 px | 0,5938 |
| `label` | 10 px | intitulé | **12 px** | 0,75 |
| `menu` | 11,5 px | information | **14 px** | 0,875 |
| `corps` | 12 px | information | **14 px** | 0,875 |
| `item` | 13 px | information | **14 px** | 0,875 |
| `chiffre-xs` | — | information | **14 px** | 0,875 |
| `chiffre-s` | 16 px | information | 16 px | 1 |
| `fiche` | 17 px | information | 17 px | 1,0625 |
| `pochoir-s` | 19 px | information | 19 px | 1,1875 |
| `chiffre-m` | 22 px | information | 22 px | 1,375 |
| `pochoir-m` | 24 px | information | 24 px | 1,5 |
| `chiffre-l` | 30 px | information | 30 px | 1,875 |
| `titre-m` | 34 px | information | 34 px | 2,125 |
| `titre-l` | 46 px | information | 46 px | 2,875 |

**Trois conséquences d'usage**, qui sont des règles et non des préférences :

- `micro-titre` cesse de servir le **nom d'une ressource** et les **intitulés de
  bloc** : ils passent à `label-section`. Un même pas ne peut pas porter un
  surtitre décoratif et le nom d'une ressource — ce sont deux rôles, et un
  plancher se pose sur un rôle ;
- `label` voit son interlettrage ramené de `.16em` à `.10em` : à 12 px, un
  espacement de `.16em` sur des capitales fait déborder « CAMELOTE » de son
  étiquette à 320 px. *Précisé le 2026-08-28* : la valeur resserrée est portée par
  une **addition** — `--typo-label-interlettre-resserre` —, et
  `--typo-label-interlettre` continue de transcrire fidèlement le `.16em` du
  dossier. La porte garde ainsi **une seule** exception à l'égalité littérale, les
  tailles de police, et l'écart reste lisible dans `tokens.css` au lieu d'être
  absorbé (FR-001a, [`verdicts.md`](../verdicts.md)) ;
- le **débit horaire** quitte le corps 9,5 pour `chiffre-xs`. C'est un chiffre,
  et FR-002 range tout chiffre dans la famille tabulaire.

**La règle prime sur la table.** Le test calcule
`max(dossier, plancher[rôle]) ÷ 16` et compare ; il ne consulte pas une liste
d'exceptions. Un pas ajouté demain reçoit son plancher tout seul, alors qu'une
exception énumérée serait invisible en revue six mois plus tard.

**Aucune taille de police en pixels, nulle part.** C'est ce qui rend WCAG 1.4.4
vrai : le texte double avec le réglage système. Le plancher protège la lecture
par défaut ; le `rem` protège celle du joueur qui a réglé son téléphone.

---

## 3. Les couples de contraste, recalculés

Mesures WCAG 2.1, couleur calculée contre fond calculé.

### 3.1 Le texte

| Avant-plan | Fond | Ratio | Seuil applicable | Verdict |
| --- | --- | --- | --- | --- |
| `encre` | `papier` | **12,80** | 4,5 | ✅ |
| `encre` | `pupitre` | **11,50** | 4,5 | ✅ |
| `encre` | `carton` | **10,10** | 4,5 | ✅ |
| `encre` | `jus` | **8,34** | 4,5 | ✅ |
| `papier` | `encre` | **12,80** | 4,5 | ✅ |
| `mine` | `encre` | **6,02** | 4,5 | ✅ |
| `ardoise` | `papier` | **6,20** | 4,5 | ✅ |
| `encre` à 0,80 (`note-regie`) | `papier` | **7,27** | 4,5 | ✅ |
| `encre` à 0,72 (`rature`) | `papier` | **5,68** | 4,5 | ✅ |
| `encre` à 0,72 (`rature`) | `pupitre` | **5,36** | 4,5 | ✅ |

### 3.2 Les aplats, liserés et objets graphiques

| Avant-plan | Fond | Ratio | Seuil applicable | Verdict |
| --- | --- | --- | --- | --- |
| `trait` | `papier` | **3,61** | 3,0 | ✅ |
| `trait` | `pupitre` | **3,24** | 3,0 | ✅ |
| `camelote` | `papier` | **3,54** | 3,0 | ✅ |
| `camelote` | `encre` | **3,61** | 3,0 | ✅ |
| `bave` | `papier` | **4,46** | 3,0 | ✅ |
| **silhouette** (`currentColor` = `encre`) | `papier` | **12,80** | 3,0 | ✅ |
| **silhouette** (`currentColor` = `encre`) | `pupitre` | **11,50** | 3,0 | ✅ |
| **silhouette** (`currentColor` = `encre`) | `carton` | **10,10** | 3,0 | ✅ |
| **silhouette** (`currentColor` = `encre`) | `jus` | **8,34** | 3,0 | ✅ |

*Ajouté le 2026-08-28, avec l'amendement de FR-030.* Les quatre dernières lignes
ne sont pas une redite des lignes de texte qui portent les mêmes nombres : elles
déclarent le **rôle** `silhouette`, sans lequel la porte de contraste n'a rien à
quoi comparer une forme. La silhouette hérite toujours de la couleur de texte
courante (INV-S1), donc de `encre` : c'est ce qui rend son verdict confortable,
et c'est ce qui doit rester vrai. Le jour où une silhouette cesse d'hériter, le
seuil de 3,0 la mesure au lieu de la laisser passer parce que « c'est du
dessin ». C'est le seul élément dont l'illisibilité **perdrait l'information**,
puisqu'il porte à lui seul le canal non chromatique de FR-012.

*Corrigé le 2026-08-28.* La rature sur papier portait **5,66**. La porte de
contraste rend **5,68** : les deux nombres sont la même mesure sous deux
conventions de composition alpha — avant ou après arrondi des composantes à
l'octet —, et le tableau employait la seconde. La porte retient la **composition
exacte**, parce qu'un arrondi à l'octet imite la précision interne d'un
navigateur donné là où une porte doit rendre le même verdict sur toutes les
machines. Sans conséquence : les deux valeurs sont très au-dessus de 4,5, et
**c'est le seuil du rôle qui fait foi, jamais le nombre annoncé** (FR-001a). Le
relevé complet est en [`verdicts.md`](../verdicts.md).

### 3.3 Les couples interdits

Ils sont interdits **par une règle de la porte**, et non par la vigilance :

| Couple | Ratio | Pourquoi il est interdit |
| --- | --- | --- |
| `jus` en texte, sur `papier` | 1,53 | très en dessous de tout seuil. Le Jus est un remplissage, toujours bordé d'encre. |
| `jus` en texte, sur `pupitre` | 1,38 | idem |
| `bave` en **texte**, sur `papier` | 4,46 | sous 4,5 — voir l'écart n° 1 |
| tout chiffre, sur un aplat de ressource | — | FR-003 : le chiffre va sur une étiquette de papier |

---

## 4. Trois écarts entre les ratios annoncés et les ratios mesurés

Le dossier de design annonce des ratios « mesurés dans le navigateur, pas
estimés ». Le recalcul en confirme la substance et relève trois divergences. Deux
sont sans conséquence ; **la troisième oblige à corriger le système.**

### Écart n° 1 — `bave` sur `papier` : 4,46 annoncé 4,5

`tokens.json` porte `"contraste_sur_papier": 4.5` pour la Bave. La valeur exacte
est **4,46**, arrondie vers le haut.

**Sans conséquence tant que le rôle est respecté** : la Bave est un *aplat*, et
un aplat relève du seuil de 3:1. La conséquence est ailleurs — le nombre `4.5`
inscrit dans les valeurs se lit comme une autorisation d'y poser du texte
normal, et cette autorisation serait fausse de quatre centièmes.

**Traitement** : la table des couples de la porte est l'autorité, pas le champ
`contraste_*` de `tokens.json`. La porte **recalcule** et compare au seuil du
rôle ; les champs annoncés du JSON sont de la documentation.

### Écart n° 2 — `mine` sur `encre` : 6,02 annoncé 6,16, et `trait` sur `papier` : 3,61 annoncé 3,1

Deux écarts de mesure, dans deux sens opposés, tous deux **au-dessus du seuil**
de leur rôle. Aucune conséquence. Consignés pour que le prochain relevé ne les
redécouvre pas comme des nouveautés.

### Écart n° 3 — l'indicateur de focus ne tient pas FR-024

Le dossier prescrit `outline: 3px solid #C4552A` — la Camelote — pour toute prise
de focus. FR-024 exige que l'indicateur atteigne **3:1 contre le fond qu'il
borde**, et l'écran comporte huit fonds. Le calcul :

| Fond bordé | `camelote` contre lui | Verdict |
| --- | --- | --- |
| `papier` | 3,54 | ✅ |
| `pupitre` | 3,18 | ✅ |
| `encre` | 3,61 | ✅ |
| `carton` | 2,80 | ❌ |
| `jus` | 2,31 | ❌ |
| `bave` | 1,26 | ❌ |
| `camelote` | 1,00 | ❌ |

**Trois de ces fonds sont focalisables** : une case de gisement de Jus, une case
de gisement de Bave, et le bouton `JE POSE ÇA`, qui est en `bg-jus`. Le contrat
est donc violé là où il compte le plus — sur la cible la plus sollicitée du jeu
et sur son bouton principal.

**Décision : l'indicateur devient composite, à deux anneaux contigus.** Un
anneau `papier` collé à l'élément, un anneau `encre` autour de lui :

```css
:focus-visible {
  outline: var(--trait-fort) solid var(--couleur-encre);
  outline-offset: var(--trait-fort);
  box-shadow: 0 0 0 var(--trait-fort) var(--couleur-papier);
}
```

Le couple est vérifié contre les huit fonds, et il n'en manque aucun :

| Fond bordé | `encre` | `papier` | Au moins un ≥ 3:1 |
| --- | --- | --- | --- |
| `papier` | 12,80 | — | ✅ |
| `pupitre` | 11,50 | 1,11 | ✅ |
| `carton` | 10,10 | 1,27 | ✅ |
| `jus` | 8,34 | 1,53 | ✅ |
| `camelote` | 3,61 | 3,54 | ✅ |
| `bave` | 2,87 | **4,46** | ✅ |
| `encre` | — | 12,80 | ✅ |
| `encre-douce` | 1,23 | 10,38 | ✅ |

Les deux anneaux contrastent en outre l'un contre l'autre à 12,80:1, ce qui rend
l'indicateur perceptible même quand l'un des deux se fond dans son fond.

**Ce que la décision coûte au dessin.** Le liseré Camelote au focus disparaît.
C'était un geste de la direction artistique ; il est remplacé par le couple
encre/papier, qui est le geste central du système — l'encre sur le papier. La
Camelote garde tous ses autres emplois : la rature, le tampon, le survol du
bouton de pose.

**En mode contrastes forcés**, l'indicateur passe à la couleur système
`Highlight` : les couleurs de la palette n'y sont plus rendues, et s'y accrocher
reviendrait à ne plus rien indiquer.

---

## 5. Les polices

| Famille | Paquet | Version | Sous-ensemble | Pile de repli |
| --- | --- | --- | --- | --- |
| Archivo | `@fontsource/archivo` | 5.3.0 | latin | `system-ui, sans-serif` |
| Archivo Narrow | `@fontsource/archivo-narrow` | 5.3.0 | latin | `Archivo, system-ui, sans-serif` |
| JetBrains Mono | `@fontsource/jetbrains-mono` | 5.3.0 | latin | `ui-monospace, SFMono-Regular, Menlo, monospace` |
| Saira Stencil One | `@fontsource/saira-stencil-one` | 5.3.0 | latin | `Archivo Narrow, Archivo, system-ui, sans-serif` |

| Contrainte | Vérifiée par |
| --- | --- |
| aucune requête vers un domaine tiers | interception de toutes les requêtes au parcours (SC-008) |
| aucune référence à `fonts.googleapis.com` / `fonts.gstatic.com` dans le paquet compilé | recherche dans `apps/game/dist/**` après compilation |
| `font-variant-numeric: tabular-nums` partout où il y a un chiffre | test de non-régression sur les règles de `tokens.css` et les composants de chiffres (FR-002) |
| la mise en page ne se disloque pas sans les polices | rendu avec les familles neutralisées |

---

## 6. Ce que la porte de conformité ne vérifie pas

Dit explicitement, pour que l'absence ne passe pas pour une garantie :

- **la beauté** — aucune porte ne la mesure ;
- **la reconnaissance des silhouettes par un humain** en niveaux de gris ou sous
  simulation de daltonisme (SC-003, SC-011). La porte vérifie que les douze états portent des
  quadruplets **distincts** ; la reconnaissance se constate par la
  recette de `quickstart.md`, et son verdict s'y consigne ;
- **la conformité des prototypes** du dossier de design. Ils ne sont pas
  construits, pas lintés, pas typés. Leur rôle est la traçabilité.
