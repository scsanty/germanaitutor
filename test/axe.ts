import { expect } from 'vitest';
import { configureAxe } from 'vitest-axe';
import type { AxeMatchers } from 'vitest-axe/matchers';

// Colour contrast is checked by lib/design/themeTokens.test.ts (jsdom has no layout or computed colours).
const runAxe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });

type Result = Awaited<ReturnType<typeof runAxe>>;

// The vitest `Assertion` type cannot be augmented without clashing with jest-dom's declaration, so the
// matcher is reached through this cast. The matcher itself is registered in vitest.setup.ts.
export const axe = runAxe;
export function expectNoViolations(results: Result) {
  (expect(results) as unknown as AxeMatchers).toHaveNoViolations();
}
