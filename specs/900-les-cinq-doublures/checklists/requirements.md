# Specification Quality Checklist: Les cinq doublures

**Purpose**: Valider la complétude et la qualité de la spécification avant la planification
**Created**: 2026-08-29
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

**Trois réserves assumées, consignées plutôt que masquées.**

1. **« Aucun détail d'implémentation ».** La spécification nomme trois
   identifiants de refus (`max-level-reached`, `no-space`,
   `work-in-progress`) et le contrat `/v1`. Ce ne sont pas des choix techniques
   mais le **vocabulaire de jeu arrêté par 001** : les nommer rend FR-007 et
   SC-005 vérifiables, les paraphraser les rendrait flous. Le même usage
   gouverne les spécifications 001 et 002.

2. **« Rédigée pour un lecteur non implémenteur ».** Le lecteur de cette
   tranche **est** l'équipe : elle outille une séance de test interne, elle n'a
   pas d'utilisateur final. Le critère est satisfait au sens où aucune décision
   technique n'y est prise — l'emplacement du code, la forme des scénarios et
   le mécanisme de configuration relèvent tous de `plan.md`.

3. **La mention de la pile locale** (§ Assumptions) est une **dépendance à un
   service existant**, ce que la section prévoit explicitement. Elle borne le
   périmètre — aucun environnement partagé — plutôt qu'elle ne prescrit une
   mise en œuvre.

**Ce que la spécification laisse délibérément à `plan.md` :** l'emplacement du
levier d'accélération, la forme et le nom de la variable de configuration, le
paquet qui héberge l'outillage, la mécanique de création des comptes, et la
manière dont la porte est branchée à la suite de tests.

---

## Révision du 2026-08-29 — le levier d'accélération a changé de nature

La première rédaction décrivait un **catalogue aux durées divisées**. Un
contrôle sur les valeurs réelles du catalogue l'a invalidée avant la
planification, et la spécification a été réécrite en conséquence.

**Le défaut.** Diviser les durées de chantier n'accélère pas l'accumulation des
ressources. Une mine de niveau 1 sur deux gisements produit 30 Camelote par
heure (`yielding(15)`), et son niveau 2 en coûte 150 (`growing(100)`). Au
facteur 60, le chantier aurait duré 2 secondes et le testeur aurait attendu
**5 heures réelles** de quoi le payer. L'US2 — éprouver les transitions —
n'aurait pas été tenue.

**Le remède.** C'est le **temps du jeu** qui s'écoule N fois plus vite, et non
les durées qui rétrécissent. Durées, production, saturation et pertes
accélèrent alors ensemble, et le catalogue reste intact.

**Ce que la révision a coûté et rapporté :**

- FR-016 à FR-024 réécrites ; SC-002 à SC-004 remplacées ; l'US2 et trois cas
  limites réécrits ; une hypothèse ajoutée sur le décalage assumé entre durée
  annoncée et durée vécue, et une autre sur la remise à zéro qu'impose un
  changement de facteur.
- FR-021 est neuve et **nécessaire** : sans mention visible du facteur, l'écart
  entre « deux minutes » annoncées et deux secondes vécues se lirait comme un
  défaut.
- Le périmètre technique **rétrécit** : le catalogue et `packages/domain` ne
  sont plus touchés, et l'avertissement de divergence de catalogue n'est plus
  sollicité — donc plus aucun risque d'écran vidé par un facteur mal réglé.

---

## Révision du 2026-08-30 — le levier d'accélération sort de la tranche

La révision du 2026-08-29 avait remplacé le catalogue aux durées divisées par
une **horloge de jeu accélérée**. L'utilisateur l'a écartée à son tour, pour un
motif d'affichage : *« si le temps de construction est de 2 sec, je veux que
2 sec soit affiché »*. Et il a posé l'exigence qui a tout réorganisé : *« le
serveur doit rester la source unique de vérité ; avoir un miroir asynchrone
client/serveur peut entraîner des problèmes à la longue avec les clients qui ne
se mettent pas à jour assez vite »*.

**La solution retenue est le Gong** — le temps déclaré en unités du jeu plutôt
qu'en secondes, la longueur du gong déclarée par le serveur et annoncée au
client. Elle satisfait les trois contraintes à la fois : affichage vrai,
couplage durées/production impossible à casser, source unique.

**Conséquence sur cette tranche : elle rétrécit.** Le levier de rythme n'est plus
de son ressort — il devient la tranche **003 — Le Gong**, dont 900 dépend.

- L'ancien bloc FR-016 à FR-024 (l'accélération et ses garde-fous) est remplacé
  par trois exigences seulement : régler la longueur du gong (FR-016), la choisir
  de façon à ne pas aplatir l'équilibrage (FR-017), et rejouer avec le catalogue
  résolu à cette longueur (FR-018).
- **SC-010 est neuf et il est le juge de la révision** : le banc d'essai n'ajoute
  **aucune** ligne de code d'accélération.
- Les garde-fous se réduisent à la base locale : le refus de démarrer en
  production a disparu, parce que la bonne règle n'est pas *local contre
  production* mais **par serveur contre par joueur** — et 003 la porte.

**État de la tranche : en attente de 003.** Voir [REPRISE.md](../REPRISE.md).
