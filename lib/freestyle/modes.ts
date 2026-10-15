export type FreestyleMode = 'conversation' | 'grammar_drill' | 'free_reading' | 'free_writing' | 'spoken' | 'exam_practice';

// Spec: modes whose module isn't built yet stay registered but hidden. Speaking flips `spoken`.
// exam_practice has its own screen (ExamPractice) and no session row (S12).
export const FREESTYLE_MODES: { mode: FreestyleMode; labelKey: string; enabled: boolean }[] = [
  { mode: 'conversation', labelKey: 'conversation', enabled: true },
  { mode: 'grammar_drill', labelKey: 'grammarDrill', enabled: true },
  { mode: 'free_reading', labelKey: 'freeReading', enabled: true },
  { mode: 'free_writing', labelKey: 'freeWriting', enabled: true },
  { mode: 'spoken', labelKey: 'spoken', enabled: false },
  { mode: 'exam_practice', labelKey: 'examPractice', enabled: true },
];

export function isFreestyleMode(value: unknown): value is FreestyleMode {
  return FREESTYLE_MODES.some((m) => m.mode === value);
}

export function isModeEnabled(mode: FreestyleMode): boolean {
  return FREESTYLE_MODES.some((m) => m.mode === mode && m.enabled);
}
