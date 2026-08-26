# Phase 1 — Guide de validation : La planète mère

**Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md) ·
**Modèle** : [data-model.md](./data-model.md) · **Contrat** : [contracts/v1-planet.md](./contracts/v1-planet.md)

Ce guide décrit **comment prouver que la tranche fonctionne**, pas comment
l'écrire. Les commandes ci-dessous portent sur un dépôt où les tâches de
`tasks.md` ont été exécutées ; à la date de ce plan, aucun code applicatif
n'existe encore.

---

## 1. Prérequis

| Prérequis | Pourquoi |
| --- | --- |
| Node.js à la version épinglée (`.nvmrc`) | R17 — la machine s'aligne sur les versions du dépôt, jamais l'inverse |
| pnpm à la version du champ `packageManager` | idem |
| **Un démon Docker en fonctionnement** | Testcontainers lance un PostgreSQL réel pour les tests d'intégration. Sans lui, cette porte ne peut pas s'exécuter — et elle est bloquante |
| Navigateurs Playwright installés (`pnpm exec playwright install`) | parcours et accessibilité |
| Un projet Supabase, ou une paire de clés de test | seulement pour les parcours de bout en bout ; les tests de domaine et d'intégration n'en ont pas besoin |

Variables d'environnement de `apps/api`, jamais dans le dépôt :

```
DATABASE_URL=…            # PostgreSQL, schéma game
SUPABASE_JWKS_URL=…        # vérification locale de signature (R12)
SUPABASE_SERVICE_ROLE_KEY=…  # compromission totale si elle fuite — jamais ailleurs
```

`apps/game` ne connaît que l'URL de l'API et la clé `anon` — qui **n'est pas un
secret**, mais un identifiant de projet. Ne rien construire sur son secret.

Ajouter, pour le socle HTTP :

```
SUPABASE_JWT_ISSUER=…      # émetteur attendu, vérifié en plus de la signature
SUPABASE_JWT_AUDIENCE=…    # audience attendue
CORS_ALLOWED_ORIGINS=…     # liste close ; l'absence n'ouvre rien
```

### La pile Supabase locale

Le parcours de bout en bout commence par « créer un compte », donc par Supabase.
La pile locale suffit : `supabase/config.toml` est dans le dépôt, et
`[db] major_version = 17` y fixe la majeure PostgreSQL — la même que le
`postgres:17-alpine` du harnais d'intégration.

**La clé de signature est à produire, une fois.** Elle n'est pas dans le dépôt :
c'est une clé **privée**, fût-elle de développement.

```sh
node --input-type=module -e "
import { generateKeyPair, exportJWK } from 'jose'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const { privateKey } = await generateKeyPair('ES256', { extractable: true })
const { crv, x, y, d } = await exportJWK(privateKey)
writeFileSync('supabase/signing_keys.json', JSON.stringify([{
  kty: 'EC', kid: randomUUID(), use: 'sig',
  key_ops: ['sign', 'verify'], alg: 'ES256', ext: true, d, crv, x, y,
}], null, 2) + '\n')
"
supabase start
```

**`key_ops` n'est pas décoratif.** GoTrue choisit sa clé de signature sur la
présence de `sign` dans ce tableau — `use: "sig"` seul ne suffit pas. Sans lui,
le démarrage échoue sur `no signing key found`, ce qui laisse croire à un
fichier absent alors qu'il est simplement incomplet. La CLI valide par ailleurs
`kid` comme un UUID et `key_ops` comme un tableau de **deux** entrées exactement.

**Pourquoi ES256 et pas le secret partagé par défaut.** R12 exige une
vérification **asymétrique** : la même clé ne doit pas pouvoir signer *et*
vérifier, sans quoi sa fuite depuis l'API permet de se faire passer pour
n'importe qui. `signing_keys_path` fait servir à GoTrue un JWKS public sur
`/auth/v1/.well-known/jwks.json`, et l'API n'y récupère que de quoi vérifier.

