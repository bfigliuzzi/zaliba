# Phase 0 — Recherche et décisions : La planète mère

**Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md)

**Portée** : les décisions **propres à cette itération**. Celles qui relèvent de la
stack, du modèle de temps, des frontières de paquets, de la sécurité et de la
stratégie de test sont déjà arrêtées dans
[`docs/architecture/2026-08-23-choix-de-stack.md`](../../docs/architecture/2026-08-23-choix-de-stack.md)
et ne sont pas rejouées ici.

Aucun marqueur `NEEDS CLARIFICATION` ne subsiste. Trois vérifications de
compatibilité restent à mener par l'exécution et non par le raisonnement : R17.

R21 et R22 ont été ajoutées après coup, sur arbitrage du responsable du dépôt sur
le rôle de chaque ressource. Elles closent le conflit lexical entre le Jus et
l'énergie.

---

## R1 — Les quantités sont des entiers en sous-unités de 1/3600 d'unité

**Décision.** Une quantité de ressource est un **entier de grains**, où
`1 grain = 1/3600 unité`. Un taux de production est un **entier d'unités par
heure**. Le gain sur `s` secondes vaut donc exactement `taux × s` grains. La
valeur affichée au joueur est `⌊grains ÷ 3600⌋`.

**Motif.** SC-003 exige un écart **nul** entre les ressources retrouvées après une
absence et les règles publiées, pour une heure comme pour trois semaines. Il faut
donc que la production soit exacte *et* **additive** : projeter à `t+n` puis à
`t+m` doit donner exactement le même résultat que projeter à `t+n+m`, sans quoi
la fortune d'un joueur dépendrait du nombre de fois qu'il a agi. Le choix
`1 grain = 1/3600 unité` fait tomber la division par 3600 : `taux × s` est un
entier, toujours.

La formulation reste reproductible à la main, ce qu'exige SC-002 : *« un taux de
120 par heure donne exactement 120 × secondes écoulées trois-mille-six-centièmes
d'unité ; le jeu conserve la fraction et affiche la partie entière. »*

**Alternatives écartées.**

- **Flottants.** L'erreur d'arrondi dépend du nombre de consolidations : le joueur
  qui agit souvent gagne ou perd des ressources par rapport à celui qui n'agit
  pas. C'est un exploit ou une injustice selon le sens de l'arrondi, et cela
  contredit SC-002 comme SC-003.
- **Entiers d'unités, gain tronqué à chaque projection.** `⌊a⌋ + ⌊b⌋ ≠ ⌊a+b⌋` :
  l'additivité tombe, donc la propriété la plus importante du modèle de temps.
- **Rationnels exacts stockés en base.** Exact, mais introduit une arithmétique
  rationnelle dans tout le noyau pour un besoin que trois mille six cents
  sous-unités couvrent entièrement. Le principe V l'exclut.

**Marge d'équilibrage.** Le grain fixe la granularité minimale d'un taux à
1 unité/heure. Si l'équilibrage réclame plus fin, redéfinir le grain à 1/36000 et
les taux en dixièmes d'unité par heure : c'est une modification de catalogue et
une migration de facteur constant, pas un changement de modèle.

---

## R2 — L'instant est un entier de secondes UTC

**Décision.** Le type `Instant` du noyau est un **entier de secondes depuis
l'époque**, en UTC. Les échéances de chantier en sont aussi. La conversion depuis
`timestamptz` tronque vers le bas, à la frontière de `packages/db`.

**Motif.** La spécification promet l'exactitude « à la seconde près » — pas mieux,
pas moins. Une précision plus fine créerait une dérive sub-seconde entre le
serveur, le client et la base sans qu'aucune exigence ne l'utilise. Une précision
plus grossière raterait la promesse. Et un entier de secondes rend les tests de
propriété triviaux à écrire : le temps devient un `number`.

**Alternative écartée.** Millisecondes : `taux × s` cesse d'être entier, ce qui
détruit R1 — ou impose de redéfinir le grain à 1/3 600 000 d'unité pour rien.

---

## R3 — Un chantier échu est appliqué par la projection, sans ordonnanceur

**Décision.** Aucun processus de fond en 001. La projection prend en compte le
chantier en cours : si son échéance est antérieure à l'instant demandé, elle
**segmente** le calcul et applique ses effets à l'instant de l'échéance. La ligne
de chantier n'est marquée résolue qu'à la prochaine **mutation**, qui consolide.

**Motif.** Le document de stack §4.3 distingue deux déclencheurs : à la lecture
pour ce qui n'est observable que par son propriétaire, à l'échéance pour ce dont
un tiers doit être informé. **En 001, rien n'est observable par un tiers** : pas
de flotte, pas d'attaque, pas de marché. Le second déclencheur n'a aucun objet, et
avec lui la boucle frugale, son verrouillage et son test de concurrence.

Cette décision satisfait deux exigences d'un coup :

- **FR-031** — une consultation ne modifie aucun état : le `GET` est une fonction
  pure, il n'écrit rien, y compris quand un chantier est échu depuis trois
  semaines.
- **FR-032** — l'achèvement prend effet à l'instant de son échéance et non à
  l'instant où il est constaté : c'est exactement ce que fait la segmentation.

**Alternatives écartées.**

- **Boucle de résolution** (doc de stack §4.3) : correcte mais sans emploi ici.
  Elle sera nécessaire à la première mécanique qu'un tiers doit constater. La
  greffer alors est additif ; l'écrire maintenant est du code sans décision, que
  le principe V refuse.
