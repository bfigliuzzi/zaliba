# Reprise — état du projet à la mise en pause

**Projet mis en pause le 2026-09-10.**

Ce document dit l'état réel du dépôt, ce qui était en cours, comment redémarrer
la machine à froid, et ce qu'il ne faut pas refaire. Il ne duplique rien : les
contextes profonds sont pointés au § 7.

---

## 1. L'état des tranches

| Tranche | Tâches | État | Ce qui reste |
| --- | --- | --- | --- |
| **001 — La planète mère** | 171 / 171 | **close** | rien |
| **002 — La Régie approximative** | 115 / 119 | ouverte | **4 recettes humaines** : T103, T104, T105, T105a |
| **003 — Le Gong** | 81 / 84 | implémentée, **non close** | **3 portes de clôture** : T025, T077, T078 |
| **900 — Les cinq doublures** | 0 | **spécifiée seulement** | tout, après la clôture de 003 |

### Les branches, et laquelle vous voulez

| Branche | Ce qu'elle contient | À la reprise |
| --- | --- | --- |
| **`003-le-gong`** | **tout le travail** : 003 implémentée, la spécification de 900, cette note. Suivie sur `origin`. | **C'est ici qu'on reprend.** |
| `main` | l'état au 27 août — 001 et 002 fusionnées — plus un renvoi vers `003-le-gong` | ne rien y reprendre |
| `900-les-cinq-doublures` | **pointeur périmé**, resté sur la fusion de 002. Créée puis quittée, jamais poussée, elle ne contient **pas** le travail de 900 — celui-ci vit sur `003-le-gong`. | à supprimer et recréer depuis `003-le-gong` |

`.specify/feature.json` pointe sur `specs/003-le-gong`.

---

## 2. Ce qui était en cours

**003 est écrite mais pas constatée.** Ses trois tâches ouvertes ne sont pas du
code, ce sont des vérifications :

- **T025** — les dix parcours de `apps/game/tests/e2e/` passent **sans
  modification** à `GONG_SECONDS=10` (critère SC-008).
