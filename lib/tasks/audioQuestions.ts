import type { LocalizedText } from '../i18n/localizedText';
import { audioHash, parseTranscript, type ParsedTranscript } from '../audio/transcript';
import {
  correctTextPassageQuestions,
  gradePassageQuestions,
  validatePassageQuestions,
  type PassageQuestionsContent,
} from './passageQuestions';

// A listening task: the transcript is spoken (rendered to cached audio), never shown before submit.
export interface AudioQuestionsContent {
  instruction?: LocalizedText;
  transcript: string;
  questions: { question: string; options: string[]; correctIndex: number; evidence?: string }[];
}
export interface AudioQuestionsView {
  instruction?: LocalizedText;
  audio: { hash: string; available: boolean };
  questions: { question: string; options: string[] }[];
}
export interface AudioQuestionsAnswer {
  type: 'audio_questions';
  selected: (number | null)[];
}

// The passage logic only reads `questions`, so audio content can borrow it with any passage text.
const asPassage = (c: AudioQuestionsContent): PassageQuestionsContent => ({ passage: c.transcript, questions: c.questions });

// S5: evidence must be a non-empty substring of one parsed line's text, so the reveal can highlight it.
function evidenceLine(parsed: ParsedTranscript, evidence: unknown): number {
  if (typeof evidence !== 'string' || evidence.trim().length === 0) return -1;
  return parsed.lines.findIndex((l) => l.text.includes(evidence));
}

export function validateAudioQuestions(content: unknown): string[] {
  const c = content as Partial<AudioQuestionsContent>;
  const problems: string[] = [];
  let parsed: ParsedTranscript | null = null;
  if (typeof c?.transcript !== 'string' || c.transcript.trim().length === 0) problems.push('transcript must be a non-empty string');
  else {
    const p = parseTranscript(c.transcript);
    if ('error' in p) problems.push(`transcript: ${p.error}`);
    else parsed = p;
  }
  // Question checks are the passage ones; a placeholder passage keeps its passage check quiet.
  problems.push(...validatePassageQuestions({ passage: '-', questions: c?.questions }));
  // Skip evidence checks when the transcript fails to parse (S5).
  if (parsed && Array.isArray(c?.questions)) {
    c.questions.forEach((q, i) => {
      if (q?.evidence !== undefined && evidenceLine(parsed, q.evidence) < 0) problems.push(`question ${i + 1}: evidence must appear in the transcript`);
    });
  }
  return problems;
}

function hashOf(c: AudioQuestionsContent): string {
  const parsed = parseTranscript(c.transcript);
  if ('error' in parsed) throw new Error(`Invalid transcript: ${parsed.error}`);
  return audioHash(parsed);
}

export function viewAudioQuestions(c: AudioQuestionsContent, available: (hash: string) => boolean): AudioQuestionsView {
  const hash = hashOf(c);
  return {
    ...(c.instruction ? { instruction: c.instruction } : {}),
    audio: { hash, available: available(hash) },
    questions: c.questions.map(({ question, options }) => ({ question, options })),
  };
}

export function parseAudioQuestionsAnswer(raw: unknown, c: AudioQuestionsContent): AudioQuestionsAnswer | null {
  const a = raw as { type?: unknown; selected?: unknown };
  if (a?.type !== 'audio_questions' || !Array.isArray(a.selected) || a.selected.length !== c.questions.length) return null;
  const ok = a.selected.every((s, i) => s === null || (Number.isInteger(s) && (s as number) >= 0 && (s as number) < c.questions[i].options.length));
  return ok ? { type: 'audio_questions', selected: a.selected as (number | null)[] } : null;
}

export function gradeAudioQuestions(c: AudioQuestionsContent, a: AudioQuestionsAnswer): { itemResults: boolean[] } {
  return gradePassageQuestions(asPassage(c), { type: 'passage_questions', selected: a.selected });
}

export function correctTextAudioQuestions(c: AudioQuestionsContent): string[] {
  return correctTextPassageQuestions(asPassage(c));
}

// After submit only: the transcript, and per question its evidence and the line that holds it.
export interface AudioReveal {
  transcript: ParsedTranscript;
  evidence: (string | null)[];
  evidenceLines: (number | null)[];
}

export function audioReveal(c: AudioQuestionsContent): AudioReveal {
  const parsed = parseTranscript(c.transcript);
  if ('error' in parsed) throw new Error(`Invalid transcript: ${parsed.error}`);
  const evidence = c.questions.map((q) => q.evidence ?? null);
  const evidenceLines = evidence.map((e) => {
    const line = e === null ? -1 : evidenceLine(parsed, e);
    return line < 0 ? null : line;
  });
  return { transcript: parsed, evidence, evidenceLines };
}
