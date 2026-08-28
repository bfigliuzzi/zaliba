# Phase 1 — Modèle : les entités d'un habillage

**Branche** : `002-la-regie-approximative` | **Date** : 2026-08-27 |
**Plan** : [plan.md](./plan.md) | **Recherche** : [research.md](./research.md)

## Ce que cette tranche n'ajoute nulle part

Avant les entités, la borne. Elle est le contrat central de la tranche, et tout
le reste s'y adosse :

| Couche | Ce que 002 y ajoute |
| --- | --- |
| `packages/catalogs` | **rien** |
| `packages/domain` | **rien** |
| `packages/contracts` | **rien** |
| `packages/db` | **rien** — aucune table, aucune colonne, aucune migration |
| `apps/api` | **rien** |
| `apps/game` | tout : le jeu de valeurs, les silhouettes, les états de case, l'adresse, la rature, l'annonce, la mise en page |

C'est SC-012 énoncé comme une propriété de structure plutôt que comme une
intention : les suites `domain`, `contracts`, `db`, `api` et `api-integration`
doivent rendre le **même** résultat avant et après la tranche, et le fait
qu'aucun de ces paquets ne soit touché est ce qui le garantit.

Les six entités ci-dessous vivent donc **entièrement dans `apps/game`**. Aucune
n'a de forme persistée, aucune ne franchit le réseau, aucune n'est un schéma
Zod.

---

## 1. Jeu de valeurs visuelles

La liste nommée des couleurs, tailles, espacements, traits, ombres et rotations.
**Source unique** au sens de FR-001.

### 1.1 Forme

Deux représentations, et une porte qui les tient ensemble (R2) :

| Représentation | Emplacement | Rôle |
| --- | --- | --- |
| JSON | `docs/design/2026-08-27-regie-approximative/tokens.json` | la référence, telle que le dossier de design l'a livrée |
| Propriétés personnalisées CSS | `apps/game/src/design/tokens.css` | ce que le navigateur lit |

Le nommage CSS transcrit la hiérarchie du JSON, sans la réinterpréter :

```
couleur.encre            → --couleur-encre
couleur.camelote-brique  → --couleur-camelote-brique
typo.chiffre-m.taille    → --typo-chiffre-m-taille
typo.chiffre-m.graisse   → --typo-chiffre-m-graisse
espacement.aise          → --espacement-aise
trait.fort               → --trait-fort
ombre.tampon             → --ombre-tampon
rotation.etiquette       → --rotation-etiquette
```

### 1.2 Ce que le jeu de valeurs porte en plus du dossier

Trois familles de valeurs sont **ajoutées** parce que l'implémentation les exige
et que le prototype n'en avait pas besoin. Elles vivent dans `tokens.css` et non
dans `tokens.json`, qui reste la copie fidèle du dossier :

| Ajout | Motif |
| --- | --- |
| une **pile de repli** par famille de police | cas limite « les polices ne se chargent pas » |
| le **côté minimal d'une case** et les épaisseurs resserrées de R9 | budget de largeur à 320 px |
| le **palier de bascule** (900 px) | FR-007, palier unique |
| les tailles **converties en `rem`**, plancher de rôle appliqué (R14) | WCAG 1.4.4, et la lisibilité par défaut du texte porteur d'information |
| le pas `chiffre-xs` (14 px) | le débit horaire est un chiffre : FR-002 le range dans la famille tabulaire |
| l'**interlettrage resserré** du pas `label` (`.10em`) | à 12 px, le `.16em` du dossier fait déborder « CAMELOTE » de son étiquette à 320 px. Le `.16em` reste transcrit à côté : la porte garde une seule exception à l'égalité littérale (FR-001a) |
| le **côté résiduel de `.sr-only`** | une constante de technique, nommée pour que la porte de non-régression n'ait aucune exception — la première admise en ouvrirait une seconde |

### 1.3 Règles

