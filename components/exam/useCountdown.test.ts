import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { formatClock, useCountdown } from './useCountdown';

describe('useCountdown', () => {
  afterEach(() => vi.useRealTimers());

  it('corrects for a skewed client clock with the measured offset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T10:05:00Z')); // client clock 5 min ahead of the server
    const startedAt = '2026-10-09T10:00:00Z';
    const offset = Date.parse(startedAt) - Date.now();
    expect(renderHook(() => useCountdown(startedAt, 10)).result.current).toEqual({ secondsLeft: 300, overtime: false });
    expect(renderHook(() => useCountdown(startedAt, 10, offset)).result.current).toEqual({ secondsLeft: 600, overtime: false });
  });

  it('never counts more than the allowed time when the client clock is behind', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T09:55:00Z'));
    expect(renderHook(() => useCountdown('2026-10-09T10:00:00Z', 10)).result.current).toEqual({ secondsLeft: 600, overtime: false });
  });

  it('formats mm:ss', () => {
    expect(formatClock(605)).toBe('10:05');
  });
});
