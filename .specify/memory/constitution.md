<!--
Sync Impact Report
Version change: 2.0.0 → 2.1.0
Type de bump: MINOR — extension matérielle d'une règle existante. La section
« Stack technique » exige un amendement MINOR pour toute montée de version
majeure d'un élément de sa liste; « schémas Zod » y figure, et zod descend de la
ligne 4.x à la ligne 3.x.
Motif: verdict d'exécution R17, consigné dans
specs/001-la-planete-mere/research.md § « Verdicts d'exécution — relevés le
2026-08-26 ». zod 4.4.3 est incompatible AU TYPAGE avec @ts-rest/* 3.52.1: les
`responses` du contrat s'effondrent en `{ [x: string]: any }` et `tsc --noEmit`
échoue (TS2322). Reproduit à l'identique sous TypeScript 5.9.3 et 7.0.2 — la
cause est zod, pas le compilateur. `generateOpenApi` produit en outre un schéma
vide. Sous zod 3.25.76, les mêmes briques typecheck proprement et l'OpenAPI est
complet. Le repli était nommé d'avance par R17; il s'applique.
Principes: aucun ajout, aucune suppression, aucun renommage.
Second motif, même amendement: dependency-cruiser 18.2.0 parcourt ZÉRO module
sous TypeScript 7.0.2 et rapporte « no dependency violations found (0 modules) ».
La porte qui rend le principe II mécanique est inerte, et son inertie prend
l'apparence d'un succès. Sous TypeScript 6.0.3, la même configuration parcourt
le graphe et évalue les règles. TypeScript descend donc à 6.0.3 — dernière
version de la ligne précédente, repli nommé d'avance par R17.
Ce second constat corrige un verdict antérieur du même jour, qui avait conclu à
la compatibilité sur la foi du code de sortie de l'outil. Exécuter ne suffit
pas: il faut vérifier que l'outil a produit un résultat non vide.
Sections modifiées:
  - Stack technique → puce « Contrats »: la ligne de version de Zod est
    contrainte, avec son motif et sa condition de sortie.
  - Stack technique → puce « Langage »: la ligne de version de TypeScript est
    contrainte tant que dependency-cruiser ne sait pas lire TypeScript 7.
Ce que l'amendement ne fait pas: il ne change aucune brique. Zod reste le
langage de schéma, ts-rest l'exposition des contrats, TypeScript le langage,
dependency-cruiser le gardien des frontières. Seules deux lignes de version
bougent, et elles bougent sur constat d'exécution.
Arbitrage assumé: entre un compilateur plus rapide et une frontière réellement
vérifiée, le principe II tranche. La vitesse de compilation n'est pas un
principe.
Condition de retour en arrière: pour zod, dès que @ts-rest/* supporte zod 4 au
typage; pour TypeScript, dès que dependency-cruiser publie son support de la
ligne 7. Dans les deux cas par un nouvel amendement MINOR, avec le même
protocole de vérification par exécution.
Artefacts impactés: docs/architecture/2026-08-23-choix-de-stack.md § 8 (tableau
des versions épinglées: zod 4.4.3 → 3.25.76, typescript 7.0.2 → 6.0.3).
CLAUDE.md ne nomme aucune version et n'est pas touché.
TODO différés: aucun.
-->

<!--
Sync Impact Report — 2.0.0 (historique)
Version change: 1.1.0 → 2.0.0
Type de bump: MAJOR — suppression d'une exigence normative. La relecture par un
tiers cesse d'être la règle, et le dispositif de substitution qui l'imitait en
contexte solo — demande de fusion systématique et auto-relecture différée d'au
moins quatre heures — est retiré. Un projet mené par une seule personne ne peut
pas tenir une cérémonie conçue pour deux; une règle qui ne sera pas tenue est
pire qu'une règle absente, parce qu'elle rend le manquement ordinaire.
Principes: aucun ajout, aucune suppression, aucun renommage.
Sections modifiées:
  - Workflow de développement et portes de qualité → règle « Revue » réécrite
Ce qui subsiste, et qui n'est pas négociable: la relecture avant fusion existe
toujours, elle est celle de l'auteur, elle se conduit contre une liste de
contrôle écrite énumérant les cinq principes, et les portes automatiques de CI
en sont le second relecteur.
Condition de retour en arrière: dès que le projet compte plus d'un contributeur,
la relecture par un tiers redevient la règle, par amendement.
Artefacts impactés: aucun. CLAUDE.md ne redit pas cette règle, le document de
stack ne s'y adosse pas, et aucune tâche de specs/001-la-planete-mere ne la
prend pour prérequis.
TODO différés: aucun.
-->

# Zaliba Constitution

## Core Principles

### I. Livraison pilotée par la spécification

Tout changement fonctionnel MUST naître d'une spécification versionnée sous
`specs/` avant l'écriture de code: `spec.md` (le quoi et le pourquoi), puis
`plan.md` (le comment technique), puis `tasks.md` (les unités exécutables).
Le code livré MUST être rattachable à une tâche identifiée, et toute divergence
constatée entre le code et la spécification MUST être résolue en corrigeant l'un
des deux explicitement, jamais en laissant l'écart implicite.
Les décisions techniques structurantes MUST être consignées avec leur
alternative écartée et le motif du choix.

*Rationale*: sur un produit full-stack, l'écart entre l'intention et le code est
la première source de dette. Rendre la spécification opposable au code garde
l'historique des décisions lisible pour quiconque reprend le projet.

### II. Frontière domaine / interface

La logique métier MUST résider dans des modules indépendants du framework, sans
import de code HTTP, de composant d'interface, ni de client de base de données
concret. Les couches d'interface — rendu, routage, contrôleurs, accès aux
données — MUST se limiter à traduire entre le monde extérieur et le domaine.
Un module de domaine MUST être testable sans démarrer de serveur, de navigateur
ni de base de données.

*Rationale*: cette frontière est ce qui rend le principe III praticable à coût
raisonnable et protège le métier d'un changement de framework front ou back.

### III. Test-First (NON NÉGOCIABLE)

Le cycle MUST être: test écrit → test observé en échec → implémentation minimale
→ refactorisation. Aucune implémentation MUST être écrite avant l'existence d'un
test qui échoue et qui décrit le comportement attendu.
Toute correction de bug MUST commencer par un test qui reproduit le défaut.
Un test écrit après l'implémentation ne satisfait pas ce principe: il MUST être
signalé comme telle dette en revue et rattrapé avant fusion.
Aucune fusion MUST intervenir avec une suite de tests rouge, ignorée ou
désactivée; neutraliser un test pour débloquer une fusion est interdit.

*Rationale*: exigence retenue explicitement pour ce projet. L'ordre d'écriture
n'est pas une préférence de style — écrire le test d'abord est le seul moment où
la spécification du comportement est encore falsifiable.

### IV. Contrats explicites et versionnés

Toute frontière franchie par des données — endpoint HTTP, schéma de persistance,
événement, props de composant partagé — MUST être décrite par un contrat typé et
validé à l'exécution aux limites du système (entrées utilisateur, réponses de
services tiers).
Chaque contrat exposé MUST être couvert par un test de contrat qui échoue si la
forme des données change. Une modification incompatible MUST être livrée avec sa
nouvelle version de contrat, sa fenêtre de compatibilité et son plan de
migration; supprimer une version encore consommée est interdit.

*Rationale*: dans une application full-stack, front et back évoluent à des
rythmes distincts; sans contrat testé, la rupture n'est découverte qu'en
production.

### V. Simplicité délibérée

La solution la plus simple qui satisfait la spécification MUST être retenue.
Une abstraction, une couche d'indirection, une dépendance ou un mécanisme de
configuration MUST être justifié par un besoin présent dans la spécification
courante, jamais par un besoin anticipé.
Toute dérogation MUST être documentée dans `plan.md` avec le coût de l'option
simple qu'elle remplace. Le code mort et les fonctionnalités non spécifiées
MUST être supprimés plutôt que conservés « au cas où ».

*Rationale*: contrepoids nécessaire aux quatre principes précédents, qui
imposent déjà de la structure. Sans cette contrainte, la rigueur dégénère en
cérémonie.

## Contraintes techniques et sécurité

- **Typage**: le projet MUST utiliser un langage ou un mode statiquement typé de
  bout en bout, front comme back. Les échappatoires au typage (`any`, casts non
  vérifiés, suppression de diagnostic) MUST porter un commentaire justificatif.
- **Dépendances**: toute dépendance MUST être épinglée à une version exacte, et
  son ajout MUST être justifié dans `plan.md`. Aucune dépendance non maintenue
  ou sans licence compatible.
- **Secrets**: aucun secret, jeton, identifiant ni URL d'environnement privé
  MUST figurer dans le dépôt. La configuration sensible passe exclusivement par
  des variables d'environnement, absentes du contrôle de version.
- **Entrées non fiables**: toute donnée provenant du client, d'un service tiers
  ou d'un import MUST être validée et normalisée avant usage. Les requêtes de
  persistance MUST être paramétrées; la concaténation de requêtes est interdite.
- **Authentification et autorisation**: l'autorisation MUST être vérifiée côté
  serveur pour chaque accès à une ressource. Un contrôle uniquement côté client
  ne constitue pas une protection.
- **Accessibilité**: toute interface livrée MUST être utilisable au clavier et
  respecter les critères WCAG 2.1 niveau AA sur les parcours principaux.
- **Journalisation**: les erreurs serveur MUST être journalisées de façon
  structurée, avec un identifiant de corrélation et sans donnée personnelle ni
  secret.

### Stack technique

Les technologies ci-dessous sont arrêtées. Le raisonnement, les alternatives
écartées et les motifs de chaque choix sont consignés dans
`docs/architecture/2026-08-23-choix-de-stack.md`. Tout écart MUST faire l'objet
d'un amendement.

- **Langage**: TypeScript, front comme back, sans exception. Environnement
  d'exécution serveur Node.js en version LTS. TypeScript MUST rester sur la
  **ligne 6.x** tant que `dependency-cruiser` ne sait pas lire TypeScript 7:
  sous la ligne 7, il parcourt zéro module et rapporte un succès, ce qui rend la
  porte du principe II inerte sans qu'aucun signal ne l'annonce. Entre un
  compilateur plus rapide et une frontière réellement vérifiée, le principe II
  prévaut. La montée en 7.x MUST faire l'objet d'un amendement MINOR, sur
  vérification que le nombre de modules parcourus est non nul — le code de
  sortie de l'outil ne vaut pas preuve.
- **Client**: application monopage React compilée par Vite, servie comme PWA,
  emballée par Capacitor pour les cibles natives. Aucun méta-framework à rendu
  serveur — le jeu est derrière authentification et ses données sont propres à
  chaque joueur.
- **Serveur**: Fastify. Le serveur MUST rester un processus long, apte à
  maintenir des connexions persistantes.
- **Persistance**: PostgreSQL, accédé par Drizzle. Les requêtes MUST rester
  lisibles et leurs index explicites.
- **Contrats**: schémas Zod dans un paquet partagé client/serveur, exposés par
  `ts-rest` sur des routes explicitement versionnées. Zod MUST rester sur la
  **ligne 3.x** tant que `@ts-rest/*` ne supporte pas Zod 4 au typage: sous Zod
  4, les réponses déclarées au contrat s'effondrent en `any` et la sûreté de
  type de bout en bout — le motif même du choix de `ts-rest` — disparaît sans
  bruit. Le constat MUST se faire par exécution, jamais par lecture de
  `peerDependencies`; celui qui fonde cette contrainte est consigné en
  `specs/001-la-planete-mere/research.md` § R17. La version exacte est épinglée
  au tableau § 8 de `docs/architecture/2026-08-23-choix-de-stack.md`. La montée
  en 4.x MUST faire l'objet d'un amendement MINOR, sur nouveau verdict
  d'exécution.
- **Infrastructure louée**: Supabase pour l'authentification, PostgreSQL et le
  stockage. Supabase MUST être traité comme fournisseur d'infrastructure et
  jamais comme backend: les tables de jeu MUST résider dans un schéma non exposé
  par PostgREST, et le client MUST n'avoir aucun accès direct à la base.
- **Site public et documentation**: Astro et Starlight. La documentation de
  référence MUST être générée depuis les catalogues de données de jeu, jamais
  rédigée à la main.
- **Rendu**: DOM et SVG pour l'interface; canvas 2D réservé à la carte galactique
  et au simulateur de bataille. Un canvas MUST rester une vue: l'interaction
  MUST passer par des éléments du document focalisables, dont l'état est la
  source de vérité.
- **Outillage**: pnpm et Turborepo pour le monorepo, Biome pour le lint et le
  format, dependency-cruiser pour les frontières de paquets, Vitest et fast-check
  pour les tests, Testcontainers pour l'intégration, Playwright et axe-core pour
  les parcours et l'accessibilité.
- **Versions exactes**: consignées dans le document d'architecture cité ci-dessus
  et épinglées dans les manifestes. Toute montée de version majeure d'un élément
  de cette liste MUST faire l'objet d'un amendement MINOR.

Deux invariants d'architecture prévalent sur toute commodité d'implémentation:

- **Le serveur est seul arbitre.** Le client MUST n'émettre que des intentions;
  toute valeur dérivable — coût, durée, résultat — MUST être recalculée côté
  serveur et MUST être absente des contrats d'entrée.
- **L'horloge est un paramètre, jamais un appel.** Aucune fonction de domaine
  MUST appeler l'horloge système: l'instant MUST être un argument explicite.
  L'horloge du client MUST n'être jamais une source de vérité.

## Workflow de développement et portes de qualité

- **Branches**: le travail MUST se faire sur une branche dédiée rattachée à une
  spécification; aucun commit direct sur la branche par défaut.
- **Portes bloquantes en CI**: une fusion MUST être refusée si l'une de ces
  vérifications échoue — compilation et vérification de types, lint et
  formatage, tests unitaires, tests de contrat, tests d'intégration des
  parcours principaux, audit de vulnérabilités des dépendances. Ces portes sont
  bloquantes, non consultatives.
- **Couverture**: la couverture des modules de domaine MUST être mesurée et ne
  MUST pas régresser d'une fusion à l'autre.
- **Revue**: chaque changement MUST être relu avant fusion, contre une liste de
  contrôle écrite énumérant les cinq principes. La revue vérifie explicitement
  la conformité à ces principes et refuse tout code sans test préalable au titre
  du principe III. Le projet étant mené par une seule personne, cette relecture
  est celle de l'auteur, et les portes automatiques de CI en sont le second
  relecteur, mécanique et non négociable. Aucun relecteur tiers, aucune demande
  de fusion et aucun délai de carence ne sont exigés. Dès que le projet compte
  plus d'un contributeur, la relecture par un tiers MUST redevenir la règle, par
  amendement.
- **Périmètre des commits**: un commit MUST représenter un changement cohérent
  et son message MUST énoncer l'intention, pas la liste des fichiers touchés.
- **Contournement**: désactiver une porte de qualité MUST faire l'objet d'un
  accord explicite du responsable du dépôt, être limité dans le temps et être
  tracé; le rétablissement MUST être suivi comme une tâche.

## Governance

Cette constitution prévaut sur toute autre pratique, convention orale ou
habitude d'équipe. En cas de conflit entre un document du projet et cette
constitution, la constitution s'applique jusqu'à son amendement.

**Amendements**: toute modification MUST faire l'objet d'une proposition écrite
énonçant le principe visé, la formulation retenue, sa motivation et son impact
sur les artefacts existants. Un amendement MUST être approuvé par le
responsable du dépôt et, lorsqu'il rend du code existant non conforme, être
accompagné d'un plan de migration avec ses tâches de mise en conformité.

**Versionnage**: cette constitution suit le versionnage sémantique.
MAJOR pour la suppression ou la redéfinition incompatible d'un principe ou
d'une règle de gouvernance; MINOR pour l'ajout d'un principe ou d'une section,
ou l'extension matérielle d'une règle; PATCH pour les clarifications,
reformulations et corrections sans effet normatif. La date de dernier
amendement MUST être mise à jour à chaque modification.

**Conformité**: chaque revue MUST vérifier la conformité du changement à cette
constitution. Toute complexité ajoutée MUST être justifiée au regard du
principe V. Un manquement constaté MUST être corrigé avant fusion ou, s'il
préexiste, enregistré comme tâche de mise en conformité.

**Guide runtime**: les consignes opérationnelles de développement au quotidien
sont maintenues dans `CLAUDE.md` à la racine du projet. Ce guide MUST rester
cohérent avec la présente constitution, qui prévaut en cas de divergence.

**Version**: 2.1.0 | **Ratified**: 2026-08-23 | **Last Amended**: 2026-08-26
