// Server-only (reads anchor and format files). The one letter grader for lessons, the Teil runner and Freestyle.
import type Database from 'better-sqlite3';
import { formatId as formatIdOf, readFormat } from '../exam/formats';
import type { LocalizedText } from '../i18n/localizedText';
import type { LetterAnswer, LetterContent, LetterTask } from '../tasks/letter';
import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';
import type { CefrLevel, Track } from '../types';
import { readAnchors, selectAnchors } from '../writing/anchors';
import { buildLetterGradingPrompt, parseLetterGrade, type Anchor, type LetterGrade } from '../writing/letterGrading';
import { LESSON_LETTER_RUBRIC, type WritingRubric } from '../writing/rubric';
import { generateWithActiveProvider, type AiRequest, type AiResult } from './aiService';
import { recordMistakes, type ErrorSource } from './errorLogService';
import { generateParsed } from './freestyleAi';
import { createNotificationService } from './notificationService';

// B1: one reply carries every mark, the criteria in two languages and a fully corrected letter.
export const LETTER_MAX_TOKENS = 4096;
// S1: the spec's server provider timeout.
export const LETTER_TIMEOUT_MS = 90_000;

export interface AnchorPart {
  formatId: string;
  partId: string;
}

export interface LetterGradingInput extends AnchorPart {
  level: CefrLevel;
  // B5/S18: lessons fall back to the NaDoch format's letter part when this part has no anchors.
  fallback?: AnchorPart;
  // null for lessons (the prompt says "a lesson").
  formatName: string | null;
  rubric: WritingRubric;
  task: LetterTask;
  text: string;
  source: ErrorSource;
  germanOnlyTask: boolean;
  instruction?: LocalizedText;
}

export type LetterGradeOutcome =
  | { ok: true; grade: LetterGrade }
  | { ok: false; error: string; code: ErrorCode; params?: ErrorParams };

export interface LetterGradingDeps {
  generate?: (request: AiRequest) => Promise<AiResult>;
  // The error log's clock (tests inject it, like the free-text path).
  now?: () => Date;
  // The anchor file reader (tests inject it, so they don't depend on which anchor files are bundled).
  readAnchors?: typeof readAnchors;
}

// The 2-3 anchors of the first part that has a valid anchor file, selected on that part's own rubric,
// which comes back too: lesson letters show the anchors' grades by that rubric's criterion names.
function anchorsOf(parts: AnchorPart[], read: typeof readAnchors): { anchors: Anchor[]; rubric: WritingRubric } | null {
  for (const { formatId, partId } of parts) {
    const anchors = read(formatId, partId);
    const rubric = readFormat(formatId)?.parts.find((p) => p.id === partId)?.rubric;
    if (anchors && rubric) return { anchors: selectAnchors(anchors, rubric), rubric };
  }
  return null;
}

// Calls the AI, parses the grade, and logs the marks. Missing anchors never block grading:
// the call goes out with the rubric only and the admin gets one content_issues notice per part (S3).
export async function gradeLetter(
  db: Database.Database,
  input: LetterGradingInput,
  deps: LetterGradingDeps = {}
): Promise<LetterGradeOutcome> {
  if (!input.text.trim()) return { ok: false, error: 'Write your letter first', code: 'bad_request' };
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));

  const found = anchorsOf([input, ...(input.fallback ? [input.fallback] : [])], deps.readAnchors ?? readAnchors);
  if (!found) {
    const part = `${input.formatId}/${input.partId}`;
    await createNotificationService(db).raise(
      'content_issues',
      `writing_anchors:${part}`,
      'Writing anchors missing',
      `Grading ${part} used the rubric only: the anchor file is missing or invalid.`
    );
  }

  const prompt = buildLetterGradingPrompt({
    level: input.level,
    formatName: input.formatName,
    rubric: input.rubric,
    task: input.task,
    anchors: found?.anchors ?? [],
    ...(found ? { anchorRubric: found.rubric } : {}),
    text: input.text,
    germanOnlyTask: input.germanOnlyTask,
    instruction: input.instruction,
  });
  const graded = await generateParsed(
    generate,
    { ...prompt, maxTokens: LETTER_MAX_TOKENS, timeoutMs: LETTER_TIMEOUT_MS },
    (reply) => parseLetterGrade(reply, input.text, input.rubric)
  );
  if (!graded.ok) return graded;

  // I5: every graded version logs its marks, so revising counts a mistake again (deliberate).
  recordMistakes(
    db,
    input.source,
    graded.value.marks.map((m) => ({ category: m.category, wrong: m.original, right: m.correction })),
    deps.now ? { now: deps.now } : {}
  );
  return { ok: true, grade: graded.value };
}

const lastLetterPart = (formatId: string): AnchorPart | null => {
  const part = readFormat(formatId)?.parts.filter((p) => p.taskType === 'letter').at(-1);
  return part ? { formatId, partId: part.id } : null;
};

// B5/S18: a lesson's anchors come from its track+level format's last letter part (form parts are
// cloze), and otherwise from the NaDoch format's.
export function lessonAnchorParts(track: Track, level: CefrLevel): { primary: AnchorPart; fallback?: AnchorPart } {
  const own = lastLetterPart(formatIdOf(track, level));
  const nadoch = lastLetterPart(formatIdOf('generic', level));
  const primary = own ?? nadoch ?? { formatId: formatIdOf('generic', level), partId: 'schreiben' };
  const fallback = nadoch && nadoch.formatId !== primary.formatId ? nadoch : undefined;
  return fallback ? { primary, fallback } : { primary };
}

export interface LessonLetterInput {
  level: CefrLevel;
  track: Track;
  content: LetterContent;
  answer: LetterAnswer;
}

// A lesson letter: the chosen task, the lesson rubric, the instruction the learner saw, source lesson.
export async function gradeLessonLetter(
  db: Database.Database,
  { level, track, content, answer }: LessonLetterInput,
  deps: LetterGradingDeps = {}
): Promise<LetterGradeOutcome> {
  const task = content.tasks[answer.taskIndex];
  if (!task) return { ok: false, error: 'That task does not exist', code: 'bad_request' };
  const { primary, fallback } = lessonAnchorParts(track, level);
  return gradeLetter(
    db,
    {
      level,
      ...primary,
      ...(fallback ? { fallback } : {}),
      formatName: null,
      rubric: LESSON_LETTER_RUBRIC,
      task,
      text: answer.text,
      source: 'lesson',
      germanOnlyTask: false,
      ...(content.instruction ? { instruction: content.instruction } : {}),
    },
    deps
  );
}