- **T077** — les **onze** portes exécutées dans l'ordre du § 3 du
  [quickstart de 003](../specs/003-le-gong/quickstart.md#3-ce-que-chaque-porte-doit-dire),
  et leurs sorties consignées.
- **T078** — revue du hors-périmètre : aucun équilibrage touché, aucune
  migration, `git diff --stat packages/db` vide.

**900 attend cette clôture** et rien d'autre. Sa spécification est écrite, son
plan ne l'est pas.

---

## 3. L'arbre au moment de la pause

Relevé du 2026-09-10, portes rapides uniquement.

| Porte | État |
| --- | --- |
| `pnpm typecheck` | **vert** |
| `pnpm boundaries` | **vert** |
| `pnpm test` | **vert** — 1 971 tests, 106 fichiers |
| `pnpm lint` | **rouge** — 3 erreurs cosmétiques |

Les trois erreurs de lint, dans leur détail :

- `apps/api/tests/integration/gong.test.ts:212` et `:214` — constantes hors
  camelCase. **Probablement volontaires**, calquées sur le nom de la variable
  d'environnement `GONG_SECONDS`. À arbitrer, pas à corriger machinalement : si
  le nom est délibéré, c'est la règle qu'il faut assouplir localement, pas le
  nom.
- `apps/game/tests/rules-generation.test.tsx` — formatage. `pnpm format` suffit.

**Non exécutées, faute de Docker et de Supabase démarrés** :
`test:integration`, `e2e`, `pnpm audit`, `gitleaks`, `test:coverage`. C'est
exactement le périmètre de T077 : la porte finale de 003 reste à passer, et
quatre des onze portes n'ont donc pas été vues depuis la pause.

---

## 4. Redémarrer à froid

```bash
node --version                          # doit dire v24.19.0 — cf. .nvmrc
pnpm install

cp .env.example .env                    # puis renseigner (voir ci-dessous)

node scripts/generate-signing-keys.mjs  # AVANT supabase start
supabase start                          # base et authentification locales

pnpm dev                                # client et API
```

**Deux pièges à ne pas redécouvrir :**

**L'ordre des deux commandes Supabase n'est pas indifférent.** Générer les clés
de signature *après* `supabase start` fait échouer le démarrage sur
`no signing key found`, ce qui ressemble à une panne d'installation et n'en est
pas une. Détaillé dans
[`specs/001-la-planete-mere/quickstart.md`](../specs/001-la-planete-mere/quickstart.md),
lignes 72 à 85.

**`GONG_SECONDS` est exigée.** Un oubli **refuse le démarrage**, au même titre
que `DATABASE_URL` — c'est délibéré : un repli silencieux sur la valeur
canonique masquerait une erreur de configuration, et un serveur qui bat au
mauvais rythme est indétectable de l'intérieur. Valeur canonique : `10`.

`supabase/signing_keys.json` et `.env` sont ignorés par git et **n'existent donc
pas sur une machine neuve** : les deux sont à régénérer.

---

## 5. La marche à suivre, dans cet ordre

1. **Fermer 003.** Trois portes, aucun code à écrire. Le travail est fait, il
   n'est pas constaté — et un critère non constaté est un écart implicite, ce
   que le principe I proscrit.
2. **T105a de 002, côté VoiceOver.** Solo, une heure, votre machine suffit.
   C'est le seul point du système dont la casse produit une valeur **fausse** —
   « niveau 2 3 » au lieu de « niveau 23 » — plutôt qu'une gêne. Un joueur
   aveugle à qui on annonce un mauvais niveau ne sait pas qu'il est trompé.
3. **900 — les cinq doublures.** `/speckit-plan` puis implémentation. Lire
   d'abord le § 9 de sa note de reprise (voir § 7 ci-dessous) : deux points de
   sa spécification en dépendent.
4. **Une séance avec trois ou quatre personnes extérieures**, les cinq doublures
   en place : T103 (nommer les douze états en niveaux de gris), T104, T105, puis
   trente minutes de jeu libre sans consigne. Une seule séance sert les recettes
   d'accessibilité **et** le test de jeu — les deux réclament les mêmes
   personnes, et c'est la raison d'être de 900.
5. **Puis 004 — le système solaire**, informé par ce que la séance aura donné.

---

## 6. Décisions restées ouvertes

- **La longueur du gong du banc d'essai.** `1/2` (×20) est recommandé et motivé
  par G6 de 003, mais **n'a jamais été formellement validé**.
- **Le nom du paquet de semis.** `packages/seed` est pressenti, pas arbitré.
- **Le gong comme unité native du domaine** — question ouverte de 003, à
  consigner dans `docs/design/conception-du-jeu.md`.
- **Le fournisseur PaaS** du conteneur applicatif. Ouvert depuis le document
  d'architecture, et sans objet tant qu'on teste en local.
- **Les trois erreurs de lint** du § 3.

---

## 7. Où lire quoi

Ces documents ne sont pas résumés ici, volontairement : un résumé dérive.

| Document | Ce qu'il porte |
| --- | --- |
| [`specs/900-les-cinq-doublures/REPRISE.md`](../specs/900-les-cinq-doublures/REPRISE.md) | **Le contexte profond de 900.** Les deux designs invalidés par des chiffres, les sept décisions à ne pas rouvrir, les faits vérifiés (le PGCD des quinze durées vaut exactement 10 s), les cinq stades P0–P4. **À lire avant de replanifier 900.** |
| [`docs/design/conception-du-jeu.md`](./design/conception-du-jeu.md) | Mécaniques arrêtées, feuille de route (§ 10), risques (§ 9), questions ouvertes (§ 11) |
| [`docs/architecture/2026-08-23-choix-de-stack.md`](./architecture/2026-08-23-choix-de-stack.md) | Décisions techniques et alternatives écartées |
| `specs/00*/quickstart.md` | Les recettes de recette et l'ordre des portes |
| [`.specify/memory/constitution.md`](../.specify/memory/constitution.md) | Ce qui prévaut sur tout le reste |

---

## 8. Ce qu'il ne faut pas faire en reprenant

**Ne pas enchaîner sur 004.** L'hypothèse qui porte les quatre tranches
suivantes — *ranger des polyominos est-il amusant* — n'a jamais été confrontée à
un joueur. C'est le motif écrit en face de 001 dans la feuille de route, et
c'est le même raisonnement qui a fait interposer 002 : sept planètes bâties sur
une hypothèse non testée coûteraient sept fois la même reprise.

**Ne pas classer T105a sans avoir entendu une synthèse vocale.** NVDA exige
Windows : machine virtuelle, poste prêté, ou scinder la tâche et **consigner**
que la moitié NVDA reste ouverte. La consigner, pas la fermer.

**Ne pas corriger les trois erreurs de lint machinalement** — voir § 3.

**Ne pas rouvrir les sept décisions arbitrées** du § 3 de la note de reprise de
900. Elles ont été payées, dont deux par des calculs qui ont invalidé des
designs entiers.
