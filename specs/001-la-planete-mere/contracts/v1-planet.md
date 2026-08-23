# Contrat `v1` — la planète

**Conventions communes** : [README.md](./README.md) — versionnement, idempotence,
modèle d'erreur, discipline de schéma. Ce document ne les redit pas.

Trois routes. Pas quatre : il n'y a **ni endpoint d'aperçu** (R8), **ni endpoint de
catalogue** (R15).

| Méthode | Chemin | Rôle | Pure ? |
| --- | --- | --- | --- |
| `POST` | `/v1/me/planet` | provisionner la planète du joueur, idempotente | non |
| `GET` | `/v1/me/planet` | lire l'instantané daté | **oui** (FR-031) |
| `POST` | `/v1/me/planet/works` | lancer un chantier | non |

---

## 1. La réponse commune : l'instantané daté

Les trois routes retournent **la même forme**. Elle porte l'instantané, **pas
l'état projeté** : le client rejoue la projection localement avec le même code que
le serveur (doc de stack §4.7, R8). C'est ce qui permet aux compteurs de progresser
sous les yeux du joueur sans un seul appel réseau.

```
PlanetSnapshotV1
  serverInstant    entier ≥ 0                 — secondes UTC ; base du calcul de décalage
  catalogVersion   chaîne, 1..64              — divergence détectable côté client (R15)
  planet
    id             uuid
    archetypeId    'berceau'                  — union littérale du catalogue
    layoutId       chaîne, 1..64
    ownerId        uuid
    occupantId     uuid                       — notion distincte (FR-006)
    consolidatedAt entier ≥ 0                 — l'instant de référence de l'instantané
  holdings         tableau, exactement une entrée par ressource
    resourceId     'camelote' | 'jus' | 'bave-etoiles'
    amountGrains   entier, 0..2^53−1          — grains : 1/3600 unité (R1)
    lostGrains     entier, 0..2^53−1          — perte cumulée par saturation (FR-026)
  buildings        tableau, 0..36
    id             uuid
    typeId         'mine' | 'puits' | 'racloir' | 'centrale' | 'entrepot'
    variantId      'single' | 'line-2' | 'square-4' | 'l-4' | 't-4' | 'rect-6' | 'square-9'
    orientation    entier, 0..3
    anchorX        entier, 0..15
    anchorY        entier, 0..15
    level          entier, 1..30
  clearedCells     tableau, 0..36 de { x: 0..15, y: 0..15 }
  work             null | ScheduledWorkV1

ScheduledWorkV1
  id         uuid
  startedAt  entier ≥ 0
  dueAt      entier ≥ 0                       — l'effet court depuis cet instant (FR-032)
  target     union discriminée sur `nature` :
    { nature: 'build',    typeId, variantId, orientation, anchorX, anchorY }
    { nature: 'upgrade',  buildingId }
    { nature: 'demolish', buildingId }
    { nature: 'clear',    x, y }
```

**Absents de la réponse, parce que dérivables par le client** : quantités
courantes, plafonds, taux nominaux et effectifs, rapport d'énergie, temps avant
saturation, cases occupées de chaque bâtiment, gisements, état obstrué des cases,
coûts cumulés, temps restant du chantier. Les envoyer serait dupliquer un calcul
que le client fait déjà — et créer deux vérités là où le monorepo n'en veut qu'une.

**Un chantier échu et non consolidé apparaît toujours dans `work`.** C'est normal
et nécessaire : c'est la projection locale qui l'applique, à `dueAt`. Le `GET`
n'écrit rien, y compris après trois semaines d'absence.

---

## 2. `POST /v1/me/planet` — provisionner

Installe le joueur sur son Berceau (FR-001). Idempotente : appelée deux fois, elle
retourne la même planète.

**Requête** : corps vide. En-têtes : `Authorization`, `Idempotency-Key`.

**Réponses** :

| Statut | Corps |
| --- | --- |
| `201` | `PlanetSnapshotV1` — planète créée |
| `200` | `PlanetSnapshotV1` — planète déjà existante |
| `401` | erreur |

Le joueur est **propriétaire et occupant** de sa planète (FR-006). La disposition
et le stock de départ viennent du catalogue, sans aucun tirage au sort (FR-003,
FR-019) : deux comptes créés indépendamment reçoivent une planète identique
(SC-008).

Deux appels concurrents ne créent jamais deux planètes : l'index unique sur
`owner_id` le garantit, et la transaction perdante retourne `200`.

---

## 3. `GET /v1/me/planet` — lire

**Fonction pure.** Aucune écriture, aucune consolidation, aucun provisionnement
(FR-031, R11).

**Requête** : en-tête `Authorization`.

**Réponses** :

| Statut | Corps |
| --- | --- |
| `200` | `PlanetSnapshotV1` |
| `404` | `planet-not-provisioned` |
| `401` | erreur |

---

## 4. `POST /v1/me/planet/works` — lancer un chantier

