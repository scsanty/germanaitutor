import { describe, it, expect } from 'vitest';
import { randomSuffix } from './randomId';

describe('randomSuffix', () => {
  it('returns a 6-character hex string by default', () => {
    expect(randomSuffix()).toMatch(/^[0-9a-f]{6}$/);
  });

  it('produces different values on successive calls', () => {
    expect(randomSuffix()).not.toBe(randomSuffix());
  });
});
