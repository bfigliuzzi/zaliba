// Zaliba — « La Régie approximative »
// Tokens UnoCSS prêts à l'emploi. Rien d'inventé ici : chaque valeur est extraite
// des maquettes 6a / 6b (dossier 6 de « Zaliba - Pistes de jeu.dc.html »).
//
//   pnpm add -D unocss @unocss/preset-web-fonts
//
// Les polices sont chargées via presetWebFonts (provider google). Si le projet
// interdit les ressources externes — c'est une contrainte connue du projet Zaliba —
// remplacer par des @font-face auto-hébergés : voir README, § Polices.

import { defineConfig, presetUno, presetWebFonts } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetWebFonts({
      provider: 'google',
      fonts: {
        // font-ui / font-etroit / font-mono / font-pochoir
        ui: [{ name: 'Archivo', weights: ['400', '500', '600', '700', '800'] }],
        etroit: [{ name: 'Archivo Narrow', weights: ['400', '600', '700', '800'] }],
        mono: [{ name: 'JetBrains Mono', weights: ['400', '500', '700'] }],
        pochoir: [{ name: 'Saira Stencil One', weights: ['400'] }],
      },
    }),
  ],

  theme: {
    // ─────────────────────────────────────────────────────────────────────────
    // COULEURS — sept valeurs nommées, plus leurs variantes de thème.
    // Règle absolue : aucune information ne tient à la teinte seule.
    // ─────────────────────────────────────────────────────────────────────────
    colors: {
      encre: {
        DEFAULT: '#1B2220', // texte, liserés, glyphes. 12,8:1 sur papier
        nuit: '#141A18',    // fond du thème sombre / du pupitre (6c)
        douce: '#2A3230',   // case libre en thème sombre
      },
      ardoise: '#4A5450',   // séparateurs sur fond d'encre
      mine: '#96A09B',      // texte secondaire SUR ENCRE uniquement (6,16:1)
      trait: '#6E7873',     // liseré minimal d'un composant sur papier (3,1:1)
      papier: '#E2E6DC',    // fond des plaques, support de tout chiffre
      pupitre: '#D6DBD0',   // fond de l'écran, case libre en thème clair
      carton: '#C9CEC2',    // fond « plateau » (piste 4c)

      camelote: {
        DEFAULT: '#C4552A', // 3,5:1 sur encre — aplat et liseré, jamais du texte
        brique: '#8E3B1B',  // variante « échelle de valeurs » (piste 5a)
      },
      jus: '#E8B21C',       // 1,5:1 — remplissage seul, TOUJOURS bordé d'encre
      bave: {
        DEFAULT: '#8E4BA8', // 4,5:1 sur papier
        nuit: '#B072C8',    // teinte recalculée pour le thème sombre
        claire: '#9C63B4',  // variante « échelle de valeurs » (piste 5a)
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // TYPOGRAPHIE — échelle sémantique. [taille, interligne]
    // Aucun texte porteur sous 9,5 px ; les blagues vivent en 9,5–10 px.
    // ─────────────────────────────────────────────────────────────────────────
    fontSize: {
      micro: ['8.5px', '1.2'],     // surtitres administratifs, majuscules espacées
      note: ['9.5px', '1.4'],      // notes de bas de page, blagues
      label: ['10px', '1.2'],      // libellés de section, majuscules espacées
      menu: ['11.5px', '1.35'],    // légende, entrées de liste
      corps: ['12px', '1.5'],      // texte courant
      item: ['13px', '1.2'],       // entrée de registre
      fiche: ['17px', '1.2'],      // titre de fiche bâtiment
      'chiffre-s': ['16px', '1.05'],
      'chiffre-m': ['22px', '1.05'],
      'chiffre-l': ['30px', '1'],
      'pochoir-s': ['19px', '1'],   // bouton mobile
      'pochoir-m': ['24px', '1'],   // bouton desktop
      'titre-m': ['34px', '.95'],   // nom de planète, mobile
      'titre-l': ['46px', '.95'],   // nom de planète, desktop
    },

    // ─────────────────────────────────────────────────────────────────────────
    // ESPACEMENTS — volontairement impairs par endroits : c'est la Régie qui a
    // mesuré. Ne pas « arrondir » vers une grille de 4, ça tue l'approximation.
    // ─────────────────────────────────────────────────────────────────────────
    spacing: {
      ras: '3px',
      fin: '5px',
      court: '7px',
      moyen: '9px',
      ample: '11px',
      aise: '13px',
      large: '16px',
      guichet: '18px',
      comptoir: '20px',
    },

    borderWidth: {
      fin: '1.5px',      // liseré d'étiquette collée
      DEFAULT: '2px',    // liseré courant
      fort: '2.5px',     // liseré de plaque, de jeton, de bouton
      cadre: '3px',      // encadrement d'écran, trait tracé à la main
    },

    boxShadow: {
      // ombres dures uniquement — jamais de flou, jamais de couleur nouvelle
      tampon: '5px 5px 0 #1B2220',
      'tampon-lg': '6px 6px 0 #1B2220',
      'tampon-doux': '4px 4px 0 rgba(27,34,32,.35)',
      pupitre: '0 6px 0 #96A09B',      // gros bouton mécanique (6c)
      'pupitre-sm': '0 4px 0 #4A5450',
      // liserés internes : servent d'état, pas de décor
      batiment: 'inset 0 0 0 3px #1B2220',
      visee: 'inset 0 0 0 5px #1B2220',
      'visee-nuit': 'inset 0 0 0 5px #E8B21C',
    },

    // Le design n'a AUCUN arrondi, sauf les jetons et les cadrans.
    borderRadius: { none: '0', jeton: '9999px' },

    // Rotations autorisées. Plafond dur : 1,5°.
    rotate: { rature: '-1.1deg', etiq: '-.6deg', 'etiq-inv': '.5deg', tampon: '-5deg' },
  },

  rules: [
    // Uno ne fournit pas font-variant-numeric par défaut selon les presets.
    [/^tnum$/, () => ({ 'font-variant-numeric': 'tabular-nums' })],
  ],

  shortcuts: {
    // ── Structure ───────────────────────────────────────────────────────────
    // plaque : le conteneur de base, fond papier. Ajouter `cadre-main` pour le
    // trait tracé à la règle qui dépasse aux angles (voir preflights).
    plaque: 'relative bg-papier',
    ecran: 'bg-pupitre border-cadre border-encre relative overflow-hidden',
    'ecran-nuit': 'bg-encre-nuit border-cadre border-encre relative overflow-hidden text-papier',

    // etiquette : le papier collé qui reçoit TOUT chiffre posé sur un aplat.
    // C'est la règle non négociable du système (12,8:1 à toute taille).
    etiquette: 'bg-papier border-fin border-encre px-fin pt-fin pb-ras',

    // ── Typographie ─────────────────────────────────────────────────────────
    'micro-titre': 'font-ui text-micro font-600 tracking-[.16em] uppercase',
    'label-section': 'font-ui text-label font-700 tracking-[.16em] uppercase',
    'note-regie': 'font-ui text-note font-400 opacity-80',
    compteur: 'font-mono font-700 tnum',
    'nom-planete': 'font-pochoir text-titre-m md:text-titre-l',

    // ── Boutons (44 px de cible tactile minimum, 48 px effectifs) ───────────
    'btn-poser': 'font-pochoir text-pochoir-s px-large py-aise min-h-[48px] bg-jus text-encre border-fort border-encre shadow-tampon cursor-pointer hover:bg-camelote',
    'btn-releve': 'font-ui text-[12px] font-700 tracking-[.1em] uppercase px-aise py-aise min-h-[48px] bg-papier text-encre border-fort border-encre cursor-pointer hover:bg-pupitre',
    'btn-sans-espoir': 'font-ui text-[12px] px-aise py-aise min-h-[48px] bg-papier text-encre border-2 border-dotted border-encre cursor-pointer hover:bg-pupitre',

    // ── Les onze états de case ──────────────────────────────────────────────
    // Chaque case est carrée, ≥ 44 px, et porte SON glyphe : la couleur ne
    // distingue jamais deux états à elle seule.
    case: 'aspect-square grid place-items-center',
    'case-libre': 'case bg-pupitre',
    'case-libre-nuit': 'case bg-encre-douce',
    'case-camelote': 'case bg-camelote',
    'case-bave': 'case bg-bave',
    'case-jus': 'case bg-jus',
    'case-relief': 'case bg-encre',
    'case-batiment': 'case bg-papier font-etroit font-800 shadow-batiment',
    'case-visee': 'case bg-papier shadow-visee',
    'case-refus': 'case bg-pupitre',

    // ── Jetons & pistes (piste 4c, réutilisables) ──────────────────────────
    jeton: 'w-[38px] h-[38px] rounded-jeton border-fort border-encre shadow-[3px_3px_0_#1B2220] grid place-items-center',
    'cran-plein': 'h-[9px] bg-current border-fin border-encre',
    'cran-vide': 'h-[9px] bg-transparent border-fin border-encre',
  },

  preflights: [
    {
      getCSS: () => `
        :root { color-scheme: light; }
        body {
          margin: 0;
          background: #D6DBD0;
          color: #1B2220;
          font-family: Archivo, system-ui, sans-serif;
          text-wrap: pretty;
        }
        a { color: #1B2220; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 2px; }
        a:hover { color: #C4552A; }
        :focus-visible { outline: 3px solid #C4552A; outline-offset: 2px; }

        /* ───────────────────────────────────────────────────────────────────
           .cadre-main — LE geste signature : un cadre tracé à la règle dont
           les traits se croisent et dépassent aux angles. Deux pseudo-éléments
           suffisent : ::before porte haut+gauche, ::after bas+droite, chacun
           débordant sur l'axe opposé. Le parent doit être en overflow visible.
           ─────────────────────────────────────────────────────────────────── */
        .cadre-main { position: relative; }
        .cadre-main::before,
        .cadre-main::after { content: ''; position: absolute; pointer-events: none; }
        .cadre-main::before {
          left: 0; top: 0; right: -4px; bottom: -3px;
          border-top: 2.5px solid #1B2220;
          border-left: 2.5px solid #1B2220;
        }
        .cadre-main::after {
          left: -4px; top: -3px; right: 0; bottom: 0;
          border-bottom: 2.5px solid #1B2220;
          border-right: 2.5px solid #1B2220;
        }
        .cadre-main--fort::before { right: -8px; bottom: -3px; border-width: 3px; }
        .cadre-main--fort::after  { left: -8px; top: -3px; border-width: 3px; }

        /* ───────────────────────────────────────────────────────────────────
           .rature — l'interface se corrige devant vous.
           Le trait est un enfant absolu, PAS un text-decoration : il doit
           pouvoir dépasser et pencher. L'opacité plancher est .72 (≈5,1:1) —
           en dessous, on tombe sous 1.4.3.
           Contrat d'accessibilité : le contenu rayé est TOUJOURS aria-hidden,
           doublé d'une phrase explicite en .sr-only. Voir README § Ratures.
           ─────────────────────────────────────────────────────────────────── */
        .rature { position: relative; display: inline-block; opacity: .72; }
        .rature > i {
          position: absolute; left: -3px; right: -3px; top: 53%;
          height: 2px; background: #C4552A; transform: rotate(-1.1deg);
        }

        .sr-only {
          position: absolute; width: 1px; height: 1px;
          overflow: hidden; clip-path: inset(50%); white-space: nowrap;
        }

        /* Mouchetures d'encre : décor pur, jamais porteuses de sens. */
        .mouchet { position: absolute; width: 3px; height: 3px; background: #1B2220; border-radius: 50%; opacity: .4; pointer-events: none; }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
        }

        /* Mode contrastes forcés : les aplats et les ombres disparaissent, donc
           la redondance doit reposer sur la SILHOUETTE et le style de trait.
           Les glyphes doivent être en fill="currentColor" pour survivre ici. */
        @media (forced-colors: active) {
          .plaque, [role='gridcell'] { border: 2px solid CanvasText; }
          .cadre-main::before, .cadre-main::after { border-color: CanvasText; }
          .rature > i { background: CanvasText; }
          [class*='shadow-'] { box-shadow: none !important; }
        }
      `,
    },
  ],
})