- **INV-V1** — toute valeur de `tokens.json` est présente dans `tokens.css`, à
  l'identique. *Tenu par* : test de conformité.
- **INV-V2** — aucune valeur visuelle littérale n'apparaît dans
  `apps/game/src/**` hors de `tokens.css`. *Tenu par* : test de non-régression
  qui doit constater avoir parcouru un nombre non nul de fichiers.
- **INV-V3** — les teintes de nuit sont transcrites et **référencées par aucune
  règle** (FR-036, R17). *Tenu par* : le même test que INV-V2.
- **INV-V5** — toute taille de police vaut `max(valeur du dossier, plancher du
  rôle) ÷ 16` en `rem`, et **aucune n'est exprimée en pixels** (R14).
  *Tenu par* : le test de conformité, qui applique la règle plutôt qu'une liste
  d'exceptions.
- **INV-V4** — chaque couple (couleur de texte, couleur de fond) employé par une
  règle atteint 4,5:1 pour le texte normal, 3:1 pour le texte large, 3:1 pour la
  bordure d'un composant navigable. *Tenu par* : test de calcul WCAG sur la table
  des couples, **et** la règle `color-contrast` d'axe sur l'écran rendu.

---

## 2. Silhouette

La forme dessinée qui identifie un état sans recourir à la couleur.
**Vocabulaire fermé de sept formes** (R5).

### 2.1 Forme

```
type Silhouette =
  | 'camelote'   // triangle sur socle
  | 'jus'        // losange barré       — un seul chemin, fill-rule evenodd
  | 'bave'       // disque évidé        — un seul chemin, fill-rule evenodd
  | 'chantier'   // sablier
  | 'obstacle'   // triangle plein
  | 'visee'      // croix, trait 4
  | 'refus'      // disque barré d'une croix
```

Rendues par un composant unique — `<Glyphe nom taille trait />` — sur un
`viewBox="0 0 24 24"`, en `fill="currentColor"`.

### 2.2 Modificateurs

Ils n'ajoutent pas de forme au vocabulaire ; ils qualifient une forme existante.

| Modificateur | Valeurs | Ce qu'il distingue |
| --- | --- | --- |
| `trait` | `plein` \| `evide` | gisement productif d'un gisement stérile |
| `position` | `centre` \| `angle` | la silhouette principale d'une marque secondaire |

### 2.3 Règles

- **INV-S1** — `fill="currentColor"` sur chaque forme, sans exception. C'est ce
  qui la fait survivre au mode contrastes forcés (FR-033).
- **INV-S2** — un évidement est un **trou** (`fill-rule="evenodd"` sur un chemin
  unique), jamais une seconde forme peinte à la teinte du fond (R5).
- **INV-S3** — la silhouette occupe `38cqmin` de sa case, soit 38 % du plus petit
  côté (FR-015, R8).
- **INV-S4** — le vocabulaire ne dépasse pas sept formes. Un huitième état exige
  d'ouvrir un canal de redondance — le mot, la position —, jamais une teinte de
  plus (cas limite de la spécification).

---

## 3. État de case

La qualification visuelle d'une case du plan. **Dérivée**, jamais stockée.

### 3.1 Forme

```
interface CellAppearance {
  readonly adresse: Adresse          // « C3 »
  readonly etat: EtatDeCase          // l'un des douze de FR-013
  readonly silhouette: Silhouette | null
  readonly trait: 'plein' | 'evide' | null
  readonly marque: { silhouette: Silhouette; trait: 'plein' | 'evide' } | null
  readonly niveau: number | null     // lisible sur l'emprise d'un bâtiment
  readonly emprise: 'seule' | 'debut' | 'milieu' | 'fin' | null
  readonly nomAccessible: string
  readonly raisonDeRefus: string | null
}

type EtatDeCase =
  | 'libre'
  | 'gisement-camelote'
  | 'gisement-jus'
  | 'gisement-bave'
  | 'gisement-productif'
  | 'gisement-sterile'
  | 'obstacle-terrain-nu'
  | 'obstacle-gisement'
  | 'batiment'
  | 'chantier'
  | 'visee-valide'
  | 'visee-refusee'
```

