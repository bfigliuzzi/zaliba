import { defineConfig } from 'drizzle-kit'

/**
 * Configuration de `drizzle-kit`.
 *
 * Le schéma visé est `game`, et lui seul : `public` reste vide côté jeu, ce qui
 * est la première moitié de la décision « le schéma de jeu n'est pas exposé à
 * PostgREST » (doc de stack § 6.1). La seconde moitié se règle côté Supabase,
 * dans la liste des schémas exposés.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  schemaFilter: ['game'],
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/zaliba',
  },
})