Une pile locale laissée en HS256 fonctionnerait — et l'API la refuserait, parce
que `createAuthenticator` n'accepte que `RS256` et `ES256`. Ce refus est voulu :
il vaut mieux qu'une pile de développement s'écarte visiblement de la production
qu'un jeu de tests vert obtenu en abaissant la garde.

Les valeurs à reporter dans `.env` sont celles que `supabase status` affiche.
`supabase stop` arrête la pile ; `supabase stop --no-backup` la remet à zéro.

### Testcontainers ne trouve pas toujours le démon tout seul

Constaté le 2026-08-26, sur une machine où **Rancher Desktop** est le contexte
Docker actif alors qu'un socket Docker Desktop périmé subsiste. `docker info`
répond correctement, et Testcontainers échoue quand même : sa détection
automatique retient `~/.docker/run/docker.sock`, présent mais mort, et n'essaie
jamais le socket du contexte actif.

Deux variables suffisent, à poser dans l'environnement local :

```sh
export DOCKER_HOST="unix://$HOME/.rd/docker.sock"   # le socket du contexte actif
export TESTCONTAINERS_RYUK_DISABLED=true            # voir ci-dessous
```

`TESTCONTAINERS_RYUK_DISABLED` n'est pas une commodité : le conteneur de
nettoyage de Testcontainers monte le socket Docker de l'hôte, ce que la machine
virtuelle de Rancher Desktop refuse (`operation not supported`). Le harnais
arrête lui-même son conteneur dans `stop()` ; c'est ce qui rend le nettoyage
automatique dispensable ici, et seulement ici. En intégration continue, le
démon est un Docker ordinaire et aucune de ces deux variables n'est nécessaire.

Symptôme si l'on oublie : `Could not find a working container runtime strategy`.

---

## 2. Mise en route

```bash
pnpm install
pnpm -w typecheck          # tsc --noEmit sur tous les paquets
pnpm -w boundaries         # dependency-cruiser : le principe II, mécaniquement
pnpm -w test               # domaine, catalogues, contrats
pnpm -w test:integration   # Testcontainers : concurrence, idempotence, autorisation
pnpm -w dev                # apps/api et apps/game
pnpm -w e2e                # Playwright + axe-core
```

**L'ordre compte pour un diagnostic rapide.** `boundaries` échoue avant les tests
si une frontière de paquet a été franchie : c'est une erreur d'architecture, pas
une erreur de logique, et la lire dans un échec de test coûte une heure.

---

## 3. Ce que chaque porte doit dire

| Commande | Attendu |
| --- | --- |
| `typecheck` | aucun diagnostic. Aucune échappatoire de typage sans commentaire justificatif |
| `boundaries` | aucune violation. En particulier : `domain` n'importe ni `db`, ni `contracts`, ni HTTP, ni React ; `contracts` n'importe **pas** `domain` ; `game` n'importe **pas** `db` ; `kernel` n'importe aucun module |
| `test` | vert, dont les treize invariants de propriété de [data-model.md §1.7](./data-model.md) et les tests de cohérence de catalogue de §1.8 |
| `test:integration` | vert, dont les trois familles obligatoires : concurrence, idempotence, autorisation dans la transaction |
| `e2e` | vert, **axe-core sans écart** sur les deux parcours |
| couverture | seuil de `packages/domain` atteint, et jamais en baisse d'une fusion à l'autre |

Un instantané d'équilibrage ou de JSON Schema qui change fait échouer la porte.
C'est le comportement voulu : le diff se **lit et s'approuve**, il ne se contourne
pas. Le jeu ne sera jamais rééquilibré par accident, et un contrat ne changera
jamais de forme en silence.

---

## 4. Valider les huit tranches de la spécification

Chaque scénario est validable **indépendamment**, dans l'ordre de priorité de la
spécification. Les scénarios marqués « domaine » ne demandent ni serveur, ni
navigateur, ni base : c'est le principe II qui les rend si peu coûteux.

### US1 — Fonder sa colonie et la voir produire (P1)

**Domaine.** Projeter l'instantané initial à `t₀ + 1 h`, `+ 3 semaines`,
`+ 3 semaines + 1 s`, et comparer au calcul mené à la main depuis les courbes du
catalogue.

