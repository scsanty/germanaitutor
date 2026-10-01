import { describe, it, expect, vi } from 'vitest';
import { playTone, TONES } from './sounds';

function fakeContext() {
  const oscillators: { frequency: { setValueAtTime: ReturnType<typeof vi.fn> }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn(() => {
      const o = { type: 'sine', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(o);
      return o;
    }),
    createGain: vi.fn(() => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() })),
  };
  return { ctx: ctx as unknown as AudioContext, oscillators };
}

describe('sounds', () => {
  it('plays one oscillator per note of the tone', () => {
    for (const kind of ['correct', 'wrong', 'complete'] as const) {
      const { ctx, oscillators } = fakeContext();
      playTone(kind, ctx);
      expect(oscillators).toHaveLength(TONES[kind].length);
      expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(TONES[kind][0].frequency, TONES[kind][0].start);
    }
  });
});
