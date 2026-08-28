# Choix de stack et architecture du socle

**Date** : 2026-08-23
**Statut** : validé
**Portée** : transversale — ce document précède la première spécification fonctionnelle
et sera cité par tous les `plan.md` ultérieurs.
**Autorité** : ce document expose le raisonnement. Les décisions opposables sont
reportées dans [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md),
qui prévaut en cas de divergence.

---

## 1. Contexte

Zaliba est un jeu web de stratégie spatiale au tour long, dans la lignée d'OGame
mais modernisé et sans pay2win. Vision produit, personas et périmètre :
[`README.md`](../../README.md).

Le projet est développé par **une seule personne**. Cette contrainte n'est pas un
détail d'organisation : elle est le premier critère d'arbitrage de tout ce
document. À plusieurs endroits, l'option techniquement la plus élégante a été
écartée parce qu'elle déplaçait le risque du jeu vers la plateforme, alors que le
risque dominant d'un projet solo est de ne pas arriver au bout.

### Priorités, dans cet ordre

1. **Sécurité** — le jeu est compétitif : tout exploit détruit la confiance.
2. **Performance** — condition de l'adoption large et du coût maîtrisé.
3. **Accessibilité** — WCAG 2.1 AA, et conception permettant une adoption large.

### Contraintes d'entrée

| Contrainte | Origine |
| --- | --- |
| TypeScript de bout en bout | choix du porteur |
| SPA / PWA, avec application native comme cible | choix du porteur |
| PostgreSQL | choix du porteur, confirmé par l'analyse (§2.2) |
| Palier gratuit en alpha, quelques euros par mois en production | budget |
| Typage statique bout en bout, dépendances épinglées, domaine testable sans serveur ni navigateur ni base, autorisation côté serveur, WCAG 2.1 AA | constitution |

### Trajectoire de temps réel

Trois niveaux de présentation ont été distingués : **A** état statique rafraîchi
sur action, **B** événements poussés par le serveur, **C** état partagé
synchronisé entre joueurs.

**Décision** : livrer B, viser C. Ce qui exclut d'emblée toute plateforme
incapable de maintenir des connexions persistantes.

Distinction essentielle, qui a débloqué la contrainte de coût : **le niveau de
présentation et le modèle de simulation sont deux questions séparées**. Viser une
présentation C n'oblige pas à faire tourner une horloge — voir §4.

---

## 2. Décisions structurantes et alternatives écartées

Le principe I de la constitution exige que toute décision technique structurante
soit consignée avec l'alternative écartée et le motif du choix. C'est l'objet de
cette section.

### 2.1 Pas de méta-framework : SPA Vite + serveur séparé

**Retenu** : React + Vite en SPA, servie comme PWA, emballée par Capacitor pour le
natif. Serveur Fastify distinct.

**Écarté : Next.js.** Quatre motifs, par ordre de poids :

1. **L'application native.** Capacitor embarque un paquet client statique. Y
   parvenir avec Next exige `output: 'export'`, qui désactive Server Actions,
   rendu dynamique, middleware et revalidation — c'est-à-dire tout ce qui
   justifiait Next. Restait à maintenir deux interfaces distinctes : rédhibitoire
   en solo.
2. **Le rendu serveur n'apporte rien ici.** Le jeu est derrière authentification
   (aucun référencement à gagner), les données sont propres à chaque joueur
   (rien à mutualiser en cache) et les compteurs de ressources sont extrapolés
   côté client à partir d'un horodatage — une valeur rendue au serveur est
   périmée à son arrivée.
3. **Le temps réel.** Next n'a pas de WebSocket, et les fonctions serverless ne
   maintiennent pas de connexion persistante. Le modèle B exigerait un service
   séparé : la simplification « un seul projet » s'effondre exactement là où le
   projet va.
4. **Le contrat implicite.** Une Server Action est un appel distant dont le
   contrat est compilé dans le paquet client, sans version ni schéma explicite.
   Inconsommable par un client natif, et incompatible avec l'exigence de contrats
   versionnés du principe IV.

**Condition de réexamen** : l'abandon de l'application native rendrait Next
défendable.

**Écarté : tRPC**, malgré son typage supérieur : il couple la version du client à
celle du serveur. Des clients natifs anciens et non forçables circuleront sur les
magasins d'applications ; le principe IV exige une fenêtre de compatibilité que
tRPC ne sait pas exprimer naturellement.

**Écarté : Angular + NestJS**, bien que maîtrisés par le porteur. Le système de
modules de Nest est la meilleure réponse toute faite à l'exigence
d'extensibilité, mais le poids d'Angular pèse sur une PWA mobile visant
l'adoption large, et la cérémonie de Nest entre en friction directe avec le
principe V — beaucoup de code d'infrastructure pour peu de jeu. Réserve
complémentaire : la prise en charge clavier du glisser-déposer du CDK Angular est
historiquement plus faible que celle de ses équivalents React, ce qui toucherait
la grille de construction.

**Écarté : Cloudflare Workers + Durable Objects.** Techniquement la réponse la
plus élégante à la cible C — un acteur à état par système solaire ou par bataille,
connexions WebSocket hibernables, pour un coût dérisoire. Écarté parce qu'il
imposerait à un développeur seul d'apprendre un modèle d'exécution non standard,
sur un environnement contraint où toute bibliothèque supposant Node peut faire
défaut, avec un accès à Postgres nécessitant une couche supplémentaire.
**Reste greffable plus tard** sur la seule fonctionnalité qui le réclamerait.