**Douze noms, et ce sont eux que porte `data-etat`.** Le vocabulaire est
**fermé** : l'énumérer plutôt que renvoyer au texte de FR-013 est ce qui rend le
compte vérifiable — le test de légende compare le nombre d'entrées à la taille de
cette union, et un treizième état ne peut pas arriver sans que le type le dise.

### 3.2 Ce dont elle est dérivée

`appearanceOf(cell, buildings, work, pose, catalogs)`, fonction **pure** :

| Entrée | Origine |
| --- | --- |
| `cell: CellView` | `state.grid`, projeté par le domaine — `state`, `depositOf`, `obstacleId`, `buildingId` |
| `buildings: BuildingView[]` | `state.buildings`, projeté par le domaine |
| `work: WorkView \| null` | `state.work`, projeté par le domaine |
| `pose` | l'empreinte armée, le curseur, et le verdict de `validatePlacement` |
| `catalogs` | `buildings[type].extracts` et `obstacles[id].reveals` |

**Aucune de ces entrées n'est nouvelle.** Les douze états de FR-013 sont douze
lectures de ce que 001 projette déjà : la table complète de la dérivation est en
[research.md § R6](./research.md).

### 3.3 Règles

- **INV-C1** — deux états distincts de FR-013 ne partagent jamais le même
  **quadruplet** (silhouette, trait, marque, emprise). C'est SC-003 et SC-009
  rendus mécaniques. Le triplet ne suffit pas : « case libre » et « bâtiment
  posé » ne portent ni silhouette, ni trait, ni marque, et ne se distinguent que
  par l'emprise et le niveau rendu dessus (FR-017, [research.md § R6](./research.md)).
- **INV-C2** — une case est carrée et mesure au moins 44 px de côté à toute
  largeur (FR-014).
- **INV-C3** — l'emprise d'un bâtiment multi-cases se délimite comme **un seul
  objet**, et son niveau est lisible dessus (FR-017). Le champ `emprise` porte la
  position de la case dans son bâtiment ; le niveau n'est rendu qu'une fois.
- **INV-C4** — aucune information ne tient à la teinte seule (FR-012). Retirer
  toute couleur de `tokens.css` doit laisser les douze états distinguables.

---

## 4. Adresse de case

La désignation courte d'une case : lettre de colonne, numéro de rangée, en base 1.

### 4.1 Forme

```
type Adresse = string   // « A1 » … « F6 » sur le Berceau
```

`adresseOf({ x, y }) = lettre(x) + (y + 1)`, où `lettre(0) = 'A'`.

### 4.2 Règles

- **INV-A1** — l'adresse est la **même** partout : nom accessible de la case,
  annonce de curseur, raison de refus, cible d'un chantier, légende (FR-016).
  Une seule fonction la produit, dans `apps/game/src/lib/labels.ts`.
- **INV-A2** — les bandes de coordonnées la doublent à l'œil et sont
  `aria-hidden` : elle est déjà dans le nom accessible de chaque case, et la lire
  deux fois ferait de la navigation une répétition.
- **INV-A3** — au-delà de vingt-six colonnes, la fonction **lève**. Aucun
  archétype annoncé n'y arrive ; produire `AA1` sans que la conception l'ait
  tranché serait inventer une convention (R7).

### 4.3 Ce qu'elle remplace

`describePosition` rend aujourd'hui « Colonne 4, rangée 1 ». Elle rend désormais
« D1 ». Les appelants — la grille, l'annonce de placement, le chantier en cours,
les aperçus de déblaiement — n'ont pas à changer ; leurs **tests**, si.

---

## 5. Rature

L'affichage d'une valeur qui vient de changer sous les yeux du joueur.

