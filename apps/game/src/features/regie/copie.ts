/**
 * La copie de la Régie, **reprise telle quelle** du dossier de design (FR-037).
 *
 * Elle est ici et non dans les composants pour deux raisons.
 *
 * **La première est FR-037 lui-même** : « les textes de la Régie MUST être repris
 * tels quels du dossier de design, à l'exception des valeurs qui relèvent des
 * données de jeu ». Un seul endroit rend l'exception vérifiable — tout ce qui est
 * ici est du texte figé, tout ce qui n'y est pas vient de la planète du joueur.
 *
 * **La seconde est FR-038** : aucun de ces textes ne porte d'information
 * nécessaire, aucun n'est cliquable, aucun n'excède le rôle de décor. C'est ce qui
 * autorise le corps 9,5 du registre administratif, et c'est ce qui permet de
 * jouer sans en lire une ligne. Les rassembler rend cette promesse relisible :
 * si un jour l'un d'eux devait porter un fait, il faudrait le sortir d'ici.
 *
 * **Ce qui n'y est pas, et pourquoi.** Les données de la maquette — « Fond de
 * Tiroir », « 18 420 de Camelote », « Parcelle n° 4-B bis (ter) », « 25 cases dont
 * 25 en pente », « 1:204:6 », « vérifié une fois, en 2387 » — ne sont pas de la
 * copie : elles illustraient une mise en page. L'écran affiche les valeurs réelles
 * de la planète, et les zones que le modèle de 001 n'alimente pas sont **omises**
 * plutôt que remplies (FR-008a).
 *
 * Le bouton « Réclamer (sans espoir) » de la maquette large est **supprimé** :
 * FR-025 interdit la commande sans effet, et la fiction de la Régie vit dans les
 * textes, jamais dans un bouton qui ne fait rien.
 */

export const COPIE = {
  /** Le surtitre administratif de la plaque d'en-tête. */
  surtitre: 'Régie interplanétaire des matières qui coulent · guichet 4',

  /** Le tampon, en deux lignes. Décoratif, masqué, et hors du plafond de rotation. */
  tampon: ['VU, MAIS', 'PAS LU'] as const,

  /** La note de bas de page, sous les compteurs. L'astérisque renvoie aux débits. */
  note: '* Les débits sont une estimation de l’estimateur, lui-même estimé.',

  /** La mention finale, en bas de l'écran. */
  mention:
    'Toute pose est définitive, sauf réclamation dans les cinq minutes, ce qui n’arrive jamais.',

  /** L'intitulé de la plaque de chantier. */
  chantierIntitule: 'Chantier en cours',

  /** Le sous-titre du chrono. La Régie ne s'engage sur rien. */
  chantierRestant: 'restant (environ)',

  /**
   * La ligne secondaire de chaque étiquette de ressource.
   *
   * Trois blagues, une par ressource, et aucune ne porte d'information : c'est
   * exactement ce que FR-038 garantit, et c'est ce qui les autorise à rester en
   * corps 9,5 quand le nom de la ressource, lui, remonte à 12.
   */
  aparte: {
    camelote: 'relevé approximatif',
    jus: 'de quoi ?',
    'bave-etoiles': 'ne pas goûter',
  } as const,

  /** Les libellés des commandes visibles (§ 6 du contrat d'interface). */
  commandes: {
    poser: 'JE POSE ÇA',
    /** Pendant que la commande voyage. Le registre de la Régie, jusque dans l'attente. */
    poserEnVol: 'ÇA PART…',
    pivoter: 'Pivoter',
    annuler: 'Annuler',
    releve: 'Relevé',
    releveLarge: 'Relevé complet',
  } as const,

  /** Le bloc de signature du guichet, sur écran large. Décor pur. */
  signature: {
    intitule: 'Signature du contrôleur',
    mention: 'illisible',
    cachet: 'cachet de la poste faisant foi',
  } as const,

  /** L'intitulé du registre des possessions. */
  registreIntitule: 'Registre des possessions',

  /** L'intitulé de la légende. La Régie ne promet pas l'exactitude. */
  legendeIntitule: 'Légende (approximative)',
} as const
