export type PronunciationBand = 'clear' | 'mostly_clear' | 'sometimes_unclear';
export interface PronunciationEstimate {
  score: number;
  unclear: string[];
}

// A word whose recognition probability is below this counts as unclear.
export const UNCLEAR_THRESHOLD = 0.6;

// An estimate from speech recognition: the mean word probability × 100, and the words recognised with low confidence.
export function pronunciationEstimate(words: { word: string; probability: number }[]): PronunciationEstimate {
  if (words.length === 0) return { score: 0, unclear: [] };
  const mean = words.reduce((sum, w) => sum + w.probability, 0) / words.length;
  const unclear = [...new Set(words.filter((w) => w.probability < UNCLEAR_THRESHOLD).map((w) => w.word.trim()).filter(Boolean))];
  return { score: Math.round(mean * 100), unclear };
}

export function pronunciationBand(score: number): PronunciationBand {
  return score >= 85 ? 'clear' : score >= 70 ? 'mostly_clear' : 'sometimes_unclear';
}
