# Quickstart — valider La Régie approximative

**Branche** : `002-la-regie-approximative` | **Date** : 2026-08-27 |
**Plan** : [plan.md](./plan.md)

Ce document dit **comment constater** que la tranche tient, pas comment
l'écrire. Il complète le
[quickstart de 001](../001-la-planete-mere/quickstart.md), qu'il ne redit pas :
la pile locale (§ 1), les commandes du quotidien (§ 2) et les onze portes (§ 3)
y sont, et elles ne changent pas.

Douze critères de succès, et chacun a ci-dessous sa vérification. Neuf sont
mécaniques ; **trois ont une moitié humaine**, et elle est écrite comme une
recette parce qu'aucun automate ne la remplace.

---

## 0. Prérequis

La pile locale de 001, telle que son quickstart § 1 la décrit :

```bash
supabase start                        # base et authentification
pnpm --filter @zaliba/api start       # le serveur autoritaire
pnpm --filter @zaliba/game dev        # le client, sur 127.0.0.1:5173
```

Puis un compte neuf, qui provisionne sa planète au premier accès.

---

## 1. Les portes, dans l'ordre où elles doivent verdir

*Corrigé le 2026-08-28.* La liste précédente en comptait huit et **omettait les
deux portes que la constitution rend bloquantes sans qu'un test les porte** :
l'audit de vulnérabilités et la fuite de secrets. Une tranche qui ajoute quatre
dépendances ne pouvait pas se déclarer close sur une liste où l'audit
n'apparaissait pas.

```bash
pnpm -w typecheck        # types
pnpm -w lint             # Biome
pnpm -w boundaries       # dependency-cruiser
pnpm -w test             # unitaires, contrats, rendu
pnpm -w test:coverage    # couverture du domaine — inchangée
pnpm -w test:integration # Testcontainers — inchangés
pnpm -w build            # compilation du client
pnpm -w e2e              # parcours et accessibilité
pnpm audit --audit-level moderate   # vulnérabilités — les quatre ajouts de 002
gitleaks detect --config .gitleaks.toml --no-banner   # fuite de secrets
```

