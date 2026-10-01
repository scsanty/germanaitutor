import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders an accessible wordmark, with the tagline only in the full variant', () => {
    const { container, unmount } = render(<Logo />);
    expect(screen.getByRole('img', { name: 'NaDoch!' })).toBeInTheDocument();
    expect(container.textContent).toContain('Ach so!');
    unmount();
    const compact = render(<Logo variant="compact" />);
    expect(compact.container.textContent).not.toContain('Ach so!');
  });

  it('gives each instance its own gradient ids', () => {
    const { container } = render(
      <>
        <Logo />
        <Logo />
      </>
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
