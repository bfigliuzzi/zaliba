/**
 * Le principe II de la constitution, rendu mécanique.
 *
 * Les règles de la table § 3 de `docs/architecture/2026-08-23-choix-de-stack.md`
 * et les deux règles de module de sa § 5.2 sont écrites ici. Toutes sont en
 * `error` : la porte de CI bloque, elle n'avertit pas. Une frontière que l'on
 * peut franchir avec un avertissement n'est pas une frontière.
 *
 * Ces règles ne remplacent pas pnpm — qui rend déjà la moitié des violations
 * impossibles à écrire faute de déclaration — elles attrapent l'autre moitié :
 * les chemins relatifs qui traversent un paquet.
 */

/** Un import de `pkg`, qu'il passe par le nom du paquet ou par un chemin relatif. */
const pkg = (name) => `(^|/)packages/${name}/|^@zaliba/${name}(/|$)`

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ─────────────────────────────────────────────────────────────────────
    // Table § 3 — qui peut importer quoi
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'catalogs-n-importe-rien',
      comment:
        'Feuille de l’arbre : des données et leurs types, aucun comportement. ' +
        'Aucune dépendance interne, aucune dépendance externe.',
      severity: 'error',
      from: { path: '^packages/catalogs/src/' },
      to: {
        pathNot: '^packages/catalogs/src/',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'domain-n-importe-que-catalogs',
      comment:
        'Principe II rendu physique : le domaine se teste sans serveur, sans ' +
        'navigateur et sans base. Il ne connaît que le contenu de jeu.',
      severity: 'error',
      from: { path: '^packages/domain/src/' },
      to: {
        pathNot: ['^packages/domain/src/', pkg('catalogs'), '^node_modules/(typescript|@types)/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    /**
     * Ajoutée par la tranche 002.
     *
     * `apps/game/tsconfig.json` déclare désormais les types de Node, parce que les
     * **portes du jeu de valeurs** lisent `tokens.json` et parcourent `src/**` sur
     * le disque. Le typage a donc cessé d'interdire au client d'importer un module
     * Node — et un `node:fs` dans un paquet destiné au navigateur est une faute
     * qui ne se verrait qu'à la compilation, c'est-à-dire trop tard et pour une
     * raison illisible.
     *
     * La frontière est donc rendue ici, où elle est vérifiée. Les **tests** ne sont
     * pas concernés : c'est leur travail de lire le disque.
     */
    {
      name: 'game-src-sans-module-node',
      comment:
        'Le client est destiné au navigateur. Aucun module de la bibliothèque ' +
        'standard de Node n’y a de sens, et le typage ne l’interdit plus depuis ' +
        'que les portes du jeu de valeurs ont besoin de lire le disque.',
      severity: 'error',
      from: { path: '^apps/game/src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'contracts-n-importe-pas-domain',
      comment:
        'La duplication est volontaire. Si le contrat réexporte le domaine, une ' +
        'refactorisation interne change silencieusement le format transmis et ' +
        'casse les clients anciens sans qu’aucune compilation n’échoue.',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: pkg('domain') },
    },
    {
      name: 'db-n-importe-ni-domain-ni-contracts',
      comment:
        'Le schéma de persistance est une préoccupation d’infrastructure. Il ne ' +
        'porte aucune règle de jeu et n’expose aucun contrat réseau.',
      severity: 'error',
      from: { path: '^packages/db/' },
      to: { path: [pkg('domain'), pkg('contracts')] },
    },
    {
      name: 'game-n-importe-pas-db',
      comment:
        'Frontière de sécurité : le client ne connaît pas la base. Le schéma ' +
        '`game` n’est pas exposé et le client n’a que l’API pour interlocuteur.',
      severity: 'error',
      from: { path: '^apps/game/' },
      to: { path: [pkg('db'), '^node_modules/(drizzle-orm|drizzle-kit|postgres)(/|$)'] },
    },

    // ─────────────────────────────────────────────────────────────────────
    // § 5.2 — les deux règles de module
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'kernel-n-importe-jamais-un-module',
      comment:
        'Le noyau détient le vocabulaire ; les modules le consomment. L’inverse ' +
        'ferait du noyau le dépotoir de toute mécanique nouvelle.',
      severity: 'error',
      from: { path: '^packages/domain/src/kernel/' },
      to: { path: '^packages/domain/src/modules/' },
    },
    {
      name: 'graphe-de-modules-acyclique',
      comment: 'Deux modules qui se répondent ne sont qu’un seul module mal découpé.',
      severity: 'error',
      from: { path: '^packages/domain/src/' },
      to: { circular: true },
    },
    {
      name: 'un-module-ne-mute-rien',
      comment:
        'Un module retourne des effets que le noyau applique. Il n’écrit donc ' +
        'jamais en base, ni directement ni par un dépôt.',
      severity: 'error',
      from: { path: '^packages/domain/src/modules/' },
      to: { path: [pkg('db'), '^node_modules/(drizzle-orm|postgres)(/|$)'] },
    },

    // ─────────────────────────────────────────────────────────────────────
    // Hygiène — pas des frontières, mais des fuites qui les contournent
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'aucun-cycle',
      comment: 'Un cycle rend l’ordre d’initialisation indéterminé.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'aucune-dependance-orpheline',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)[.][^/]+[.](cjs|mjs|js|ts)$',
          '[.]d[.]ts$',
          '(^|/)tsconfig[.]json$',
          '(^|/)(babel|biome|vite|vitest|playwright|drizzle)[.]config[.](js|cjs|mjs|ts)$',
          '^apps/[^/]+/src/main[.]tsx$',
          '^apps/api/src/server[.]ts$',
          '^packages/[^/]+/src/index[.]ts$',
        ],
      },
      to: {},
    },
    {
      name: 'aucun-module-inexistant',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'aucune-dependance-de-dev-en-production',
      comment:
        'Une dépendance de développement importée par du code livré est une ' +
        'dépendance de production non déclarée.',
      severity: 'error',
      from: { path: '^(apps|packages)/[^/]+/src/' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'src-n-importe-pas-tests',
      comment: 'Un test peut lire le code livré ; l’inverse est une inversion.',
      severity: 'error',
      from: { path: '^(apps|packages)/[^/]+/src/' },
      to: { path: '^(apps|packages)/[^/]+/tests/' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|[.]turbo|playwright-report|test-results)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