**Ces dix commandes ne sont pas les onze portes de CI.** Elles en sont la
reproduction locale, et les deux numérotations ne coïncident pas : la CI compte
onze portes numérotées — 1 types, 2 lint, 3 frontières, 4 catalogues, 5 domaine,
6 contrats, 7 intégration, 8 parcours, 9 vulnérabilités, 10 secrets, 11
couverture —, là où `pnpm -w test` en exécute quatre d'un coup et où `pnpm -w
build` n'en est pas une. **Le décompte opposable est celui de
`.github/workflows/ci.yml`** ; cette liste est le moyen de le rendre vert avant
de pousser. Citer « les huit portes » ne désigne plus rien : dire « les onze
portes de CI », ou nommer la commande.

**Deux d'entre elles sont la preuve de SC-012**, et se lisent autrement que les
autres : `test:coverage` et `test:integration` doivent rendre **exactement** le
même résultat qu'avant la tranche. Un chiffre de couverture qui bouge, un test
d'intégration qui change de durée, sont des signaux à examiner — la tranche ne
touche aucun paquet qu'ils mesurent.

**Vérifier que la porte 3 a parcouru des modules.** `dependency-cruiser` sort en
succès en ayant lu zéro module lorsque la ligne de TypeScript ne lui convient
pas. Le compte est dans sa sortie ; s'il est nul, la porte est inerte.

---

## 2. Le jeu de valeurs

```bash
pnpm --filter @zaliba/game test -- tokens
```

| Ce qui doit être vrai | Ce qui échoue sinon |
| --- | --- |
| toute clé de `tokens.json` a sa propriété personnalisée | le test de conformité nomme la clé manquante |
| le test a lu un nombre **non nul** de clés | le test échoue explicitement sur le compte |
| aucune valeur visuelle littérale hors de `tokens.css` | le test nomme le fichier et la ligne |
| les teintes de nuit sont transcrites et **inemployées** | le test nomme la règle fautive |
| chaque couple de rôles atteint son seuil WCAG | le test nomme le couple et le ratio calculé |
| chaque taille vaut `max(dossier, plancher du rôle) ÷ 16` en `rem` | le test nomme le pas, son rôle et la valeur attendue |
| **aucune taille de police en pixels** dans `apps/game/src/**` | le test nomme le fichier et la ligne |

La table des couples et les trois écarts relevés au recalcul sont dans
[`contracts/jeu-de-valeurs.md`](./contracts/jeu-de-valeurs.md).

---

## 3. SC-001 — la parcelle à 320 × 640 px

```bash
pnpm -w e2e -- --grep "320"
```

Ce que le parcours mesure, et le budget qui le rend possible
([research.md § R9](./research.md)) :

- les 36 cases visibles ensemble, sans défilement ni zoom ;
- **chaque case au moins 44 px de côté** — c'est la mesure qui casse en premier
  si un rembourrage revient à sa valeur nominale ;
- aucune barre de défilement horizontale.

À l'œil, pour confirmer : réduire la fenêtre de 1180 px à 320 px d'un trait, et
vérifier qu'il n'existe **qu'un seul** palier de bascule, à 900 px, et aucun
débordement entre les deux.

---

## 4. SC-002 — le zoom texte à 200 %

Dans le navigateur, en fenêtre de 430 px :
`Réglages → Apparence → Taille de la police → Très grande`, ou dans les outils
de développement, doubler la taille de police par défaut. **Ce n'est pas le zoom
de page** — celui-là agrandit tout, y compris les pixels, et ne prouve rien.

| Ce qu'il faut voir | Ce qui trahirait un défaut |
| --- | --- |
| **le texte a doublé** | un texte qui n'a pas bougé — le signe d'une taille en `px` quelque part |
| aucun bloc ne déborde de la fenêtre | une carte de ressource qui pousse la page |
| aucun texte n'est tronqué | une étiquette de papier à `text-overflow: ellipsis` |
| « Bave d'étoiles » passe sur deux lignes plutôt que d'être coupé | un renvoi à la ligne empêché par un `white-space: nowrap` |
| les silhouettes gardent leur proportion dans la case | une silhouette qui déborde de sa case — le signe qu'elle est dimensionnée en `rem` et non en `cqmin` |

La première ligne est celle qui compte. **Le plancher typographique protège la
lecture par défaut ; c'est le `rem` qui protège celle du joueur malvoyant**, et
seul ce test le constate.

---

## 4 bis. Le plancher typographique

```bash
pnpm -w e2e -- --grep "plancher"
```

Le parcours mesure la taille **calculée** de chaque nœud de texte, aux deux
largeurs de référence, et la compare au plancher de son rôle :

| Rôle | Plancher | Comment le rôle est déterminé |
| --- | --- | --- |
| champ de saisie | 16 px | `input`, `select`, `textarea` |
| texte porteur d'information | 14 px | **par défaut** — un nœud sans `data-role-texte` est présumé porteur |
| intitulé de bloc | 12 px | `data-role-texte="intitule"` |
| décor sans information | 9,5 px | `data-role-texte="decor"` |

Le défaut est ce qui rend la porte utile : **oublier de marquer un bloc le range
du côté exigeant**, pas du côté permissif. Un décor non marqué échoue le test ;
une information non marquée est protégée.

À confirmer une fois à l'œil : les textes restés en corps 9 sont bien le
surtitre de la Régie, les notes de bas de page, la mention finale et le tampon —
et rien d'autre. Si un chiffre, un nom de ressource ou une entrée de légende s'y
trouve, c'est un défaut, pas un choix.

---

## 5. SC-004 et SC-005 — contrastes et audit d'accessibilité

```bash
pnpm -w e2e -- --grep "accessibilité"
```

axe-core, aux **trois largeurs éprouvées** — 320 px, 430 px et 1180 px —, sur les
mêmes réglages que 001 : `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, **aucune
règle désactivée**. La règle `color-contrast` d'axe couvre le texte rendu ; le
test de la § 2 couvre la palette elle-même.

**Le 320 px a été ajouté le 2026-08-28**, et ce n'est pas une largeur de plus par
prudence : c'est celle où le budget de R9 resserre rembourrages, encadrement et
gouttières pour tenir les 44 px de côté. La largeur la plus exposée à une
régression de contraste ou de cible était la seule à n'être jamais auditée.

Si un écart apparaît, il se corrige dans le diff avec son motif écrit. Une
exception ajoutée au harnais est invisible en revue six mois plus tard, et
`apps/game/tests/e2e/axe.ts` le dit déjà.

---

## 6. SC-006 — le parcours complet au clavier

**Sans souris. La débrancher rend le test honnête.**

| # | Frappe | Ce qui doit se produire |
| --- | --- | --- |
| 1 | `Tab` répété | atteindre la grille en **un** arrêt de tabulation |
| 2 | flèches | le curseur se déplace de case en case ; chaque case est annoncée avec son adresse |
| 3 | `Tab` | quitter la grille en **une** frappe |
| 4 | `Maj+Tab` | y revenir **sur la case où on était** |
| 5 | `Tab` jusqu'aux actions, choisir un bâtiment | la pose s'arme |
| 6 | `Maj+Tab` vers la grille, flèches | chaque case refusée **nomme sa cause** |
| 7 | `R` | l'empreinte pivote, l'orientation est annoncée |
| 8 | `Entrée` sur une case valide | la pose est acceptée et annoncée |
| 9 | rearmer, puis `Échap` | rien n'est posé, l'annulation est annoncée |

Aucun piège de focus, aucune commande qui exige la souris. Le bouton
d'annulation existe aussi visiblement (FR-020) : le vérifier au pointeur ne
dispense pas de l'étape 9.

---

## 7. SC-007 — les ratures à l'oreille

Provoquer une amélioration et attendre son achèvement, puis écouter avec un
lecteur d'écran — VoiceOver sur macOS (`Cmd+F5`), NVDA sur Windows.

| Ce qu'il faut entendre | Ce qui trahirait le défaut |
| --- | --- |
| « Niveau 3, anciennement niveau 2. » | « niveau 2 3 » — le visuel rayé n'est pas masqué |
| une seule fois | deux fois — la phrase et le visuel sont tous deux lus |
| rien du tout quand la valeur n'a pas changé | une phrase d'ancienne valeur sur une valeur stable |

C'est le point le plus facile à casser du système, et le seul dont la casse
produit une valeur **fausse** plutôt qu'une gêne. Il se réécoute à chaque
modification du bloc concerné.

**C'est une recette humaine, et son verdict se consigne** comme ceux du § 10.
*Corrigé le 2026-08-28* : cette section décrivait une écoute sans dire qu'il
fallait en garder trace, et aucune tâche ne la conduisait — alors que les trois
recettes du § 10 en avaient chacune une. Le balisage est mécanisé par les tests
de rendu ; **ce que produit réellement une synthèse vocale ne l'est pas**, et
c'est précisément là que « niveau 2 3 » se produirait sans qu'aucune porte ne le
voie. Consigner : ce qui a été entendu, sur quel lecteur d'écran, et sur quelle
valeur.

---

## 8. SC-008 — aucune requête sortante

```bash
pnpm -w e2e -- --grep "domaine tiers"
```

Le parcours intercepte **toutes** les requêtes et compare leur origine à celles
de la pile locale. À confirmer une fois à la main, l'onglet réseau ouvert,
filtre « Tiers » : la liste doit être vide, polices comprises.

Et sur le paquet compilé :

```bash
pnpm --filter @zaliba/game build
grep -r "fonts.googleapis.com\|fonts.gstatic.com" apps/game/dist || echo "aucune"
```

---

## 9. SC-010 — le mouvement réduit

```bash
pnpm -w e2e -- --grep "mouvement"
```

Le parcours émule `prefers-reduced-motion: reduce` et mesure les durées
**calculées** d'animation et de transition sur tous les éléments de l'écran :
aucune au-dessus de 1 ms. Le tampon d'état doit **apparaître quand même** — la
préférence supprime le mouvement, pas l'information.

---

## 10. Les trois critères à moitié humaine

Ce sont ceux qu'aucun automate ne clôt. La moitié mécanique tourne avec les
autres tests ; la moitié humaine se conduit **une fois par tranche**, et son
verdict se consigne dans la description de la demande de fusion.

### 10.1 SC-003 — les douze états, en niveaux de gris

**Moitié mécanique** : le test vérifie que les douze états portent douze
quadruplets (silhouette, trait, marque, emprise) **distincts deux à deux** — le
triplet ne suffit pas, « case libre » et « bâtiment posé » ayant leurs trois
premiers champs vides (INV-C1).

**Moitié humaine** — la recette :

1. afficher une parcelle portant les douze états simultanément (le harnais de
   test en fournit une : voir `tests/fixtures/`) ;
2. appliquer un filtre de niveaux de gris — `filter: grayscale(1)` sur
   `<html>` depuis les outils de développement ;
3. demander à **une personne qui n'a pas participé à la conception** de nommer
   chaque état, avec la seule légende sous les yeux ;
4. consigner : combien nommés sans erreur, lesquels ont hésité, et ce que
   l'hésitation portait.

Le critère est tenu si les douze sont nommés sans erreur. Une hésitation qui n'est
pas une erreur se consigne quand même : c'est le signal d'avance de la
prochaine régression.

### 10.2 SC-009 de 002 — le mode contrastes forcés

**Moitié mécanique** : le parcours émule `forced-colors: active` et vérifie que
chaque case porte toujours son canal non chromatique et que les douze
quadruplets restent distincts.

**Moitié humaine** : activer le mode réel du système — Windows, *Paramètres →
Accessibilité → Thèmes de contraste* — et regarder. Les aplats et les ombres
doivent avoir disparu ; les silhouettes et les styles de trait, non.

### 10.3 SC-011 — protanopie et deutéranopie

**Aucune moitié mécanique.** Un automate peut appliquer la matrice ; il ne peut
pas juger si deux états deviennent confusables.

La recette :

1. appliquer les matrices `feColorMatrix` que le fichier de pistes embarque
   (`docs/design/2026-08-27-regie-approximative/Zaliba - Pistes de jeu.dc.html`),
   d'abord protanopie, puis deutéranopie ;
2. parcourir les douze états deux à deux ;
3. consigner tout couple devenu confusable.

**Un seul cas d'alerte affaiblie est connu et admis** : sous protanopie, le rouge
du refus se rapproche de l'orange de la Camelote. L'état reste identifiable par
sa silhouette — disque barré d'une croix — mais il **alerte faiblement**. Ce cas
est documenté dans la page de règles du jeu (FR-035) ; vérifier qu'il y est.
Tout autre couple confusable est un défaut, pas une variante de celui-ci.

---

## 11. SC-012 — aucune règle de jeu n'a changé

C'est le critère le plus simple à vérifier et le plus important à ne pas
supposer :

```bash
git diff --stat main -- packages/ apps/api/
```

**La sortie doit être vide.** Cette tranche ne touche ni `catalogs`, ni
`domain`, ni `contracts`, ni `db`, ni `apps/api`. Si un fichier y apparaît, la
question n'est pas « est-ce grave » mais « pourquoi », et la réponse va dans le
plan ou nulle part.

Puis, pour la forme et parce que la forme est ce qui tient :

```bash
pnpm -w test --project domain --project contracts --project db --project api
```

---

## 12. La liste de relecture avant fusion

La constitution exige une relecture contre une liste écrite énumérant les cinq
principes. Pour cette tranche, les questions qui la rendent utile :

| Principe | La question à poser au diff |
| --- | --- |
| **I** — spécification opposable | chaque fichier touché se rattache-t-il à une tâche, et chaque écart constaté a-t-il été résolu **dans** la spécification ou **dans** le code, jamais laissé implicite ? |
| **II** — frontière domaine / interface | la porte `boundaries` a-t-elle parcouru un nombre non nul de modules, et `packages/domain` est-il resté intact ? |
| **III** — test d'abord | pour chaque comportement observable ajouté — nom accessible, ordre de bloc, silhouette, annonce —, le test a-t-il été écrit et **vu en échec** avant le composant ? |
| **IV** — contrats | `packages/contracts` est-il inchangé, et les instantanés de JSON Schema identiques ? |
| **V** — simplicité | y a-t-il une dépendance, une couche ou une option qu'aucune exigence de `spec.md` ne réclame aujourd'hui ? |
