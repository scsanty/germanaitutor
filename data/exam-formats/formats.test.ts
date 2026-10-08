import { describe, it, expect } from 'vitest';
import { formatProblems, listFormats } from '@/lib/exam/formats';

describe('bundled exam formats', () => {
  it('are all valid', () => {
    const formats = listFormats();
    expect(formats.length).toBeGreaterThan(0);
    for (const f of formats) expect(formatProblems(f), f.id).toEqual([]);
  });
});