Attendu : écart **nul**, plafond compris. La propriété I-2 doit tenir : projeter
par étapes et projeter d'un coup donnent la même quantité **et** la même perte
cumulée.

**Bout en bout.** Créer un compte, ouvrir la planète.

Attendu : grille 6×6, **10 cases obstruées**, 26 libres, une veine de Camelote en
(0,4), un geyser de Jus en (1,1), un récif de Bave d'étoiles en (4,4) — la
disposition de [research.md R7](./research.md). Les compteurs progressent sous les
yeux, sans requête réseau : le couper (mode hors ligne du navigateur) ne les
arrête pas.

**Équité (SC-008).** Créer deux comptes, comparer les deux réponses `GET`.

Attendu : `layoutId`, obstacles et gisements **identiques**. Aucun tirage au sort.

**Non-blocage (US1-6).** Partir d'un instantané sans bâtiment et sans ressource,
projeter.

Attendu : les trois compteurs croissent. Il n'existe aucun état définitivement
bloquant.

### US2 — Poser un bâtiment sur la grille (P2)

**Clavier seul, sans aucun dispositif de pointage** — c'est un test Playwright, pas
une intention :

1. `Tab` jusqu'à la grille, sélectionner `mine` ;
2. choisir la variante `square-4` ;
3. flèches jusqu'en (0,4) ;
4. `R` pour pivoter — le carré de quatre n'a qu'une orientation, donc **rien ne
   doit être annoncé comme changé** ;
5. `Entrée` pour confirmer.

Attendu : le parcours aboutit. La région `aria-live` a annoncé, à chaque
déplacement, la position, le contenu de la case, l'empreinte, son orientation, la
validité et **le nombre de gisements recouverts** (FR-059).

**Refus motivés.** Tenter une pose débordant la grille, puis sur une case obstruée,
puis sur une case occupée.

Attendu : trois refus, trois `code` distincts, les cases fautives énumérées.

**Proportionnalité (US2-3).** Comparer l'aperçu d'une mine recouvrant une veine à
celui d'une mine recouvrant deux veines, tous autres facteurs égaux.

Attendu : exactement le double. Et une mine sur zéro gisement annonce **zéro**
avant la pose.

**Unicité du chantier.** Lancer une construction, puis en tenter une seconde.

Attendu : `409 work-in-progress`, avec `dueAt`. Refaire depuis **deux onglets
simultanés** : la seconde échoue aussi — c'est l'index unique de la base qui le
garantit, pas une vérification préalable.

### US3 — Alimenter la colonie en énergie (P3)

**Domaine.** Construire un état où l'énergie produite vaut 60 pour 100 consommées,
le dénominateur sommant **tous** les bâtiments sauf la centrale, entrepôt compris.

Attendu : la production effective de chaque extracteur vaut **exactement 60 %** de
sa nominale, la troncature étant celle publiée en [research.md R5](./research.md).
Les deux valeurs sont affichées séparément (FR-024), et la production de base du
Berceau n'est **pas** touchée.

**L'entrepôt en déficit.** Poser un entrepôt, provoquer un déficit, relire les
plafonds.

Attendu : les trois plafonds sont **inchangés** — le rapport ne s'applique qu'à la
production (FR-023b, R21) — mais la consommation de l'entrepôt figure bien dans
`consumed` et a donc dégradé le rapport des extracteurs.

**Aperçu.** Demander l'aperçu d'une amélioration qui ferait basculer en déficit.

Attendu : le nouveau rapport et la production effective résultante sont annoncés
**avant paiement**.

### US4 — Améliorer un bâtiment (P4)

Attendu : l'ensemble des cases occupées est identique à la case près (I-7) ;
l'aperçu affiche coût, durée, production actuelle, production résultante et leur
différence ; avec des ressources insuffisantes, le refus énonce le manque **par
ressource** et le temps restant pour payer au rythme courant.

Vérifier aussi que la charge `upgrade` **n'a aucun champ** de variante ou
d'orientation : c'est ce qui rend FR-039 inviolable.

