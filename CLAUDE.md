# Guide de développement — Zaliba

Guide opérationnel du quotidien. La
[constitution](.specify/memory/constitution.md) **prévaut** en cas de
divergence : ce fichier ne redit pas ses règles, il indique comment travailler
avec elles.

## Le projet en une phrase

**Zany Alien Battles** (`zaliba`) : jeu web de stratégie spatiale inspiré
d'OGame, modernisé, sans pay2win. Vision produit, personas et périmètre :
[README.md](README.md).

## État du dépôt

Aucun code applicatif à ce jour. Le dépôt contient sa gouvernance
(`.specify/`), sa documentation et sa licence.

La stack est arrêtée depuis le 2026-08-23 : TypeScript partout, React + Vite en
PWA emballée par Capacitor, Fastify, PostgreSQL via Drizzle, contrats Zod
versionnés via `ts-rest`, Supabase pour l'authentification et la base, Astro et
Starlight pour le site public. Monorepo pnpm et Turborepo.

**Avant toute décision technique, lire
[`docs/architecture/2026-08-23-choix-de-stack.md`](docs/architecture/2026-08-23-choix-de-stack.md)** :
il contient le découpage du monorepo et ses règles de dépendance, le modèle de
temps, les frontières de modules, la posture de sécurité et la stratégie de
test, avec les alternatives écartées et leurs motifs.

## Où écrire quoi

| Nature de l'information | Destination |
| --- | --- |
| Règle dont la violation doit bloquer une fusion | `.specify/memory/constitution.md` (via `/speckit-constitution`) |
| Convention, commande, piège connu, repère de navigation | ce fichier |
| Vision produit, personas, périmètre | `README.md` |
| Le quoi et le pourquoi d'une fonctionnalité | `specs/NNN-*/spec.md` (via `/speckit-specify`) |
| Le comment technique, choix de stack, alternatives écartées | `specs/NNN-*/plan.md` (via `/speckit-plan`) |
| Unités de travail exécutables | `specs/NNN-*/tasks.md` (via `/speckit-tasks`) |

## Workflow

Toute fonctionnalité passe par `/speckit-specify` → `/speckit-plan` →
`/speckit-tasks` → `/speckit-implement`, sur une branche dédiée. Le principe I
de la constitution rend la spécification opposable au code : tout code livré
doit être rattachable à une tâche, et tout écart constaté se résout en
corrigeant explicitement le code **ou** la spécification.

L'extension git de Spec Kit n'est pas enregistrée (`.specify/extensions.yml`
absent) : **les branches sont à créer à la main**, aucune commande ne le fait.

La numérotation des specs est séquentielle (`specs/001-*`, `002-*`, …).

## Rappels qui se trompent souvent

- **Test d'abord.** Principe III, non négociable : test écrit, observé en
  échec, puis implémentation. Un test écrit après le code est de la dette à
  signaler en revue. Un bug commence par un test qui le reproduit.
- **Domaine sans framework.** La logique de jeu — production, coûts,
  résolution de combat, progression — vit dans des modules testables sans
  serveur, sans navigateur et sans base de données.
- **Versions exactes.** Aucune plage de version dans un manifeste de
  dépendances ; chaque ajout se justifie dans `plan.md`.
- **Pas de formule cachée.** P4 « a besoin de tout savoir » : une mécanique
  implémentée doit pouvoir être exposée au joueur. Concevoir les règles pour
  être lisibles, pas pour être devinées.
- **Pas d'avantage achetable.** Toute fonctionnalité monétisable est
  cosmétique ou de confort. Un gain de temps payant est un pay2win déguisé.
- **L'horloge est un paramètre, jamais un appel.** Aucune fonction de domaine
  n'appelle l'horloge système : l'instant est toujours un argument explicite.
  C'est ce qui rend testable un jeu dont le sujet est le temps.
- **Le client envoie une intention, jamais un résultat.** Tout ce que le serveur
  peut dériver — coût, durée, issue d'un combat — est *absent du contrat*, pas
  seulement validé. Un champ qu'on ne peut pas envoyer ne peut pas être exploité.
- **Le canvas est une vue, jamais le contrôle.** L'interaction passe par des
  éléments du document focalisables, dont l'état est la source de vérité.
- **L'autorisation se vérifie dans la transaction de mutation**, sur l'état
  verrouillé. Les planètes changent d'occupant : vérifier puis muter ouvre une
  fenêtre de course qui est ici une mécanique de jeu, pas une hypothèse.
- **Un module de domaine ne mute rien.** Il retourne des effets que le noyau
  applique. Et `kernel` n'importe jamais un module.

## Lentille personas

Face à un arbitrage d'interface ou d'équilibrage, la question est : est-ce
lisible pour **P1** sans être bridé pour **P4** ? Les quatre profils sont un
gradient de profondeur, pas quatre publics à servir séparément — voir le
tableau du [README](README.md#personas).

## Langue

Documentation, spécifications et messages de commit en **français**.
Identifiants, code et messages techniques destinés aux logs en **anglais**.

## Décisions ouvertes

- Principes produit du README dérivés des personas : à valider ou corriger
  avant la première spécification.
- Nom des ressources : « métal » est jugé trop sérieux, un registre plus loufoque
  reste à trouver. Sans effet technique, les ressources étant des données.
- Modélisation propriétaire / occupant d'une planète : deux notions distinctes,
  à poser dès la première spécification.
- Règles du marché libre : mécanique la plus risquée du projet, mérite sa propre
  spécification avant le marché lui-même.
- Fournisseur PaaS du conteneur applicatif : à trancher au premier déploiement.