### 5.1 Forme

```
interface Rature<T> {
  readonly courante: T
  readonly ancienne: T | null    // null tant que rien n'a changé
}
```

Produite par `useRature(valeur)` : une référence retient la dernière valeur
**différente**, mise à jour dans un effet.

### 5.2 Ce qui est suivi, et ce qui ne l'est jamais

| Valeur | Suivie | Motif |
| --- | --- | --- |
| niveau d'un bâtiment | oui | change par saut |
| débit horaire d'une ressource | oui | change par saut, à l'achèvement d'un chantier |
| plafond de stockage | oui | change par saut |
| **quantité détenue** | **non** | progresse à la seconde : une rature par seconde clignoterait au lieu de corriger (FR-029a) |
| nom de planète | sans objet | 001 n'en porte pas (FR-008a) |

### 5.3 Cycle de vie

```
valeur inchangée ──────────────▶ { courante, ancienne: null }
        │
        │ la valeur change
        ▼
{ courante: nouvelle, ancienne: précédente }
        │
        ├── la valeur change encore ──▶ { courante, ancienne: l'avant-dernière }
        └── l'écran est rechargé ─────▶ { courante, ancienne: null }
```

Rien n'est persisté, rien n'est transmis (FR-029).

**Et rien ne l'efface au bout d'un moment.** Les deux seules sorties sont le
changement suivant de la même valeur et le rechargement de l'écran : **aucune
minuterie** ne retire une rature (FR-026a). Une correction qui s'efface d'elle-
même se manque — le joueur qui regardait ailleurs n'apprend jamais ce qui a
bougé —, et une disparition programmée serait un second mouvement là où FR-005
n'en admet qu'un.

### 5.4 Règles

- **INV-R1** — le visuel raturé est **entièrement** `aria-hidden` (FR-027).
- **INV-R2** — une phrase explicite en `.sr-only` porte l'information complète,
  de la forme « Niveau 3, anciennement niveau 2. ».
- **INV-R3** — `aria-label` n'est **jamais** employé pour la porter : la
  spécification ARIA l'interdit sur les rôles `paragraph` et `generic`, les
  technologies d'assistance l'ignorent, et le texte rayé redevient du contenu lu.
- **INV-R4** — le texte rayé reste au-dessus de 4,5:1 ; l'opacité plancher est
  0,72 sur papier, mesurée à **5,68:1** — *corrigé le 2026-08-28 : la valeur
  portait 5,66, qui est la même mesure sous une composition alpha arrondie à
  l'octet ; la porte retient la composition exacte*. Ce qui fait foi est le
  **seuil du rôle**, jamais le nombre annoncé (FR-001a) : le recalcul de
  [jeu-de-valeurs.md § 3.1](./contracts/jeu-de-valeurs.md) est l'autorité, et
  l'écart est consigné en [verdicts.md](./verdicts.md) (FR-028).
- **INV-R5** — deux ratures simultanées portent chacune leur phrase ; l'ordre de
  restitution est celui du document.

---

## 6. Annonce

Le texte unique qu'énonce la région d'annonce polie.

### 6.1 Forme

```
interface Annonce {
  readonly texte: string
  readonly origine: OrigineAnnonce
}

type OrigineAnnonce =
  | 'entree-grille'
  | 'curseur'
  | 'pose-acceptee'
  | 'pose-refusee'
  | 'chantier-acheve'
  | 'stockage-sature'
  | 'releve'
```

La rotation de l'empreinte n'a **pas d'origine propre** : elle change le verdict
de placement sous le curseur, donc elle réécrit l'annonce sous l'origine
`curseur`. Le contrat l'énumère comme un événement distinct — c'est le même
écrivain, pas une seconde origine.

### 6.2 Règles

- **INV-N1** — il existe **un seul** élément `aria-live` poli dans le document de
  l'écran de parcelle (FR-022). Les régions assertives — le refus de commande —
  ne sont pas concernées : elles sont d'une autre urgence.
