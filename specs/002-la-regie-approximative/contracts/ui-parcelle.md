# Contrat d'interface — l'écran de parcelle

**Branche** : `002-la-regie-approximative` | **Date** : 2026-08-27

Ce document fige **l'observable** : ce qu'un test de rendu, un parcours de bout
en bout et un lecteur d'écran peuvent constater. Il ne décrit ni classes CSS ni
arborescence de composants — ceux-là sont libres, tant que l'observable tient.

---

## 1. L'ordre du document

Immuable, aux deux largeurs (FR-006, FR-007) :

| # | Bloc | Rôle / élément | Présent toujours |
| --- | --- | --- | --- |
| 1 | plaque d'en-tête | `<h1>` portant l'identité de la planète | oui |
| 2 | compteurs de ressources | trois `role="group"`, un par ressource | oui |
| 3 | note de bas de page | texte de la Régie, sans rôle | oui |
| 4 | plaque de chantier | `role="group"` nommé « Chantier » | **oui**, y compris sans chantier |
| 5 | plan de parcelle | `role="grid"` et ses bandes | oui |
| 6 | actions | boutons et panneaux des quatre mécaniques, bouton **Relevé** | oui |
| 7 | mention finale | texte de la Régie, sans rôle | oui |

Deux blocs s'ajoutent **au même endroit du document** quelle que soit la largeur,
et ne sont visuellement déplacés qu'au-delà du palier :

| # | Bloc | Position dans le document |
| --- | --- | --- |
| 8 | registre des possessions | après la mention finale |
| 9 | légende des silhouettes | après le registre |

L'énergie conserve son bloc distinct des trois ressources (FR-010), après les
compteurs.

### 1.1 Les trois nœuds que la table de FR-006 ne nomme pas

*Ajouté le 2026-08-28.* FR-006 énumère les **sept blocs de la Régie** ; l'écran
en rend trois de plus, et leur place est fixée ici plutôt que nulle part.

| Nœud | Élément | Position dans le document | Motif |
| --- | --- | --- | --- |
| énergie | `role="group"` | **2 bis** — immédiatement après les trois compteurs | FR-010 : nature différente, bloc distinct |
| refus de commande | `RefusalNotice`, `role="alert"` | **6 bis** — dans le bloc *actions*, immédiatement après les boutons de pose | l'exception assertive nommée par FR-022 : elle porte le refus **de la commande**, pas celui d'une case, et se lit avec le geste qui l'a produite |
| divergence de catalogue | `CatalogNotice` | **enveloppe** — englobe l'écran entier, sans occuper de rang | FR-011 : elle qualifie tout ce que l'écran affiche, elle n'est pas un bloc parmi d'autres |

**Le refus de commande change de place par rapport à 001**, où il se rendait
entre le plan et les compteurs. Il suit désormais les commandes qui le
déclenchent : un message d'échec placé loin du bouton qui a échoué oblige à le
chercher.

**Ce qui est vérifié** : l'ordre des nœuds correspondants dans le document — les
sept blocs, l'énergie et le refus de commande —, par un test de rendu,
indépendamment de la largeur.

---

## 2. Le plan de parcelle

### 2.1 Structure

```
<div>                          ← enveloppe, porte les bandes en CSS grid
  <div aria-hidden="true">     ← bande des rangées : 1 … n
  <div role="grid"
       aria-label="Parcelle, {n} colonnes A à {lettre}, {m} rangées 1 à {m}"
       aria-colcount aria-rowcount>
    <div role="row">           ← display: contents
      <div role="gridcell" …>  ← une case
  <div aria-hidden="true">     ← bande des colonnes : A … lettre
```

Les bandes sont **hors** de `role="grid"` et `aria-hidden` : l'adresse est déjà
dans le nom accessible de chaque case.

### 2.2 La case

| Attribut | Valeur | Depuis |
| --- | --- | --- |
| `role` | `gridcell` | 001 |
| `tabIndex` | `0` sur la case du curseur, `-1` ailleurs | 001 |
| `data-index` | l'index en ordre de lecture | 001 |
| `data-state` | `free` \| `obstructed` \| `occupied` | 001 |
| `data-deposit` | l'identifiant de ressource, ou absent | 001 |
| `data-ghost` | `valid` \| `invalid` \| `faulty`, ou absent | 001 |
| `data-adresse` | `A1` … | **002** |
| `data-etat` | l'un des douze noms de `EtatDeCase` — vocabulaire fermé, énuméré en [data-model.md § 3.1](../data-model.md) | **002** |
| `data-glyphe` | le nom de la silhouette, ou **absent** pour les quatre états qui n'en portent pas — libre, productif, stérile, bâtiment posé | **002** |
| `data-trait` | `plein` \| `evide`, ou **absent** quand il n'y a pas de silhouette | **002** |
| `data-emprise` | `seule` \| `debut` \| `milieu` \| `fin`, ou absent | **002** |
| `data-marque` | le nom de la silhouette d'angle, ou absent | **002** |
| `aria-label` | voir § 2.3 | 001, réécrit |

