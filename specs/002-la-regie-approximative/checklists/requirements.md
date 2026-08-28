# Specification Quality Checklist: La Régie approximative — l'écran de parcelle habillé

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Tous les items passent. Les trois marqueurs `[NEEDS CLARIFICATION]` de la
première rédaction ont été levés le 2026-08-27 :

| Marqueur | Décision |
| --- | --- |
| **FR-008** — l'en-tête et le registre, que le modèle de 001 n'alimente pas | La maquette est une cible : on garde le *look and feel*, les valeurs et **l'agencement**. Les zones sans donnée sont **omises**, jamais remplies d'une valeur inventée, et aucune structure n'est construite à l'avance pour les accueillir (FR-008a). Le registre affiche la seule possession réelle. |
| **FR-029** — la source de l'ancienne valeur d'une rature | La dernière valeur affichée par le client. Aucune donnée persistée, aucun contrat touché ; la rature ne suit que les valeurs qui changent **par saut** (FR-029a). |
| **FR-036** — le thème sombre | Hors périmètre. Les teintes de nuit restent en réserve : le dossier annonce des ratios mesurés et n'en fournit aucun en sombre. |

**Ce qui a été tranché sans question**, par défaut raisonnable documenté dans les
hypothèses : l'adressage court des cases (« C3 ») adopté partout, la répartition
des cinq obstacles de 001 en deux silhouettes selon ce que leur déblaiement
libère, le maintien de l'énergie en bloc distinct, et l'interdiction des
commandes décoratives (FR-025) — qui tranche le sort du bouton « Réclamer (sans
espoir) » de la maquette large.

**Renvoyé à `plan.md`** : le mécanisme de style retenu, l'auto-hébergement des
fontes, la place définitive du dossier de design dans le dépôt, et l'amendement
du § 10 de `docs/design/conception-du-jeu.md`, dont la feuille de route
attribuait le numéro 002 au système solaire.