**Requête** — union discriminée **fermée** sur `nature`, quatre variantes et rien
d'autre :

```
{ nature: 'build',    typeId, variantId, orientation: 0..3, anchorX: 0..15, anchorY: 0..15 }
{ nature: 'upgrade',  buildingId: uuid }
{ nature: 'demolish', buildingId: uuid }
{ nature: 'clear',    x: 0..15, y: 0..15 }
```

En-têtes : `Authorization`, `Idempotency-Key`.

**Ce que le corps ne peut pas contenir** — et il n'y a pas de champ pour le
contenir : `cost`, `duration`, `dueAt`, `production`, `refund`, `result`,
`clientNow`, ni quelque horodatage que ce soit. Une charge qui en porte un est
rejetée en `400` pour clé inconnue. C'est la forme mécanique de FR-055 à FR-057,
et c'est un test (README §8).

Le champ `orientation` est présent uniquement pour `build`, parce que la variante
et l'orientation sont figées à la pose et pour la vie du bâtiment (FR-010) : une
amélioration n'a **pas de champ** pour les changer, ce qui rend FR-039
inviolable par le contrat lui-même.

**Réponses** :

| Statut | Corps |
| --- | --- |
| `201` | `PlanetSnapshotV1` — instantané **après** débit et planification |
| `409` | `RefusalV1` — refus de règle de jeu |
| `403` | `not-occupant` |
| `400` | violation de schéma |
| `401` | erreur |

Le `201` retourne l'instantané consolidé : le client n'a aucun `GET` à enchaîner,
et son extrapolation reprend immédiatement sur une base fraîche.

Le coût est débité **au lancement** (FR-036) ; les effets s'appliquent à
l'échéance. Le chantier n'est ni annulable ni remplaçable (FR-037) : aucune route
ne le permet, ce qui est plus solide qu'un refus.

---

## 5. `RefusalV1` — l'union fermée des motifs

```
{ code: <ci-dessous>, message: chaîne, details: <selon le code>, requestId: chaîne }
```

`message` est un libellé lisible ; **il n'est jamais la source de vérité.** Le
client dérive son affichage de `code` et de `details`, jamais du texte.

| `code` | `details` | Exigence servie |
| --- | --- | --- |
| `work-in-progress` | `{ workId, nature, dueAt }` | FR-034, SC-006 — le motif **et** l'échéance du chantier en cours |
| `insufficient-resources` | `{ shortfall: [{ resourceId, grains }], secondsUntilAffordable: entier \| null }` | FR-035, SC-007, US4-3 — le manque **par ressource**, et le temps restant pour payer au rythme courant |
| `placement-out-of-grid` | `{ cells: [{x, y}] }` | FR-012, FR-013 |
| `placement-on-obstructed-cell` | `{ cells: [{x, y}] }` | FR-012, FR-013, US2-2 |
| `placement-on-occupied-cell` | `{ cells: [{x, y}] }` | FR-012, FR-013, US2-2 |
| `variant-not-available-for-type` | `{ typeId, variantId }` | FR-009 |
| `building-not-found` | `{ buildingId }` | — |
| `building-is-work-target` | `{ workId }` | cas limite : démolir la cible du chantier en cours |
| `max-level-reached` | `{ buildingId, level }` | borne de catalogue |
| `cell-not-obstructed` | `{ x, y }` | FR-042 — déblayer une case libre |
| `not-occupant` | `{}` — **403** | FR-007 |
| `planet-not-provisioned` | `{}` — **404** | R11 |

**`secondsUntilAffordable` vaut `null`** quand le taux de production courant ne
permettra jamais d'atteindre le montant — parce que la ressource sature avant.
C'est une information utile et non un cas d'erreur : elle dit au joueur qu'il lui
faut d'abord un entrepôt.

Un refus **ne consomme pas** la clé d'idempotence : le joueur peut corriger son
intention et réémettre avec la même clé.

---

## 6. Ce que ce contrat rend structurellement impossible

Récapitulatif, parce que c'est l'essentiel de ce document :

| Exploit | Pourquoi il est hors d'atteinte |
| --- | --- |
| Annoncer un coût minoré | Aucun champ de coût dans aucune entrée |
| Antidater une action pour gagner du temps | Aucun horodatage client dans aucune entrée ; l'instant est le `now()` de la transaction |
| Lancer deux chantiers depuis deux onglets | Index unique `(planet_id) where resolved_at is null` — la seconde transaction échoue |
| Dépenser deux fois par un réessai réseau | Reçu d'idempotence : la seconde tentative rejoue la première réponse |
| Changer l'empreinte d'un bâtiment en l'améliorant | La charge `upgrade` ne porte que `buildingId` |
| Poser un bâtiment sur une case occupée | Validé par le domaine **dans la transaction verrouillée**, et garanti par une clé primaire |
| Agir sur la planète d'un autre | L'autorisation est vérifiée sur l'occupant de la ligne verrouillée, jamais sur le jeton |