- **INV-N2** — aucune origine ne correspond à la progression d'un compteur.
  Rien n'écrit l'annonce à chaque seconde.
- **INV-N3** — le relevé énonce les quantités, les débits et le chantier, à la
  demande et une seule fois par appui (FR-023).
- **INV-N3a** — deux appuis successifs produisent **deux énoncés**, y compris
  quand l'état n'a pas bougé (FR-023a). Une région `aria-live` ne réénonce pas
  un contenu identique : l'annonce porte donc un **jeton d'unicité** — un
  compteur d'appuis, tenu hors du texte lu, jamais un horodatage prononcé.
  L'égalité de deux relevés successifs n'est pas un cas de bord : une ressource
  saturée, un débit nul et aucun chantier la produisent sur l'écran de 001.
- **INV-N4** — les origines `chantier-acheve` et `stockage-sature` sont des
  **transitions** de l'état extrapolé, détectées par comparaison avec l'état
  précédent, jamais par une échéance d'horloge lue directement.

---

## 7. Registre des possessions

L'entité que la maquette montre et que le modèle de 001 n'alimente qu'à moitié.

### 7.1 Forme

```
interface Possession {
  readonly nom: string        // le nom d'archétype, tant qu'il n'y a pas de nom propre
  readonly active: boolean
}
```

### 7.2 Ce qui est omis, et pourquoi c'est écrit ici

FR-008a interdit d'inventer une donnée pour remplir une zone de maquette. Le
tableau ci-dessous est la liste exhaustive de ce que la maquette montre et que
002 **n'affiche pas** :

| Zone de la maquette | Statut en 002 | Arrive avec |
| --- | --- | --- |
| ancien nom de planète (`Trou du Cul du Monde`) | omise | un nom de planète, donc une tranche qui en donne un |
| coordonnées système (`1:204:6`) | omise | le système solaire |
| possessions multiples, possession perdue | omises | le système solaire et l'occupation |
| « Parcelle n° 4-B bis (ter) », « 25 cases dont 25 en pente » | remplacées par les valeurs réelles de la parcelle | — |
| bouton « Réclamer (sans espoir) » | **supprimé** | jamais : FR-025 interdit la commande sans effet |

**L'agencement, lui, reste celui de la cible.** Les zones omises ne laissent pas
de trou structurel : la plaque d'en-tête, le registre et le comptoir sont
disposés comme la maquette les dispose, de sorte que l'arrivée de ces données ne
redispose pas l'écran. Aucune structure n'est en revanche construite à l'avance
pour les accueillir — pas de composant `Coordonnees` inemployé, pas de liste
vide.

### 7.3 Règles

- **INV-P1** — le registre énumère les possessions **réelles**. En 001 il en
  compte une, la planète courante, et cette entrée unique est vraie.
- **INV-P2** — l'entrée active n'est pas un lien : elle désigne l'écran courant,
  et un lien vers l'écran courant est une commande sans effet (FR-025).

---

## 8. Transitions et effets de bord

Aucune entité de ce document ne mute quoi que ce soit hors du composant qui la
détient. Le seul effet de bord de la tranche est **l'écriture de l'annonce**, et
il est déclenché par sept transitions :

| Transition observée | Origine d'annonce |
| --- | --- |
| le focus entre dans la grille | `entree-grille` |
| le curseur change de case ou d'orientation | `curseur` |
| une commande de pose est acceptée par le serveur | `pose-acceptee` |
| une commande de pose est refusée, localement ou par le serveur | `pose-refusee` |
| `work` passe de non nul à nul | `chantier-acheve` |
| `saturatedSince` d'une ressource passe de nul à un instant | `stockage-sature` |
| le bouton **Relevé** est activé | `releve` |

Le serveur reste seul arbitre, l'horloge reste un paramètre, et le client
continue de n'émettre que des intentions : rien dans cette liste ne change cela.
