import { describe, it, expect } from 'vitest';
import { audioHash, parseTranscript } from './transcript';

const T = `@filter phone
[Anrufer m] Hallo, hier ist Thomas.
[Mailbox f] Bitte sprechen Sie nach dem Ton.
[Anrufer m] Ich rufe später noch einmal an.
[Kollege m] Und ich auch.`;

describe('parseTranscript', () => {
  it('reads the filter, the speakers, and gives each speaker one voice from their pool', () => {
    const parsed = parseTranscript(T);
    expect(parsed).toMatchObject({ filter: 'phone' });
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => [l.label, l.voice])).toEqual([
      ['Anrufer', 'thorsten'],
      ['Mailbox', 'kerstin'],
      ['Anrufer', 'thorsten'],
      ['Kollege', 'karlsson'],
    ]);
  });

  it('defaults to no filter and rejects untagged lines and unknown filters', () => {
    expect(parseTranscript('[A f] Hallo.')).toMatchObject({ filter: 'none' });
    expect(parseTranscript('Hallo ohne Sprecher.')).toEqual({ error: 'line 1 needs a speaker tag like [Name m]' });
    expect(parseTranscript('@filter echo\n[A f] Hallo.')).toEqual({ error: 'unknown filter echo' });
  });

  it('hashes stably, and differently when anything audible changes', () => {
    const a = parseTranscript(T);
    const b = parseTranscript(T);
    const c = parseTranscript(T.replace('phone', 'station'));
    if ('error' in a || 'error' in b || 'error' in c) throw new Error('parse');
    expect(audioHash(a)).toBe(audioHash(b));
    expect(audioHash(a)).not.toBe(audioHash(c));
    expect(audioHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
