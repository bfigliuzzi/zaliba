# Checklist Système visuel et jeu de valeurs : La Régie approximative

**Purpose**: Éprouver la **qualité d'écriture** des exigences qui portent le
système visuel — la source unique de valeurs, la typographie et ses planchers,
les silhouettes, les ratures, la copie — avant que `/speckit-tasks` n'en fasse
des unités de travail. On ne vérifie pas ici que l'écran est beau ni qu'il est
conforme : on vérifie que le texte qui le prescrit est complet, univoque,
cohérent et mesurable.

**Created**: 2026-08-27

**Feature**: [spec.md](../spec.md)

**Périmètre de la revue** : `spec.md` et les artefacts de phase 1 —
[research.md](../research.md), [data-model.md](../data-model.md),
[contracts/jeu-de-valeurs.md](../contracts/jeu-de-valeurs.md),
[contracts/ui-parcelle.md](../contracts/ui-parcelle.md),
[quickstart.md](../quickstart.md).

**Note**: Cette liste est produite par la commande `/speckit-checklist` à partir
du contexte de la fonctionnalité.

**Review Ownership**: Artefact de revue, propriété du relecteur. Ne cocher un
item que lorsque le relecteur a constaté que le critère de qualité d'exigence est
satisfait.

**Marker Semantics**: `[x]` signifie que le critère a été relu et qu'il est tenu
**du point de vue de la qualité de l'exigence**. Il ne signifie **pas** que le
travail d'implémentation est fait.

## Complétude des exigences

- [ ] CHK001 FR-001 nomme-t-il la source de référence — quel fichier, à quel emplacement, sachant que le dossier de design est déplacé sous `docs/design/` ? Une « source unique » sans adresse n'est pas opposable. [Clarté, Spec §FR-001, research.md § R3]
- [ ] CHK002 La règle « aucune taille de police exprimée en pixels » et l'expression de l'échelle en `rem` figurent-elles dans une **exigence**, ou seulement dans le plan et les contrats ? C'est ce qui rend WCAG 1.4.4 vrai, et rien ne le demande dans `spec.md`. [Lacune, Spec §FR-039, research.md § R14, contracts/jeu-de-valeurs.md § 2]
- [ ] CHK003 La marque `data-role-texte`, sans laquelle FR-038 et le plancher par rôle ne sont pas mesurables, est-elle exigée par la spécification ? [Lacune, Spec §FR-038, §FR-039, contracts/ui-parcelle.md § 8]
- [ ] CHK004 Les exigences de chargement des polices — sous-ensemble servi, comportement d'affichage pendant le chargement, pile de repli par famille — sont-elles énoncées, ou seulement le fait qu'elles soient auto-hébergées ? Le cas limite « les polices ne se chargent pas » les suppose toutes. [Lacune, Spec §FR-004, §Edge Cases, contracts/jeu-de-valeurs.md § 5]
- [ ] CHK005 Une exigence de contraste porte-t-elle sur ce qui **remplace** les aplats et les ombres en mode contrastes forcés ? FR-033 exige leur disparition sans rien exiger de leur substitut. [Lacune, Spec §FR-033]
- [ ] CHK006 La contrainte de place du niveau lisible sur l'emprise est-elle définie ? FR-017 l'exige, FR-014 borne la case à 44 px et le plancher range le niveau dans le texte porteur d'information à 14 px : les trois exigences se rencontrent sans qu'aucune ne dise ce qui cède. [Lacune, Spec §FR-014, §FR-017, contracts/jeu-de-valeurs.md § 2]
- [ ] CHK007 Le vocabulaire fermé des sept silhouettes est-il énoncé dans la spécification, ou seulement dans `research.md § R5` ? La « Silhouette » des entités annonce un vocabulaire fermé « de cinq à sept formes » sans les nommer. [Complétude, Spec §Key Entities, research.md § R5]
- [ ] CHK008 La spécification dit-elle quels canaux de redondance restent **disponibles** une fois la marque d'angle et le style de trait consommés par les états existants ? Le cas limite promet d'ouvrir « le mot, la position » alors que la position est déjà prise. [Clarté, Spec §Edge Cases, research.md § R5]
- [ ] CHK009 Les exigences de la note de bas de page, de la mention finale et du surtitre — ce qu'ils portent, et la garantie qu'ils ne portent rien de nécessaire — sont-elles vérifiables autrement que par lecture humaine ? [Mesurabilité, Spec §FR-037, §FR-038]

