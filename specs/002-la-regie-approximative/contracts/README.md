# Contrats de la tranche 002

**Branche** : `002-la-regie-approximative` | **Date** : 2026-08-27

## Aucun contrat HTTP ne bouge

La règle d'abord, parce qu'elle décide du reste : **cette tranche ne touche
aucune route, aucun schéma Zod, aucune version de contrat.** Les trois routes
`/v1` de 001 sont inchangées, leurs instantanés de JSON Schema doivent rendre
exactement le même résultat, et `packages/contracts` n'est pas modifié.

Ce n'est pas un effet du hasard : c'est FR-029 et l'hypothèse centrale de la
spécification. Tout ce que l'écran habillé montre de nouveau — les douze états de
case, l'adresse courte, la raison d'un refus, l'ancienne valeur d'une rature —
est **dérivé** de ce que 001 projette déjà. Une rature qui exigerait de persister
l'ancienne valeur serait une donnée nouvelle, donc un contrat nouveau ; elle ne
l'exige pas, et c'est pourquoi elle est un état de client.

La conséquence est vérifiable : la suite `contracts` doit passer sans qu'un seul
de ses fichiers ait changé.

## Ce qui est contractuel dans cette tranche

Le principe IV parle de « toute frontière franchie par des données ». Ici, la
frontière n'est pas le réseau : c'est **l'écran lui-même**, franchi par un
joueur, un clavier et un lecteur d'écran. Ce sont ces frontières que les deux
documents ci-dessous décrivent, et que les tests éprouvent.

| Document | Ce qu'il fige | Ce qui échoue si la forme change |
| --- | --- | --- |
| [`ui-parcelle.md`](./ui-parcelle.md) | l'ordre du document, les noms accessibles, les crochets `data-*`, le protocole de la région d'annonce, les commandes clavier | tests de rendu (`game-dom`), parcours de bout en bout |
| [`jeu-de-valeurs.md`](./jeu-de-valeurs.md) | la correspondance entre `tokens.json` et `tokens.css`, la table des couples de contraste | test de conformité, test de contraste, `color-contrast` d'axe |

## Pourquoi les crochets `data-*` sont contractuels

Un test de parcours a besoin de désigner une case et de lire son état sans
dépendre d'une couleur ni d'une position à l'écran. En 001, `data-state`,
`data-deposit`, `data-ghost`, `data-cap`, `data-fill`, `data-lost`,
`data-saturated-for`, `data-refusal` et `data-energy` remplissent déjà ce rôle,
et les parcours les emploient.

Cette tranche en ajoute — `data-glyphe`, `data-trait`, `data-marque`,
`data-emprise`, `data-adresse`, `data-etat`, et `data-role-texte` sur les blocs de
décor — et
**n'en retire aucun**. Un attribut retiré casse un parcours de
001, ce qui est précisément le signal qu'on veut : un crochet de test est une
promesse faite au test, et la casser doit se voir dans le diff.

## Versionnage

Ces contrats n'ont pas de version : ils décrivent un écran, pas une donnée
échangée entre deux systèmes qui évoluent à des rythmes distincts. Un changement
s'y fait en corrigeant le document **et** le test dans le même commit — ce que le
principe I appelle résoudre l'écart explicitement.
