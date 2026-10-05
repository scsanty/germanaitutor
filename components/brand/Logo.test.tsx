import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';
import { LOGO_SVG } from './logoSvg.generated';

describe('Logo', () => {
  it('embeds public/brand/nadoch-logo.svg byte for byte (regenerate with npx tsx scripts/build-logo.ts)', () => {
    const file = readFileSync(join(process.cwd(), 'public', 'brand', 'nadoch-logo.svg'), 'utf8');
    expect(LOGO_SVG).toBe(file);
  });

  it('renders the supplied artwork, including the tagline and the filters', () => {
    const { container } = render(<Logo />);
    expect(container.textContent).toContain('Ach so!');
    expect(container.querySelector('#modernShadow')).not.toBeNull();
    expect(container.querySelector('#accentGlow')).not.toBeNull();
    expect(container.innerHTML).toContain('modernShadow');
    expect(container.innerHTML).toContain('accentGlow');
  });

  it('has a single accessible name and hides the inner svg from assistive tech', () => {
    const { container } = render(<Logo />);
    const img = screen.getByRole('img', { name: 'NaDoch!' });
    expect(img.tagName).toBe('SPAN');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('accepts a custom accessible name and class', () => {
    render(<Logo title="Startseite" className="w-40" />);
    const img = screen.getByRole('img', { name: 'Startseite' });
    expect(img.className).toContain('w-40');
  });
});
