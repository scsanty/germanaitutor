// Spec: Motion and Sound. Short tones generated in the browser: no audio files to license.
export type ToneKind = 'correct' | 'wrong' | 'complete';

export const TONES: Record<ToneKind, { frequency: number; start: number; duration: number }[]> = {
  correct: [
    { frequency: 660, start: 0, duration: 0.12 },
    { frequency: 880, start: 0.1, duration: 0.18 },
  ],
  wrong: [{ frequency: 196, start: 0, duration: 0.25 }],
  complete: [
    { frequency: 523, start: 0, duration: 0.12 },
    { frequency: 659, start: 0.12, duration: 0.12 },
    { frequency: 784, start: 0.24, duration: 0.3 },
  ],
};

let shared: AudioContext | null = null;

export function playTone(kind: ToneKind, ctx?: AudioContext): void {
  const context = ctx ?? (shared ??= new AudioContext());
  for (const note of TONES[kind]) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.frequency, context.currentTime + note.start);
    gain.gain.setValueAtTime(0.15, context.currentTime + note.start);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + note.start + note.duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(context.currentTime + note.start);
    osc.stop(context.currentTime + note.start + note.duration);
  }
}
