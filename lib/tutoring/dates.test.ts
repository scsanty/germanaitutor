import { describe, it, expect } from 'vitest';
import { addDays, localDate } from './dates';

describe('localDate', () => {
  it('uses the local calendar day, even late in the evening', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 8, 24, 0, 5))).toBe('2026-09-24');
  });
});

describe('addDays', () => {
  it.each([
    ['2026-09-24', 0, '2026-09-24'],
    ['2026-09-24', 1, '2026-09-25'],
    ['2026-02-27', 3, '2026-03-02'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-10-01', 17, '2026-10-18'],
  ])('%s + %i days = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});