### 2.2 PostgreSQL, et non une base documentaire

**Écarté : Firebase / Firestore.** Trois motifs dirimants :

1. **Modèle de coût hostile.** Firestore facture à la lecture de document. Une
   vue de galaxie affichant cent planètes coûte cent lectures, par ouverture et
   par joueur. Le palier gratuit se consomme avec quelques dizaines de joueurs.
   La promesse « sans pay2win » implique des revenus tardifs : un coût qui croît
   en lectures d'affichage est inacceptable.
2. **Les règles de sécurité ne peuvent pas porter les règles de jeu.** Elles
   savent exprimer « ce joueur peut lire ce document », jamais « cette
   construction est autorisée si les prérequis technologiques sont acquis et si
   les ressources disponibles à l'instant T couvrent le coût ». Cette validation
   exigerait des Cloud Functions — donc un backend classique, dans le modèle
   d'exécution le plus contraint et le plus cher.
3. **L'absence de relationnel.** Classements, requêtes de galaxie par
   coordonnées, agrégats d'alliance, dépense transactionnelle de ressources :
   chacune deviendrait une dénormalisation à maintenir cohérente à la main, donc
   une source de bugs d'équilibrage et d'exploits.

**Argument décisif en faveur de Postgres** : le marché libre exige des
transactions atomiques et isolées — deux acheteurs sur la même offre ne doivent
jamais réussir tous les deux.

### 2.3 Supabase comme fournisseur d'infrastructure, jamais comme backend

Supabase et Firebase se vendent sur la même promesse — *le client parle
directement à la base, plus besoin de backend*. **Cette promesse ne s'applique
pas à un jeu compétitif** : toute mutation est une décision de jeu qui doit être
arbitrée par une autorité que le joueur ne contrôle pas.

**Décision** : louer l'**authentification**, **Postgres** et le **stockage**.
Garder sous autorité propre **toute mutation de l'état de jeu**.

L'authentification est louée délibérément : sécurité en priorité n° 1 et
développeur seul, écrire son propre système d'authentification est le meilleur
moyen de produire la faille la plus classique du web.

### 2.4 Drizzle plutôt qu'un ORM à couche d'abstraction

Le marché libre impose des transactions concurrentes et les vues de galaxie
imposent des requêtes indexées finement. Il faut **voir le SQL produit**.
Performance en priorité n° 2 : cela se décide là.

### 2.5 Contrats Zod partagés et versionnés, via ts-rest

Chaque frontière franchie par des données est un schéma Zod dans un paquet
importé par le client **et** par le serveur. Le serveur valide à l'exécution, le
client dérive ses types de la même source : une divergence devient une erreur de
compilation.

`ts-rest` est retenu comme couche de routage contractuelle : contrat d'abord,
routes explicitement versionnables, et export OpenAPI — utile pour la
transparence promise au persona P4.

### 2.6 Rendu : DOM et SVG pour l'interface, canvas 2D ciblé

Trois options examinées : tout en DOM/SVG, hybride, ou WebGL généralisé. Le
WebGL généralisé est écarté : il transformerait l'accessibilité en seconde
interface à construire et maintenir en parallèle, avec un coût en poids de
téléchargement et en batterie contraire à l'ambition d'adoption large.

**Retenu** : DOM et SVG pour l'interface, canvas 2D (Pixi) pour la carte
galactique zoomable et le simulateur de bataille animé.

**Règle non négociable** : **le canvas est une vue, jamais le contrôle.**
L'interaction réelle — sélectionner une case, placer un bâtiment, choisir une
cible — passe par des éléments DOM focalisables ; le canvas ne fait que rendre
un état dont le document reste la source de vérité. L'accessibilité devient
structurelle au lieu d'être une couche rapportée, et l'état complet du jeu reste
lisible et outillable, ce qui sert directement P4.

### 2.7 Capacitor plutôt que React Native

Une seule interface à écrire et à maintenir. React Native imposerait une seconde
interface complète pour un gain nul sur un jeu de gestion.

### 2.8 Combat déterministe

Mêmes flottes, même résultat, toujours. Le simulateur devient **exact** : ce
qu'il annonce est ce qui se produira — exactement ce que réclame P4.

**Écarté : combat avec aléa.** Plus proche du genre, mais il exigerait qu'une
graine soit tirée par le serveur au moment de la résolution (jamais avant, sinon
l'attaquant connaîtrait l'issue et annulerait ses défaites), et réduirait le
simulateur à un afficheur de probabilités.

**Motif de l'ordre retenu** : on ne peut pas retirer l'aléa d'un jeu sans casser
les acquis des joueurs ; on peut toujours l'ajouter localement plus tard si
l'équilibrage le réclame.

### 2.9 Hébergement

**Retenu** : Supabase (authentification, Postgres, stockage) + un conteneur
applicatif long chez un PaaS conteneurisé.

**Écarté : serverless / edge** — incompatible avec les connexions persistantes du
modèle B et rendant la cible C difficile.

**Écarté : VPS auto-géré** — meilleur rapport performance/euro, mais toute
l'exploitation (TLS, correctifs, sauvegardes testées, supervision, réponse aux
incidents) incomberait à une seule personne. Avec la sécurité en priorité n° 1,
c'est le poste de risque le plus sous-estimé.

