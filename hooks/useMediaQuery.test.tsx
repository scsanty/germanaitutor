import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

describe('useMediaQuery', () => {
  it('renders false first (matching the server), then applies the real match', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useMediaQuery('(min-width: 1024px)'));
      return null;
    }
    render(<Probe />);
    expect(seen[0]).toBe(false);
    expect(seen[seen.length - 1]).toBe(true);
  });
});