- **Résoudre à la lecture en écrivant** (`GET` consolidant) : viole FR-031, et
  transforme chaque affichage en écriture — précisément ce que le modèle de temps
  cherche à éviter.

**Conséquence à ne pas manquer.** Comme un seul chantier peut être actif (FR-033),
il y a **au plus deux segments** entre deux consolidations. La projection reste
triviale, et l'aperçu d'une action est **exactement prédictible** : entre le
lancement d'un chantier et son échéance, aucune autre transition ne peut se
produire. C'est ce qui rend FR-049 tenable — voir R4.

---

## R4 — Plafond, perte et additivité

**Décision.** Par segment et par ressource, avec `q₀` la quantité au début du
segment, `r` le taux effectif, `s` la durée du segment et `P` le plafond :

```
brut  = q₀ + r × s
q     = min(brut, P)
perdu = max(0, brut − P)          (cumulé dans l'instantané)
```

L'instant de saturation, affiché par FR-027, vaut `t₀ + ⌈(P − q₀) ÷ r⌉`, et est
infini si `r = 0`.

**Motif — pourquoi cela reste additif.** Le plafonnement seul ne l'est pas ; le
plafonnement **plus le cumul des pertes** l'est. Sur deux segments consécutifs à
taux constant, la somme des pertes vaut `q₀ + r × (s₁ + s₂) − P`, c'est-à-dire
exactement la perte du segment unique équivalent. C'est un invariant à mettre sous
fast-check, pas un raisonnement à croire :

> `project(t₀ → t₁ → t₂)` et `project(t₀ → t₂)` donnent la même quantité **et** la
> même perte cumulée, plafond compris.

**Conséquence sur FR-049.** L'écrêtement du remboursement d'une démolition doit
être annoncé **avant confirmation**, donc prédit à l'instant du lancement pour un
crédit qui aura lieu à l'échéance. C'est possible parce qu'aucune autre transition
ne peut survenir entre les deux (R3) : l'état à l'échéance est calculable
exactement au lancement. L'unicité du chantier n'est pas seulement une règle de
jeu, c'est ce qui rend cette promesse tenable.

**Alternative écartée.** Ne pas comptabiliser la perte et se contenter du
plafonnement : rend la projection non additive, et prive FR-026 comme US7 de la
grandeur qu'ils exigent d'afficher.

---

## R5 — Le rapport d'énergie : une seule troncature, publiée

**Décision.** Pour un extracteur de niveau `n` recouvrant `d` gisements de sa
ressource, avec `E₊` l'énergie produite — base du Berceau plus centrales — et `E₋`
l'énergie consommée sur la planète — **somme sur tous les bâtiments sauf la
centrale**, l'entrepôt compris :

```
taux nominal   = courbeProduction(n) × d              (unités/heure, entier)
rapport        = 1 si E₋ ≤ E₊, sinon E₊ ÷ E₋
taux effectif  = ⌊ taux nominal × E₊ ÷ E₋ ⌋ en déficit, sinon taux nominal
```

La production de base du Berceau (FR-018) s'**ajoute après**, et n'est jamais
touchée par le rapport.

**Le rapport ne s'applique qu'à la production** (FR-023b). Un entrepôt figure au
dénominateur mais sa capacité reste entière en déficit : voir R21 pour le motif et
l'alternative écartée.

**Motif.** La troncature porte sur le **taux**, une fois, et non sur le gain.
C'est ce qui préserve l'additivité de R1 : `⌊a⌋ + ⌊b⌋ ≠ ⌊a+b⌋`, mais un taux
entier constant sur un segment se multiplie exactement par la durée. Et la règle
reste énonçable en une ligne, donc reproductible à la main (SC-002) et
décomposable en quatre facteurs (FR-053) : valeur de base du type, facteur de
niveau, nombre de gisements, rapport d'énergie.

**Alternative écartée.** Tronquer le gain (`⌊taux × s × E₊ ÷ E₋⌋`) : plus fin,
mais non additif — donc la fortune du joueur dépendrait à nouveau de sa fréquence
d'action.

---

## R6 — Empreintes : ensembles d'offsets normalisés, miroir inatteignable par construction

**Décision.** Une empreinte est un **ensemble d'offsets entiers** normalisé
(`min x = min y = 0`). Ses orientations sont **précalculées** par application
répétée du quart de tour `(x, y) → (−y, x)` suivi d'une renormalisation, puis
dédoublonnées.

| Empreinte | Cases | Offsets de l'orientation 0 | Orientations distinctes |
| --- | --- | --- | --- |
| `single` | 1 | `(0,0)` | 1 |
| `line-2` | 2 | `(0,0) (1,0)` | 2 |
| `square-4` | 4 | `(0,0) (1,0) (0,1) (1,1)` | 1 |
| `l-4` | 4 | `(0,0) (0,1) (0,2) (1,2)` | 4 |
| `t-4` | 4 | `(0,0) (1,0) (2,0) (1,1)` | 4 |
| `rect-6` | 6 | `(0,0) (1,0) (2,0) (0,1) (1,1) (2,1)` | 2 |
| `square-9` | 9 | les neuf de `0..2 × 0..2` | 1 |

Un bâtiment posé stocke `variantId`, `orientation` (0 à 3) et une **ancre**
`(x, y)` ; ses cases sont dérivées.

**Motif.** FR-011 interdit le retournement. Ne jamais implémenter la symétrie rend
la forme miroir **inatteignable par construction** plutôt qu'interdite par une
garde qu'on pourrait oublier. La propriété se met néanmoins sous fast-check —
*aucune suite de rotations ne produit le miroir d'une empreinte chirale* — parce
que ce test est ce qui protège la règle dans six mois.

