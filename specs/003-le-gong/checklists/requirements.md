# Specification Quality Checklist: Le Gong

**Purpose**: Valider la complétude et la qualité de la spécification avant la planification
**Created**: 2026-08-30
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Aucun détail d'implémentation (langages, cadriciels, interfaces de programmation)
- [x] Centrée sur la valeur pour l'utilisateur et le besoin
- [x] Rédigée pour un lecteur non implémenteur
- [x] Toutes les sections obligatoires sont remplies

## Requirement Completeness

- [x] Aucun marqueur [NEEDS CLARIFICATION] restant
- [x] Les exigences sont testables et non ambiguës
- [x] Les critères de succès sont mesurables
- [x] Les critères de succès sont indépendants de la technologie
- [x] Tous les scénarios d'acceptation sont définis
- [x] Les cas limites sont identifiés
- [x] Le périmètre est clairement borné
- [x] Dépendances et hypothèses identifiées

## Feature Readiness

- [x] Chaque exigence fonctionnelle a un critère d'acceptation clair
- [x] Les scénarios utilisateurs couvrent les parcours principaux
- [x] La fonctionnalité satisfait les résultats mesurables des critères de succès
- [x] Aucun détail d'implémentation ne fuit dans la spécification

## Notes

**Deux faits vérifiés sur le catalogue, et non supposés.**

1. **Le gong canonique vaut dix secondes.** Les quinze durées du catalogue —
   `buildDuration` des cinq types, `demolitionSeconds` des cinq types,
   `durationSeconds` des cinq obstacles — ont pour plus grand commun diviseur
   exactement 10. Le catalogue s'exprime donc en gongs entiers (12, 15, 20, 9,
   10, 30, 42, 60, 24, 18, 30, 90, 180, 270, 360) sans qu'aucune valeur
   d'équilibrage ne bouge. FR-003 et SC-001 reposent sur ce calcul.

2. **La longueur du gong doit pouvoir être fractionnaire.** Bornée à la seconde
   entière, elle plafonnerait l'accélération à un facteur dix — insuffisant pour
   traverser une progression en une séance : à ×10, réunir le coût d'une
   amélioration de mine demande encore une demi-heure. C'est ce qui justifie la
   formulation « exprimée exactement » de FR-005 plutôt que « en secondes ».

**Une réserve assumée.** La spécification nomme le **grain** (l'unité de
quantité de R1) et le contrat `/v1`. Ce sont du vocabulaire de jeu et un
artefact arrêtés par 001, pas des choix pris ici ; les paraphraser rendrait
FR-002 et FR-006 invérifiables.

**Ce que la spécification laisse à `plan.md` :** la forme exacte de la longueur
du gong dans la configuration et dans le contrat, l'endroit où vit la résolution
du catalogue, l'ordre des troncatures qui rend FR-009 et FR-010 vrais
simultanément, et la manière dont le client absorbe un changement de gong.

**Dépendance aval.** `specs/900-les-cinq-doublures/` — le banc d'essai de la
phase de test interne — ne peut pas exister sans cette tranche, et son brouillon
attend qu'elle soit planifiée.
