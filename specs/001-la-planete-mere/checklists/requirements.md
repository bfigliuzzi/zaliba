# Liste de contrôle qualité de la spécification : La planète mère

**Objet** : valider la complétude et la qualité de la spécification avant de
passer à la planification.

**Créée le** : 2026-08-23

**Fonctionnalité** : [spec.md](../spec.md)

## Qualité du contenu

- [x] Aucun détail d'implémentation (langages, frameworks, interfaces techniques)
- [x] Centrée sur la valeur pour le joueur et le besoin produit
- [x] Rédigée pour un lecteur non technique
- [x] Toutes les sections obligatoires sont renseignées

## Complétude des exigences

- [x] Aucun marqueur `[NEEDS CLARIFICATION]` ne subsiste
- [x] Les exigences sont testables et sans ambiguïté
- [x] Les critères de succès sont mesurables
- [x] Les critères de succès sont indépendants de toute technologie
- [x] Tous les scénarios d'acceptation sont définis
- [x] Les cas limites sont identifiés
- [x] Le périmètre est explicitement borné
- [x] Les dépendances et les hypothèses sont identifiées

## Aptitude au développement

- [x] Chaque exigence fonctionnelle est couverte par un critère d'acceptation
- [x] Les scénarios couvrent les parcours principaux
- [x] La fonctionnalité satisfait les résultats mesurables des critères de succès
- [x] Aucun détail d'implémentation ne fuit dans la spécification

## Notes

Tous les items sont satisfaits à la première itération de validation. Trois
réserves sont consignées dans la spécification elle-même et n'empêchent pas la
planification :

1. **Tension assumée** : le plafond de stockage avec perte à saturation contredit
   le principe produit 5 du README. La spécification l'assume explicitement, avec
   ses trois contreparties, et demande son réexamen à l'équilibrage.
2. **Divergences avec le document de conception** : six points recensés en fin de
   spécification — empreintes L et T à quatre cases, absence de l'empreinte de
   trois cases, variantes d'empreinte, plafond de stockage, énergie, nombre
   d'obstacles du Berceau, et rôle de chaque ressource.
   `docs/design/conception-du-jeu.md` a été corrigé en conséquence, conformément à
   sa propre règle d'autorité.
3. **Vocabulaire à valider** : le nom « racloir » pour l'extracteur de Bave
   d'étoiles. Le conflit lexical entre le Jus et l'énergie est **clos** : l'énergie
   est une ressource à part, le Jus est un carburant de propulsion (R21, R22).
4. **Contrepartie assumée** : le Jus n'a aucun débouché en 001 (FR-062, FR-063).
   Assumée explicitement dans la spécification, à réexaminer dès que la première
   mécanique consommatrice de Jus est spécifiée.

Aucun de ces points ne relève de `/speckit-clarify` : ils sont tranchés ou
explicitement différés, non ambigus.
