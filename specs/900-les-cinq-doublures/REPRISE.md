# Reprise — où en est la tranche 900

**Écrit le 2026-08-30**, avant une remise à zéro du contexte de conversation.
**Mis à jour le 2026-08-31 : la tranche 003 est implémentée, 900 est
débloquée.** Ce que 003 a réellement livré est consigné au § 9, qui est à lire
avant de replanifier.
Ce document existe pour qu'on reprenne le sujet sans rien redécouvrir. Il dit
l'état, les décisions **déjà prises** (à ne pas rouvrir), les faits vérifiés, et
la marche à suivre.

---

## 1. État en une phrase

**900 est spécifiée et n'est plus bloquée : la tranche 003 — Le Gong est
implémentée, et le levier de rythme du banc d'essai existe désormais.**

| Tranche | Branche | État | Artefacts |
| --- | --- | --- | --- |
| **003 — Le Gong** | `003-le-gong` | **implémentée** | `spec.md`, `plan.md`, `research.md` (G1–G17), `data-model.md`, `contracts/v1-gong.md`, `quickstart.md`, `tasks.md`, `checklists/` |
| **900 — Les cinq doublures** | `900-les-cinq-doublures` (créée, vide) | **spécifiée seulement** | `spec.md`, `checklists/`, ce fichier |

**Rien n'est commité.** Les deux répertoires de spécification sont en non suivi.
La branche `900-les-cinq-doublures` a été créée puis quittée ; le travail s'est
poursuivi sur `003-le-gong`.

---

## 2. Comment on en est arrivé là

Le besoin initial était : *cinq comptes de test aux stades P0–P4, et des temps
de construction drastiquement réduits en local*. Trois designs se sont succédé,
et **les deux premiers ont été invalidés par des chiffres**, pas par un avis.

### Design 1 — catalogue aux durées divisées ❌

Diviser les durées de chantier par N. **Invalidé** : cela n'accélère pas
l'accumulation des ressources. Une mine de niveau 1 sur deux gisements produit
30 unités/heure ; son niveau 2 en coûte 150. À ×60 le chantier durerait 2 s et
l'attente **5 heures réelles**. Le testeur pourrait observer des états, pas
jouer.

### Design 2 — horloge de jeu accélérée ❌

Faire s'écouler le temps du jeu N fois plus vite. Cohérent, et minuscule à
implémenter. **Rejeté par l'utilisateur** : l'écran annoncerait « 2 min » là où
2 secondes s'écoulent. Exigence formulée alors : *« si le temps de construction
est de 2 sec, je veux que 2 sec soit affiché »*, et *« le serveur doit rester la
source unique de vérité ; un miroir asynchrone client/serveur pose problème avec
les clients qui ne se mettent pas à jour »*.

### Design 3 — le Gong ✅ (retenu)

Proposé par l'utilisateur. Le temps cesse d'être un *réglage* pour devenir une
**unité** : le catalogue déclare en gongs et en grains par gong, chaque serveur
déclare la longueur de son gong. Durées et production sont alors couplées **par
l'unité elle-même**, et ne peuvent plus diverger. L'affichage montre des
secondes réelles. Le serveur annonce la longueur au client dans la réponse qui
porte l'état.

Cela a fait sortir le sujet de l'outillage : le Gong est du **vocabulaire de
jeu**, d'où la scission en deux tranches.

---

## 3. Décisions arbitrées — ne pas rouvrir

| # | Décision | Motif |
| --- | --- | --- |
| 1 | **Deux tranches** : 003 (jeu) puis 900 (outillage) | le Gong touche catalogue, contrat, domaine et page de règles ; le semis non |
| 2 | **Bande `9xx` = outillage**, `0xx` = jeu | évite de décaler la feuille de route du jeu pour du banc d'essai ; convention à inscrire dans `CLAUDE.md` |
| 3 | **003 décale la feuille de route** : système solaire 003 → **004**, suivantes d'autant | le Gong, lui, est bien une tranche de jeu |
| 4 | **États fabriqués par rejeu d'intentions** à travers le domaine, jamais par fixture écrite en base | garantit l'atteignabilité ; un état inatteignable produit des rapports de défauts fantômes |
| 5 | **Le gong descend jusqu'à la déclaration, pas jusqu'au domaine** | la profondeur native rouvrirait `time.ts`/`projection.ts` et rendrait les compteurs extrapolés de 002 trompeurs entre deux gongs |
| 6 | **Gong canonique = 10 s** | validé par l'utilisateur ; c'est le PGCD exact des quinze durées du catalogue |
| 7 | **Porte de CI + tâche de tranche imposée** pour tenir les comptes à jour | la porte empêche la régression, la tâche force l'enrichissement |

