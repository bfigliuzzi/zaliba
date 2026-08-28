# Handoff : Zaliba — « La Régie approximative »

## Overview

Zaliba est un jeu de stratégie spatiale à tours longs (héritier d'OGame) autour de trois
ressources absurdes : **Camelote**, **Jus**, **Bave d'étoiles**. Ce dossier livre le système
visuel et d'interaction de l'**écran de parcelle** — l'écran principal du jeu : en-tête de
planète, compteurs de ressources, chantier en cours, plan de parcelle en grille, actions.

La direction retenue s'appelle **La Régie approximative**. Sa fiction porte tout le style :
*cette interface a été produite par la Régie interplanétaire elle-même, une administration
d'amateurs.* Donc elle est tracée à la main (les traits dépassent aux angles), elle se corrige
devant le joueur (ratures), et elle glisse des notes de bas de page que personne n'a relues.

**Le critère de qualité premier du projet est l'accessibilité (WCAG 2.1 AA), à égalité avec la
beauté.** Ce n'est pas une case à cocher en fin de sprint : c'est ce qui a produit la direction
artistique. Lire impérativement le § *Le contrat d'accessibilité* avant d'écrire une ligne.

## About the Design Files

Les fichiers `.dc.html` de ce dossier sont des **références de design créées en HTML** : des
prototypes qui montrent l'apparence et le comportement voulus. **Ce n'est pas du code de
production à copier.** La tâche est de **recréer ces écrans dans l'environnement existant du
projet** (React, Vue, Svelte…) avec ses patterns et ses bibliothèques. Si aucun environnement
n'existe encore, choisir la stack la plus adaptée et y implémenter les designs.

Ce qui **doit** être repris tel quel : les valeurs de `uno.config.ts` / `tokens.json`, les
chaînes de copie, les libellés d'accessibilité, la géométrie des glyphes, et les règles du
contrat d'accessibilité. Ce qui **ne doit pas** l'être : la structure DOM des prototypes, leurs
styles en ligne, leur mécanique de rendu.

## Fidelity

**Haute fidélité (hifi).** Couleurs, typographie, espacements, états et copie sont définitifs.
Recréer au pixel avec les tokens fournis. Les ratios de contraste annoncés ont été mesurés dans
le navigateur (couleur calculée contre fond calculé, formule WCAG), pas estimés — les respecter
n'est pas optionnel.

Deux largeurs sont livrées, **mobile first** :
- **mobile 430 px** (option `6a` du fichier de pistes) — la référence de base.
- **desktop 1180 px** (option `6b`) — pas la version mobile étirée : la métaphore gagne son
  *guichet* (registre à gauche, plan au centre, comptoir à droite).

Le fichier contient aussi les dossiers 4 et 5, conservés comme **traçabilité des décisions**
(pourquoi les hachures ont été supprimées, quels canaux de redondance les remplacent). Le
dossier 6 est la cible d'implémentation ; les 4 et 5 ne sont pas à construire.

## Screens / Views

### 1. Écran de parcelle — mobile (430 px)

**Purpose.** Le joueur consulte l'état de sa planète et pose un bâtiment sur une case.

**Layout.** Colonne unique. Conteneur `bg-pupitre`, `border-cadre border-encre`, padding
`16px 15px 15px`, `overflow: hidden`, `position: relative` (pour les mouchetures d'encre).
Pile verticale, `gap: 15px`. Ordre : en-tête → ressources → note de bas de page → chantier →
plan de parcelle → actions → mention légale.

**Composants, de haut en bas.**

1. **Plaque d'en-tête** — `plaque cadre-main`, padding `11px 12px 12px`.
   - Surtitre : `micro-titre`, `max-width: 24ch`, texte
     « Régie interplanétaire des matières qui coulent · guichet 4 ».
   - **Rature du nom** : ancien nom `Trou du Cul du Monde`, Archivo 15px/1 400, `opacity: .72`,
     barre `#C4552A` de 2px à `top: 54%`, débordant de 3-4px, `rotate(-1.1deg)`.
   - Nom courant : `font-pochoir` 34px/.95 — « FOND DE TIROIR ».
   - Coordonnées : `compteur` 12px sur pastille `bg-encre text-papier`, padding `4px 6px`,
     texte « 1:204:6 » ; à côté, `note-regie` « vérifié une fois ».
   - **Tampon** `aria-hidden`, en absolu bas-droite : `rotate(-6deg)`, Saira Stencil 11px,
     `color: #C4552A`, `border: 2px solid #C4552A`, padding `3px 5px`, deux lignes
     « VU, MAIS / PAS LU ».

2. **Trois compteurs de ressources** — grille `1fr 1fr 1fr`, `gap: 9px`. Chaque carte :
   `border-fort border-encre`, fond = teinte de la ressource.
   - Bandeau supérieur 44px de haut, `border-bottom: 2.5px solid encre`, glyphe 30px centré.
   - **Étiquette de papier collée** (`etiquette`), `margin: 4px 3px 3px`, `rotate(-.7deg)` /
     `(.6deg)` / `(-.5deg)`. Elle contient : nom en `micro-titre` 8px ; une ligne secondaire
     (rature de l'ancien relevé pour la Camelote, « de quoi ? » pour le Jus, « ne pas goûter »
     pour la Bave) ; la valeur en `compteur` 16px/1.05 ; le débit en mono 9.5px « +540/h * ».
   - **Règle non négociable** : aucun chiffre ne se pose sur un aplat de ressource. Le papier
     collé existe pour que les chiffres soient à 12,8:1 à toute taille. C'est ce détail qui
     donne aussi la meilleure matière du système.
   - Valeurs : Camelote 18 420 (+540/h, ancien relevé 17 980) · Jus 9 105 (+220/h) ·
     Bave 1 260 (+45/h).

3. **Note de bas de page** — `note-regie`, `margin-top: -8px` :
   « * Les débits sont une estimation de l'estimateur, lui-même estimé. »

4. **Plaque de chantier** — `plaque cadre-main`, padding `12px 12px 11px`, `flex` aligné en bas.
   - `micro-titre` « Chantier en cours » + « (depuis mardi) » en 400 sans espacement.
   - Titre `fiche` : « Cuve de Bave d'étoiles ».
   - Niveau : « niveau ~~2~~ **3** » — voir § Ratures pour le balisage.
   - Jauge : hauteur 15px, `border-fort border-encre`, fond `pupitre`, remplissage `bg-jus`
     à 61% avec `border-right: 2.5px solid encre`.
   - Chrono : `compteur` 21px « 04:12:09 », sous-titre `note-regie` « restant (environ) ».

5. **Plan de parcelle** — voir § *La grille* ci-dessous.

6. **Actions** — `flex`, `gap: 10px` : `btn-poser` (« JE POSE ÇA », pochoir 19px, flex 1) +
   `btn-releve` (« Relevé »).

7. **Mention** — `note-regie`, `margin-top: -6px` : « Toute pose est définitive, sauf
   réclamation dans les cinq minutes, ce qui n'arrive jamais. »

8. **Mouchetures d'encre** — 3 points `.mouchet` en absolu (74%/31%, 12%/57%, 88%/73%),
   tailles 2,5–4px, opacités .35–.45, `aria-hidden`. Décor pur.

### 2. Écran de parcelle — desktop (1180 px)

**Layout.** Conteneur `ecran`, padding 18px, pile `gap: 16px`.
Bandeau d'en-tête pleine largeur (`plaque cadre-main--fort`, `flex` espacé) : à gauche surtitre
+ rature du nom (16px) + nom en pochoir **46px** ; à droite coordonnées (`compteur` 15px,
sous-titre « vérifié une fois, en 2387 ») et le tampon `rotate(-5deg)` en 15px.

Puis une grille **`268px 1fr 320px`**, `gap: 16px`, `align-items: start` :

- **Colonne gauche — le registre.**
  - *Registre des possessions* (`plaque cadre-main`) : liste de 4 entrées, `min-height: 44px`
    chacune. Entrée active : `bg-encre text-papier`, chevron `▶`. Entrées inactives :
    `border-2 border-encre`, nom + coordonnées en mono 10px. **Dernière entrée : possession
    perdue** — `border: 2px dotted encre`, `opacity: .75`, nom raturé, mention « perdue mardi ».
    Contenu : Fond de Tiroir · Bout du Couloir (1:204:9) · Cul-de-Sac 2 (1:211:1) ·
    ~~Bel Horizon~~ (perdue mardi).
  - *Légende (approximative)* (`plaque cadre-main`) : 5 lignes, pastille 26px + libellé
    `menu`. **La légende est indispensable** depuis qu'on a supprimé les hachures : tout tient
    à la silhouette, donc il faut donner la clé. Libellés : « Gisement de Camelote », « Gisement
    de Bave », « Relief : ça monte », « Case libre (pour l'instant) », « Refusé : trop près du
    bord ».

- **Colonne centrale — le plan.** `plaque cadre-main--fort`, padding `14px 15px 15px`. Titre
  « Parcelle n° 4-B bis (ter) » + « 25 cases, dont 25 en pente · relevé du 14 floréal ».
  Grille avec bandes de coordonnées (voir § *La grille*), cases ~108px. Sous la grille, barre
  d'actions `gap: 12px` : `btn-poser` en pochoir 22px + `btn-releve` (« Relevé complet ») +
  `btn-sans-espoir` (« Réclamer (sans espoir) »).

- **Colonne droite — le comptoir.** Les trois ressources deviennent des **bandeaux
  horizontaux** (`min-height: 66px`) : colonne de glyphe 60px sur l'aplat, séparée par
  `border-right: 2.5px`, puis l'étiquette de papier (`margin: 4px`, `rotate(±.5deg)`) qui porte
  nom + rature/blague sur une ligne, valeur `chiffre-m` + débit sur la suivante.
  Puis la note de bas de page, la plaque de chantier (mêmes contenus qu'en mobile, chrono 24px),
  puis le **bloc de signature** : `border: 2px dotted encre`, `micro-titre` « Signature du
  contrôleur », un gribouillis SVG 112×30 (`stroke: encre`, `stroke-width: 2.2`,
  `stroke-linecap: round`), la mention « illisible », et à droite « cachet de la poste faisant
  foi ».

### 3. La grille (les deux largeurs)

Composant partagé, référence complète dans `GrilleParcelle.dc.html`.

- **Géométrie.** 5×5 en maquette, **6×6 en production**. `display: grid`,
  `grid-template-columns: repeat(n, 1fr)`, `gap: 5px` (mobile) / `6px` (desktop), fond `encre`,
  padding égal au gap, `border-fort`/`border-cadre` `encre` — les gouttières d'encre font le
  quadrillage. Chaque case `aspect-square`, **jamais sous 44px**.
- **Bandes de coordonnées.** Colonne de chiffres 1…n à gauche (16px mobile / 20px desktop) et
  ligne de lettres A…F sous la grille, en `compteur` 10-12px, `aria-hidden` (l'adresse est déjà
  dans le libellé de chaque case). Les joueurs s'échangent des plans à l'oral : les adresses
  sont un besoin fonctionnel, pas une décoration.
- **États** — chacun identifiable **sans la couleur**, par sa silhouette :

  | État | Fond | Marque |
  |---|---|---|
  | libre | `pupitre` (`encre-douce` en sombre) | — |
  | gisement Camelote | `camelote` | triangle sur socle, 32px (44px desktop) |
  | gisement Bave | `bave` | disque évidé |
  | gisement Jus | `jus` | losange barré |
  | relief infranchissable | `encre` | triangle plein `mine` |
  | bâtiment | `papier` + `shadow-batiment` | niveau en `font-etroit` 800, 24/34px |
  | chantier en cours | `jus` | sablier |
  | case visée, pose valide | `papier` + `shadow-visee` | croix `+`, trait 4 |
  | pose refusée | `pupitre` | disque d'encre + croix papier |
  | survol de pose (multi-cases) | idem valide, `opacity` inchangée | croix sur chaque case |
  | hors parcelle | non rendu | — |

- **Taille des glyphes** : ~35-40% de la case. En dessous, la redondance existe sans être
  *scannable*, ce qui ne sert à personne.

## Interactions & Behavior

Reprendre le comportement de `GrilleParcelle.dc.html`, qui est la spécification.

- **Clavier, entièrement pilotable.** `Tab` entre dans la grille (un seul arrêt de tabulation
  pour toute la grille, pattern *grid* ARIA) ; **flèches** déplacent le curseur de case en case ;
  **R** fait tourner le bâtiment en cours de pose ; **Entrée** pose ; **Échap** annule la pose.
- **Focus.** `outline: 3px solid #C4552A; outline-offset: 2px`. Le focus ne déclenche **aucune**
  rotation, aucun déplacement, aucun changement de taille.
- **Pose.** Sélection d'un bâtiment → la grille passe en mode pose → les cases valides prennent
  `shadow-visee`, les invalides l'état refus **avec sa raison** (« trop près du relief »,
  « déjà occupée », « hors gisement ») portée dans le libellé de la case et annoncée au
  déplacement du curseur.
- **Annonces.** Une région `aria-live="polite"` unique. **Les compteurs de ressources ne sont
  jamais annoncés** — ils changent en continu et noieraient tout. Seuls les **événements** le
  sont : chantier terminé, stockage plein, pose acceptée, pose refusée + raison. Le bouton
  *Relevé* existe pour que le joueur demande **explicitement** l'état courant à tout moment ;
  c'est un besoin d'accessibilité, pas une commodité.
- **Hover.** Boutons : `btn-poser` → `bg-camelote` ; boutons secondaires → `bg-pupitre`.
  Aucune transition de couleur au-delà de 120ms ; aucun mouvement.
- **Responsive.** Mobile first. Palier unique vers le desktop autour de **900px** : la colonne
  unique devient la grille `268px 1fr 320px`, les ressources passent de cartes verticales à
  bandeaux horizontaux, les glyphes et le pochoir grandissent. Testé à **320px** (les cases
  restent ≥44px) et à **zoom texte 200%** — aucun débordement, aucune troncature.
- **Animations.** Le seul mouvement du système est la *frappe de tampon* (`scale(1.5) → .97 →
  1`, ~260ms, `rotate` constant) à l'apparition d'un tampon d'état. Sous
  `prefers-reduced-motion: reduce`, tout tombe à 1ms.

## State Management

```
planete        { nom, ancienNom?, coordonnees, verifieLe }
ressources     { camelote:{valeur, ancienneValeur?, debit, capacite}, jus:{…}, bave:{…} }
chantier       { batiment, niveau, ancienNiveau?, restantSec, pourcentage } | null
parcelle       { largeur, hauteur, cases: Case[] }
Case           { adresse:'A1', etat, ressource?, niveau?, raisonRefus? }
pose           { batimentId, orientation, curseur:'C3', valide:boolean } | null
registre       Possession[]   // { nom, coordonnees, active, perdueLe? }
annonce        string          // ce que la région aria-live doit dire
```

- `ancienNom` / `ancienneValeur` / `ancienNiveau` **pilotent les ratures** : la rature n'est pas
  décorative, c'est un état. Elle s'affiche quand la valeur a changé, et se retire après un
  délai (suggestion : à la prochaine visite de l'écran).
- Le chrono décrémente localement, resynchronisé sur le serveur ; le format est toujours
  `HH:MM:SS` en mono tabulaire pour qu'aucun chiffre ne tremble.
- `annonce` est écrit uniquement par des événements, jamais par un tick de ressource.

## Le contrat d'accessibilité

**La loi qui rend l'approximation soutenable : l'approximation ne touche jamais la donnée.**
Elle vit dans le décor — cadres, étiquettes, tampons, notes en corps 9. Les chiffres restent
d'aplomb, en mono tabulaire, sur papier, à 12,8:1.

1. **Jamais la couleur seule.** Tout état porte une **silhouette** (glyphe SVG) ou un **style
   de trait**. Les hachures de la version précédente ont été supprimées : elles étaient jugées
   laides, et la silhouette est un canal plus robuste (elle se lit à 4px de large, sous
   n'importe quel filtre). Contrepartie assumée : 5 à 7 silhouettes lisibles au maximum — si un
   futur écran (le combat) multiplie les états, il faudra rouvrir un canal (le mot, la position).
2. **Aucun chiffre sur un aplat de ressource.** Étiquette de papier collée, systématiquement.
3. **Les ratures** — voir ci-dessous, c'est le point le plus facile à casser.
4. **Contrastes plancher.** Texte normal ≥ 4,5:1 ; texte large ≥ 3:1 ; **bordure d'un composant
   navigable ≥ 3:1** (d'où `trait #6E7873` pour une case libre sur papier, jamais `mine`).
   L'opacité est ce qui casse le plus souvent le calcul : sur papier, `.72` → ≈5,1:1 est le
   plancher pour du texte normal. Ne pas descendre en dessous sans remesurer.
5. **Cibles tactiles** ≥ 44px, 48px effectifs sur les boutons.
6. **Rotations** ≤ 1,5°, jamais sur un bloc de texte long, jamais au focus, jamais animées.
7. **Mode contrastes forcés.** Les aplats et les ombres disparaissent : la redondance repose
   alors sur la silhouette et le style de trait. **Tous les glyphes doivent être en
   `fill="currentColor"`** (les prototypes ont des teintes en dur, c'est une dette à ne pas
   reprendre).
8. **Angle mort connu, à documenter dans le jeu.** Sous protanopie, le rouge du refus se
   rapproche de l'orange Camelote. L'état reste identifiable par sa silhouette (disque + croix)
   mais **alerte faiblement**. Piste non implémentée : un tampon `STÉRILE` en encre.

### Les ratures — le balisage exact

Une rature affiche l'ancienne valeur. Le lecteur d'écran ne doit **jamais** énoncer
« niveau 2 3 » ni « Trou du Cul du Monde Fond de Tiroir ». Donc :

```html
<p class="font-ui text-menu">
  <span class="sr-only">Niveau 3, anciennement niveau 2.</span>
  <span aria-hidden="true">niveau <span class="rature">2<i></i></span> <b>3</b></span>
</p>
```

- Le visuel raturé est **entièrement `aria-hidden`**.
- Une phrase explicite en `.sr-only` porte l'information.
- **Ne pas utiliser `aria-label` sur un `<p>` ou un `<span>` sans rôle** : la spec l'interdit
  sur les rôles `paragraph` et `generic`, les technologies d'assistance l'ignorent, et le texte
  raturé reste lu comme du contenu ordinaire. C'est exactement le piège dans lequel la première
  version est tombée.
- `<del>` / `<ins>` avec le même texte masqué sont une alternative acceptable.

### Recette de test

- Naviguer l'écran **au clavier seul**, poser un bâtiment, annuler une pose.
- Passer l'écran en **niveaux de gris** : les onze états doivent rester distincts.
- Simuler **protanopie** et **deutéranopie** (le fichier de pistes embarque les matrices
  `feColorMatrix` utilisées).
- **Zoom texte 200%** et largeur **320px** : aucun débordement, cases ≥44px.
- Activer le **mode contrastes forcés** : les silhouettes et les styles de trait subsistent.
- Écouter un lecteur d'écran sur : entrée dans la grille, déplacement de case, pose refusée,
  chantier terminé, et **chaque rature**.

## Design Tokens

Tout est dans **`uno.config.ts`** (thème + raccourcis + preflights) et **`tokens.json`**
(mêmes valeurs, brutes, pour un autre consommateur). Les deux gestes signature sont dans les
preflights de `uno.config.ts` :

- **`.cadre-main`** — le cadre tracé à la règle dont les traits se croisent et dépassent aux
  angles. Deux pseudo-éléments : `::before` porte haut+gauche, `::after` bas+droite, chacun
  débordant sur l'axe opposé. Variante `--fort` pour le desktop (3px, débord 8px).
- **`.rature`** — trait `#C4552A` en enfant absolu (pas un `text-decoration` : il doit dépasser
  et pencher), `opacity: .72` plancher.

### Polices

Archivo, Archivo Narrow, JetBrains Mono, Saira Stencil One. `presetWebFonts` les charge depuis
Google Fonts, ce qui est pratique en développement. **Le projet a une contrainte « pas de
ressources externes » : prévoir de les auto-héberger** (`@font-face`, `font-display: swap`,
sous-ensemble latin) avant la mise en production. `tabular-nums` est obligatoire sur JetBrains
Mono partout où il y a un chiffre.

## Assets

Aucune image, aucune icône externe. **Toute l'iconographie est du SVG en ligne**, sept
silhouettes sur un `viewBox="0 0 24 24"`, géométrie exacte dans `tokens.json` → `glyphes`.
Les construire en composant unique (`<Glyphe nom="camelote" taille={32} />`) avec
`fill="currentColor"`. Le gribouillis de signature (desktop) est un `path` fourni dans le
prototype. Il n'y a **pas** de placeholder d'image à remplacer dans cet écran.

## Files

Dans ce dossier :

- **`Zaliba - Pistes de jeu.dc.html`** — les explorations. **Le dossier 6 (options `6a`, `6b`)
  est la cible d'implémentation.** Les dossiers 4 et 5 documentent les décisions écartées et
  leurs raisons ; `6c` (« Le pupitre ») est une sortie de route non retenue, conservée comme
  réserve d'idées (les cadrans à aiguille sont un bon canal accessible).
- **`GrilleParcelle.dc.html`** — la grille comme composant : navigation clavier complète, onze
  états visibles simultanément, chaînes d'annonce, simulations de daltonisme. C'est la
  spécification d'interaction.
- **`uno.config.ts`**, **`tokens.json`** — les tokens.
- **`support.js`** — runtime des prototypes, nécessaire pour les ouvrir dans un navigateur.
  Aucun intérêt pour l'implémentation.

Pour ouvrir un prototype : servir le dossier (`npx serve .`) et ouvrir le `.dc.html`.