Le dédoublonnage des orientations sert directement l'accessibilité : le carré de
quatre n'a qu'une orientation, donc la commande de rotation ne fait rien qui doive
être annoncé, et un lecteur d'écran n'énonce que des états distincts.

**Une seule empreinte est chirale** — relevé par exécution le 2026-08-26, en
correction d'une première rédaction qui nommait `l-4` **et** `t-4`. Le T a un axe
de symétrie vertical : son miroir `(0,0) (1,0) (2,0) (1,1)` **est** son
orientation 0. Il est donc achiral, comme les cinq autres. Seul `l-4` a un miroir
qu'aucune rotation n'atteint.

La correction ne change rien à FR-011 ni au code : la symétrie n'est de toute
façon jamais implémentée. Elle change ce que le test peut affirmer. Un test qui
aurait exigé « le miroir de `t-4` est inatteignable » aurait échoué contre une
vérité de géométrie, et la tentation aurait été de l'assouplir — c'est-à-dire
d'affaiblir aussi la garantie sur `l-4`. Le test de catalogue fixe désormais la
**partition** du vocabulaire : une chirale, six achirales. Une empreinte future
qui changerait de catégorie se signalerait d'elle-même.

**Alternative écartée.** Stocker les cases occupées comme unique vérité, sans
variante ni orientation : l'affichage ne saurait plus dessiner la forme, et FR-059
exige d'annoncer l'orientation courante.

---

## R7 — La disposition du Berceau : un candidat vérifié

**Décision.** Une disposition unique, identique pour tous (FR-003), en donnée de
catalogue. Coordonnées `(x, y)` avec `x` la colonne de 0 à 5 et `y` la ligne de 0
à 5, l'origine en haut à gauche.

```
      x=0   x=1   x=2   x=3   x=4   x=5
y=0    .     .     .     ▓     .     .
y=1    .    ~J~    .     .     .     ▓
y=2    ▓     ▓     .     ▓     ▓     ▓
y=3    .     ▓     ▓     .     .     .
y=4   =C=    .     ▓     .    *B*    .
y=5    .     .     .     .     .     .

  .   case libre        ▓   case obstruée
 =C=  veine de Camelote      ~J~  geyser de Jus
 *B*  récif de Bave d'étoiles
```

Dix obstacles, vingt-six cases libres, un gisement de chaque ressource : FR-004
est satisfait au compte exact.

**Les dix obstacles et ce qu'ils libèrent** (FR-042, FR-043) :

| Case | Type d'obstacle | Résultat du déblaiement |
| --- | --- | --- |
| (3,0) | `eboulis` | terrain nu |
| (5,1) | `rocher` | terrain nu |
| (0,2) | `filon-enfoui` | veine de Camelote |
| (1,2) | `eboulis` | terrain nu |
| (3,2) | `poche-scellee` | geyser de Jus |
| (4,2) | `eboulis` | terrain nu |
| (5,2) | `croute-calcifiee` | récif de Bave d'étoiles |
| (1,3) | `rocher` | terrain nu |
| (2,3) | `filon-enfoui` | veine de Camelote |
| (2,4) | `eboulis` | terrain nu |

Au terme de tous les déblaiements : trente-six cases utilisables et sept
gisements — dans la fourchette de trente à quarante du document de conception §3.1.

**Vérification de FR-005**, menée à la main ici et **rejouée en test de cohérence
de catalogue**, qui est la seule autorité :

- **carré de neuf** — le bloc `x∈3..5, y∈3..5` est intégralement libre ; il
  contient le récif (4,4), donc le **racloir** peut recouvrir son gisement ;
- **rectangle de six** — le bloc `x∈0..2, y∈0..1` est intégralement libre ; il
  contient le geyser (1,1), donc le **puits** peut recouvrir son gisement ;
- **carré de quatre** — le bloc `x∈0..1, y∈4..5` est intégralement libre ; il
  contient la veine (0,4), donc la **mine** peut recouvrir son gisement ;
- **L et T** — tous deux tiennent dans un rectangle 3×2, donc dans le bloc
  `x∈3..5, y∈3..5` ;
- **une case** et **deux en ligne** — trivialement.

Les sept empreintes admettent donc au moins un placement valide, et chacune des
trois ressources a un placement d'extracteur recouvrant son gisement.

**Motif de la forme retenue.** La bande d'obstacles de la ligne `y=2` coupe la
planète en deux, ce qui donne au déblaiement un enjeu **topologique** et non
seulement comptable. La case (2,2), libre mais accessible seulement par le haut,
est un recoin que seules la case unique et les deux cases en ligne exploitent :
c'est la démonstration du vocabulaire d'empreintes dès le premier écran. Aucune
de ces intentions n'est chiffrée : la disposition ne porte aucun bonus, seulement
de la géométrie — conformément au document de conception §2.1.

**Alternative écartée.** Une disposition tirée au sort par graine : FR-003 et
SC-008 l'interdisent, et le document de conception §2.2 fonde l'équité sur la
permutation d'un ensemble fixe, jamais sur la calibration d'un générateur.

---

## R8 — Les aperçus sont calculés par le client, avec le code du serveur

**Décision.** Aucun endpoint d'aperçu. Le coût, la durée, l'effet, la validité
d'un placement, le nombre de gisements recouverts, le rapport d'énergie résultant
et le montant écrêté d'un remboursement sont calculés **dans le client**, par
`packages/domain`, sur l'instantané qu'il détient déjà. Le serveur recalcule tout
dans la transaction de mutation, sur l'état verrouillé.