## Clarté et absence d'ambiguïté

- [ ] CHK010 « Toute valeur chiffrée » (FR-002) est-il défini ? Le chrono HH:MM:SS, le pourcentage d'une jauge, les bandes de coordonnées et le chiffre d'une adresse de case en relèvent-ils ? [Clarté, Spec §FR-002]
- [ ] CHK011 « Aplat de couleur de ressource » (FR-003) est-il défini — les trois teintes stockées seulement, ou l'énergie comprise, dont FR-010 rappelle qu'elle est d'une autre nature ? [Clarté, Spec §FR-003, §FR-010]
- [ ] CHK012 FR-005 fait de la frappe de tampon **le seul** mouvement de l'interface ; la progression d'une jauge de chantier et la décrémentation d'un chrono sont-elles exclues explicitement de la notion de mouvement ? Sans cela, FR-005 et FR-009 s'opposent. [Ambiguïté, Spec §FR-005, §FR-009]
- [ ] CHK013 FR-015 dit « environ 35 à 40 % » : une fourchette précédée de « environ » est-elle vérifiable ? Le contrat retient 38 % — l'exigence doit-elle porter la valeur ou la fourchette ? [Mesurabilité, Spec §FR-015, contracts/ui-parcelle.md § 2.4]
- [ ] CHK014 « Rester en réserve » (FR-036) est-il défini : les teintes de nuit sont-elles transcrites et inemployées, ou absentes ? R17 tranche pour la première lecture, mais l'exigence admet les deux. [Clarté, Spec §FR-036, research.md § R17]
- [ ] CHK015 FR-029a énumère trois valeurs suivies par une rature ; la liste est-elle **fermée** ou exemplative ? Un tiret et trois exemples ne disent pas lequel des deux. [Clarté, Spec §FR-029a, data-model.md § 5.2]
- [ ] CHK016 FR-001 interdit toute « valeur visuelle » écrite en dur ailleurs ; le périmètre en est-il défini — une durée de transition, un pourcentage, un `viewBox`, un nombre de colonnes en sont-ils ? La porte de non-régression a besoin de cette frontière pour ne pas être arbitraire. [Clarté, Spec §FR-001, research.md § R2]
- [ ] CHK017 FR-037 exige la copie « telle quelle » à l'exception des valeurs de jeu ; la frontière est-elle définie pour un texte qui mêle les deux dans la même phrase ? [Clarté, Spec §FR-037, §Assumptions]
- [ ] CHK018 FR-036 met le thème sombre hors périmètre ; l'exigence dit-elle **ce qui doit être mesuré** pour le rouvrir ? Un hors-périmètre sans condition de sortie devient un renoncement. [Clarté, Spec §FR-036, §Hors périmètre]

## Cohérence entre exigences