**Réalité budgétaire consignée** : le palier gratuit de Supabase couvre largement
l'alpha et au-delà ; son premier palier payant est aux alentours de 25 $ par
mois, sans marche intermédiaire. Il n'existe plus de palier réellement gratuit
pour un processus long : compter **4 à 6 € par mois dès l'alpha** pour le
conteneur applicatif.

---

## 3. Le monorepo et les frontières

```
zaliba/
├── apps/
│   ├── game/          # SPA Vite + React — client de jeu, PWA, emballée par Capacitor
│   ├── api/           # Fastify — serveur autoritaire
│   └── site/          # Astro + Starlight — site public, guides, référence générée
├── packages/
│   ├── catalogs/      # contenu de jeu déclaratif et typé
│   ├── domain/        # règles du jeu, fonctions pures
│   ├── contracts/     # schémas Zod et routes versionnées
│   └── db/            # schéma Drizzle et migrations
├── docs/architecture/ # ce document
└── specs/             # spécifications Spec Kit
```

Un monorepo sans règles de dépendance n'est qu'un gros dossier. Les règles sont
la substance de cette section.

| Paquet | Peut importer | Ne doit jamais importer | Motif |
| --- | --- | --- | --- |
| `catalogs` | rien | — | Feuille de l'arbre : des données et leurs types, aucun comportement. |
| `domain` | `catalogs` | `db`, `contracts`, HTTP, React | Principe II rendu physique. Testable sans serveur, navigateur ni base. |
| `contracts` | `catalogs` | **`domain`** | Voir ci-dessous. |
| `db` | `catalogs` | `domain`, `contracts` | Le schéma de persistance est une préoccupation d'infrastructure. |
| `api` | tout | — | Seul lieu où les quatre se rencontrent. |
| `game` | `domain`, `catalogs`, `contracts` | **`db`** | Frontière de sécurité : le client ne connaît pas la base. |
| `site` | `catalogs`, `domain` | `db`, `contracts` | Génère la référence, embarque les calculatrices. |

### La règle contre-intuitive : `contracts` n'importe pas `domain`

La tentation est de réexporter les types de domaine sur le réseau plutôt que de
les redéclarer. Mais un contrat réseau et un type interne ont des **cycles de vie
différents**. Si le contrat réexporte le domaine, une refactorisation interne
modifie silencieusement le format transmis et casse les clients natifs anciens
sans qu'aucune compilation n'échoue. **La duplication est ici volontaire** : elle
rend la rupture visible. C'est le prix du principe IV, et il est modique.

### `game` importe `domain`

C'est ce qui garantit que le simulateur de bataille et la validation de grille
côté client donnent **exactement** le même résultat que l'arbitrage serveur.
C'est la raison technique fondamentale du choix « TypeScript partout », et elle
se matérialise dans cette seule ligne.

### Comment ces règles tiennent sans discipline personnelle

- **pnpm ne remonte pas les dépendances.** Un paquet ne peut importer que ce
  qu'il déclare : la moitié des violations devient impossible à écrire, pas
  seulement interdite.
- **`dependency-cruiser` en porte bloquante de CI**, avec ces règles écrites.
  Le principe II est vérifié à chaque poussée — ce qui vaut mieux qu'une
  relecture humaine quand on est seul à relire.

**Capacitor** vit dans `apps/game` : il consomme la sortie de compilation de la
SPA et génère les projets natifs à côté. Pas de second client dans le monorepo.

---

## 4. Le modèle de temps

C'est la section qui décide des priorités performance et sécurité ; tout le reste
en découle.

### 4.1 On persiste un état daté, jamais un état courant

Une planète ne stocke pas `ferraille: 15234`. Elle stocke **la valeur au dernier
instant de consolidation, et cet instant**. Les taux de production se déduisent
des niveaux de bâtiments, qui sont stockés.

L'état courant n'existe donc nulle part en base : c'est une **projection**,
fonction pure, calculée à la demande.

```
projeter(instantané, catalogues, à: Instant) -> ÉtatCourant
```

Consulter son empire ne modifie rien.

### 4.2 La consolidation : le seul moment où l'on écrit

On n'écrit qu'à une **transition** — chantier lancé, bâtiment achevé, flotte
partie, échange conclu. À cet instant : projeter jusqu'à maintenant, appliquer la
décision, écrire le nouvel instantané daté.

**Propriété de performance fondamentale** : un joueur inactif coûte zéro écriture
et zéro calcul. Mille comptes dormants ne consomment rien. On ne paie que le jeu
réellement joué — ce qui rend les petits hébergements viables.

### 4.3 Les événements datés

Fin de chantier, arrivée de flotte, recherche achevée : des lignes en base
portant une échéance. Deux déclencheurs de résolution :

- **À la lecture**, pour ce qui n'est observable que par son propriétaire. Aucun
  ordonnanceur nécessaire.
- **À l'échéance**, pour ce dont un tiers doit être informé — une attaque doit
  atterrir même si personne ne regarde, sinon le défenseur n'est pas notifié et
  la flotte de l'attaquant ne repart jamais.

Le second cas se traite par une **boucle frugale, pas par une horloge** :

```sql
SELECT ... FROM events
WHERE resolve_at <= now()
ORDER BY resolve_at
LIMIT 50
FOR UPDATE SKIP LOCKED
```

Le processus traite le lot puis **dort jusqu'à la prochaine échéance connue** au
lieu de battre à intervalle fixe. `SKIP LOCKED` rend l'ensemble sûr si un second
processus est lancé un jour.

### 4.4 La propriété qui rend l'hébergement frugal possible

