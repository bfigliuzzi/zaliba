# Zany Alien Battles

> Nom court : **zaliba**

Jeu web de stratégie spatiale au tour long, dans la lignée d'OGame : on
développe une colonie, on arbitre entre production, recherche et flotte, on
compose avec les autres joueurs. La différence tient en deux points :
des mécaniques de jeu contemporaines plutôt qu'un héritage des années 2000,
et **aucun pay2win** — l'argent ne s'échange jamais contre de la puissance.

**Statut** : conception. Le dépôt ne contient à ce jour que sa gouvernance et
sa documentation ; aucune ligne de code applicative n'est encore écrite.

## Personas

Les quatre profils ne décrivent pas des fonctionnalités distinctes mais un
**gradient de profondeur** : le même jeu doit rester lisible pour P1 et
inépuisable pour P4.

| Réf. | Profil | Rapport au jeu | Ce que le jeu lui doit |
| --- | --- | --- | --- |
| **P1** | Casu | Suit son plan de progression sans se prendre la tête. Peut rejoindre une alliance mais interagit peu. Peu ou pas agressif. | Une progression lisible et guidée, jouable sans optimisation ni interaction sociale soutenue. |
| **P2** | Assidu | Aime le jeu et veut progresser. Connaît les principes avancés mais reste à faible profondeur. Prêt à dépenser un peu pour personnaliser son expérience. | Des repères clairs vers le palier suivant, et une offre payante qui ne touche jamais à l'équilibre. |
| **P3** | Investi | Même profil que P2, plus de temps passé. Veut réellement comprendre les mécaniques et s'investit sur plusieurs axes à la fois. | Des mécaniques qui récompensent la compréhension, et de la marge de manœuvre sur plusieurs axes simultanés. |
| **P4** | Hardcore | Connaît toutes les mécaniques et explore le jeu jusqu'à ses profondeurs. **A besoin de tout savoir pour s'amuser.** | Aucune formule cachée : les règles exactes doivent être consultables et exploitables. |

## Principes produit

Ces principes sont **dérivés** des personas et de la contrainte « sans
pay2win ». Ils sont à valider ou corriger avant la première spécification.

1. **Monétisation non compétitive.** Cosmétique et confort uniquement. Aucun
   achat ne modifie l'équilibre du jeu, ni directement ni par accélération.
2. **Transparence des mécaniques.** Les formules et les règles sont
   consultables en jeu. Le plaisir de P4 vient de la maîtrise, pas de la
   rétro-ingénierie ; l'opacité n'est pas un contenu.
3. **Divulgation progressive.** Une interface unique, feuilletée : P1 n'est
   pas noyé, P4 n'est pas bridé. Pas de « mode expert » séparé.
4. **Valeur passive de l'alliance.** Une alliance doit rapporter à P1 sans
   exiger de présence ni de coordination continue.
5. **Le temps n'est pas une taxe d'attention.** À arbitrer : l'ambition de
   modernisation implique de ne pas récompenser les réveils nocturnes ni la
   micro-gestion permanente qui caractérisaient le genre.

## Hors périmètre

- Tout mécanisme d'achat conférant un avantage compétitif, y compris déguisé
  en gain de temps.
- Toute mécanique exigeant une disponibilité continue pour rester compétitif.

## Stack technique

TypeScript de bout en bout. Client React compilé par Vite, servi comme PWA et
emballé par Capacitor pour les cibles natives. Serveur Fastify. PostgreSQL
accédé par Drizzle. Contrats Zod partagés et versionnés via `ts-rest`. Supabase
pour l'authentification, la base et le stockage — comme fournisseur
d'infrastructure, jamais comme backend. Site public et documentation sous Astro
et Starlight.

Le raisonnement complet, les alternatives écartées et les versions épinglées :
[`docs/architecture/2026-08-23-choix-de-stack.md`](docs/architecture/2026-08-23-choix-de-stack.md).

## Documentation

| Document | Contenu |
| --- | --- |
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | Règles opposables : principes, contraintes techniques, portes de qualité. Prévaut sur tout le reste. |
| [`CLAUDE.md`](CLAUDE.md) | Guide de développement au quotidien. |
| `specs/NNN-*/` | Une spécification par fonctionnalité : `spec.md`, `plan.md`, `tasks.md`. |

## Licence

[PolyForm Noncommercial License 1.0.0](LICENSE) — tout usage non commercial
est permis ; l'exploitation commerciale par un tiers ne l'est pas. Le
titulaire des droits conserve la totalité des siens, dont l'exploitation
commerciale du jeu. Détails dans [NOTICE.md](NOTICE.md).
