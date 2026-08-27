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

La tranche **001 — La planète mère** est implémentée : deux applications, quatre
paquets, la chaîne de portes de CI. Le monorepo pnpm et Turborepo est amorcé.

| Emplacement | Ce qu'on y trouve |
| --- | --- |
| `packages/catalogs` | le contenu de jeu, déclaratif et typé. **N'importe rien** |
| `packages/domain` | les règles, en fonctions pures. `kernel/` (temps, ressources, grille, énergie, taux, projection) et `modules/construction/` (pose, amélioration, démolition, déblaiement, aperçus). N'importe que `catalogs` |
| `packages/contracts` | les schémas Zod et les routes `/v1` via `ts-rest`. **N'importe pas `domain`** : la duplication est volontaire |
| `packages/db` | le schéma Drizzle, ses migrations et le dépôt d'instantané. N'importe ni `domain` ni `contracts` |
| `apps/api` | Fastify, serveur autoritaire : greffons, routes, forme unique de commande, et le `mapping/` qui traduit entre persistance, domaine et contrat |
| `apps/game` | le client Vite + React : écran de planète, grille au clavier, compteurs extrapolés, page de règles |
| `supabase/` | la configuration de la pile locale — base et authentification |
| `scripts/` | l'outillage hors paquet : la clé de signature de la pile locale |

Les commandes du quotidien sont dans
[`specs/001-la-planete-mere/quickstart.md`](specs/001-la-planete-mere/quickstart.md)
§ 2, la pile locale au § 1, et ce que chaque porte doit dire au § 3.

La stack est arrêtée depuis le 2026-08-23 : TypeScript partout, React + Vite en
PWA emballée par Capacitor, Fastify, PostgreSQL via Drizzle, contrats Zod
versionnés via `ts-rest`, Supabase pour l'authentification et la base, Astro et
Starlight pour le site public. Monorepo pnpm et Turborepo.

Ce que 001 **n'installe pas** — Capacitor, `vite-plugin-pwa`, `pixi.js`,
`@dnd-kit/core`, Astro — est différé, jamais remplacé : la table « Étagement de
la stack » de [`specs/001-la-planete-mere/plan.md`](specs/001-la-planete-mere/plan.md)
dit à quelle tranche et pourquoi.

**Deux documents à lire avant toute décision. Ils sont la mémoire du projet :**

- [`docs/architecture/2026-08-23-choix-de-stack.md`](docs/architecture/2026-08-23-choix-de-stack.md)
  — **décisions techniques**, figées : découpage du monorepo et règles de
  dépendance, modèle de temps, frontières de modules, sécurité, stratégie de
  test, versions épinglées. Avec les alternatives écartées et leurs motifs.
- [`docs/design/conception-du-jeu.md`](docs/design/conception-du-jeu.md)
  — **conception du jeu**, vivant : vocabulaire, archétypes de planètes, grille à
  empreintes, mécaniques arrêtées, lignes rouges de monétisation, risques
  identifiés, feuille de route des spécifications et questions ouvertes.

Ne réinventez aucune décision qu'ils contiennent, et ne les contredisez pas sans
les amender.

## Où écrire quoi

| Nature de l'information | Destination |
| --- | --- |
| Règle dont la violation doit bloquer une fusion | `.specify/memory/constitution.md` (via `/speckit-constitution`) |
| Convention, commande, piège connu, repère de navigation | ce fichier |
| Vision produit, personas, périmètre | `README.md` |
| Mécanique de jeu, équilibrage, vocabulaire, feuille de route | `docs/design/conception-du-jeu.md` |
| Décision technique structurante et son alternative écartée | `docs/architecture/AAAA-MM-JJ-<sujet>.md` |
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

Elles sont tenues à jour dans les deux documents de référence, jamais ici — une
liste dupliquée dérive :

- **Questions de conception du jeu** : section « Questions ouvertes » de
  [`docs/design/conception-du-jeu.md`](docs/design/conception-du-jeu.md).
- **Questions techniques** : section « Ce qui reste à décider » de
  [`docs/architecture/2026-08-23-choix-de-stack.md`](docs/architecture/2026-08-23-choix-de-stack.md).