**La résolution est horodatée par l'échéance, jamais par l'instant d'exécution.**
Un événement dû à 14 h 03 et traité à 14 h 19 s'applique comme s'il s'était
produit à 14 h 03. Combiné à l'idempotence — un événement résolu est marqué, le
retraiter ne fait rien — cela signifie que **le serveur peut tomber, redémarrer,
s'endormir ou être déployé sans qu'aucun état ne soit corrompu ni perdu**.

Un serveur qui doit faire tourner une horloge ne peut jamais s'interrompre.
Celui-ci peut.

### 4.5 Une forme unique pour toutes les commandes

Chaque mutation, sans exception, dans une transaction :

**verrouiller l'agrégat** → **résoudre les événements échus** → **projeter à
maintenant** → **valider par le domaine** → **appliquer** → **écrire
l'instantané daté**

Une seule forme à écrire, tester et auditer. Le domaine dit oui ou non ; la
couche serveur ne décide rien.

Pour le marché, la concurrence se règle sans niveau d'isolation exotique, par une
revendication atomique en une instruction :

```sql
UPDATE offers SET status = 'taken', taken_by = $1
WHERE id = $2 AND status = 'open'
RETURNING *
```

Zéro ligne retournée signifie « quelqu'un a été plus rapide ». Deux acheteurs ne
peuvent structurellement pas réussir tous les deux.

### 4.6 L'horloge est un paramètre, jamais un appel

Aucune fonction de `domain` n'appelle l'horloge système. L'instant est **toujours
un argument explicite**.

C'est ce qui rend un jeu dont le sujet *est* le temps réellement testable au sens
du principe III : un test devient « avec cet instantané, ce catalogue et trois
jours écoulés, j'attends exactement ces ressources ». Pas d'attente, pas
d'horloge simulée, pas de test instable — et six mois de jeu vérifiables en une
milliseconde.

Côté serveur, l'instant de référence est le `now()` de la transaction Postgres,
cohérent pour toutes les lectures d'une même commande. **L'horloge du client
n'est jamais une source de vérité.**

### 4.7 Le client : extrapolation locale

Le client reçoit `{ instantané, taux, instantServeur }`, calcule une fois son
décalage, et anime ses compteurs par extrapolation locale — **sans un seul appel
réseau**. Resynchronisation au retour d'onglet, à chaque action, et
périodiquement. C'est le même `projeter` que le serveur, importé depuis `domain`.

---

## 5. Les frontières de modules

Deux natures d'extensibilité, **deux mécanismes distincts**. Les confondre est la
façon classique de rater les deux.

### 5.1 Le contenu comme données

Ajouter un bâtiment, un vaisseau, une technologie, une ressource ou un archétype
de planète ne doit **jamais** être écrire du code.

Le piège serait de rendre les données si expressives qu'elles deviennent un
langage de script — un interpréteur de formules dans le catalogue, donc une
surface d'attaque et un cauchemar de mise au point, que le principe V refuserait.

**Solution** : un vocabulaire fermé de **courbes nommées et paramétrées**
(géométrique, linéaire, palier) et une famille fermée d'**effets**. Le catalogue
ne fait que les paramétrer.

Le critère de placement de la couture est la **fréquence** : ajouter un bâtiment
est fréquent, donc c'est une donnée ; ajouter une forme de courbe inédite est
rare, donc c'est du code délibéré dans `domain`.

Deux bénéfices dérivés :

- Les identifiants sont dérivés du catalogue en unions littérales : **ajouter une
  ressource fait échouer la compilation partout où un traitement exhaustif l'a
  oubliée.** Le compilateur devient la liste de tâches — précieux quand on est
  seul et qu'on revient sur son code après trois semaines.
- Le rééquilibrage devient une modification de données, visible en diff,
  relisible, qui régénère la documentation publique.

### 5.2 Les mécaniques comme tranches verticales

```
packages/domain/
├── kernel/           # temps, projection, ressources, planète, vocabulaire d'effets
└── modules/
    ├── construction/  recherche/  flotte/  combat/
    └── alliance/  marché/  diplomatie/  expéditions/
```

Deux règles d'import :

**`kernel` n'importe jamais un module.** Aucune exception. Le jour où le noyau
connaît le nom d'une mécanique, l'extensibilité est morte — et cela ne se
remarquera que trois modules plus tard.

**Un module peut dépendre d'un autre, le long d'un graphe déclaré et acyclique.**
Choix assumé plutôt que la fiction de modules parfaitement indépendants :
`combat` a réellement besoin de connaître la composition d'une flotte, et
interdire ces liens produirait des contorsions pires que le problème.
`dependency-cruiser` interdit les cycles. Un module dont trois autres dépendent
est un signal : il mérite d'être promu dans `kernel`.

### 5.3 La couture décisive : un module ne mute rien

Un module n'écrit **jamais** dans l'état. Il reçoit une projection en lecture
seule et **retourne une description d'effets** que le noyau applique :

```
(état, commande, catalogues) -> Résultat<Effet[]>
```

Le vocabulaire d'effets est un ensemble fermé détenu par le noyau : créditer des
ressources, en débiter, poser un niveau de bâtiment, planifier un événement daté,
en annuler un, déplacer une flotte, notifier un joueur.

Un module d'expédition peut ainsi accorder des ressources sans jamais savoir
comment elles sont persistées, projetées ou consolidées. Le noyau reste **seul
détenteur de l'autorité et de la cohérence temporelle**. Et un module se teste
comme une fonction pure : un état en entrée, une liste d'effets en sortie, aucun
simulacre.