**Motif.** C'est la raison d'être du « TypeScript partout » : le document de stack
§3 en fait la seule ligne qui la matérialise — `game` importe `domain`. L'aperçu
n'est alors pas *cohérent avec* l'arbitrage serveur, il est **le même calcul**.
Trois conséquences directes :

- FR-050 et FR-051 sont satisfaits sans aller-réseau : l'aperçu suit le curseur de
  grille à la fréquence d'affichage, ce qu'un endpoint ne permettrait pas ;
- il n'y a aucune surface de contrat à versionner pour l'aperçu, donc aucune
  possibilité qu'aperçu et arbitrage divergent d'une version ;
- l'exigence de transparence de US8 devient structurelle : la page de règles et
  l'aperçu lisent le même catalogue et les mêmes courbes.

**Ce que cela n'affaiblit pas.** Le client reste sans autorité. Il n'envoie que
`{type, variante, orientation, position}` ou `{cible}` ; le coût qu'il a affiché
**n'a pas de champ pour être transmis**. Le cas limite « les ressources deviennent
insuffisantes entre l'aperçu et la confirmation » se résout côté serveur, au
moment de la confirmation, avec le manque exact.

**Alternative écartée.** `POST /v1/previews` : un aller-retour par déplacement de
curseur, une surface de contrat supplémentaire à versionner, et une divergence
possible entre deux implémentations du même calcul. Aucun gain de sécurité :
l'aperçu ne décide de rien.

---

## R9 — Le coût cumulé d'un bâtiment est dérivé, non stocké

**Décision.** `buildings` stocke le niveau, pas le coût cumulé. Le remboursement
de FR-046 vaut `fraction × Σ(k=1..N) coût(k)`, recalculé depuis la courbe du
catalogue.

**Motif.** Le document de stack place la règle : *tout ce que le serveur peut
dériver est absent*. Ici, dériver garantit en plus que la page de règles, l'aperçu
du client et l'arbitrage du serveur donnent le même nombre, puisqu'ils lisent la
même courbe.

**Coût assumé.** Un rééquilibrage de la courbe de coût change **rétroactivement**
le remboursement des bâtiments déjà posés. C'est acceptable en alpha, et cohérent
avec le document de stack §5.1 qui fait du rééquilibrage une modification de
données visible en diff. La contrepartie — figer le coût cumulé à la pose — créerait
deux joueurs aux règles différentes sur la même planète, ce qui est pire.

**À réexaminer** au premier rééquilibrage après ouverture publique.

---

## R10 — L'occupation de la grille est garantie par une clé primaire

**Décision.** Une table `building_cells (planet_id, x, y, building_id)` de clé
primaire `(planet_id, x, y)`, écrite dans la même transaction que `buildings`.

**Motif.** La non-superposition est **l'invariant central** de la fonctionnalité.
Une clé primaire la rend impossible à violer, y compris par un futur chemin
d'écriture qui aurait oublié la validation. Coût : une instruction de plus par
transaction.

**Alternative écartée.** S'en remettre à la validation du domaine dans la
transaction verrouillée. C'est correct aujourd'hui, et le reste jusqu'au jour où
un second chemin d'écriture apparaît. Une contrainte de base ne se dégrade ni avec
le temps ni avec la fatigue ; la discipline, si. Redondance enregistrée en
« Complexity Tracking » du plan.

---

## R11 — Le provisionnement est une commande explicite, pour que `GET` reste pur

**Décision.** `POST /v1/me/planet`, idempotente : crée la planète du joueur si
elle n'existe pas, retourne l'existante sinon. Le client l'appelle après
l'authentification. `GET /v1/me/planet` ne crée rien et retourne 404 si rien
n'existe.

**Motif.** FR-031 interdit qu'une consultation modifie l'état. Provisionner à la
première lecture serait exactement cela. Et une commande explicite se teste comme
les autres : deux appels concurrents, une seule planète — garanti par un index
unique sur `owner_id`.

**Alternative écartée.** Un déclencheur PostgreSQL sur `auth.users`. Il placerait
une règle de jeu — quelle disposition, quel stock de départ — dans un schéma géré
par le fournisseur, hors de `domain` et hors de tout test de propriété. Le
document de stack §2.3 tranche déjà : l'authentification se loue, les mutations de
l'état de jeu ne se délèguent pas.

---

## R12 — Le JWT Supabase est vérifié localement, par clé asymétrique

**Décision.** L'API récupère le JWKS du projet, le met en cache, et vérifie la
signature **localement** avec `jose`. On n'en extrait qu'une information : *qui*.
Aucun droit n'est lu dans le jeton.

**Motif.** Document de stack §6.2 : aucun appel réseau par requête, et
l'autorisation n'est jamais dans le jeton puisque les planètes changent
d'occupant. La vérification asymétrique évite de placer dans l'API une clé capable
de **forger** un jeton.

**Alternative écartée.** Secret partagé HS256 : la même clé signe et vérifie ; sa
fuite depuis l'API permet de se faire passer pour n'importe qui.

**Pour les tests.** La frontière `jeton → identifiant de joueur` est un adaptateur
isolé, testé sur des jetons de fixture signés par une paire de clés de test. Les
tests d'intégration injectent l'identifiant directement : ils vérifient
l'autorisation *dans la transaction*, pas la cryptographie.

---

## R13 — Pilote PostgreSQL : postgres.js

