import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from './contrast';

const css = readFileSync(join(process.cwd(), 'app', 'theme.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const THEMES = { dark: block(":root[data-theme='dark']"), light: block(":root[data-theme='light']") };

// Body text needs 4.5:1; large text and UI parts (buttons on the background) need 3:1.
const PAIRS: [string, string, number][] = [
  ['text', 'background', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-raised', 4.5],
  ['text-muted', 'background', 4.5],
  ['text-muted', 'surface', 4.5],
  ['primary', 'background', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['accent', 'background', 3],
  ['success', 'background', 4.5],
  ['danger', 'background', 4.5],
  ['warning', 'background', 3],
  ['focus-ring', 'background', 3],
];

describe('theme tokens', () => {
  it.each(Object.entries(THEMES))('%s theme meets WCAG AA for every listed pair', (_name, tokens) => {
    for (const [fg, bg, min] of PAIRS) {
      expect(tokens[fg], `--${fg}`).toBeDefined();
      expect(contrastRatio(tokens[fg], tokens[bg]), `--${fg} on --${bg}`).toBeGreaterThanOrEqual(min);
    }
  });
});
