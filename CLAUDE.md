# Guide de développement — Zaliba

Guide opérationnel du quotidien. La
[constitution](.specify/memory/constitution.md) **prévaut** en cas de
divergence : ce fichier ne redit pas ses règles, il indique comment travailler
avec elles.

> [!IMPORTANT]
> **Projet en pause depuis le 2026-09-10.** Avant toute action, lire
> [`docs/REPRISE.md`](docs/REPRISE.md) : état réel des quatre tranches, ce qui
> était en cours, comment redémarrer à froid, et ce qu'il ne faut pas refaire.
> Retirer cet encadré à la reprise effective.

## Le projet en une phrase

**Zany Alien Battles** (`zaliba`) : jeu web de stratégie spatiale inspiré
d'OGame, modernisé, sans pay2win. Vision produit, personas et périmètre :
[README.md](README.md).

## État du dépôt

Les tranches **001 — La planète mère**, **002 — La Régie approximative** et
**003 — Le Gong** sont implémentées : deux applications, quatre paquets, la chaîne de portes de CI. Le
monorepo pnpm et Turborepo est amorcé.

002 n'a touché qu'`apps/game` et la documentation : **aucun paquet, aucune règle de
jeu**. Elle a livré le système visuel de l'écran de parcelle — jeu de valeurs unique
tenu par trois portes, sept silhouettes qui identifient douze états sans la couleur,
adresse courte de case, raison du refus portée par la case, région d'annonce unique
et relevé à la demande, ratures, guichet à trois colonnes.

003 a changé l'**unité de déclaration** du temps sans déplacer aucun chiffre du
jeu : le catalogue déclare en gongs, chaque serveur déclare la longueur de la
sienne (`GONG_SECONDS`), résout son catalogue **une fois** au démarrage et
**annonce** cette longueur au client dans l'instantané de planète. Au gong
canonique de dix secondes, les 240 valeurs comparables sont strictement
inchangées, et un test le tient. `packages/db` n'a pas bougé.

| Emplacement | Ce qu'on y trouve |
| --- | --- |
| `packages/catalogs` | le contenu de jeu, déclaratif et typé. **N'importe rien**. Il déclare ses durées en **gongs** et ses productions en **grains par gong** — jamais en secondes : `gong.ts` porte l'unité, et les formes `Declared*` sont les seules exportées |
| `packages/domain` | les règles, en fonctions pures. `kernel/` (temps, ressources, grille, énergie, taux, projection, **résolution du gong**) et `modules/construction/` (pose, amélioration, démolition, déblaiement, aperçus). N'importe que `catalogs`. `kernel/gong.ts` est le **seul** pont du déclaré vers le résolu |
| `packages/contracts` | les schémas Zod et les routes `/v1` via `ts-rest`. **N'importe pas `domain`** : la duplication est volontaire |
| `packages/db` | le schéma Drizzle, ses migrations et le dépôt d'instantané. N'importe ni `domain` ni `contracts` |
| `apps/api` | Fastify, serveur autoritaire : greffons, routes, forme unique de commande, et le `mapping/` qui traduit entre persistance, domaine et contrat |
| `apps/game` | le client Vite + React : écran de parcelle habillé, grille au clavier, compteurs extrapolés, page de règles. `src/design/` est le **système visuel** — `tokens.css` est la seule source de valeurs, et deux portes le tiennent ; `src/features/regie/` sont les blocs de la Régie |
| `docs/design/2026-08-27-regie-approximative/` | le **dossier de design** de 002, archivé entier. `tokens.json` y est **normatif** : la porte de conformité le compare à `tokens.css`. Exclu de toutes les portes de lint |
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

La numérotation des specs est séquentielle (`specs/001-*`, `002-*`, …), et la
bande le dit : **les `0xx` sont le jeu, les `9xx` l'outillage**. Une tranche de
banc d'essai, de semis ou de diagnostic prend un numéro `9xx` — elle ne décale
pas la feuille de route du jeu, qui est celle du § 10 de
[`docs/design/conception-du-jeu.md`](docs/design/conception-du-jeu.md). Une
tranche qui touche le catalogue, le contrat, le domaine ou ce que le joueur voit
est du jeu, quel qu'ait été le besoin qui l'a fait naître : c'est ce qui a fait
scinder le Gong (003) du banc d'essai qui s'en sert (900).

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
- **Le catalogue déclare en gongs, le serveur résout et annonce, le client
  reçoit.** Aucune longueur de gong ne vit dans `apps/game/src` — ni constante,
  ni littéral, ni variable d'environnement : le client la reçoit du serveur et
  résout en **un seul endroit**, `src/lib/catalogs.ts`. Une longueur absente ne
  vaut pas accord : le client n'affiche alors **aucun** chiffre dérivé, plutôt
  que de se replier sur le canonique. Deux portes lexicales le tiennent, et
  chacune échoue si elle a parcouru zéro fichier.
- **Résoudre la base d'une courbe, jamais sa valeur évaluée.** `⌊12 × 1,4²⌋ × 10`
  donne 230 là où le jeu met 235, qui est `⌊120 × 1,4²⌋`. Une seule troncature,
  en fin de calcul — c'est ce qui rend un chiffre refaisable à la main, et ce qui
  rend l'égalité au gong canonique exacte plutôt qu'approchée.
- **Aucune valeur visuelle hors de `tokens.css`.** Ni hexadécimal, ni angle, ni
  longueur en pixels — et **aucune taille de police en pixels nulle part**, ce qui
  est ce qui rend WCAG 1.4.4 vrai. Deux portes le refusent, et l'une d'elles échoue
  si elle a parcouru zéro fichier.
- **Jamais la couleur seule.** Un état de case s'identifie par un canal non
  chromatique — silhouette, style de trait, marque d'angle, cadre d'emprise —, et les
  douze états portent douze quadruplets distincts. Retirer toute teinte doit les
  laisser distinguables.
- **Une seule région d'annonce polie**, écrite par des événements, jamais par un
  compteur. Les refus de commande gardent leur canal assertif : c'est l'exception, et
  elle est nommée.
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
