import { describe, it, expect } from 'vitest';
import { normalizeCategory, TAXONOMY } from './taxonomy';
import { trimSnippet } from './snippets';

describe('taxonomy', () => {
  it('has unique ids, both labels, keywords, and ends with other', () => {
    expect(new Set(TAXONOMY.map((c) => c.id)).size).toBe(TAXONOMY.length);
    expect(TAXONOMY.length).toBeGreaterThanOrEqual(25);
    for (const c of TAXONOMY) expect(c.label.en && c.label.de).toBeTruthy();
    expect(TAXONOMY.at(-1)!.id).toBe('other');
    expect(normalizeCategory('adjective_endings')).toBe('adjective_endings');
    expect(normalizeCategory('made_up')).toBe('other');
    expect(normalizeCategory(42)).toBe('other');
  });
});

describe('trimSnippet', () => {
  it('keeps short text and cuts long text at a word boundary with an ellipsis', () => {
    expect(trimSnippet('wegen dem Regen')).toBe('wegen dem Regen');
    const long = 'Ich habe gestern mit meinem Freund über die Arbeit gesprochen und wir haben lange diskutiert';
    const cut = trimSnippet(long, 40);
    expect(cut.length).toBeLessThanOrEqual(41);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1).trimEnd())).toBe(true);
  });
});
