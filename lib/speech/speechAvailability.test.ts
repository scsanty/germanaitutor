import { describe, it, expect, vi } from 'vitest';
import { createSpeechAvailability, HEALTH_MEMO_MS } from './speechAvailability';

describe('createSpeechAvailability', () => {
  function setup(ok: boolean | (() => Promise<{ ok: boolean; voices: string[] }>)) {
    let t = 0;
    const health = vi.fn(typeof ok === 'function' ? ok : async () => ({ ok, voices: [] }));
    const availability = createSpeechAvailability({ provider: () => ({ health }), now: () => t });
    return { availability, health, advance: (ms: number) => (t += ms) };
  }

  it('memoizes one health check per URL for 30 s', async () => {
    const { availability, health, advance } = setup(true);
    expect(await availability.isUp('http://a')).toBe(true);
    advance(HEALTH_MEMO_MS - 1);
    expect(await availability.isUp('http://a')).toBe(true);
    expect(health).toHaveBeenCalledTimes(1);
    expect(await availability.isUp('http://b')).toBe(true); // another URL is checked afresh
    expect(health).toHaveBeenCalledTimes(2);
    advance(1);
    await availability.isUp('http://a');
    expect(health).toHaveBeenCalledTimes(3);
  });

  it('shares one call between concurrent requests, and treats a throwing check as down', async () => {
    const { availability, health } = setup(async () => {
      throw new Error('refused');
    });
    expect(await Promise.all([availability.isUp('http://a'), availability.isUp('http://a')])).toEqual([false, false]);
    expect(health).toHaveBeenCalledTimes(1);
  });

  it('takes what the worker recorded', async () => {
    const { availability, health } = setup(false);
    availability.record('http://a', true);
    expect(await availability.isUp('http://a')).toBe(true);
    expect(health).not.toHaveBeenCalled();
  });
});
