import { createHash } from 'node:crypto';

export type AudioFilter = 'none' | 'phone' | 'station' | 'radio';
const FILTERS: AudioFilter[] = ['none', 'phone', 'station', 'radio'];
const VOICES = { m: ['thorsten', 'karlsson', 'pavoque'], f: ['kerstin', 'ramona', 'eva_k'] } as const;
export const RENDERER_VERSION = 1;
export const PAUSE_MS = 600;

export interface ParsedTranscript {
  filter: AudioFilter;
  lines: { label: string; gender: 'm' | 'f'; text: string; voice: string }[];
}

const LINE = /^\[(.+?)\s+([mf])\]\s*(.+)$/;

export function parseTranscript(text: string): ParsedTranscript | { error: string } {
  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let filter: AudioFilter = 'none';
  if (rows[0]?.startsWith('@filter')) {
    const name = rows.shift()!.slice('@filter'.length).trim();
    if (!FILTERS.includes(name as AudioFilter)) return { error: `unknown filter ${name}` };
    filter = name as AudioFilter;
  }
  if (rows.length === 0) return { error: 'the transcript is empty' };
  const voiceOf = new Map<string, string>();
  const used = { m: 0, f: 0 };
  const lines: ParsedTranscript['lines'] = [];
  for (const [i, row] of rows.entries()) {
    const m = LINE.exec(row);
    if (!m) return { error: `line ${i + 1} needs a speaker tag like [Name m]` };
    const [, label, gender, said] = m as unknown as [string, string, 'm' | 'f', string];
    const key = `${label}|${gender}`;
    if (!voiceOf.has(key)) {
      const pool = VOICES[gender];
      voiceOf.set(key, pool[used[gender] % pool.length]);
      used[gender] += 1;
    }
    lines.push({ label, gender, text: said, voice: voiceOf.get(key)! });
  }
  return { filter, lines };
}

export function audioHash(parsed: ParsedTranscript): string {
  const payload = JSON.stringify({
    segments: parsed.lines.map((l) => ({ text: l.text, voice: l.voice })),
    filter: parsed.filter,
    pauseMs: PAUSE_MS,
    rendererVersion: RENDERER_VERSION,
  });
  return createHash('sha256').update(payload).digest('hex');
}