---

## 4. Faits vérifiés — ne pas les recalculer

- **Le PGCD des quinze durées du catalogue vaut exactement 10 secondes.**
  `buildDuration` 120/150/200/90/100 · `demolitionSeconds` 300/420/600/240/180 ·
  obstacles 300/900/1800/2700/3600. En gongs : 12/15/20/9/10, 30/42/60/24/18,
  30/90/180/270/360.
- **Au gong canonique, l'égalité est stricte sur 230 valeurs** (durées des cinq
  types sur tous leurs niveaux, taux des trois extracteurs sur trente niveaux) —
  à condition de résoudre **la base de la courbe** puis d'évaluer, jamais
  l'inverse. C'est la décision G4 de 003.
- **Un gong trop court aplatit l'équilibrage.** À `1/6` (×60), mine et puits se
  résolvent tous deux sur 2 s, centrale et entrepôt sur 1 s.
  → **Pour le banc d'essai, retenir `GONG_SECONDS=1/2` (×20)** : bases 6, 7, 10,
  4, 5, toutes distinctes, et l'attente d'une amélioration de mine tombe de 5 h à
  ~15 min. C'est la décision G6 de 003, et c'est ce que FR-017 de 900 exige.
- **Ajouter un champ à `PlanetSnapshotV1` casse un bundle client périmé** :
  le schéma est `.strict()` (`packages/contracts/src/v1/planet.ts:184`) et
  `apps/game/src/lib/planetGateway.ts` appelle `.parse()` en trois points.
  Écart au principe IV assumé et **borné à l'arrivée de Capacitor** — voir
  « Complexity Tracking » de `specs/003-le-gong/plan.md`.

---

## 5. Ce que 900 devra construire

Rien de tout cela n'est écrit ; c'est la conception pressentie, à confirmer en
`/speckit-plan`.

```
packages/seed/                    NOUVEAU paquet privé — le seul du dépôt
  src/scenarios/{p0..p4}.ts       à réunir catalogs + domain + db
  src/replay.ts                   rejeu pur : intentions → PlanetSnapshot
  src/accounts.ts                 les cinq utilisateurs GoTrue
  src/seed.ts                     l'orchestration
  tests/scenarios.test.ts         LA PORTE : les cinq rejouent sans refus
```

- **Comptes** : UUID fixes, `p0@zaliba.test` … `p4@zaliba.test`, mot de passe
  commun lu dans `ZALIBA_SEED_PASSWORD` (jamais versionné), créés via
  `POST /auth/v1/admin/users` avec `email_confirm: true`.
- **Écriture** : par `writePlanet` (`packages/db/src/repository/snapshot.ts:294`).
- **Commandes** : `pnpm seed`, `pnpm seed --reset`.
- **Frontière** : règle `dependency-cruiser` **`rien-n-importe-seed`**, interdisant
  à `apps/*` et aux autres paquets d'en dépendre.
- **Porte** : nouveau projet Vitest `seed`, environnement `node`, **sans Docker**,
  ajouté à `pnpm -w test`.
- **Tenue à jour** : `.specify/templates/tasks-template.md` gagne une tâche finale
  obligatoire ; `CLAUDE.md` gagne le rappel correspondant.

---

## 6. Les cinq stades, pour mémoire

| Compte | Stade | Ce qu'il rend éprouvable |
| --- | --- | --- |
| **P0** | vierge, **sans planète** | le tout premier parcours, la grille intacte, les cinq obstacles |
| **P1** — Casu | 2 bâtiments niv. 1–2, 1 case déblayée, stock large | la progression guidée : rien à optimiser, aucun refus atteignable |
| **P2** — Assidu | 5 bâtiments niv. 2–4, un entrepôt, **un chantier en cours** | le palier suivant, le premier déficit d'énergie |
| **P3** — Investi | grille dense, **les trois empreintes de mine**, déblaiements multiples, déficit assumé, ressource **en saturation** | plusieurs axes simultanés, les compteurs à leur plafond |
| **P4** — Hardcore | niveau **maximal**, grille quasi pleine, saturation prolongée avec pertes, **démolition dans l'histoire**, chantier en cours | les cas limites : `max-level-reached`, `no-space`, `work-in-progress` |

---

## 7. Marche à suivre