### 2.3 Le nom accessible d'une case

Une grammaire, et non une phrase par état. Les segments s'enchaînent dans cet
ordre, les absents étant omis :

```
{adresse} : {état}{, gisement}{, bâtiment et niveau}{, sous l'empreinte}{, refusé : raison}
```

Exemples normatifs :

| Situation | Nom accessible |
| --- | --- |
| case libre | `C3 : libre` |
| gisement nu | `C3 : libre, veine de Camelote` |
| obstacle libérant du terrain nu | `C3 : obstruée par un éboulis, libère du terrain nu` |
| obstacle libérant un gisement | `C3 : obstruée par un filon enfoui, libère une veine de Camelote` |
| gisement productif | `C3 : occupée par une Mine niveau 2, veine de Camelote exploitée` |
| gisement stérile | `C3 : occupée par un Puits niveau 1, veine de Camelote non exploitée` |
| chantier en cours | `C3 : chantier en cours, Mine niveau 3` |
| visée valide | `C3 : libre, sous l'empreinte` |
| visée refusée, débordement | `C3 : libre, sous l'empreinte, refusé : 2 cases sortent de la parcelle par la droite` |
| visée refusée, obstacle | `C3 : libre, sous l'empreinte, refusé : la case D3 est obstruée par un rocher` |
| visée refusée, bâtiment | `C3 : libre, sous l'empreinte, refusé : chevauche la Mine niveau 2 en D3` |

Le vocabulaire des gisements, des obstacles, des bâtiments et des empreintes
reste celui de `apps/game/src/lib/labels.ts` : la Régie ajoute un registre
lexical, elle n'en remplace aucun (FR-040).

### 2.4 Géométrie

| Contrainte | Valeur | Vérifiée par |
| --- | --- | --- |
| côté d'une case | ≥ 44 px à toute largeur, carrée | mesure de la boîte rendue à 320, 430 et 1180 px |
| silhouette | 38 % du plus petit côté de la case | `38cqmin` |
| bandes de coordonnées | présentes à toute largeur | présence des nœuds |
| dimensions | tirées de la disposition, jamais d'une constante | rendu d'une parcelle non carrée dans un test |

---

## 3. Le clavier

| Touche | Effet | Depuis |
| --- | --- | --- |
| `Tab` | entre dans la grille, **un seul arrêt**, et en sort en une frappe | 001 |
| flèches | déplacent le curseur de case en case, sans rebond aux bords | 001 |
| `R` / `Maj+R` | pivote l'empreinte d'un quart de tour | 001 |
| `Entrée`, `Espace` | pose | 001 |
| `Échap` | **annule la pose armée** | **002** |

`Échap` est nouveau : FR-020 exige une commande d'annulation atteignable au
clavier **et** par un bouton visible. Le bouton d'annulation rejoint la barre
d'actions ; la rotation et la pose y ont également le leur.

En sortant puis revenant dans la grille, le focus retrouve la case où il était
(FR-019, US3-AC5).

---

## 4. La région d'annonce

**Une seule** région `aria-live="polite"` dans le document, `aria-atomic="true"`,
montée en permanence et vide au départ (FR-022).

| Événement | Ce qui est énoncé |
| --- | --- |
| entrée dans la grille | l'adresse et l'état de la case du curseur |
| déplacement du curseur | idem, plus l'empreinte, son orientation et le verdict de placement |
| rotation de l'empreinte | l'orientation nouvelle et le verdict |
| pose acceptée | l'acceptation et la cible |
| pose refusée | le refus **et sa raison** |
| chantier achevé | l'achèvement et la cible |
| stockage saturé | la ressource et le fait que la production se perd |
| **Relevé** | les trois quantités, les trois débits, et le chantier |

La rotation de l'empreinte n'a pas d'origine propre dans le modèle : elle réécrit
l'annonce sous l'origine `curseur`, dont elle change le verdict de placement
([data-model.md § 6.1](../data-model.md)). Le contrat l'énumère parce que c'est un
événement pour le joueur, pas parce que c'est une seconde origine.

**Jamais énoncée** : la progression des compteurs. Une seconde qui passe sans
interaction ne produit aucune annonce (US4-AC2).

Les refus de commande gardent leur région **assertive** distincte
(`role="alert"`) : c'est une autre urgence, et elle n'est pas concernée par la
règle d'unicité.

---

## 5. Les ratures

```
<span class="sr-only">Niveau 3, anciennement niveau 2.</span>
<span aria-hidden="true">niveau <span class="rature">2<i></i></span> <b>3</b></span>
```

