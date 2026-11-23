import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalSpeechProvider, transcribeTimeoutMs } from './localSpeechProvider';

const MB = 1024 * 1024;

describe('transcribeTimeoutMs', () => {
  it('keeps a 120 s floor, adds 120 s per MB and caps at 600 s', () => {
    expect(transcribeTimeoutMs(0)).toBe(120_000);
    expect(transcribeTimeoutMs(50 * 1024)).toBe(125_859);
    expect(transcribeTimeoutMs(1 * MB)).toBe(240_000);
    expect(transcribeTimeoutMs(2.5 * MB)).toBe(420_000);
    expect(transcribeTimeoutMs(4 * MB)).toBe(600_000);
    expect(transcribeTimeoutMs(10 * MB)).toBe(600_000);
  });

  it('only grows with the upload', () => {
    let last = 0;
    for (let bytes = 0; bytes <= 6 * MB; bytes += 256 * 1024) {
      const ms = transcribeTimeoutMs(bytes);
      expect(ms).toBeGreaterThanOrEqual(last);
      last = ms;
    }
  });
});

describe('local speech provider: transcribe timeout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives the request a timeout scaled to the clip size', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: 'Hallo', language: 'de', duration: 1, words: [] }))));
    try {
      const provider = createLocalSpeechProvider('http://speech.test');
      await provider.transcribe(Buffer.alloc(2 * MB), 'small');
      expect(timeout).toHaveBeenCalledWith(360_000);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
