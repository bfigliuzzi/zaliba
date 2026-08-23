# Contrats — conventions communes

**Spec** : [../spec.md](../spec.md) · **Plan** : [../plan.md](../plan.md) ·
**Version 1** : [v1-planet.md](./v1-planet.md)

Ces conventions sont l'application du **principe IV** de la constitution et de la
§6.3 du document de stack. Elles valent pour toutes les versions futures, pas
seulement pour 001.

---

## 1. Où vivent les contrats, et ce qu'ils n'importent pas

`packages/contracts` contient les schémas Zod et les définitions de routes
`ts-rest`. Il importe `catalogs` et **jamais `domain`**.

Cette règle est contre-intuitive et volontaire (doc de stack §3) : un contrat
réseau et un type interne ont des cycles de vie différents. Si le contrat
réexportait le domaine, une refactorisation interne modifierait silencieusement le
format transmis et casserait les clients natifs anciens **sans qu'aucune
compilation n'échoue**. La duplication est ici ce qui rend la rupture visible.

Conséquence pratique : `data-model.md` et `v1-planet.md` décrivent les mêmes
notions deux fois, avec des noms proches et des formes distinctes. C'est le prix
du principe IV, et il est modique.

## 2. Versionnement

- La version est **dans le chemin** : `/v1/…`. Elle n'est jamais implicite, jamais
  négociée par en-tête.
- **Compatible** — donc pas de nouvelle version : ajouter un champ *optionnel* de
  réponse, ajouter un code de refus à une union *documentée comme ouverte à
  l'extension côté client*, élargir une borne d'entrée.
- **Incompatible** — donc nouvelle version : retirer ou renommer un champ, rendre
  obligatoire un champ optionnel, resserrer une borne, changer un type, changer la
  sémantique d'un champ à forme constante.
- Une modification incompatible est livrée avec **sa nouvelle version, sa fenêtre
  de compatibilité et son plan de migration**. Supprimer une version encore
  consommée est interdit — un client natif ancien continuera d'exister sur les
  téléphones, et c'est ce qui permettra de corriger une faille serveur sans casser
  ce qu'on ne peut pas mettre à jour (doc de stack §6.7).
- Une version en fin de vie porte l'en-tête `Deprecation` et la date de retrait
  dans `Sunset`.

## 3. Ce qui est absent des schémas d'entrée, et pourquoi

**Règle** : tout ce que le serveur peut dériver **n'est pas validé, il est absent
du contrat**.

On ne vérifie pas que le coût annoncé par le client est correct : le schéma **n'a
pas de champ** pour l'annoncer. Un champ qu'on ne peut pas envoyer est un champ
qu'on ne peut pas exploiter, et une vérification qu'on ne peut pas oublier dans
six mois.

Sont donc absents, définitivement : coût, durée, instant d'achèvement, production,
gain, quantité de ressource, remboursement, résultat d'un déblaiement, validité
d'un placement, nombre de gisements recouverts, **et tout horodatage fourni par le
client**. FR-055, FR-056 et FR-057 ne sont pas des validations à écrire : ce sont
des champs à ne pas créer.

## 4. Discipline de schéma

Appliquée à **tous** les schémas d'entrée, sans exception (doc de stack §6.4) :

- **fermés** — les clés inconnues sont refusées, jamais ignorées. Aucun champ
  clandestin qu'un code futur lirait peut-être ;
- **bornés** — tout nombre est un entier, avec un minimum et un maximum
  plausibles. Les quantités négatives et les débordements sont les deux exploits
  les plus fréquents des jeux de gestion, et la borne appartient au **schéma**, pas
  au métier ;
- **analysés, jamais transtypés** — la requête traverse `parse`, pas un `as`.

## 5. Idempotence

Toute commande — donc tout `POST` — exige l'en-tête **`Idempotency-Key`** :

- généré par le client, format UUID, 36 caractères ;
- le serveur enregistre `(playerId, key) → réponse` dans `game.command_receipts` ;
- une seconde tentative avec la même clé **retourne le premier résultat**, à
  l'identique, avec l'en-tête `Idempotency-Replayed: true`. Elle ne dépense rien,
  ne lance rien.

Motif : la cible est une application mobile sur réseau instable. Une requête
réémise ne doit jamais dépenser deux fois.

## 6. Authentification

En-tête `Authorization: Bearer <jwt>`, jeton émis par Supabase, **signature
vérifiée localement** par JWKS (R12). Une seule information en est extraite :
*qui*. Aucun droit n'est lu dans le jeton : l'autorisation se vérifie dans la
transaction de mutation, sur l'état verrouillé (doc de stack §6.2).

Absence de jeton, jeton expiré, signature invalide : **401**, sans détail.

## 7. Modèle d'erreur

Une seule forme de corps d'erreur, pour toutes les routes et toutes les versions :

```
{ code: string, message: string, details?: object, requestId: string }
```

| Statut | Nature | Exemple |
| --- | --- | --- |
| **400** | violation de schéma, avant toute règle de jeu | `orientation` à 7, clé inconnue, `Idempotency-Key` absent |
| **401** | authentification | jeton absent ou invalide |
| **403** | autorisation | `not-occupant` |
| **404** | ressource absente | `planet-not-provisioned` sur un `GET` |
| **409** | **refus de règle de jeu** | chantier en cours, ressources insuffisantes, placement invalide |
| **500** | défaut serveur | corrélation par `requestId`, aucun détail exposé |

**Le 409 est la porte de toutes les règles de jeu.** Un refus n'est pas une erreur
technique : c'est une réponse du jeu, et son `code` appartient à une **union
fermée** documentée en [v1-planet.md](./v1-planet.md). FR-013, FR-034 et SC-007
exigent le **motif exact** — un booléen ou un message libre ne les satisfait pas.

`requestId` est l'identifiant de corrélation, présent dans chaque réponse d'erreur
et dans chaque ligne de journal. Ne sont jamais journalisés : jetons, adresses de
courriel, clé de service.

## 8. Comment ces contrats sont testés

Le principe IV rendu mécanique (doc de stack §7.3) :

| Test | Ce qu'il attrape |
| --- | --- |
| **Instantané de JSON Schema** — le schéma dérivé de chaque route est figé en fichier de référence | Toute modification de forme fait échouer le test : il faut assumer le diff ou créer une version. Aucune rupture silencieuse. |
| **Échantillon enregistré par version** — une charge utile réelle en fixture par version supportée | La fenêtre de compatibilité **rendue testable** : on sait, avant de déployer, qu'on n'a pas cassé les clients anciens. |
| **Test d'absence** — une charge portant `cost`, `duration`, `result` ou un horodatage client est **rejetée en 400** | La forme mécanique de FR-055 à FR-057. C'est le test qui prouve que le champ n'existe pas. |
| **Test de bornes** — valeurs négatives, hors bornes, non entières, `NaN` | La classe d'exploit la plus fréquente du genre. |
| **Export OpenAPI** — généré par `@ts-rest/open-api` | La transparence promise à P4 : les contrats sont publiables. |
