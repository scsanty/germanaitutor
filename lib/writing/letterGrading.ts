import { extractJsonObject } from '../ai/json';
import { taxonomyIds, normalizeCategory } from '../errors/taxonomy';
import type { LocalizedText } from '../i18n/localizedText';
import type { ChatMessage } from '../providers/types';
import type { GradeResult } from '../tutoring/grading';
import type { LetterTask } from '../tasks/letter';
import type { CefrLevel } from '../types';
import { locateMarks } from './marks';
import { pointsFor, rubricMaxPoints, type Grade, type WritingRubric } from './rubric';

export type MarkType = 'grammar' | 'vocabulary' | 'spelling' | 'register';
const MARK_TYPES: MarkType[] = ['grammar', 'vocabulary', 'spelling', 'register'];
const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'E'];

export interface Mark {
  start: number;
  end: number;
  original: string;
  correction: string;
  type: MarkType;
  category: string;
  reason: LocalizedText;
}

export interface LetterGrade {
  marks: Mark[];
  criteria: { id: string; grade: Grade; justification: LocalizedText }[];
  points: number;
  maxPoints: number;
  percent: number;
  corrected: string;
  summary: LocalizedText;
}

export interface Anchor {
  task: LetterTask;
  letter: string;
  grades: Record<string, Grade>;
  justification: string;
}

export interface LetterPromptInput {
  level: CefrLevel;
  formatName: string | null;
  rubric: WritingRubric;
  task: LetterTask;
  anchors: Anchor[];
  // The rubric the anchors were graded on (their exam part's), when it isn't `rubric` (lesson letters).
  anchorRubric?: WritingRubric;
  text: string;
  // Exam tasks are German-only. Lesson tasks may also carry the English instruction the learner saw.
  germanOnlyTask: boolean;
  instruction?: LocalizedText;
}

const taskLines = (t: LetterTask) => [
  `Situation: ${t.situation}`,
  `Points to cover (Leitpunkte): ${t.leitpunkte.map((p, i) => `${i + 1}. ${p}`).join(' ')}`,
  `Register: ${t.register}. Word target: ${t.wordTarget.min}–${t.wordTarget.max} words.`,
];

export function buildLetterGradingPrompt(input: LetterPromptInput): { systemPrompt: string; messages: ChatMessage[] } {
  const { level, formatName, rubric, task, anchors, anchorRubric, text, germanOnlyTask, instruction } = input;
  const ids = (r: WritingRubric) => r.criteria.map((c) => c.id).join(',');
  // Lesson letters use exam anchors: their grades are shown by criterion name, never as reply ids.
  const foreign = anchorRubric && ids(anchorRubric) !== ids(rubric) ? anchorRubric : null;
  const gradesOf = (a: Anchor) =>
    foreign
      ? `Grades (on the exam rubric): ${foreign.criteria.map((c) => `${c.name.de} ${a.grades[c.id] ?? '-'}`).join(', ')}`
      : `Grades: ${Object.entries(a.grades).map(([id, g]) => `${id} ${g}`).join(', ')}`;
  const lines: string[] = [
    `You grade a German letter written by a learner at CEFR level ${level} for ${formatName ?? 'a lesson'}.`,
    'Grade each criterion with one grade, using these descriptors:',
  ];
  for (const c of rubric.criteria) {
    lines.push(`- ${c.id} (${c.name.en}):`);
    for (const g of GRADES) if (c.points[g] !== undefined) lines.push(`  ${g} (${c.points[g]} points): ${c.descriptors[g]}`);
  }
  lines.push('', 'The task:', ...taskLines(task));
  if (!germanOnlyTask && instruction) lines.push(`Instructions the learner saw: ${instruction.en}`);
  if (anchors.length > 0) {
    lines.push('', 'Reference letters (already graded; grade consistently with them):');
    if (foreign) {
      lines.push(
        "The reference letters were graded on the exam's criteria; use them only to calibrate overall quality, and grade this letter on the criteria above."
      );
    }
    anchors.forEach((a, i) => {
      lines.push(
        `Reference ${i + 1}:`,
        ...taskLines(a.task),
        `Letter: ${a.letter}`,
        gradesOf(a),
        `Why: ${a.justification}`,
      );
    });
  }
  lines.push(
    '',
    'Instructions:',
    '- List every mistake as a mark. "original" is the exact wrong words copied from the letter, and marks come in order of appearance.',
    `- Give each mark a "type" (grammar, vocabulary, spelling or register) and a "category" from this list: ${taxonomyIds().join(', ')}.`,
    '- Grade every criterion.',
    "- Write a fully corrected version of the letter that keeps the learner's content.",
    '- Summarise in English and in simple German.',
    `- Reply with exactly these criterion ids: ${rubric.criteria.map((c) => c.id).join(', ')}.`,
    'Reply with only a JSON object:',
    '{"marks": [{"original": "...", "correction": "...", "type": "grammar", "category": "...", "reason_en": "...", "reason_de": "..."}],',
    ' "criteria": [{"id": "...", "grade": "A", "justification_en": "...", "justification_de": "..."}],',
    ' "corrected": "...", "summary_en": "...", "summary_de": "..."}',
  );
  return { systemPrompt: lines.join('\n'), messages: [{ role: 'user', content: text }] };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const filled = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function parseLetterGrade(replyText: string, text: string, rubric: WritingRubric): LetterGrade | null {
  const o = extractJsonObject(replyText);
  if (!o || !Array.isArray(o.criteria)) return null;

  const grades: Record<string, Grade> = {};
  const criteria: LetterGrade['criteria'] = [];
  for (const c of rubric.criteria) {
    const got = (o.criteria as Record<string, unknown>[]).find((x) => x?.id === c.id);
    const grade = got?.grade as Grade;
    if (!got || !GRADES.includes(grade) || c.points[grade] === undefined) return null;
    grades[c.id] = grade;
    criteria.push({ id: c.id, grade, justification: { en: str(got.justification_en), de: str(got.justification_de) } });
  }
  if (!filled(o.corrected) || !filled(o.summary_en) || !filled(o.summary_de)) return null;

  const raw = (Array.isArray(o.marks) ? (o.marks as Record<string, unknown>[]) : [])
    .filter((m) => m && filled(m.original))
    .map((m) => ({
      original: m.original as string,
      correction: str(m.correction),
      type: MARK_TYPES.includes(m.type as MarkType) ? (m.type as MarkType) : 'grammar',
      category: normalizeCategory(m.category),
      reason: { en: str(m.reason_en), de: str(m.reason_de) },
    }));
  const marks: Mark[] = locateMarks(text, raw);

  const points = pointsFor(rubric, grades);
  const maxPoints = rubricMaxPoints(rubric);
  const percent = maxPoints === 0 ? 0 : Math.round((points / maxPoints) * 100);
  return { marks, criteria, points, maxPoints, percent, corrected: o.corrected, summary: { en: o.summary_en, de: o.summary_de } };
}

export function resultFromPercent(percent: number): GradeResult {
  return percent >= 60 ? 'correct' : percent >= 40 ? 'almost' : 'wrong';
}