### US5 — Déblayer une case obstruée (P5)

Sélectionner (3,2), consulter l'aperçu, payer, attendre l'échéance.

Attendu : l'aperçu annonçait « geyser de Jus » ; la case devient libre et porte un
geyser de Jus. Rien de caché, rien de tiré au sort. Deux joueurs déblayant la même
case obtiennent le même résultat (US5-3).

### US6 — Démolir pour réorganiser (P6)

Démolir un bâtiment de niveau 3.

Attendu : le remboursement annoncé vaut la fraction publiée du coût cumulé des
**trois** niveaux ; à l'achèvement les cases redeviennent libres, **les gisements
qu'elles portaient sont intacts**, et la production a cessé à l'instant exact de
l'échéance — pas à celui de la constatation.

Provoquer un remboursement dépassant un plafond : le montant écrêté est annoncé
**avant confirmation** (FR-049), ce qui est calculable exactement parce qu'aucune
autre transition ne peut survenir entre le lancement et l'échéance (R3, R4).

### US7 — Étendre sa capacité de stockage (P7)

Attendu : les trois plafonds augmentent du montant annoncé avant la pose ; le temps
avant saturation est affiché au rythme courant ; une ressource saturée cesse de
croître et **la quantité perdue est comptabilisée et consultable**.

Vérifier le cas d'absence : saturer pendant trois semaines, relire.

Attendu : la ressource vaut **exactement** son plafond, la durée de saturation et
la quantité perdue sont affichées (US1-5).

### US8 — Consulter les règles de calcul (P8)

Ouvrir l'écran de règles. Prendre un échantillon de tous les chiffres affichés sur
la planète — coûts, durées, productions, capacités, temps avant saturation — et les
recalculer à la main depuis cette seule page.

Attendu : **aucun écart** (SC-002). Toute production affichée se décompose en ses
quatre facteurs — valeur de base du type, facteur de niveau, gisements recouverts,
rapport d'énergie — dont le produit redonne la valeur affichée.

Cet écran est **généré depuis `packages/catalogs`** (R15). Rien n'y est rédigé à la
main : un rééquilibrage met la page à jour sans qu'on y pense, ce qui est la seule
façon qu'elle reste vraie.

---

## 5. Les trois tests qu'aucun raisonnement ne remplace

Doc de stack §7.4. S'ils manquent, la tranche n'est pas livrée.

| Test | Scénario | Attendu |
| --- | --- | --- |
| **Concurrence** | deux commandes simultanées sur la même planète | sérialisées sans perte ; si les deux lancent un chantier, exactement une réussit |
| **Idempotence** | même `Idempotency-Key` deux fois | un seul effet, la seconde réponse rejoue la première |
| **Autorisation dans la transaction** | l'occupant de la planète change entre la lecture et l'écriture | la commande est **rejetée** (FR-007) |

Le troisième est le moins intuitif et le plus important : les planètes sont
conçues pour changer d'occupant. Vérifier la propriété puis muter laisse un
intervalle qui est ici une **mécanique de jeu**, pas une hypothèse théorique.

---

## 6. Ce qui n'est pas validé par ce guide, et pourquoi

- **Le rendu des composants** : au titre du principe V, doc de stack §7.7. Ce qui
  est testé du client, c'est le **chemin clavier** et l'accessibilité — ce qui
  vérifie que la règle « l'interaction passe par des éléments du document
  focalisables » est encore respectée dans six mois.
- **Un simulacre de PostgreSQL** : il testerait le simulacre, pas le SQL. Or
  verrous, transactions et contraintes sont précisément ce qui doit être vérifié.
- **La cryptographie de Supabase** : la frontière `jeton → identifiant de joueur`
  est un adaptateur isolé, testé sur des jetons de fixture. Les tests
  d'intégration injectent l'identifiant et vérifient l'autorisation, pas la
  signature.
- **La couverture globale** : elle se mesure sur `packages/domain` uniquement. Un
  chiffre mélangeant interface et domaine ne veut rien dire.