Ajouter un effet inédit est une modification du noyau : rare, délibérée,
attentivement relue. C'est le comportement attendu d'un point d'extension.

### 5.4 Ce que « sans toucher au noyau » signifie exactement

Ajouter une mécanique **n'est pas** déposer un dossier et rien d'autre. Une ligne
d'enregistrement de routes, une migration, une entrée de navigation seront
écrites. C'est sain : un système où un dossier se branche seul exige registre,
découverte dynamique et inversion de contrôle — machinerie que le principe V
rejette pour un développeur seul ajoutant une mécanique tous les deux mois.

**La promesse tenable** : ni `kernel` ni un autre module n'auront à être modifiés
pour en ajouter un. L'ajout est additif ; l'existant n'est pas rouvert.

### 5.5 Une mécanique, sept endroits

| Couche | Apport du module |
| --- | --- |
| `catalogs` | ses données déclaratives |
| `domain/modules/x` | ses règles pures et ses effets |
| `db` | ses tables et sa migration, préfixées |
| `contracts` | ses routes versionnées et ses schémas |
| `api` | l'enregistrement de ses routes — une ligne |
| `game` | ses écrans et son entrée de navigation |
| `site` | sa page de référence, générée depuis `catalogs` |

Les mini-jeux sont le cas le plus léger : presque tout vit dans `game`, et le
domaine ne porte qu'une commande de réclamation de récompense — validée,
plafonnée, horodatée contre la répétition. Le serveur n'a pas besoin de rejouer
le mini-jeu, seulement d'en borner le gain.

---

## 6. La sécurité

### 6.1 La posture Supabase : se défendre par l'absence

Supabase expose Postgres via PostgREST. La configuration attendue consiste à
restreindre cet accès par des politiques RLS. **Décision plus radicale : ne pas
exposer du tout.**

Les tables de jeu vivent dans un **schéma non déclaré aux schémas exposés** de
PostgREST. Pas une politique restrictive : **pas d'API du tout**. Une politique
peut être mal écrite, oubliée sur une nouvelle table, contournée par une jointure
inattendue. Une table qu'aucune interface HTTP n'atteint n'a aucune de ces
failles. C'est la seule catégorie de défense qui ne se dégrade ni avec le temps
ni avec la fatigue.

| Élément | Où il vit | Statut |
| --- | --- | --- |
| Clé `anon` | dans le paquet client, publique par conception | **Ce n'est pas un secret**, c'est un identifiant de projet. Ne rien construire sur son secret. |
| Clé `service_role` | variable d'environnement de `apps/api`, exclusivement | Compromission totale si elle fuite. Jamais dans `game`, `site`, ni un journal. |
| RLS | activée partout, **refus par défaut**, aucune politique permissive sur les tables de jeu | Deuxième ligne. Sauve en cas d'exposition accidentelle d'un schéma. |

### 6.2 L'authentification se loue, l'autorisation ne se délègue jamais

**Authentification** : Supabase émet un JWT ; l'API en vérifie la signature
**localement**, sans appel réseau par requête. On en extrait une seule
information : *qui*.

**Autorisation** : jamais dans le jeton. Un jeton portant « propriétaire des
planètes 12, 47, 93 » serait faux dès qu'une planète change de main — et le jeu
est précisément conçu pour que les planètes changent d'occupant.

**Règle** : **l'autorisation se vérifie à l'intérieur de la même transaction que
la mutation**, sur l'état verrouillé. Vérifier la propriété puis muter sont deux
opérations séparées par un intervalle pendant lequel la planète peut être
capturée. Ici, cet intervalle est une mécanique de jeu, pas une hypothèse
théorique.

### 6.3 Le client envoie une intention, jamais un résultat

| Le client envoie | Verdict |
| --- | --- |
| « j'envoie 40 chasseurs vers 3:127:8 en attaque » | Intention irréductible — accepté |
| « je place ce bâtiment sur la case 12 » | Intention irréductible — accepté |
| « le combat me coûte 12 chasseurs, j'ai gagné » | Résultat — recalculé par le serveur |
| « cette construction coûte 340 de ferraille » | Dérivable — lu au catalogue |
| « le trajet prend 1 h 12 » | Dérivable — recalculé |

**Règle plus forte** : tout ce que le serveur peut dériver **n'est pas validé, il
est absent du contrat**. On ne vérifie pas que le coût annoncé est correct — le
schéma n'a pas de champ pour l'annoncer. Un champ qu'on ne peut pas envoyer est
un champ qu'on ne peut pas exploiter, et une vérification qu'on ne peut pas
oublier six mois plus tard.

Le combat déterministe rend l'ensemble propre : les entrées suffisent, le serveur
recalcule, et le résultat est reproductible pour arbitrer une contestation.

### 6.4 La validation aux frontières

Chaque requête est **analysée** par son schéma Zod, jamais transtypée.

- **Schémas fermés** : refus des clés inconnues. Aucun champ clandestin qu'un
  code futur lirait peut-être.
- **Bornes sur tous les nombres** : entiers, minimum zéro, maximum plausible. Les
  quantités négatives et les débordements sont les deux exploits les plus
  fréquents des jeux de gestion. La borne appartient au schéma, pas au métier.
- **Clé d'idempotence sur toute commande** : la cible est une application mobile
  sur réseau instable ; une requête réémise ne doit jamais dépenser deux fois. Le
  client génère la clé, le serveur la stocke, la seconde tentative retourne le
  premier résultat.