**Décision.** `postgres` (postgres.js) comme pilote de Drizzle. Connexion par le
**pooler de session** de Supabase, ou par le pooler de transaction avec les
requêtes préparées désactivées.

**Motif.** Pilote recommandé par Drizzle, et le point de vigilance est connu : un
pooler de transaction ne conserve pas les requêtes préparées. L'écrire dans le
plan évite de le découvrir en production.

**Alternative écartée.** `pg` : viable, mais traitement des requêtes préparées et
du pooler moins direct, pour aucun gain ici.

---

## R14 — L'interaction de grille est un curseur, pas un glisser-déposer

**Décision.** Le modèle d'interaction est : *sélectionner un type → choisir une
variante → déplacer un curseur → pivoter → confirmer*. Le curseur est déplaçable
au clavier (flèches), au pointeur (appui sur une case) et par la molette d'aucune
manière. Un `role="grid"` de trente-six cases, `tabindex` mobile, une région
`aria-live` annonçant position, contenu de case, empreinte, orientation, validité
et nombre de gisements recouverts. **Aucun glisser-déposer.**

**Motif.** Le document de conception §9 identifie la grille comme l'écran le plus
difficile du projet. Le glisser-déposer accessible en est la partie la plus
coûteuse — et elle est **facultative** : le modèle de curseur est *le même
parcours* au clavier et au pointeur, donc FR-058 et SC-004 sont satisfaits par
construction plutôt que par une seconde implémentation à maintenir en parallèle.
Sur téléphone, l'appui sur une case est aussi plus fiable qu'un glissement sur une
cible de 40 pixels.

Conséquence : `@dnd-kit/core` n'est pas installé en 001. La dépendance figure dans
la table du document de stack ; elle y reste, pour la tranche qui en aura besoin.

**Alternative écartée.** Glisser-déposer accessible avec dnd-kit. Deux modèles
d'interaction à écrire, à annoncer et à tester, dont le second n'apporte rien
qu'aucune exigence ne réclame. Le principe V refuse.

---

## R15 — La page de règles vit dans le jeu, générée depuis le catalogue

**Décision.** US8 est un écran de `apps/game`, dont le contenu est **dérivé de
`packages/catalogs`** : courbes nommées et paramètres, valeurs par type et par
niveau, formules de production, de plafond et de rapport d'énergie. Rien de rédigé
à la main. `apps/site` n'est pas créé en 001.

**Motif.** FR-054 exige des règles consultables **en jeu**. La constitution exige
par ailleurs que la documentation de référence soit générée depuis les catalogues,
jamais rédigée — c'est respecté ici, à ceci près que la cible de génération est
l'écran de jeu et non le site public, lequel n'a rien à publier avant 002.

**Conséquence de cohérence.** La réponse d'état porte un identifiant de version de
catalogue. Un client dont le catalogue diverge de celui du serveur affiche des
chiffres faux : la divergence est détectée et le rechargement proposé, plutôt que
silencieuse.

**Alternative écartée.** Un endpoint `GET /v1/catalogs`. Le client importe déjà le
catalogue depuis le monorepo ; le servir par le réseau ajoute une surface de
contrat pour dupliquer une donnée déjà présente dans son paquet.

---

## R16 — Le vocabulaire d'effets de 001, et rien de plus

**Décision.** Le noyau détient un ensemble **fermé** d'effets ; un module en
retourne une liste, ne mute rien. En 001, sept effets suffisent :

| Effet | Emploi |
| --- | --- |
| `debit-resources` | coût d'un chantier, au lancement |
| `credit-resources` | remboursement d'une démolition, à l'échéance |
| `place-building` | pose au niveau 1, à l'échéance |
| `set-building-level` | amélioration, à l'échéance |
| `remove-building` | démolition, à l'échéance |
| `clear-cell` | déblaiement, à l'échéance |
| `schedule-work` | planification de l'événement daté, au lancement |

**Motif.** Document de stack §5.3 : le vocabulaire est détenu par le noyau, et
ajouter un effet inédit est une modification délibérée du noyau. L'énumérer ici
fixe la frontière avant d'écrire la première ligne.

**Volontairement absents.** `cancel-work` — FR-037 rend un chantier non
annulable ; `notify-player` — aucune notification en 001 (hors périmètre de la
spécification).

---

## R17 — Trois vérifications de compatibilité à mener à l'amorçage

Le raisonnement ne suffit pas ; ces points se tranchent par exécution, à la
première tâche d'amorçage, et **avant** d'écrire du code applicatif. Chacun a son
repli.

