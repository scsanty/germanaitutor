import { extractJsonObject } from '../ai/json';
import { normalizeCategory, taxonomyIds } from '../errors/taxonomy';
import type { LocalizedText } from '../i18n/localizedText';
import type { ChatMessage } from '../providers/types';
import type { ExamPart } from '../exam/formats';
import type { SpokenPartContent } from '../tasks/spoken';
import type { CefrLevel } from '../types';
import { GRADES, MARK_TYPES, type Mark, type MarkType } from '../writing/letterGrading';
import { pointsFor, rubricMaxPoints, type Grade, type WritingRubric } from '../writing/rubric';
import type { PronunciationEstimate } from './pronunciation';

export interface SpokenTurn {
  speaker: 'student' | 'partner' | 'examiner';
  text: string;
}

// A graded reference conversation: only the student's turns are written down.
export interface SpokenAnchor {
  band: 'A' | 'C' | 'D';
  turns: string[];
  grades: Record<string, Grade>;
  justification: string;
}

export interface SpokenGrade {
  criteria: { id: string; grade: Grade; justification: LocalizedText }[];
  points: number;
  maxPoints: number;
  percent: number;
  // `turnIndex` is the index of the student turn in the conversation's turns; offsets are into that turn's NFC text.
  marks: (Mark & { turnIndex: number })[];
  // Null when there was no estimate (nothing was spoken aloud).
  pronunciation: LocalizedText | null;
  summary: LocalizedText;
  // Computed in code from the recogniser's word probabilities; never by the AI.
  estimate: PronunciationEstimate | null;
}

const LABEL: Record<SpokenTurn['speaker'], string> = { student: 'Learner', partner: 'Partner', examiner: 'Examiner' };
const turnLines = (turns: SpokenTurn[]) => turns.map((t) => `${LABEL[t.speaker]}: ${t.text}`).join('\n');

const materialLines = (set: SpokenPartContent) => [
  `Situation: ${set.situation}`,
  ...set.materials.map((m) => `Material "${m.title}": ${m.points.join('; ')}`),
];

export interface SpokenGradingPromptInput {
  level: CefrLevel;
  formatName: string | null;
  part: ExamPart & { rubric: WritingRubric };
  set: SpokenPartContent;
  turns: SpokenTurn[];
  anchors: SpokenAnchor[];
  estimate: PronunciationEstimate | null;
}

