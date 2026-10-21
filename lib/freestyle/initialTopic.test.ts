import { describe, it, expect } from 'vitest';
import { parseInitialTopic } from './initialTopic';

describe('parseInitialTopic', () => {
  it('ignores arrays, empty and missing values', () => {
    expect(parseInitialTopic(['a', 'b'])).toBeUndefined();
    expect(parseInitialTopic('   ')).toBeUndefined();
    expect(parseInitialTopic(undefined)).toBeUndefined();
  });
  it('trims and cuts to 200 characters', () => {
    expect(parseInitialTopic('  Passiv ')).toBe('Passiv');
    expect(parseInitialTopic('x'.repeat(300))).toHaveLength(200);
  });
});
