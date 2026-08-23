<!--
Sync Impact Report
Version change: TEMPLATE (non renseigné) → 1.0.0
Type de bump: MAJOR — ratification initiale, passage d'un gabarit vierge à une
gouvernance effective (aucune version antérieure à préserver).
Principes définis (aucun renommage, le gabarit n'en nommait aucun):
  - [PRINCIPLE_1_NAME] → I. Livraison pilotée par la spécification
  - [PRINCIPLE_2_NAME] → II. Frontière domaine / interface
  - [PRINCIPLE_3_NAME] → III. Test-First (NON NÉGOCIABLE)
  - [PRINCIPLE_4_NAME] → IV. Contrats explicites et versionnés
  - [PRINCIPLE_5_NAME] → V. Simplicité délibérée
Sections ajoutées:
  - [SECTION_2_NAME] → Contraintes techniques et sécurité
  - [SECTION_3_NAME] → Workflow de développement et portes de qualité
  - Governance (règles d'amendement, versionnage, conformité)
Sections supprimées: aucune.
TODO différés:
  - TODO(TECH_STACK): figer les runtimes, frameworks et versions exactes une fois
    le premier /speckit-plan produit; amendement MINOR attendu.
  - TODO(GUIDANCE_FILE): CLAUDE.md à la racine du projet n'existe pas encore; la
    section Governance le désigne comme guide runtime à créer.
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

TODO(TECH_STACK): les runtimes, frameworks et versions exacts ne sont pas encore
arrêtés. Ils MUST être fixés ici lors du premier `/speckit-plan`, par amendement
MINOR.

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
- **Revue**: chaque changement MUST être relu par une personne qui n'en est pas
  l'auteur. La revue vérifie explicitement la conformité aux cinq principes et
  refuse tout code sans test préalable au titre du principe III.
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

**Version**: 1.0.0 | **Ratified**: 2026-08-23 | **Last Amended**: 2026-08-23