1. ~~Finir 003 d'abord.~~ **Fait le 2026-08-31.** Voir le § 9 pour ce qu'elle a
   livré, et ce qui a changé par rapport à ce qui était prévu.
2. **Reprendre 900.**
   ```bash
   git switch 900-les-cinq-doublures
   # relire ce fichier et spec.md, puis :
   /speckit-plan
   ```
3. **Avant de replanifier 900**, relire le § 9 : deux points de la spécification
   de 900 en dépendent directement — le nom de la variable et la forme de la
   longueur.

---

## 8. Points laissés ouverts

- **La longueur exacte du gong du banc d'essai.** `1/2` est recommandé (G6) mais
  n'a pas été formellement validé par l'utilisateur.
- **Le nom du paquet** : `packages/seed` est pressenti, pas arbitré.
- **La convention de bande `9xx`** n'est pas encore inscrite dans `CLAUDE.md` —
  elle a été décidée en conversation seulement.
- **La question ouverte de 003** — faire du gong l'unité **native** du domaine —
  est à consigner dans `docs/design/conception-du-jeu.md` par la tranche 003.

---

## 9. Ce que 003 a livré, et ce qui change pour 900

**Écrit le 2026-08-31, à la fin de l'implémentation de 003.**

### Le levier de rythme, dans sa forme définitive

| Ce que 900 doit savoir | La réponse de 003 |
| --- | --- |
| Le nom de la variable | **`GONG_SECONDS`**, lue par `apps/api` seul, dans la troisième section de `.env.example` — « configuration non secrète » |
| Sa forme | un **entier** (`10`) ou une **fraction entière** (`1/2`). Jamais un flottant : `1.5` est refusé au démarrage |
| Sa valeur recommandée pour le banc d'essai | **`1/2`**, soit ×20 ([G6](../003-le-gong/research.md#g6--un-gong-très-court-aplatit-les-écarts-entre-types)). C'est ce que FR-017 de 900 exige, et le motif tient : à `1/6`, mine et puits se résolvent tous deux sur 2 s, centrale et entrepôt sur 1 s — l'équilibrage s'aplatit et le banc d'essai cesse de représenter le jeu |
| Ce que ça donne | mine de niveau 1 : 6 s au lieu de 120 ; attente d'une amélioration de mine : ~15 min au lieu de ~5 h |
| Ce qui est obligatoire | la variable **est exigée** : un oubli refuse le démarrage, comme `DATABASE_URL`. Le semis devra donc la poser |

### Une correction à reporter dans la spécification de 900

**L'accumulation accélère aussi, et c'est le point qui rendait le premier design
de 900 inopérant.** 003 l'a d'abord manqué : ses documents de conception
écartaient « les dispositions » en bloc de la résolution, ce qui laissait
`baseProductionPerHour` — la **seule source de revenu d'une planète fraîche** —
au rythme canonique. Le test d'accumulation l'a montré par le calcul, et la
correction est consignée en [G13](../003-le-gong/research.md#g13--lénergie-les-coûts-et-les-capacités-ne-sont-pas-touchés).

Conséquence pour 900 : à `GONG_SECONDS=1/2`, **tout** est ×20 — chantiers,
production des extracteurs et production de base du Berceau. Un scénario de semis
peut donc compter sur le rapport pour atteindre un stade, sans avoir à créditer
des ressources à la main.

### Ce que 900 devra faire, que 003 n'a pas fait

- **Les scénarios sont à rejouer à travers le domaine**, et le domaine ne
  s'appelle plus avec `DEFAULT_CATALOGS` : cette constante **n'existe plus**. Il
  faut `resolveCatalogs(DECLARED_CATALOGS, gong)` — la longueur est un argument,
  et il n'y a plus de catalogue « par défaut ». C'est délibéré : un défaut
  silencieux est exactement ce que FR-007 de 003 refuse.
- **Le catalogue déclaré et le catalogue résolu sont deux types distincts.**
  Passer l'un pour l'autre ne compile pas, dans les deux sens. Le semis devra
  donc décider explicitement de sa longueur, ce qui est le bon défaut.
- **La convention de bande `9xx` est désormais inscrite** dans `CLAUDE.md` : le
  § 8 de ce document peut fermer ce point.

### Les points du § 8 qui restent ouverts

Le nom du paquet (`packages/seed`) et la longueur exacte du gong du banc d'essai
restent à arbitrer. `1/2` est recommandé et motivé ; il n'a pas été formellement
validé.