- [ ] CHK019 FR-039 fixe 9,5 px comme plancher de tout texte porteur d'information ; le contrat en exige **14**. FR-039 est-il amendé, ou la spécification dit-elle encore autre chose que ce qui sera construit ? [Conflit, Spec §FR-039, contracts/jeu-de-valeurs.md § 2, research.md § R14]
- [ ] CHK020 FR-001 fait des valeurs du dossier la **référence unique** ; le contrat écarte délibérément six tailles de police, relève un champ de contraste faux et crée un pas nouveau. L'exception est-elle inscrite dans FR-001, ou seulement pratiquée par la porte ? [Conflit, Spec §FR-001, contracts/jeu-de-valeurs.md § 1, § 2, § 4]
- [ ] CHK021 Le pas `chiffre-xs`, créé par le plan, n'existe pas dans `tokens.json` : une valeur opérante **sans référence dans la source** est-elle admise par FR-001, et si oui l'exigence le dit-elle ? [Conflit, Spec §FR-001, contracts/jeu-de-valeurs.md § 2]
- [ ] CHK022 Le champ `contraste_sur_papier` de la source annonce 4,5 pour une mesure de 4,46 : l'exigence dit-elle si la **source doit être corrigée**, ou seulement contournée en traitant ses champs comme de la documentation ? Une source de référence qui contient un chiffre faux reste une source de référence. [Conflit, Spec §FR-001, contracts/jeu-de-valeurs.md § 4]
- [ ] CHK023 FR-024 prescrit un indicateur de focus qui atteint 3:1 contre le fond bordé ; le dossier prescrit un anneau qui échoue sur trois fonds focalisables. L'écart est-il résolu **dans la spécification**, ou seulement dans le plan qui le corrige ? [Conflit, Spec §FR-024, contracts/jeu-de-valeurs.md § 4]
- [ ] CHK024 FR-032 plafonne toute rotation à 1,5° ; le dossier de design en applique-t-il davantage sur des éléments porteurs d'information, et cet écart est-il relevé comme le sont les trois autres constats de planification ? [Cohérence, Spec §FR-032, plan.md § Trois constats de planification]
- [ ] CHK025 FR-030 et la table des couples emploient-ils les mêmes rôles et les mêmes seuils ? La spécification parle de « bordure d'un composant navigable », le contrat de « aplats, liserés et objets graphiques » : la correspondance est-elle établie ? [Cohérence, Spec §FR-030, contracts/jeu-de-valeurs.md § 3]
- [ ] CHK026 Le conflit avec **SC-009 de 001** — le plancher de 16 px — est-il consigné dans la spécification de 002, ou seulement dans son plan ? Le principe I demande que l'écart se résolve dans un document opposable. [Traçabilité, Spec, plan.md, research.md § R14]
- [ ] CHK027 FR-002 exige les chiffres tabulaires « partout où il y a un chiffre » ; les libellés de la Régie qui contiennent un nombre décoratif — « Parcelle n° 4-B bis (ter) » — en relèvent-ils, alors que FR-037 les fige tels quels ? [Cohérence, Spec §FR-002, §FR-037]

## Qualité des critères d'acceptation

- [ ] CHK028 Un critère de succès mesure-t-il **FR-001**, la source unique de valeurs ? C'est l'exigence dont dépendent toutes les autres, et aucun SC ne la nomme. [Traçabilité, Spec §FR-001, §Success Criteria]
- [ ] CHK029 Un critère de succès mesure-t-il **FR-002**, la chasse fixe à chiffres tabulaires ? [Traçabilité, Spec §FR-002]
- [ ] CHK030 Un critère de succès mesure-t-il **FR-003**, le chiffre posé sur étiquette de papier ? US1-AC2 le décrit comme scénario d'acceptation ; est-ce suffisant, ou faut-il un SC ? [Traçabilité, Spec §FR-003, §US1]
- [ ] CHK031 Un critère de succès mesure-t-il que les tailles de texte ont **réellement doublé** à 200 %, et pas seulement que rien ne déborde ? SC-002 ne distingue pas une échelle en `rem` d'une échelle figée. [Lacune, Spec §SC-002, contracts/ui-parcelle.md § 8]
- [ ] CHK032 Un critère de succès mesure-t-il **FR-037 et FR-040**, la copie de la Régie et le vocabulaire du jeu ? [Traçabilité, Spec §FR-037, §FR-040]
- [ ] CHK033 FR-005 plafonne les transitions de couleur à 120 ms ; un critère de succès le mesure-t-il **hors** préférence de mouvement réduit ? SC-010 ne couvre que le cas réduit, où le plafond est 1 ms. [Couverture, Spec §FR-005, §SC-010]
- [ ] CHK034 FR-028 exige 4,5:1 pour le texte raturé ; le couple est-il mesuré sur **tous** les fonds où une rature peut apparaître, ou seulement sur papier et pupitre ? [Couverture, Spec §FR-028, contracts/jeu-de-valeurs.md § 3.1]
- [ ] CHK035 La porte de conformité déclare ne pas vérifier la reconnaissance humaine des silhouettes ; la spécification énonce-t-elle cette limite, ou la découvre-t-on au contrat ? Une limite non écrite dans le critère se lit comme une garantie. [Complétude, Spec §SC-003, contracts/jeu-de-valeurs.md § 6]

## Dépendances et hypothèses

