import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * WCAG 2.1 AA, mesuré et bloquant (FR-061).
 *
 * Aucun écart n'est toléré et aucune règle n'est désactivée : une exception
 * ajoutée ici serait invisible en revue six mois plus tard. Si une règle doit
 * tomber, elle tombe dans le diff, avec son motif écrit.
 */
const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

export async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags([...WCAG_21_AA]).analyze()

  // Le message d'échec doit nommer la règle et le nœud fautif : un compte
  // d'écarts n'apprend rien à qui doit le corriger.
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? 'impact inconnu'}) — ${v.help}\n  ${v.nodes
        .map((n) => n.target.join(' '))
        .join('\n  ')}`,
  )

  expect(summary, `Écarts d'accessibilité :\n${summary.join('\n')}`).toEqual([])
}