### 6.5 Le marché libre : enregistrer, puis désamorcer par la conception

C'est là que le jeu se fera exploiter. Par ordre de rapport valeur/effort :

**Journal d'audit immuable des transferts, dès le premier jour.** En ajout seul :
qui, vers qui, quoi, quand, dans quel contexte. Ce n'est pas une protection,
c'est le substrat de toute enquête future — et **la seule mesure de cette liste
qu'on ne peut pas rattraper** : une histoire non enregistrée est perdue
définitivement.

**Désamorcer par la conception plutôt que par la police.** Le multi-comptes
alimentant un compte principal ne se combat pas efficacement par la détection,
mais en rendant le transfert *non rentable* : taxe ou plafond d'échange indexé
sur l'écart de développement entre les parties. Une règle de jeu ne se trompe pas
et n'exige pas d'arbitrage humain ; une sanction, si.

**Non-transférabilité structurelle du cosmétique.** Non pas « les échanges de
cosmétiques sont interdits », mais : les droits cosmétiques vivent dans une table
**sans aucun chemin de transfert**. Aucun code ne peut les déplacer. C'est ce qui
rend la promesse « sans pay2win » vérifiable plutôt que déclarative — car dès
qu'un marché libre existe, tout objet achetable en argent réel et échangeable
rend l'argent réel convertible en puissance.

**Détection de collusion en second temps** : corrélation d'adresses, flux de
ressources à sens unique, horaires. Signale, n'agit pas automatiquement — un faux
positif qui bannit un joueur honnête coûte plus cher que l'exploit.

### 6.6 L'automatisation : ce qui marche, et ce qui est du théâtre

On ne peut pas empêcher les robots dans un jeu web. Ce qui fonctionne : limiter
le débit **par compte** et non par adresse ; concevoir les mécaniques pour
qu'aucune ne récompense la répétition rapide ; détecter la régularité surhumaine
dans les journaux et agir manuellement.

Ce qui est du théâtre : obfusquer le client. Cela échoue toujours, et **contredit
frontalement la promesse de transparence faite à P4**. L'architecture met
d'ailleurs dans la bonne posture par construction : le serveur étant seul arbitre
et le combat déterministe, un robot ne gagne que de la régularité, jamais de la
puissance. C'est un problème d'équité de confort, pas d'intégrité.

### 6.7 Le client natif

Les jetons vont dans le **stockage sécurisé de la plateforme** (Keychain,
Keystore) via Capacitor, jamais dans le stockage local du navigateur embarqué.
Jetons d'accès de courte durée, rotation du jeton de rafraîchissement, révocation
possible côté serveur.

**Un client natif ancien continuera d'exister sur les téléphones.** La discipline
de versionnement des contrats est donc une mesure de sécurité autant qu'un
principe : c'est ce qui permettra de corriger une faille côté serveur sans casser
les clients qu'on ne peut pas mettre à jour.

### 6.8 Journalisation et secrets

Un **identifiant de corrélation** par requête, **propagé jusqu'au résolveur
d'événements** — sinon une attaque résolue en différé est intraçable jusqu'à son
origine. Liste noire explicite de ce qui n'est jamais journalisé : jetons,
adresses de courriel, clé de service.

---

## 7. Tests et portes de qualité

Les décisions des sections 4 et 5 rendent le test-first facile : l'horloge est un
paramètre, le domaine est pur, les modules retournent des effets. Presque aucun
simulacre n'est nécessaire.

### 7.1 Le domaine — la grande majorité des tests

Fonctions pures, instant explicite, aucune entrée-sortie. Les tests s'exécutent
en microsecondes et ne peuvent pas être instables.

**Tests par propriétés** (fast-check) : ils valent beaucoup plus qu'ailleurs sur
un jeu d'économie, car les bogues d'équilibrage ne se trouvent pas par des
exemples choisis mais par des invariants soumis à des milliers d'entrées.

- une ressource n'est jamais négative, quel que soit l'enchaînement de commandes ;
- projeter à `t+n` puis `t+m` équivaut à projeter directement à `t+n+m` ;
- dépenser puis projeter, ou projeter puis dépenser au même instant, sont
  équivalents ;
- **aucune séquence de commandes légales ne produit de ressources à partir de
  rien** — le garde-fou anti-exploit le plus rentable, car il cherche activement
  la faille économique non imaginée.

### 7.2 Les catalogues — des tests de cohérence

Les données de jeu ont besoin d'être **validées**, pas testées au sens habituel :
chaque prérequis référence un identifiant existant ; l'arbre technologique est
acyclique ; toute ressource citée existe ; aucun orphelin ni doublon ; les coûts
sont strictement croissants avec le niveau.

Une faute de frappe dans un identifiant après un rééquilibrage est l'erreur la
plus fréquente. Ces tests coûtent une heure et en épargnent beaucoup.

**Test d'instantané d'équilibrage** : un fichier de référence des coûts, durées
et productions calculés pour chaque bâtiment aux niveaux 1 à 30. Toute
modification apparaît comme un **diff explicite à approuver**. Le jeu ne sera
jamais rééquilibré par accident.

### 7.3 Les contrats — le principe IV rendu mécanique

**Instantané du schéma** : le JSON Schema dérivé de chaque contrat versionné est
figé en fichier de référence. Modifier une forme fait échouer le test : il faut
alors assumer le diff ou créer une version.