| À vérifier | Repli si l'incompatibilité est confirmée |
| --- | --- |
| **`zod` 4.4.3 avec `@ts-rest/*` 3.52.1.** ts-rest a longtemps été écrit pour zod 3. | Épingler la version de zod que ts-rest accepte, ou passer par son interface de schéma standard. Si l'un des deux doit changer de version majeure, c'est un **amendement MINOR** de la constitution (sa section « Stack technique » l'exige explicitement). |
| **`typescript` 7.0.2 avec Biome, Drizzle, ts-rest et Vitest.** TypeScript 7 est un compilateur réécrit ; l'outillage tiers peut être en retard. | Épingler la dernière version de la ligne précédente, et consigner l'écart par amendement. À ne pas contourner par des échappatoires de typage. |
| **Chaîne d'outils locale contre versions épinglées.** Relevé : Node 24.18.0 et pnpm 11.9.0 en local, contre 24.19.0 et 11.22.0 épinglés au document de stack. | Aligner la machine sur les versions épinglées (`packageManager` dans le manifeste racine, `.nvmrc`), et non l'inverse. Si une version épinglée n'existe pas, corriger le document de stack : il consigne un relevé, qui peut être erroné. |

**Prérequis d'exécution à noter aussi** : les tests d'intégration exigent un
démon Docker en fonctionnement (Testcontainers). Ce n'est pas une décision, c'est
une condition d'exécution de la porte de CI correspondante.

### Verdicts d'exécution — relevés le 2026-08-26 (T001, T002)

Bac à sable jetable, installation réelle, exécution réelle. Aucun verdict n'est
tiré d'une lecture de `peerDependencies` : ces déclarations se sont révélées
fausses **dans les deux sens**.

| Vérification | Verdict | Ce qui a été exécuté |
| --- | --- | --- |
| `zod` 4.4.3 avec `@ts-rest/*` 3.52.1 | ❌ **Incompatible au typage** | Un contrat `initContract().router` dont les `responses` portent un schéma zod 4 s'effondre en `{ [x: string]: any }` : l'implémentation du routeur n'est plus assignable, `tsc --noEmit` échoue (TS2322). Reproduit à l'identique sous **TypeScript 5.9.3 et 7.0.2** — la cause est zod, pas le compilateur. `generateOpenApi` produit en outre un schéma **vide** (`{}`), `@anatine/zod-openapi` 1.x ne lisant que les internes de zod 3. Le **runtime**, lui, est correct : `.strict()`, bornes et entiers rejettent bien en 400. |
| `zod` 3.25.76 avec `@ts-rest/*` 3.52.1 et `typescript` 7.0.2 | ✅ **Compatible** | Même contrat : `tsc --noEmit` propre, `generateOpenApi` produit le schéma complet (`type`, `minimum`, `maximum`, `required`). |
| `typescript` 7.0.2 avec Biome 2.5.10, drizzle-kit 0.31.10, drizzle-orm 0.45.2, ts-rest 3.52.1, Vitest 4.1.11, fast-check 4.9.0 | ✅ **Compatible** | `tsc --noEmit` propre sur un contrat ts-rest, un schéma `pgTable` à clé primaire composite et un générateur fast-check, en mode `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Les cinq exécutables se lancent et font leur travail. |
| `typescript` 7.0.2 avec **dependency-cruiser 18.2.0** | ❌ **Incompatible** | dependency-cruiser parcourt **zéro module** TypeScript et rapporte `no dependency violations found (0 modules, 0 dependencies cruised)`. La porte du principe II est **inerte**, et son inertie prend l'apparence d'un succès. L'outil dit lui-même pourquoi : « Support for typescript@>=7 will follow when its API is published and stable. » Sous `typescript` 6.0.3, le même dépôt donne 2 modules et la dépendance est trouvée. |
| `typescript` 6.0.3 avec l'ensemble de la chaîne | ✅ **Compatible** | zod 3.25.76 + ts-rest 3.52.1 + fastify 5.12.1, drizzle-orm 0.45.2, fast-check 4.9.0, Vitest 4.1.11, Biome 2.5.10, drizzle-kit 0.31.10 **et** dependency-cruiser 18.2.0. C'est la seule ligne qui passe la totalité. |
| `@ts-rest/fastify` 3.52.1 avec `fastify` 5.12.1 | ✅ **Compatible à l'exécution** | Le peer déclaré est `fastify@^4.0.0`, et `npm install` refuse la résolution. Mais le greffon s'enregistre et sert la route : `app.inject` retourne 200, et la validation de corps rejette en 400. L'incompatibilité est **déclarée, pas réelle** ; elle se contourne par `pnpm.peerDependencyRules`, jamais par un contournement de code. |

**Décision retenue** — le repli nommé ci-dessus s'applique : **zod est épinglé à
`3.25.76`** dans tout le dépôt. Conséquences, toutes portées :

1. **Amendement MINOR de la constitution** (2.0.0 → 2.1.0), exigé par sa section
   « Stack technique » : zod change de version majeure.
2. Le tableau § 8 de
   [`docs/architecture/2026-08-23-choix-de-stack.md`](../../docs/architecture/2026-08-23-choix-de-stack.md)
   est corrigé : `zod` passe de 4.4.3 à 3.25.76.
3. Les schémas s'écrivent en API zod 3 : `z.number().int().min(0).max(3)` et non
   `z.int()`. Le sous-chemin `zod/v4` de zod 3.25.x est **écarté** : il ferait
   coexister deux vocabulaires de schéma pour un seul consommateur.
4. T037 et T158 restent réalisables : `generateOpenApi` fonctionne sous zod 3.

**Décision retenue pour TypeScript** — le repli nommé s'applique également :
**TypeScript est épinglé à `6.0.3`**, la dernière version de la ligne précédente.

Le motif mérite d'être dit franchement, parce qu'il est contre-intuitif : ce
n'est pas le compilateur qui échoue. TypeScript 7.0.2 compile parfaitement tout
ce que 001 lui demande. Ce qui échoue, c'est **le gardien** — et il échoue en
silence, en affichant un succès. Une porte bloquante qui ne parcourt rien ne
protège rien, et elle est *pire* qu'une porte absente : elle donne l'assurance
que le principe II est tenu. Entre un compilateur plus rapide et une frontière
réellement vérifiée, la constitution ne laisse pas le choix — le principe II
existe, la vitesse de compilation n'est pas un principe.

**Ce verdict corrige un verdict antérieur du même jour.** La première passe de
T002 avait conclu à la compatibilité de dependency-cruiser avec TypeScript 7 sur
la foi de son exécution : l'outil se lançait et sortait en succès. Il ne
travaillait pas. Le protocole de R17 dit « se tranche par exécution » ; la leçon
est qu'exécuter ne suffit pas — **il faut vérifier que l'outil a produit un
résultat non vide**. Le compte de modules parcourus est désormais la mesure, pas
le code de sortie.

Conséquences, toutes portées :

1. **Amendement MINOR de la constitution** : TypeScript change de version
   majeure. Il est porté par le même amendement que zod.
2. Le tableau § 8 du document de stack passe `typescript` de 7.0.2 à 6.0.3.
3. La montée en 7.x se fera quand dependency-cruiser publiera son support,
   par un nouvel amendement et un nouveau verdict d'exécution.

**Chaîne d'outils locale** : Node 24.18.0 et pnpm 11.9.0 relevés, contre 24.19.0
et 11.22.0 épinglés. Les deux versions épinglées **existent** au registre : c'est
donc la machine qui s'aligne (T003), et le document de stack qui a raison. pnpm
11.22.0 est en place via `packageManager`. **Node reste à 24.18.0 sur la machine
de développement** : `corepack` ne gère pas l'environnement d'exécution. Un
`nvm install` de la version portée par `.nvmrc` est à la main de la personne qui
développe ; la CI, elle, est déjà épinglée à 24.19.0.

---

## R18 — Langue des identifiants

**Décision.** La structure du code — dossiers, fichiers, types, fonctions,
variables, colonnes, codes d'erreur — est en **anglais**. Les identifiants de
**contenu de jeu** conservent le vocabulaire français du document de conception,
en kebab-case : `camelote`, `jus`, `bave-etoiles`, `mine`, `puits`, `racloir`,
`centrale`, `entrepot`, `berceau`, `filon-enfoui`. Les libellés affichés sont des
chaînes de présentation, séparées des identifiants.

**Motif.** `CLAUDE.md` tranche déjà : documentation en français, identifiants et
messages techniques en anglais. Le contenu de jeu est un cas mixte : ce sont des
**noms propres** du jeu, dont la traduction n'aurait aucun sens, et le document de
conception §1 les pose comme vocabulaire. Les garder tels quels rend le diff d'un
rééquilibrage lisible par quiconque connaît le jeu.

---

## R19 — Trois courbes nommées, et pas une de plus

**Décision.** Vocabulaire **fermé** de courbes, évaluées pour un niveau `n ≥ 1`,
résultat entier :

| Courbe | Formule | Emploi typique |
| --- | --- | --- |
| `linear(base, step)` | `base + step × (n − 1)` | consommation d'énergie, durées plates |
| `geometric(base, num, den)` | `⌊ base × (num ÷ den)^(n−1) ⌋` | coûts, productions, capacités |
| `steps([v₁, v₂, …])` | `vₙ`, table explicite | valeurs qu'aucune formule ne décrit bien |

`geometric` s'évalue en **arithmétique entière étendue** avec **une seule
troncature, à la fin** : `⌊ base × num^(n−1) ÷ den^(n−1) ⌋`. Le niveau est plafonné
par le catalogue, ce qui borne l'exponentiation.

**Motif.** Document de stack §5.1 : le critère de placement de la couture est la
fréquence. Ajouter un bâtiment est fréquent, donc c'est une donnée ; ajouter une
forme de courbe est rare, donc c'est du code délibéré dans `domain`. Trois formes
couvrent tout ce dont 001 a besoin.

La troncature unique en fin de calcul est ce qui rend la valeur reproductible à la
main : `⌊300 × 1,5⁴⌋` s'écrit et se vérifie ; un arrondi appliqué à chaque niveau
ne se raconte pas.

**Alternative écartée.** Un champ de formule interprété dans le catalogue. Le
document de stack l'écarte nommément : ce serait un langage de script, donc une
surface d'attaque et un cauchemar de mise au point, que le principe V refuse.

**Coût cumulé.** `Σ(k=1..N) coût(k)`, sommé sur les valeurs déjà tronquées de la
courbe. C'est cette somme, et non une formule fermée, qui est publiée — parce que
c'est celle que le joueur peut refaire.

---

## R20 — Ce que le catalogue de 001 contient

Cinq types de bâtiment, conformément aux arbitrages de la spécification :

| Type | Variantes d'empreinte | Rôle |
| --- | --- | --- |
| `mine` | `square-4`, `l-4`, `t-4` | extrait la Camelote sous ses veines |
| `puits` | `rect-6` | extrait le Jus sous ses geysers |
| `racloir` | `square-9` | extrait la Bave d'étoiles sous ses récifs |
| `centrale` | `line-2` | produit de l'énergie ; **seul type qui n'en consomme pas** |
| `entrepot` | `single` | relève le plafond des trois ressources ; consomme de l'énergie sans être dégradé par le rapport (R21) |

FR-009 impose que les variantes d'un même type aient la même surface et des
caractéristiques identiques : la mine a trois variantes de quatre cases, dont le
choix est **purement géométrique**. C'est un test de cohérence de catalogue, pas
une intention.

**Tous les types sauf la `centrale` portent une courbe de consommation d'énergie**,
y compris l'`entrepot` (FR-022).

**Les coûts sont libellés en Camelote et en Bave d'étoiles uniquement** (FR-062).
Le Jus n'entre dans aucun coût de cette itération : ses débouchés sont la
propulsion et la recherche, toutes deux hors périmètre. Voir R22.

Les valeurs numériques — bases de courbes, ratios, durées, stock de départ,
production, capacité et **énergie** de base du Berceau, niveau maximal par type,
durée de démolition, fraction de remboursement — sont des données d'équilibrage,
produites en phase d'implémentation et gelées par un **instantané d'équilibrage**
(doc de stack §7.2). Cinq d'entre elles portent une exigence et non un réglage :

- **FR-019** — le stock de départ doit suffire à construire au moins une centrale
  et un extracteur de niveau 1. C'est un test de cohérence de catalogue.
- **FR-018** — la production de base du Berceau doit être non nulle pour chaque
  ressource. Aussi un test : aucun état de jeu n'est définitivement bloquant.
- **FR-062** — aucun coût du catalogue n'est libellé en Jus. Aussi un test de
  cohérence de catalogue, et non une convention de rédaction.
- **FR-022** — le Berceau fournit une **énergie de base non nulle**. C'est un test
  de cohérence de catalogue : sans elle, une mine posée avant la première centrale
  donne `E₊ = 0`, donc un rapport nul et une production nulle. FR-018 serait tenu
  en droit — la production de base du Berceau est insensible au rapport — mais la
  première décision de placement du joueur serait punie sans qu'aucune règle
  publiée ne l'ait annoncé.
- **FR-040 et FR-046** — chaque type déclare son **niveau maximal**, sa **durée de
  démolition** et sa **fraction de remboursement**. Ce sont trois valeurs
  d'équilibrage, mais leur *existence* est une exigence : sans elles,
  `max-level-reached` n'a pas de borne à opposer et la démolition n'a ni durée ni
  remboursement à publier avant confirmation.

---

## R21 — En déficit d'énergie, seule la production est dégradée

**Décision.** Tous les bâtiments consomment de l'énergie, la centrale exceptée.
Mais le rapport `E₊ ÷ E₋` ne multiplie que des **taux de production**. La capacité
d'un entrepôt reste entière en déficit.

**Motif.** La consommation d'un entrepôt n'est pas gratuite pour autant : elle
grossit le dénominateur, donc elle dégrade le rapport de **toute** la planète.
Poser un entrepôt sans centrale se paie, simplement le prix est payé par les
extracteurs. La règle publiée reste énonçable en une ligne, ce qu'exige SC-002.

**Alternative écartée — la capacité aussi réduite au prorata.** Symétrique et
défendable, mais un plafond qui rétrécit peut passer **sous la quantité détenue**.
Il faudrait alors décider du sort du surplus : le perdre, c'est une confiscation
déclenchée par une construction ; le conserver au-dessus du plafond, c'est un état
que l'invariant I-1 (`0 ≤ amount ≤ cap`) interdit. Cette règle rendrait en outre la
saturation, la perte cumulée et l'aperçu d'écrêtement d'une démolition (FR-049)
dépendants de l'énergie — donc trois calculs exacts de plus à tenir pour un gain de
simulation nul.

**Alternative écartée — l'arrêt binaire sous un seuil.** Plus lisible qu'un
prorata, mais elle réintroduit un effet de falaise que le rapport unique évitait,
et elle exige un ordre de priorité entre bâtiments, c'est-à-dire une règle cachée
de plus à publier et à rendre reproductible à la main.

---

## R22 — Le Jus n'a aucun débouché en 001, et c'est assumé

**Décision.** Les coûts de cette itération sont libellés en Camelote et en Bave
d'étoiles. Le Jus est produit, stocké, plafonné et saturable comme les deux autres
ressources, mais rien ne le dépense.

**Motif.** Le rôle des ressources est arrêté : Camelote et Bave d'étoiles pour la
construction et la recherche, Jus pour la propulsion des flottes et la recherche.
Les flottes et la recherche sont hors périmètre de 001. Inventer un débouché au Jus
serait créer une règle à retirer en 002 — exactement ce que le principe V refuse.

**Contrepartie, énoncée sans l'atténuer.** En 001, le puits, le geyser de la case
(1,1) et la part Jus de l'entrepôt n'ont d'intérêt qu'anticipé. Un joueur qui pose
un puits verra son Jus croître puis saturer sans jamais pouvoir le dépenser.

**Pourquoi les garder malgré tout.** La disposition du Berceau et les trois
extracteurs sont arrêtés par la spécification ; les mécaniques de gisement, de
plafond et de saturation se valident à l'identique sur les trois ressources, donc
le Jus ne coûte pas une ligne de code de plus ; et retirer une ressource du
catalogue pour la remettre en 002 serait une migration pour rien.

**Alternative écartée — la centrale brûle du Jus en continu.** La plus fidèle à la
fiction du carburant, et la plus coûteuse : un taux net négatif atteint zéro **en
cours de segment**, l'énergie s'effondre alors, et les taux changent au milieu du
segment. L'invariant « au plus deux segments entre deux consolidations » de R3
tombe, la projection devient itérative, et l'aperçu exact de FR-049 cesse d'être
calculable au lancement. Un débouché décoratif ne vaut pas le modèle de temps.

**Alternative écartée — un coût ponctuel en Jus à la construction de la centrale.**
Sans danger pour le modèle de temps, et elle donnerait un emploi au puits dès 001.
Écartée parce qu'elle contredit le rôle arrêté du Jus : une centrale qui se paie en
carburant de flotte est une règle qu'il faudrait défaire ou justifier en 002.

**À réexaminer** dès que la première mécanique consommatrice de Jus est
spécifiée.
