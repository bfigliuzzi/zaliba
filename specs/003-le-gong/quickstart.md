# Phase 1 — Guide de validation : Le Gong

**Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md) ·
**Modèle** : [data-model.md](./data-model.md) · **Contrat** : [contracts/v1-gong.md](./contracts/v1-gong.md)

Ce guide décrit **comment prouver que la tranche fonctionne**, pas comment
l'écrire.

---

## 1. Ce qui change dans la mise en route

Rien à installer : la tranche n'ajoute aucune dépendance
([G15](./research.md#g15--aucune-dépendance-nouvelle)). Les commandes du § 2 du
[guide de 001](../001-la-planete-mere/quickstart.md) sont inchangées.

**Une variable devient obligatoire** dans le `.env` racine. Elle est lue par
**`apps/api` seul** : c'est de la configuration de serveur, non secrète mais non
destinée au client, et `.env.example` gagne une troisième section pour la
recevoir. La ranger dans la section `apps/game` en ferait une configuration
locale du client, que FR-012 et SC-005 interdisent — et le préfixe `VITE_` que
portent toutes les variables de cette section l'embarquerait littéralement dans
le bundle.

```
# La longueur du gong, en secondes. Entier, ou fraction entière.
# Canonique : 10. Le jeu se comporte alors exactement comme avant 003.
GONG_SECONDS=10
```

Elle est **exigée**, pas facultative : un serveur qui bat au mauvais rythme est
indétectable de l'intérieur, et un repli silencieux sur le canonique masquerait
une erreur de configuration au lieu de l'exposer (FR-007). Le symptôme d'un
oubli est un refus de démarrage nommant la variable, comme pour `DATABASE_URL`.

Sa valeur est **publique** — la page de règles l'énonce (FR-016). Elle n'a rien
à faire dans la section « secrets » de `.env.example`.

Quelques valeurs et ce qu'elles donnent :

| `GONG_SECONDS` | Rapport | Mine niveau 1 | Attente d'une amélioration de mine |
| --- | --- | --- | --- |
| `10` | ×1 — canonique | 120 s | ~5 h |
| `1/2` | ×20 | 6 s | ~15 min |
| `1/6` | ×60 | 2 s | ~5 min |

---

## 2. Prouver chaque parcours

### US4 d'abord — rien n'a bougé

C'est la preuve à obtenir **avant** toutes les autres : si l'équilibrage a
bougé, le reste ne vaut rien.

```bash
pnpm -w test        # projet `domain` : la table de vérité, valeur par valeur
```

Attendu : les **240 valeurs** comparables — 140 durées de construction, 5 de
démolition, 5 de déblaiement, 90 taux — sont **strictement égales** aux valeurs
d'avant 003 au gong canonique (SC-001). Un écart d'une seule seconde sur un seul
niveau fait échouer la tranche.

```bash
GONG_SECONDS=10 pnpm -w e2e   # les parcours de 001 passent sans modification
```

### US1 — le joueur peut refaire chaque chiffre

1. Démarrer avec `GONG_SECONDS=10`, ouvrir la page de règles.
2. Attendu : elle énonce **la longueur du gong**, et donne chaque durée en gongs
   **et** en secondes, chaque production par gong **et** par heure.
3. Vérifier à la main : `12 gongs × 10 s = 120 s` pour la mine ;
   `150 grains par gong ÷ 10 s = 15 grains par seconde = 15 unités par heure`.
4. Recommencer avec `GONG_SECONDS=1/2`. Les deux colonnes doivent rester
   cohérentes entre elles, et la base résolue publiée doit permettre de refaire
   le calcul (FR-009, [G5](./research.md#g5--hors-gong-canonique-une-troncature-et-la-base-résolue-est-publiée)).

### US2 — un serveur bat plus vite, et tout suit

1. Démarrer avec `GONG_SECONDS=1/6`, semer une planète, lancer une mine.
2. Attendu : elle s'achève en **2 secondes**, et l'écran annonçait bien 2 s.
3. Attendu, et c'est le point qui a motivé le Gong : le temps de réunir de quoi
   payer l'amélioration suivante est **lui aussi** divisé par soixante. Une
   accélération qui ne porterait que sur les chantiers laisserait le joueur
   affamé. Les taux se résolvent sans reste, donc ce rapport-là est **exact**.
4. Attendu, et c'est la limite à ne pas prendre pour une panne : les **durées**
   ne suivent exactement que lorsque leur base se résout sans reste. La mine
   (12 gongs) tombe sur 2 s, donc ×60 exact ; la centrale (9 gongs) tombe sur
   `max(1, ⌊9 ÷ 6⌋) = 1 s` au lieu de 1,5, donc ×90 — et la courbe amplifie
   l'écart avec le niveau (SC-002,
   [G6](./research.md#g6--un-gong-très-court-aplatit-les-écarts-entre-types)).
   Au gong canonique, aucune troncature n'a lieu.
5. Attendu : coûts, capacités et rapport d'énergie **inchangés** par rapport au
   gong canonique ([G13](./research.md#g13--lénergie-les-coûts-et-les-capacités-ne-sont-pas-touchés)).

### US3 — le client apprend le gong du serveur

1. Serveur et client en fonctionnement, `GONG_SECONDS=10`.
2. Changer la variable pour `1/2`, **redémarrer le serveur seul**, sans toucher
   ni recompiler le client.
3. Attendu : dès la réponse suivante, les aperçus, les compteurs et la page de
   règles du client emploient la nouvelle longueur (SC-004).
4. Attendu : `grep -r "GONG" apps/game/src` ne rend **aucune** valeur de
   configuration — seulement la lecture de ce que le serveur annonce (SC-005,
   [G17](./research.md#g17--le-client-ne-doit-pas-pouvoir-atteindre-le-gong-canonique)).
5. Retirer le champ de la réponse (test de composant) : le client **n'affiche
   aucun chiffre dérivé**, au lieu de se replier sur le canonique.

### US5 — le gong appartient au serveur

1. Deux comptes différents sur le même serveur : la longueur annoncée est la
   même (SC-006).
2. Émettre une commande portant un champ `gong` : le serveur la **rejette**, les
   quatre natures comprises. Le champ n'est pas ignoré — il est refusé à la
   frontière.

**Le constat d'inspection, consigné le 2026-08-31 (T070).** Deux recherches, et
leurs résultats :

| Recherche | Résultat |
| --- | --- |
| `gong` dans `packages/contracts/src/v1/planet.ts` | **une seule** occurrence de champ — `gong`, en lecture, dans `PlanetSnapshotV1`. Aucun corps de commande n'en porte, et `WorkIntentV1` est `.strict()` sur ses quatre natures |
| `gong` dans `apps/api/src/routes/` | **aucune**. Les routes ne lisent la longueur nulle part : elles lisent le catalogue résolu, qui la porte |

L'inégalité n'est donc pas interdite — elle est **irreprésentable** : il n'existe
aucune structure, dans le contrat comme dans les routes, où une longueur par
joueur pourrait s'écrire. C'est ce que FR-014 et FR-020 demandent, et une
vérification vaut moins qu'un champ absent.

### Les refus de démarrage

| Configuration | Attendu |
| --- | --- |
| `GONG_SECONDS` absente | refus, en nommant la variable |
| `GONG_SECONDS=0`, `-3`, `abc`, `1.5` | refus, en nommant la valeur |
| une longueur dont un taux ne se résout pas en entier | refus, en nommant **la ressource et le type fautifs** — un message générique obligerait à chercher |
| `NODE_ENV=production` avec un gong non canonique | démarre : un univers rapide est légitime (FR-019). Ce qui est interdit, c'est un gong **par joueur**, et il est irreprésentable |

### Changer la longueur du gong d'un serveur déjà peuplé

Le cas limite de la spécification, dont elle dit que « le remède relève de
l'exploitation, et doit être documenté ». Trois faits, et un remède.

**Les ressources accumulées depuis la dernière consolidation sont créditées au
nouveau taux.** La projection part de `consolidatedAt` et applique les taux du
catalogue **courant** : le temps écoulé sous l'ancien rythme est donc payé au
nouveau. C'est une aubaine si le gong a raccourci, une perte s'il a rallongé —
jamais une incohérence, et jamais un état invalide.

**Les échéances déjà écrites en base ne bougent pas.** `dueAt` est fixé à la
décision et stocké ([G14](./research.md#g14--un-chantier-en-cours-nest-jamais-recalculé)) ;
un chantier lancé sous l'ancien rythme finit à l'heure prévue. Ni raccourci, ni
rallongé — ce second cas serait le plus mal vécu.

**Le remède est de consolider avant de redémarrer, pas de recalculer après.**

```bash
# 1. Arrêter le serveur : plus aucune commande n'entre.
# 2. Consolider chaque planète à l'instant courant — la projection écrit alors
#    tout ce qui a été produit sous l'ancien rythme, au taux de l'ancien rythme.
# 3. Changer GONG_SECONDS, puis redémarrer.
```

Recalculer après coup a été écarté : il faudrait rejouer l'historique de chaque
planète avec le catalogue de l'époque, alors que le gong n'est pas persisté —
c'est un paramètre du processus, pas un état de partie. La consolidation, elle,
est un geste que le jeu fait déjà à chaque commande.

En développement, la question ne se pose pas : `supabase stop --no-backup`
remet la base à zéro, ce qui est plus court que tout ce qui précède.

---

## 3. Ce que chaque porte doit dire

**Les onze portes, et les onze.** La liste ci-dessous est celle de la table § 7.8
du document de stack. Deux d'entre elles — l'audit de vulnérabilités et
`gitleaks` — ne sont portées par aucun test et sont donc celles qu'une liste
abrégée laisse tomber. C'est arrivé en 002 ; elles sont ici nommément.

| # | Commande | Attendu |
| --- | --- | --- |
| — | `pnpm -w build` | **obligatoire d'abord** — les paquets se résolvent par `dist/` |
| 1 | `pnpm -w typecheck` | un catalogue **déclaré** passé à une fonction de domaine **ne compile pas** ([G16](./research.md#g16--le-catalogue-déclaré-et-le-catalogue-résolu-sont-deux-types-distincts)) |
| 2 | `pnpm -w lint` | aucun écart de format ni de lint |
| 3 | `pnpm -w boundaries` | `domain-n-importe-que-catalogs` couvre la résolution **sans règle nouvelle**, et le nombre de modules parcourus est **non nul**. Aucune règle n'est ajoutée : la garde du gong côté client est lexicale ([G17](./research.md#g17--le-client-ne-doit-pas-pouvoir-atteindre-le-gong-canonique)) |
| 4 | `pnpm -w test` — catalogues | le catalogue **déclaré** s'exprime en gongs entiers et en grains par gong |
| 5 | `pnpm -w test` — domaine | la table de vérité des 240 valeurs, les invariants de propriété, le rapport d'accélération |
| 6 | `pnpm -w test` — contrats | les cinq propriétés de [`contracts/v1-gong.md` § 5](./contracts/v1-gong.md) |
| 7 | `pnpm -w test:integration` | inchangé quant au schéma — aucune migration ; le refus de démarrage et l'égalité entre joueurs s'y ajoutent |
| 8 | `pnpm -w e2e` | les parcours de 001 passent au gong canonique, **axe-core sans écart** sur la page de règles augmentée |
| 9 | `pnpm audit --audit-level moderate` | aucune vulnérabilité. **Porte bloquante de la constitution**, et le fait que la tranche n'ajoute aucune dépendance (G15) n'en dispense pas |
| 10 | `gitleaks detect --config .gitleaks.toml --no-banner` | aucune fuite. La tranche ajoute une variable à `.env.example` : c'est exactement sa matière |
| 11 | `pnpm -w test:coverage` | le seuil du domaine **ne peut que monter** |

---

## 4. Deux pièges connus

**Un gong très court aplatit les écarts entre types.** À `1/6`, la mine et le
puits se résolvent tous deux sur une base de 2 secondes, la centrale et
l'entrepôt sur 1 seconde. L'équilibrage relatif disparaît. Sans conséquence pour
un banc d'essai, décisif pour un univers rapide ouvert à des joueurs — le détail
et la table sont en [G6](./research.md#g6--un-gong-très-court-aplatit-les-écarts-entre-types).
Préférer `1/2` quand les écarts comptent.

**Un bundle client périmé cesse d'afficher un message lisible.**
`PlanetSnapshotV1` est `.strict()` : un client compilé avant 003 rejette la clé
inconnue **à l'analyse**, et son mode de défaillance passe de l'avis de
divergence à une erreur d'analyse. C'est assumé et borné
([G8](./research.md#g8--ajouter-un-champ-à-un-schéma-strict-casse-un-bundle-client-périmé)) :
recompiler le client suffit, et il est de toute façon servi avec l'API.

---

## 5. Relevé des portes — 2026-08-31

Consigné à la fin de l'implémentation (T077). **Onze veut dire onze**, et les
deux qui se font oublier — l'audit de vulnérabilités et `gitleaks` — sont ici
nommément, parce qu'aucun test ne les porte et que la liste de 002 les avait
laissées tomber toutes les deux.

| # | Porte | Sortie |
| --- | --- | --- |
| — | `pnpm -w build` | 5 paquets construits, 5 sur 5 |
| 1 | `pnpm -w typecheck` | 10 tâches sur 10. Un `DeclaredCatalogs` passé à `previewBuild` **ne compile pas**, et le sens inverse non plus — vérifié par une sonde jetable, les deux refus constatés |
| 2 | `pnpm -w lint` | 285 fichiers, aucun écart |
| 3 | `pnpm -w boundaries` | **294 modules, 837 dépendances**, aucune violation. Le nombre est non nul, et c'est ce qu'il fallait vérifier. Aucune règle ajoutée : `domain-n-importe-que-catalogs` couvre la résolution telle quelle |
| 4-6 | `pnpm -w test` | **105 fichiers, 1957 tests** — catalogues, domaine, contrats, base, API, client |
| 7 | `pnpm -w test:integration` | voir ci-dessous |
| 8 | `pnpm -w e2e` | voir ci-dessous |
| 9 | `pnpm audit --audit-level moderate` | *No known vulnerabilities found*. La tranche n'ajoute aucune dépendance, ce qui n'en dispense pas |
| 10 | `gitleaks detect --config .gitleaks.toml --no-banner` | 39 commits parcourus, *no leaks found*. Un second passage `--no-git` sur l'arbre remonte quatre alertes, **toutes dans des fichiers gitignorés** — le `.env` local et `apps/game/dist/` —, donc hors du champ de la porte : `git check-ignore` le confirme |
| 11 | `pnpm -w test:coverage` | domaine à **97,44 %** d'instructions, 88,36 % de branches, 97,51 % de lignes — au-dessus des seuils (90/90/85), et `kernel/gong.ts` couvert par quatre fichiers de test |

### Ce qui a été vu rougir, et pas seulement vert

Une porte dont on n'a jamais vu l'échec n'est pas une porte. Trois l'ont été
délibérément :

| Porte | Sabotage | Ce qu'elle a dit |
| --- | --- | --- |
| `gong-egalite.test.ts` — les 240 valeurs | une seconde ajoutée à chaque base résolue | `mine — construction niveau 1: expected 121 to be 120` |
| `gong-hors-du-client.test.ts` — FR-012 | un `{ num: 10, den: 1 }` glissé dans `lib/clock.ts` | `lib/clock.ts nomme une longueur de gong littérale` |
| `gong-hors-des-ecrans.test.ts` — FR-018 | un `"3 gongs"` glissé dans `BuildPanel.tsx` | `work/BuildPanel.tsx nomme le gong hors de la page de règles` |

Les deux portes lexicales échouent par ailleurs si elles ont parcouru zéro
fichier — c'est la panne que le dépôt a déjà nommée, et elle est gardée des deux
côtés.

### Le refus de démarrage, constaté

```
$ node --env-file=<sans GONG_SECONDS> --import tsx src/main.ts
Error: GONG_SECONDS (absente) : la variable est requise et n’a pas été fournie.
Attendu : un entier de secondes (« 10 »), ou une fraction entière (« 1/2 »,
« 1/6 »). Jamais un flottant : écrire « 3/2 » plutôt que « 1.5 ». Voir .env.example.
```