**Échantillons enregistrés par version** : pour chaque version supportée, une
charge utile réelle conservée en fixture, qui doit continuer à être acceptée.
C'est la **fenêtre de compatibilité rendue testable** — la seule façon de savoir,
avant de déployer, qu'on n'a pas cassé les clients natifs anciens.

### 7.4 Le serveur — intégration sur un vrai Postgres

Pas de simulacre de base : il testerait le simulacre, pas le SQL — or verrous,
transactions et contraintes sont précisément ce qui doit être vérifié. Un
conteneur Postgres, les migrations appliquées, une transaction par test annulée à
la fin.

Trois familles obligatoires, parce qu'aucun raisonnement ne les remplace :

- **Concurrence** : deux acheteurs sur la même offre, exactement un réussit ;
  deux commandes simultanées sur la même planète, sérialisées sans perte.
- **Idempotence** : même clé de commande deux fois, un seul effet.
- **Autorisation dans la transaction** : une commande sur une planète dont
  l'occupant a changé entre-temps est rejetée.

### 7.5 Le client — peu, mais aux bons endroits

Le calcul de décalage d'horloge et l'extrapolation vivent dans `domain`, donc
sont déjà couverts.

**Le chemin clavier des zones interactives** est un test, pas une bonne
intention : c'est la vérification que la règle « le canvas est une vue, jamais le
contrôle » est encore respectée dans six mois.

**Trois parcours de bout en bout au maximum** sous Playwright : inscription puis
première construction, envoi d'une flotte, achat au marché. Avec **axe-core en
porte bloquante** dans ces parcours : une exigence d'accessibilité non mesurée
est une exigence abandonnée.

### 7.6 Le déterminisme du combat

Un jeu de scénarios de bataille avec leurs issues en fichiers de référence. Toute
modification du code de combat changeant une issue échoue bruyamment. C'est ce
qui garantit **pour toujours** que le simulateur annonce ce que le serveur
appliquera — promesse faite à P4 qui ne peut tenir que par un test.

### 7.7 Ce qui n'est pas testé

Au titre du principe V : pas de tests de rendu de composants, pas de simulacre de
Postgres, pas de couverture à 100 %, pas de test sur du code sans décision.

La **couverture se mesure sur `packages/domain` uniquement**, avec un seuil
versionné qui ne peut que monter. Une couverture globale mélangeant interface et
domaine est un chiffre qui ne veut rien dire, et la constitution ne demande la
non-régression que sur le domaine.

### 7.8 Les portes de CI

| Porte | Outil | Ce qu'elle protège |
| --- | --- | --- |
| Types | `tsc --noEmit`, tous paquets | La cohérence de bout en bout |
| Format et lint | Biome | La lisibilité |
| **Frontières de paquets** | dependency-cruiser | **Le principe II**, mécaniquement |
| Domaine et propriétés | Vitest, fast-check | Les règles du jeu |
| Cohérence des catalogues | Vitest | Les données |
| Contrats et compatibilité | Vitest, instantanés | Le principe IV et les clients anciens |
| Intégration | Vitest, conteneur Postgres | Verrous, transactions, autorisation |
| Parcours et accessibilité | Playwright, axe-core | Les priorités 1 et 3 |
| Vulnérabilités | audit de dépendances | La chaîne d'approvisionnement |
| Fuite de secrets | gitleaks | L'irréversible |
| Seuil de couverture domaine | Vitest | La non-régression |

Toutes bloquantes, aucune consultative.

---

## 8. Versions épinglées

Versions publiées relevées le 2026-08-23. Elles sont reportées dans la
constitution et devront être épinglées exactement dans les manifestes.

| Rôle | Paquet | Version |
| --- | --- | --- |
| Environnement d'exécution | Node.js (LTS « Krypton ») | 24.19.0 |
| Gestionnaire de paquets | pnpm | 11.22.0 |
| Orchestrateur monorepo | turbo | 2.10.11 |
| Langage | typescript | 6.0.3 |
| Interface | react / react-dom | 19.2.8 |
| Compilation client | vite | 8.2.2 |
| PWA | vite-plugin-pwa | 1.3.0 |
| Routage client | @tanstack/react-router | 1.170.32 |
| État serveur | @tanstack/react-query | 5.102.1 |
| Glisser-déposer accessible | @dnd-kit/core | 6.3.1 |
| Rendu canvas 2D | pixi.js | 8.20.0 |
| Serveur HTTP | fastify | 5.12.1 |
| Schémas | zod | 3.25.76 |
| Contrats | @ts-rest/core, @ts-rest/fastify, @ts-rest/open-api | 3.52.1 |
| Accès aux données | drizzle-orm | 0.45.2 |
| Pilote PostgreSQL | postgres (postgres.js) | 3.4.9 |
| Vérification de JWT | jose | 6.2.10 |
| CORS | @fastify/cors | 11.3.0 |
| Journal structuré | pino | 10.3.1 |
| Migrations | drizzle-kit | 0.31.10 |
| Client d'infrastructure | @supabase/supabase-js | 2.112.3 |
| Emballage natif | @capacitor/core, cli, ios, android | 8.5.0 |
| Site public et documentation | astro | 7.2.4 |
| Documentation | @astrojs/starlight | 0.41.7 |
| Tests | vitest, @vitest/coverage-v8 | 4.1.11 |
| Tests par propriétés | fast-check | 4.9.0 |
| Intégration | testcontainers | 12.1.0 |
| Parcours | @playwright/test | 1.62.1 |
| Accessibilité | @axe-core/playwright | 4.13.0 |
| Lint et format | @biomejs/biome | 2.5.10 |
| Frontières de paquets | dependency-cruiser | 18.2.0 |
| Polices auto-hébergées | @fontsource/archivo, archivo-narrow, jetbrains-mono, saira-stencil-one | 5.3.0 |