| Contrainte | Vérifiée par |
| --- | --- |
| le visuel rayé est absent de l'arbre d'accessibilité | nom accessible calculé du bloc |
| une phrase explicite porte les deux valeurs | présence du texte `.sr-only` |
| aucune rature quand la valeur n'a pas changé | absence des deux nœuds |
| le texte rayé reste au-dessus de 4,5:1 | test de contraste sur l'opacité plancher |
| jamais `aria-label` sur un `<p>` ou un `<span>` sans rôle | test de non-régression sur les sources |

---

## 6. Les commandes visibles

| Commande | Libellé | Effet réel |
| --- | --- | --- |
| poser | `JE POSE ÇA` | envoie l'intention de construction |
| pivoter | `Pivoter` | fait tourner l'empreinte d'un quart de tour |
| annuler | `Annuler` | désarme la pose |
| relevé | `Relevé` (mobile) / `Relevé complet` (large) | écrit l'annonce d'état courant |
| améliorer, démolir, déblayer | ceux de 001 | inchangés |
| recharger, après divergence de catalogue | celui de 001 | inchangé |

**Aucune autre commande n'existe.** Le bouton « Réclamer (sans espoir) » de la
maquette large est supprimé : FR-025 interdit la commande sans effet, et la
fiction de la Régie vit dans les textes, jamais dans un bouton qui ne fait rien.

| Contrainte | Valeur |
| --- | --- |
| cible interactive | ≥ 44 px dans les deux dimensions |
| bouton | ≥ 48 px de hauteur effective |
| indicateur de focus | visible sur tous les fonds, ≥ 3:1 contre le fond qu'il borde |

---

## 7. La légende

Une entrée par état de FR-013, chacune portant **la silhouette rendue** — le même
composant `Glyphe`, pas une capture — et son libellé. Atteignable à toutes les
largeurs (FR-018) : sur écran étroit elle vit dans le document après le registre,
sur écran large dans la colonne de gauche.

**Ce qui est vérifié** : le nombre d'entrées est égal à la taille de l'union
`EtatDeCase` — **douze** —, et chaque `data-glyphe` de la légende apparaît dans la
table des états.
Un état sans entrée de légende fait échouer le test — c'est ce qui empêche
qu'un douzième état arrive un jour sans sa clé.

---

## 8. Les tailles de texte

Quatre planchers, posés sur le **rôle** du texte. La table complète et sa
conversion en `rem` sont en [`jeu-de-valeurs.md § 2`](./jeu-de-valeurs.md).

| Rôle | Plancher | Exemples sur cet écran |
| --- | --- | --- |
| champ de saisie | 16 px | aucun sur l'écran de parcelle ; la règle vaut pour l'écran d'authentification |
| texte porteur d'information | 14 px | légende, « niveau 3 », entrées du registre, débit horaire, `Relevé` |
| intitulé de bloc | 12 px | « CHANTIER EN COURS », « CAMELOTE », bandes de coordonnées |
| décor sans information | 9,5 px | surtitre de la Régie, notes de bas de page, mention finale, tampon |

**Ce qui est vérifié**, à 430 px et à 1180 px :

- chaque nœud de texte est au-dessus du plancher de son rôle, mesuré sur la
  taille **calculée** — une règle héritée peut réduire un élément que la feuille
  de style dit pourtant grand ;
- **aucune taille de police n'est exprimée en pixels** dans `apps/game/src/**` ;
- à 200 % de zoom texte, les tailles calculées ont bien doublé — c'est ce qui
  distingue une échelle en `rem` d'une échelle figée.

Le rôle d'un nœud se lit sur son attribut `data-role-texte`, porté par les blocs
de décor. En son absence, le nœud est **présumé porteur d'information** : c'est
le sens qui échoue du bon côté.

---

## 9. Ce que le contrat interdit

| Interdit | Motif |
| --- | --- |
| une seconde région polie | FR-022 |
| un `aria-label` sur un élément sans rôle | R13, piège documenté du dossier de design |
| une information portée par la teinte seule | FR-012 |
| un chiffre posé sur un aplat de ressource sans étiquette de papier | FR-003 |
| une rotation d'élément au-delà de 1,5°, sur un texte long, au focus, ou animée | FR-032 |
| une transition de couleur au-delà de 120 ms | FR-005 |
| un mouvement au survol ou à la prise de focus | FR-005 |
| une requête vers un domaine tiers | FR-004 |
| un bouton ou un lien décoratif | FR-025 |
| un texte porteur d'information sous 14 px, un intitulé de bloc sous 12 px, un décor sous 9,5 px | FR-039, resserré par rôle en R14 |
| une taille de police exprimée en pixels | R14 — c'est ce qui rend WCAG 1.4.4 vrai |

Le tampon décoratif « VU, MAIS PAS LU » est la seule exception au plafond de
rotation : il ne porte aucune information et il est `aria-hidden` (FR-032).