export function buildSpokenGradingPrompt(input: SpokenGradingPromptInput): { systemPrompt: string; messages: ChatMessage[] } {
  const { level, formatName, part, set, turns, anchors, estimate } = input;
  const rubric = part.rubric;
  const lines: string[] = [
    `You grade the speaking of a learner at CEFR level ${level} in ${part.title.de} of ${formatName ?? 'a practice exam'}. The conversation was transcribed from speech, so ignore capitalisation and punctuation.`,
    'Grade each criterion with one grade, using these descriptors:',
  ];
  for (const c of rubric.criteria) {
    lines.push(`- ${c.id} (${c.name.en}):`);
    for (const g of GRADES) if (c.points[g] !== undefined) lines.push(`  ${g} (${c.points[g]} points): ${c.descriptors[g]}`);
  }
  if (rubric.zeroesTextOn) {
    const { criterion, grade } = rubric.zeroesTextOn;
    lines.push(
      `If ${criterion} gets grade ${grade}, the whole performance is worth 0 points; still grade every criterion on its own descriptors, and give ${criterion} grade ${grade} whenever its descriptor fits, regardless of this rule.`
    );
  }
  lines.push('', 'The task:', ...materialLines(set), `The partner is ${set.partner.name}: ${set.partner.profile}`);
  if (anchors.length > 0) {
    lines.push('', "Reference conversations (already graded; only the learner's turns are shown; grade consistently with them):");
    anchors.forEach((a, i) => {
      lines.push(
        `Reference ${i + 1}:`,
        ...a.turns.map((t) => `Learner: ${t}`),
        `Grades: ${Object.entries(a.grades).map(([id, g]) => `${id} ${g}`).join(', ')}`,
        `Why: ${a.justification}`
      );
    });
  }
  if (estimate) {
    lines.push(
      '',
      `Pronunciation estimate: ${estimate.score} out of 100 (the mean confidence of the speech recognition).`,
      `Words recognised with low confidence: ${estimate.unclear.length > 0 ? estimate.unclear.join(', ') : 'none'}.`,
      'The pronunciation data is an estimate from speech recognition; comment tentatively.'
    );
  }
  lines.push(
    '',
    'Instructions:',
    '- List every mistake in the learner\'s turns as a mark. "original" is the exact wrong words copied from one Learner turn; never mark Partner or Examiner lines. Marks come in order of appearance.',
    `- Give each mark a "type" (grammar, vocabulary, spelling or register) and a "category" from this list: ${taxonomyIds().join(', ')}.`,
    '- Grade every criterion.',
    ...(estimate ? ['- Comment on pronunciation in English and in simple German, informed by the estimate.'] : []),
    '- Summarise in English and in simple German.',
    `- Reply with exactly these criterion ids: ${rubric.criteria.map((c) => c.id).join(', ')}.`,
    'Reply with only a JSON object:',
    '{"marks": [{"original": "...", "correction": "...", "type": "grammar", "category": "...", "reason_en": "...", "reason_de": "..."}],',
    ' "criteria": [{"id": "...", "grade": "A", "justification_en": "...", "justification_de": "..."}],',
    estimate ? ' "pronunciation_en": "...", "pronunciation_de": "...", "summary_en": "...", "summary_de": "..."}' : ' "summary_en": "...", "summary_de": "..."}'
  );
  return { systemPrompt: lines.join('\n'), messages: [{ role: 'user', content: `The conversation:\n${turnLines(turns)}` }] };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const filled = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

// Places each mark in a student turn: the search starts in the turn (and after the mark) where the last one was
// found and moves on to later student turns; a mark found nowhere is dropped. Matching is in Unicode NFC.
function locateSpokenMarks(turns: SpokenTurn[], raw: Omit<Mark, 'start' | 'end'>[]): (Mark & { turnIndex: number })[] {
  const out: (Mark & { turnIndex: number })[] = [];
  let turn = 0;
  let cursor = 0;
  for (const m of raw) {
    const needle = m.original.normalize('NFC');
    for (let t = turn, from = cursor; t < turns.length; t++, from = 0) {
      if (turns[t].speaker !== 'student') continue;
      const start = turns[t].text.normalize('NFC').indexOf(needle, from);
      if (start < 0) continue;
      out.push({ ...m, start, end: start + needle.length, turnIndex: t });
      turn = t;
      cursor = start + needle.length;
      break;
    }
  }
  return out;
}

export function parseSpokenGrade(replyText: string, turns: SpokenTurn[], rubric: WritingRubric, estimate: PronunciationEstimate | null = null): SpokenGrade | null {
  const o = extractJsonObject(replyText);
  if (!o || !Array.isArray(o.criteria)) return null;

  const grades: Record<string, Grade> = {};
  const criteria: SpokenGrade['criteria'] = [];
  for (const c of rubric.criteria) {
    const got = (o.criteria as Record<string, unknown>[]).find((x) => x?.id === c.id);
    const grade = got?.grade as Grade;
    if (!got || !GRADES.includes(grade) || c.points[grade] === undefined) return null;
    grades[c.id] = grade;
    criteria.push({ id: c.id, grade, justification: { en: str(got.justification_en), de: str(got.justification_de) } });
  }
  if (!filled(o.summary_en) || !filled(o.summary_de)) return null;
  let pronunciation: LocalizedText | null = null;
  if (estimate) {
    if (!filled(o.pronunciation_en) || !filled(o.pronunciation_de)) return null;
    pronunciation = { en: o.pronunciation_en, de: o.pronunciation_de };
  }

  const raw = (Array.isArray(o.marks) ? (o.marks as Record<string, unknown>[]) : [])
    .filter((m) => m && filled(m.original))
    .map((m) => ({
      original: m.original as string,
      correction: str(m.correction),
      type: MARK_TYPES.includes(m.type as MarkType) ? (m.type as MarkType) : 'grammar',
      category: normalizeCategory(m.category),
      reason: { en: str(m.reason_en), de: str(m.reason_de) },
    }));

  const points = pointsFor(rubric, grades);
  const maxPoints = rubricMaxPoints(rubric);
  const percent = maxPoints === 0 ? 0 : Math.round((points / maxPoints) * 100);
  return {
    criteria,
    points,
    maxPoints,
    percent,
    marks: locateSpokenMarks(turns, raw),
    pronunciation,
    summary: { en: o.summary_en, de: o.summary_de },
    estimate,
  };
}

export interface PartnerPromptInput {
  level: CefrLevel;
  part: ExamPart;
  set: SpokenPartContent;
  turns: SpokenTurn[];
}

export function buildPartnerPrompt(input: PartnerPromptInput): { systemPrompt: string; messages: ChatMessage[] } {
  const { level, part, set, turns } = input;
  const systemPrompt = [
    `You play ${set.partner.name}, the learner's exam partner, and sometimes the examiner, in ${part.title.de}.`,
    `Speak German at CEFR level ${level}, one to three sentences, react to what the learner said, and follow the task. Do not end the conversation; the examiner closes it.`,
    `Your character: ${set.partner.profile}`,
    ...materialLines(set),
    `The task instructions: ${part.instructions}`,
    'Reply as the partner. Reply as the examiner only to redirect the learner back to the task.',
    'Reply with only a JSON object: {"speaker": "partner" | "examiner", "text": "..."}',
  ].join('\n');

  // The learner speaks as "user"; the other voices were the model's earlier replies. Consecutive same-role turns merge.
  const messages: ChatMessage[] = [];
  const push = (role: 'user' | 'assistant', content: string) => {
    const last = messages.at(-1);
    if (last && last.role === role) last.content += `\n${content}`;
    else messages.push({ role, content });
  };
  for (const t of turns) {
    if (t.speaker === 'student') push('user', t.text);
    else push('assistant', JSON.stringify({ speaker: t.speaker, text: t.text }));
  }
  if (messages.length === 0 || messages[0].role === 'assistant') messages.unshift({ role: 'user', content: 'The conversation begins.' });
  if (messages.at(-1)!.role === 'assistant') messages.push({ role: 'user', content: 'Continue.' });
  return { systemPrompt, messages };
}

export function parsePartnerReply(text: string): { speaker: 'partner' | 'examiner'; text: string } | null {
  const o = extractJsonObject(text);
  if (!o || (o.speaker !== 'partner' && o.speaker !== 'examiner') || !filled(o.text)) return null;
  return { speaker: o.speaker, text: o.text.trim() };
}