- [ ] CHK036 L'hypothèse « les prototypes ne sont pas du code à reprendre » énumère-t-elle de façon **exhaustive et vérifiable** ce qui est normatif — valeurs, copie, libellés, géométrie des silhouettes, contrat d'accessibilité ? [Hypothèse, Spec §Assumptions]
- [ ] CHK037 La place définitive du dossier de design est renvoyée au plan ; FR-001 reste-t-elle vraie et vérifiable quel que soit l'emplacement retenu ? [Dépendance, Spec §Dépendances, research.md § R3]
- [ ] CHK038 Les quatre polices sont-elles épinglées en version exacte et justifiées, comme la constitution l'exige de toute dépendance, et l'exigence dit-elle où cette justification vit ? [Dépendance, Spec §FR-004, plan.md § Technical Context]
- [ ] CHK039 L'hypothèse « les obstacles de 001 sont au nombre de cinq, répartis en deux silhouettes selon ce que leur déblaiement libère » est-elle validée contre le catalogue réel, ou reste-t-elle une lecture de la maquette ? [Hypothèse, Spec §Assumptions, research.md § R6]
- [ ] CHK040 L'hypothèse selon laquelle l'écran de parcelle est le seul écran habillé est-elle compatible avec FR-001, qui interdit toute valeur visuelle en dur **partout** ? Les deux autres écrans reçoivent le jeu de valeurs sans que rien ne dise ce qu'ils en font. [Hypothèse, Spec §Assumptions, §FR-001]

## Résolutions appliquées le 2026-08-28

Les items ci-dessous ne sont **pas cochés** : le cochage appartient au
relecteur. Ils sont listés parce que le document visé a été corrigé, et que la
question qu'ils posaient a reçu une réponse écrite.

| Item | Ce qui a été corrigé |
| --- | --- |
| CHK002 | **FR-039a** interdit toute taille de police exprimée en pixels et exige qu'elles suivent le réglage système |
| CHK003 | **FR-039** exige que le rôle d'un texte soit **inscrit dans le document**, et qu'un texte non marqué soit présumé porteur d'information |
| CHK019 | **FR-039** est amendé : quatre planchers par rôle — 16 px pour un champ de saisie, 14 pour un texte porteur d'information, 12 pour un intitulé de bloc, 9,5 pour un décor. La rédaction à 9,5 px et son motif d'abandon sont consignés dans l'exigence |
| CHK020 | **FR-001a** distingue les *valeurs* du dossier des *nombres écrits à propos* de ses valeurs, et admet deux écarts nommés — le relèvement au plancher, et le recalcul des ratios |
| CHK021 | **FR-001a** exige qu'une valeur opérante que le dossier ne porte pas soit **consignée** avant d'être appliquée : c'est le cas du pas `chiffre-xs` |
| CHK022 | **FR-001a** tranche : un ratio annoncé est de la documentation, jamais une autorisation ; le recalcul fait foi |
| CHK023 | **FR-024** porte le constat que l'indicateur prescrit par le dossier ne tient pas l'exigence, et impose la vérification contre **chacun** des fonds |
| CHK026 | **FR-039** consigne l'amendement de **SC-009 de 001** et dit pourquoi : le conflit est résolu dans les deux spécifications, non contourné dans un plan |

**Restent ouverts et non traités** : les lacunes de fond — définition de « valeur
chiffrée » (CHK010) et d'« aplat de ressource » (CHK011), le statut de la jauge
au regard de FR-005 (CHK012), « environ 35 à 40 % » (CHK013), les exigences de
chargement des polices (CHK004), et les critères de succès manquants (CHK028 à
CHK035). Ce sont des décisions de conception, pas des corrections de rédaction.

## Notes

- Ne cocher `[x]` qu'après avoir constaté que le critère de qualité d'exigence
  est satisfait — au besoin en corrigeant `spec.md` ou l'artefact visé.
- Laisser décoché ce qui demande encore une clarification, une correction ou une
  évaluation par le relecteur.
- `/speckit-implement` lit l'état des cases comme une porte et ne doit **pas**
  modifier les marqueurs.
- `checklists/requirements.md` a son propre cycle de vie, tenu par
  `/speckit-specify` et `/speckit-clarify` ; l'exception ne s'étend pas à ce
  fichier.
- Les items CHK019, CHK020, CHK021, CHK022 et CHK023 portent des écarts
  **constatés entre documents**. Trois d'entre eux sont déjà tranchés dans
  `plan.md` et `research.md` sans que `spec.md` ait été amendée : c'est
  exactement l'écart implicite que le principe I proscrit, et il se résout dans
  la spécification, non dans la note de plan.