**@fontsource/\*** : ajoutés le **2026-08-28** par la tranche
[002 — La Régie approximative](../../specs/002-la-regie-approximative/plan.md).
Quatre paquets de **contenu statique**, sans code exécutable, exigés par FR-004 de
cette tranche : *l'écran doit s'afficher complet sans aucune requête vers un domaine
tiers*, et le dossier de design charge ses polices depuis Google Fonts en le
signalant lui-même comme inacceptable ici. Vite émet les `woff2` dans le paquet
compilé et réécrit les `@font-face` en chemins relatifs, sans configuration.

Licence **OFL-1.1** pour les quatre, vérifiée à l'installation. L'alternative écartée
est `presetWebFonts` du dossier de design, qui charge depuis Google ; le repli nommé
d'avance est le `woff2` téléchargé et sous-ensemblé à la main, qui coûte un binaire
versionné et aucune voie de mise à jour.

**Un écart relevé par exécution** : *Archivo Narrow n'a pas de graisse 800*, que le
dossier de design demande — son axe de graisse s'arrête à 700, et ce n'est pas une
lacune du paquet mais de la famille. La graisse est donc plafonnée à 700 ; déclarer
800 sans fichier produirait une graisse **synthétique**, c'est-à-dire un rendu que le
dossier n'a jamais mesuré, obtenu en silence. Le relevé complet est en
[`specs/002-la-regie-approximative/verdicts.md`](../../specs/002-la-regie-approximative/verdicts.md).

**typescript** : relevé à 7.0.2 le 2026-08-23, **corrigé à 6.0.3 le 2026-08-26**
sur verdict d'exécution. `dependency-cruiser` 18.2.0 parcourt **zéro module**
sous la ligne 7 et rapporte un succès : la porte du principe II devient inerte
sans qu'aucun signal ne l'annonce. Sous 6.0.3, elle parcourt le graphe. Le reste
de la chaîne — zod, ts-rest, Fastify, Drizzle, Vitest, fast-check, Biome — passe
indifféremment sous les deux lignes ; c'est donc le gardien qui décide.

**zod** : relevé à 4.4.3 le 2026-08-23, **corrigé à 3.25.76 le 2026-08-26** sur
verdict d'exécution. zod 4 est incompatible au typage avec `@ts-rest/*` 3.52.1 —
les réponses déclarées au contrat s'effondrent en `any`. Le relevé et son
protocole sont en
[`specs/001-la-planete-mere/research.md` § R17](../../specs/001-la-planete-mere/research.md) ;
la contrainte est portée par l'amendement 2.1.0 de la constitution.

**fastify** : `@ts-rest/fastify` 3.52.1 déclare un peer `fastify@^4.0.0`. La
vérification du 2026-08-26 montre que le greffon **fonctionne** avec Fastify
5.12.1 : route servie, validation de corps effective. La version épinglée reste
5.12.1 ; l'écart de peer se traite par `pnpm.peerDependencyRules`, jamais par un
contournement de code.

**jose, postgres.js, @fastify/cors, pino** : versions relevées à l'installation le
2026-08-26 (T055), et épinglées exactement dans `apps/api/package.json`. `pino`
n'était pas au relevé initial : il est arrivé avec le journal structuré de T040,
dont la liste noire est la raison d'être.

**PostgreSQL 17** — relevé le 2026-08-26. C'est la majeure que le provisionnement
Supabase impose (`supabase/config.toml`, `[db] major_version = 17`), et l'image
locale est `public.ecr.aws/supabase/postgres:17.6.1.141`.

**Elle correspond au `postgres:17-alpine` du harnais d'intégration**, épinglé dans
`apps/api/tests/integration/harness.ts`. L'écart que la version précédente de ce
document signalait n'existe donc pas — ce qui compte, parce que les contraintes
qui portent des règles de jeu (index partiel de `works`, clé primaire de
`building_cells`) doivent être vérifiées sur le moteur que la production exécute,
et non sur un voisin.

Les deux valeurs sont à tenir ensemble : changer l'une sans l'autre remettrait
l'écart en place, cette fois sans que rien ne le dise.

---

## 9. Ce qui reste à décider

- **Nom des ressources.** « Métal » est jugé trop sérieux ; un registre plus
  loufoque est souhaité. Sans effet technique dès lors que les ressources sont
  des données déclaratives et non des colonnes nommées en dur.
- **Règle de relecture pour un développeur seul.** La constitution exige une
  relecture par un tiers, inapplicable en solo. Traité par amendement — voir la
  constitution.
- **Modélisation propriétaire / occupant.** Le jeu dissocie le propriétaire d'une
  planète de son occupant courant. À modéliser comme deux notions distinctes dès
  la première spécification : les rattraper avec un marché et des alliances déjà
  en place serait une migration douloureuse.
- **Règles du marché libre.** Mécanique la plus risquée du projet, sur la
  sécurité comme sur la promesse « sans pay2win ». Mérite sa propre
  spécification, avant le marché lui-même.
- **Fournisseur PaaS pour le conteneur applicatif.** Décision d'exploitation, à
  prendre au premier déploiement.
