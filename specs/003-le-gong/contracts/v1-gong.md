# Contrat `/v1` — le delta du Gong

**Plan** : [plan.md](../plan.md) · **Modèle** : [data-model.md](../data-model.md)

Un seul champ change de main. Ce document dit sa forme, son caractère
facultatif, ce que le client ne peut **pas** en faire, et le test qui tient
chacune de ces trois propriétés.

---

## 1. Le champ

Il s'ajoute à `PlanetSnapshotV1` — la réponse **commune aux trois routes** de
planète —, à côté de `serverInstant` et de `catalogVersion`, qui sont là pour la
même raison : le client ne date rien et ne dérive rien sans que le serveur le
lui ait dit d'abord.

```
PlanetSnapshotV1 {
  serverInstant   : entier de secondes UTC          # existant
  catalogVersion  : chaîne, 1 à 64 caractères       # existant
  gong?           : { num: entier > 0,              # NOUVEAU, facultatif
                      den: entier > 0 }             #   longueur en secondes
  planet          : …                               # existant, inchangé
  holdings        : …
  buildings       : …
  …
}
```

**Facultatif, et son absence n'est pas un accord**
([G9](../research.md#g9--le-champ-est-optionnel-et-son-absence-vaut-divergence)).
Un client qui ne reçoit pas de longueur de gong **n'affiche aucun chiffre
dérivé**, au lieu de se replier sur le gong canonique. Le repli afficherait des
chiffres d'apparence exacte pour un monde peut-être différent — la faute que
`catalogVersion.ts` a déjà nommée : *« croire à l'accord sur la foi d'une absence
ferait afficher des chiffres faux précisément quand on ne sait rien »*.

**Bornes.** `num` et `den` sont des entiers strictement positifs. Aucune borne
supérieure arbitraire : c'est la validation de démarrage du serveur qui refuse
une longueur dont les taux ne se résolvent pas en entiers (FR-006), et cette
règle-là ne s'exprime pas dans un schéma.

---

## 2. Ce que le client ne peut pas faire

**Aucune commande ne porte de longueur de gong**, et aucune n'en portera : le
client envoie une intention, jamais un résultat. Une durée, un coût et un rythme
sont tous dérivables par le serveur ; les accepter du client, ce serait accepter
qu'il les choisisse.

Les quatre corps de commande de `/v1` — `build`, `upgrade`, `demolish`, `clear` —
sont déclarés `.strict()`. Un champ `gong` y serait donc **rejeté à la
frontière**, et non ignoré. C'est la propriété qu'un test doit constater, plutôt
que de la supposer acquise.

---

## 3. Ce que le serveur garantit

| Garantie | Comment |
| --- | --- |
| La longueur annoncée est celle qui est **appliquée** | `buildApi` la dérive du catalogue résolu, jamais d'un import séparé ([G10](../research.md#g10--buildapi-dérive-ce-quil-annonce-de-ce-quil-applique)) |
| Elle est la **même pour tous les joueurs** du serveur | c'est un paramètre du processus ; aucune structure ne la porte par joueur (FR-019, FR-020) |
| Elle ne change pas en cours de vie du processus | lue une fois au démarrage, avec le reste de la configuration |

La première garantie est la plus importante, et c'est une garantie de **forme**,
pas de vigilance : un serveur qui annoncerait autre chose qu'il n'applique est
un état qu'on ne peut plus écrire.

---

## 4. La compatibilité, dite franchement

`PlanetSnapshotV1` est `.strict()` et `apps/game/src/lib/planetGateway.ts`
appelle `PlanetSnapshotSchema.parse(response.body)` en trois points. Un bundle
client **antérieur** rejettera donc la clé inconnue à l'analyse : l'ajout est
sémantiquement additif et techniquement **rupteur**
([G8](../research.md#g8--ajouter-un-champ-à-un-schéma-strict-casse-un-bundle-client-périmé)).

Aucune version `/v2` n'est ouverte. Le motif, son coût et **la condition qui
rouvrira la question** — l'arrivée d'un client à cycle de vie propre, c'est-à-dire
Capacitor — sont consignés en « Complexity Tracking » du plan, au titre du
principe IV.

---

## 5. Les tests de contrat

Le principe IV exige qu'un test échoue si la forme des données change. Cinq
propriétés, cinq tests :

| # | Propriété | Ce que le test constate |
| --- | --- | --- |
| 1 | La forme du champ | un instantané portant `gong: { num, den }` est accepté |
| 2 | Le refus des valeurs impossibles | `num` ou `den` nul, négatif ou non entier est **rejeté** |
| 3 | Le caractère facultatif | un instantané **sans** `gong` reste valide |
| 4 | L'interdiction côté commande | un corps de commande portant `gong` est **rejeté**, pour les quatre natures |
| 5 | La rigueur conservée | un instantané portant une clé inconnue reste rejeté — l'ajout n'a pas relâché `.strict()` |

Le cinquième est celui qu'on oublie : ajouter un champ à un schéma strict est
l'occasion classique d'assouplir le schéma « en passant ».
