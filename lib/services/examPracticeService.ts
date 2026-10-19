import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { formatId as formatIdOf, readFormat, RUNTIME_TASK_TYPES, type ExamFormat, type ExamPart } from '../exam/formats';
import type { ItemReview, MockRun, PracticeOverview, PracticeResult, PracticeRun, ReadinessView } from '../exam/practiceViews';
import type { TeilSetContent } from '../exam/teilSets';
import type { MatchingContent } from '../tasks/matching';
import { correctTexts, gradeTask, parseTaskAnswer, viewTask, type TaskAnswer } from '../tasks/taskTypes';
import { answerTexts } from '../tasks/answerTexts';
import { errorBodyFor, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { generateWithActiveProvider, type AiRequest, type AiResult } from './aiService';
import { createProfileService } from './profileService';
import { createTeilSetService, TeilSetError } from './teilSetService';
import { audioHashOf, type AudioAvailabilityDeps } from '../audio/audioAvailability';
import { hasAudio } from '../audio/audioStore';
import { isSpeechUp } from '../speech/speechAvailability';
import { audioReveal, type AudioQuestionsContent, type AudioReveal } from '../tasks/audioQuestions';
import type { LetterAnswer, LetterContent } from '../tasks/letter';
import type { LetterGrade } from '../writing/letterGrading';
import { pointsFor, rubricMaxPoints, type Grade, type WritingRubric } from '../writing/rubric';
import { gradeLetter } from './letterGradingService';

export type PracticeErrorKind = 'not_found' | 'bad_request' | 'unavailable' | 'ai_failed';
const STATUS: Record<PracticeErrorKind, number> = { not_found: 404, bad_request: 400, unavailable: 409, ai_failed: 502 };
// S7: an unavailable part is a legitimate state with its own message, not a bad request.
const CODE: Record<PracticeErrorKind, ErrorCode> = { not_found: 'not_found', bad_request: 'bad_request', unavailable: 'part_unavailable', ai_failed: 'ai_failed' };

export class PracticeError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, readonly kind: PracticeErrorKind, code?: ErrorCode, readonly params?: ErrorParams) {
    super(message);
    this.code = code ?? CODE[kind];
  }
}

export function toPracticeErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof PracticeError)) return null;
  return { status: STATUS[err.kind], body: errorBodyFor(err) };
}

export interface ExamPracticeDeps {
  generate?: (request: AiRequest) => Promise<AiResult>;
  now?: () => Date;
  // The bundled Teil sets folder (B2); tests point it at a fixture.
  setsDir?: string;
  // Listening availability (S7): tests inject fakes for the speech service and the audio cache.
  audio?: AudioAvailabilityDeps;
}

// Review Focus 2: an attempt left open longer than this can't be submitted any more.
const ABANDONED_MS = 3 * 3600 * 1000;
const READINESS_WINDOW = 5;

interface AttemptRow {
  id: number;
  format_id: string;
  part_id: string;
  set_id: string | null;
  kind: 'practice' | 'mock';
  mock_id: string | null;
  score: number | null;
  max_score: number | null;
  overtime_seconds: number | null;
  started_at: string;
  finished_at: string | null;
  answers: string | null;
  grading_started_at: string | null;
  result: string | null;
}

// A letter part is graded on its rubric, so it has no runner without one (formatProblems requires it for bundled formats).
const hasRunner = (part: ExamPart) => RUNTIME_TASK_TYPES.has(part.taskType) && (part.taskType !== 'letter' || part.rubric !== undefined);
const isListening = (part: ExamPart) => part.taskType === 'audio_questions';
// S10: Sprachbausteine are practised only inside the full mock.
const singlyRunnable = (part: ExamPart) => hasRunner(part) && part.skill !== 'sprachbausteine';
const percent = (score: number, max: number) => (max > 0 ? (score / max) * 100 : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
// B4: a letter's grading lock older than this is stale (the provider times out after 90 s).
const GRADING_LOCK_MS = 120 * 1000;

// Nothing was written: every criterion at its lowest grade, and no AI call.
function emptyLetterGrade(rubric: WritingRubric): LetterGrade {
  const nothing = { en: 'Nothing was written.', de: 'Es wurde nichts geschrieben.' };
  const criteria = rubric.criteria.map((c) => {
    const graded = Object.entries(c.points).filter(([, p]) => p !== undefined) as [Grade, number][];
    const lowest = graded.reduce((low, g) => (g[1] < low[1] ? g : low))[0];
    return { id: c.id, grade: lowest, justification: nothing };
  });
  const maxPoints = rubricMaxPoints(rubric);
  const points = pointsFor(rubric, Object.fromEntries(criteria.map((c) => [c.id, c.grade])));
  return { marks: [], criteria, points, maxPoints, percent: 0, corrected: '', summary: nothing };
}

function translate(err: unknown): never {
  if (err instanceof TeilSetError) throw new PracticeError(err.message, err.kind);
  throw err;
}

export function createExamPracticeService(db: Database.Database, deps: ExamPracticeDeps = {}) {
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));
  const clock = deps.now ?? (() => new Date());
  const teilSets = createTeilSetService(db, { generate, now: clock, setsDir: deps.setsDir });
  const cached = deps.audio?.cached ?? hasAudio;
  const askSpeech = deps.audio?.speechUp ?? (() => isSpeechUp(db));
  // One speech check per request (the answer is memoized in-process for 30 s anyway).
  const speechCheck = () => {
    let answer: Promise<boolean> | undefined;
    return () => (answer ??= askSpeech());
  };
  const setCached = (set: TeilSetContent) => {
    const hash = audioHashOf(set.taskType, set.content);
    return hash !== null && cached(hash);
  };

  // Spec + S10: a listening part needs at least one usable set (no AI set from nothing), and then the
  // speech service up or a usable set whose audio is cached. Cached sets answer without a check.
  async function listeningRunnable(formatId: string, part: ExamPart, speechUp: () => Promise<boolean>): Promise<boolean> {
    if (!teilSets.hasUsableSet(formatId, part.id, () => true)) return false;
    return teilSets.hasUsableSet(formatId, part.id, setCached) || (await speechUp());
  }

  function partOf(formatId: string, partId: string): { format: ExamFormat; part: ExamPart } {
    // S1: readFormat accepts only known format-id shapes.
    const format = typeof formatId === 'string' ? readFormat(formatId) : null;
    const part = format?.parts.find((p) => p.id === partId);
    if (!format || !part) throw new PracticeError(`Unknown exam part: ${formatId}/${partId}`, 'not_found');
    return { format, part };
  }

  function activeFormat(): ExamFormat | null {
    const profile = createProfileService(db).getProfile();
    return readFormat(formatIdOf(profile.activeTrack, profile.activeLevel));
  }

  function setOf(setId: string | null): TeilSetContent {
    const row = setId ? (db.prepare('SELECT content FROM teil_sets WHERE id = ?').get(setId) as { content: string } | undefined) : undefined;
    if (!row) throw new PracticeError('The set for this attempt no longer exists', 'not_found');
    return JSON.parse(row.content) as TeilSetContent;
  }

  // S10: while the speech service is down a listening part serves only sets with cached audio and
  // never asks the AI for a new set (its audio couldn't be rendered). `playable` feeds the view.
  async function pick(
    formatId: string,
    part: ExamPart,
    speechUp: () => Promise<boolean>
  ): Promise<{ id: string; set: TeilSetContent; playable: (hash: string) => boolean }> {
    if (isListening(part) && !(await listeningRunnable(formatId, part, speechUp))) {
      throw new PracticeError(`The audio for ${part.id} is unavailable right now`, 'unavailable');
    }
    const up = isListening(part) ? await speechUp() : true;
    if (!up && !teilSets.hasUsableSet(formatId, part.id, setCached)) {
      throw new PracticeError(`The audio for ${part.id} is unavailable right now`, 'unavailable');
    }
    try {
      const picked = await teilSets.pickForPractice(formatId, part.id, up ? {} : { accept: setCached, generate: false });
      return { ...picked, playable: (hash: string) => up || cached(hash) };
    } catch (err) {
      translate(err);
    }
  }

  function insertAttempt(formatId: string, part: ExamPart, setId: string, kind: 'practice' | 'mock', mockId: string | null, startedAt: string): number {
    const info = db
      .prepare('INSERT INTO teil_attempts (format_id, part_id, set_id, kind, mock_id, max_score, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(formatId, part.id, setId, kind, mockId, part.points, startedAt);
    return Number(info.lastInsertRowid);
  }

  const runOf = (
    attemptId: number,
    formatId: string,
    part: ExamPart,
    picked: { id: string; set: TeilSetContent; playable: (hash: string) => boolean },
    startedAt: string,
    mockId: string | null
  ): PracticeRun => ({
    attemptId,
    formatId,
    part,
    set: { id: picked.id, view: viewTask(picked.set.taskType, picked.set.content, picked.playable) },
    minutes: part.minutes,
    startedAt,
    mockId,
  });

  // The written-block parts a mock runs, in block order.
  function mockParts(format: ExamFormat): ExamPart[] {
    const block = format.blocks.find((b) => b.id === 'written');
    return (block?.partIds ?? []).map((id) => format.parts.find((p) => p.id === id)!).filter(hasRunner);
  }

  async function overview(): Promise<PracticeOverview> {
    const format = activeFormat();
    if (!format) return { format: null, parts: [], mockRunnable: false };
    const last = db.prepare(
      'SELECT score, max_score FROM teil_attempts WHERE format_id = ? AND part_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC, id DESC LIMIT 1'
    );
    const speechUp = speechCheck();
    const listeningOk = new Map<string, boolean>();
    for (const part of format.parts.filter((p) => hasRunner(p) && isListening(p))) {
      listeningOk.set(part.id, await listeningRunnable(format.id, part, speechUp));
    }
    const available = (part: ExamPart) => listeningOk.get(part.id) ?? true;
    const inMock = mockParts(format);
    return {
      format,
      parts: format.parts.map((part) => {
        const row = last.get(format.id, part.id) as { score: number; max_score: number } | undefined;
        return {
          part,
          runnable: singlyRunnable(part) && available(part),
          mockOnly: hasRunner(part) && !singlyRunnable(part),
          audioUnavailable: !available(part),
          lastPercent: row ? Math.round(percent(row.score, row.max_score)) : null,
        };
      }),
      mockRunnable: inMock.length > 0 && inMock.every(available),
    };
  }

  async function start(formatId: string, partId: string): Promise<PracticeRun> {
    const { part } = partOf(formatId, partId);
    if (!singlyRunnable(part)) throw new PracticeError(`${partId} can't be practised on its own`, 'unavailable');
    const picked = await pick(formatId, part, speechCheck());
    const startedAt = clock().toISOString();
    return runOf(insertAttempt(formatId, part, picked.id, 'practice', null, startedAt), formatId, part, picked, startedAt, null);
  }

  // Spec + B2: every written-block part with a runner, in block order, under one timer. A part
  // without a usable set fails the whole mock rather than shortening it.
  async function startMock(formatId: string): Promise<MockRun> {
    const format = typeof formatId === 'string' ? readFormat(formatId) : null;
    if (!format) throw new PracticeError(`Unknown exam format: ${formatId}`, 'not_found');
    const parts = mockParts(format);
    if (parts.length === 0) throw new PracticeError('This exam has no parts to practise yet', 'unavailable');
    // S10: a listening part that can't be heard right now stops the mock before anything is picked.
    const speechUp = speechCheck();
    for (const part of parts.filter(isListening)) {
      if (!(await listeningRunnable(format.id, part, speechUp))) {
        throw new PracticeError(`The audio for ${part.id} is unavailable right now`, 'unavailable');
      }
    }
    const picks: { id: string; set: TeilSetContent; playable: (hash: string) => boolean }[] = [];
    for (const part of parts) picks.push(await pick(format.id, part, speechUp));
    const mockId = randomUUID();
    const startedAt = clock().toISOString();
    const runs = db.transaction(() =>
      parts.map((part, i) => runOf(insertAttempt(format.id, part, picks[i].id, 'mock', mockId, startedAt), format.id, part, picks[i], startedAt, mockId))
    )();
    return { mockId, runs, minutes: parts.reduce((s, p) => s + p.minutes, 0) };
  }

  // For a mock attempt the clock is the mock's: its shared start and the sum of its parts' minutes.
  function allowedMinutes(row: AttemptRow, part: ExamPart, format: ExamFormat): number {
    if (!row.mock_id) return part.minutes;
    const ids = db.prepare('SELECT part_id FROM teil_attempts WHERE mock_id = ?').all(row.mock_id) as { part_id: string }[];
    return ids.reduce((s, { part_id }) => s + (format.parts.find((p) => p.id === part_id)?.minutes ?? 0), 0);
  }

  // A letter has no per-item review (gradeTask throws for letters): its grade is stored instead (B4).
  function reviewOf(set: TeilSetContent, answer: TaskAnswer): { review: ItemReview[]; right: number } {
    if (set.taskType === 'letter') return { review: [], right: 0 };
    const { itemResults } = gradeTask(set.taskType, set.content, answer);
    const correct = correctTexts(set.taskType, set.content);
    const given = answerTexts(set.taskType, set.content, answer);
    const review = itemResults.map((right, index) => ({ index, answerText: given[index], right, correct: correct[index], explanation: set.explanations[index] }));
    return { review, right: itemResults.filter(Boolean).length };
  }

  function requireAttempt(attemptId: number): AttemptRow {
    const row = Number.isInteger(attemptId) ? (db.prepare('SELECT * FROM teil_attempts WHERE id = ?').get(attemptId) as AttemptRow | undefined) : undefined;
    if (!row) throw new PracticeError('Attempt not found', 'not_found');
    return row;
  }

  // Listening: after submit the transcript and evidence are shown (spec: never before answering).
  function revealOf(set: TeilSetContent): { reveal?: AudioReveal } {
    if (set.taskType !== 'audio_questions') return {};
    try {
      return { reveal: audioReveal(set.content as AudioQuestionsContent) };
    } catch {
      return {};
    }
  }

  function letterResult(row: AttemptRow, set: TeilSetContent, answer: LetterAnswer, grade: LetterGrade): PracticeResult {
    return {
      attemptId: row.id,
      score: row.score!,
      maxScore: row.max_score!,
      overtimeSeconds: row.overtime_seconds ?? 0,
      review: [],
      letter: grade,
      text: answer.text,
      taskIndex: answer.taskIndex,
      tips: set.explanations,
    };
  }

  function storedResult(row: AttemptRow): PracticeResult {
    const set = setOf(row.set_id);
    const answer = JSON.parse(row.answers!) as TaskAnswer;
    // B4: a letter replays its stored grade; it is never graded again.
    if (answer.type === 'letter') return letterResult(row, set, answer, JSON.parse(row.result!) as LetterGrade);
    const { review } = reviewOf(set, answer);
    return { attemptId: row.id, score: row.score!, maxScore: row.max_score!, overtimeSeconds: row.overtime_seconds ?? 0, review, ...revealOf(set) };
  }

  // Writes a finished attempt, guarded on finished_at so two racing submits can't both write. A letter
  // also stores its grade and releases its grading lock. Returns the stored result when another write won.
  function finish(row: AttemptRow, score: number, maxScore: number, overtimeSeconds: number, now: Date, answer: TaskAnswer, grade: LetterGrade | null) {
    return db
      .prepare(
        `UPDATE teil_attempts SET score = ?, max_score = ?, overtime_seconds = ?, finished_at = ?, answers = ?, result = ?, grading_started_at = NULL
         WHERE id = ? AND finished_at IS NULL`
      )
      .run(score, maxScore, overtimeSeconds, now.toISOString(), JSON.stringify(answer), grade ? JSON.stringify(grade) : null, row.id).changes > 0;
  }

  // S4 + B4: a letter is graded by the AI while the attempt holds a grading lock, taken atomically, so a
  // second submit never starts a second grading call. A failure releases the lock and leaves it open.
  async function submitLetter(
    row: AttemptRow,
    format: ExamFormat,
    part: ExamPart,
    set: TeilSetContent,
    answer: LetterAnswer,
    now: Date,
    overtimeSeconds: number
  ): Promise<PracticeResult> {
    const rubric = part.rubric;
    if (!rubric) throw new PracticeError(`${part.id} has no rubric yet`, 'unavailable');
    const task = (set.content as LetterContent).tasks[answer.taskIndex];
    if (!task) throw new PracticeError('That task does not exist', 'bad_request');

    if (!answer.text.trim()) {
      const grade = emptyLetterGrade(rubric);
      if (!finish(row, grade.points, part.points, overtimeSeconds, now, answer, grade)) return storedResult(requireAttempt(row.id));
      return letterResult(requireAttempt(row.id), set, answer, grade);
    }

    const lockedAt = clock();
    const locked = db
      .prepare(
        'UPDATE teil_attempts SET grading_started_at = ? WHERE id = ? AND finished_at IS NULL AND (grading_started_at IS NULL OR grading_started_at < ?)'
      )
      .run(lockedAt.toISOString(), row.id, new Date(lockedAt.getTime() - GRADING_LOCK_MS).toISOString());
    if (locked.changes === 0) {
      const current = requireAttempt(row.id);
      if (current.finished_at) return storedResult(current);
      throw new PracticeError('This letter is being graded', 'unavailable', 'letter_grading');
    }
    const unlock = () => db.prepare('UPDATE teil_attempts SET grading_started_at = NULL WHERE id = ? AND finished_at IS NULL').run(row.id);

    let outcome: Awaited<ReturnType<typeof gradeLetter>>;
    try {
      outcome = await gradeLetter(
        db,
        { level: format.level, formatId: format.id, partId: part.id, formatName: format.name, rubric, task, text: answer.text, source: 'teil', germanOnlyTask: true },
        { generate, now: clock }
      );
    } catch (err) {
      unlock();
      throw err;
    }
    if (!outcome.ok) {
      unlock();
      throw new PracticeError(outcome.error, outcome.code === 'bad_request' ? 'bad_request' : 'ai_failed', outcome.code, outcome.params);
    }
    // S15: the score is the rubric points, out of the part's points (equal to the rubric's maximum).
    const score = round2(outcome.grade.points);
    if (!finish(row, score, part.points, overtimeSeconds, now, answer, outcome.grade)) return storedResult(requireAttempt(row.id));
    return letterResult(requireAttempt(row.id), set, answer, outcome.grade);
  }

  async function submit(attemptId: number, answers: unknown): Promise<PracticeResult> {
    const row = requireAttempt(attemptId);
    // Review Focus 1: a repeated submit returns the first result unchanged.
    if (row.finished_at) return storedResult(row);
    const now = clock();
    const elapsedMs = now.getTime() - Date.parse(row.started_at);
    if (elapsedMs > ABANDONED_MS) throw new PracticeError('This attempt has expired', 'not_found');
    const { format, part } = partOf(row.format_id, row.part_id);
    const set = setOf(row.set_id);
    const answer = parseTaskAnswer(set.taskType, answers, set.content);
    // I9: "none" (null) is only an answer when the matching part offers it.
    const noneWithoutOption =
      answer?.type === 'matching' && !(set.content as MatchingContent).allowNone && answer.selected.some((s) => s === null);
    if (!answer || noneWithoutOption) throw new PracticeError('The answers do not fit this task', 'bad_request');
    // S4: measured at request entry, before any AI call, so grading time never counts as overtime.
    const overtimeSeconds = Math.max(0, Math.floor(elapsedMs / 1000 - allowedMinutes(row, part, format) * 60));
    if (answer.type === 'letter') return submitLetter(row, format, part, set, answer, now, overtimeSeconds);
    const { review, right } = reviewOf(set, answer);
    const score = round2((right * part.points) / review.length);
    if (!finish(row, score, part.points, overtimeSeconds, now, answer, null)) return storedResult(requireAttempt(row.id));
    return { attemptId: row.id, score, maxScore: part.points, overtimeSeconds, review, ...revealOf(set) };
  }

  async function explain(attemptId: number, itemIndex: number, question: string): Promise<{ reply: string }> {
    const row = requireAttempt(attemptId);
    if (!row.finished_at) throw new PracticeError('Submit the part before asking about it', 'bad_request');
    const { part } = partOf(row.format_id, row.part_id);
    const set = setOf(row.set_id);
    // S17: a letter's feedback is its grade; there is no item to ask about.
    if (set.taskType === 'letter') throw new PracticeError('A letter has no items to ask about', 'bad_request');
    const { review } = reviewOf(set, JSON.parse(row.answers!) as TaskAnswer);
    const item = Number.isInteger(itemIndex) ? review[itemIndex] : undefined;
    if (!item) throw new PracticeError('There is no such item', 'bad_request');
    // S11: the view leaves the transcript out, so a listening item gets it (and its evidence) here.
    const listening =
      set.taskType === 'audio_questions'
        ? [
            `The transcript of what the learner heard: ${(set.content as AudioQuestionsContent).transcript}`,
            `The words in the transcript that give this item's answer: ${(set.content as AudioQuestionsContent).questions[item.index]?.evidence ?? '(not stored)'}`,
          ]
        : [];
    const systemPrompt = [
      `You help a German learner understand one item of the exam part "${part.title.de}" they just practised.`,
      `The part's instructions: ${part.instructions}`,
      `The task (JSON, without answers): ${JSON.stringify(viewTask(set.taskType, set.content))}`,
      ...listening,
      `The item: number ${item.index + 1}.`,
      `The learner's answer: ${item.answerText || '(no answer)'}. The right answer: ${item.correct}.`,
      `The stored explanation: ${item.explanation.en} / ${item.explanation.de}`,
      "Reply in the language of the learner's question, briefly, keeping German examples in German.",
      'Reply in plain text, with no Markdown.',
    ].join('\n');
    const result = await generate({ systemPrompt, messages: [{ role: 'user', content: question }] });
    if (!result.ok) throw new PracticeError(result.error, 'ai_failed', result.code, result.params);
    const reply = result.text.trim();
    if (!reply) throw new PracticeError('The AI sent an empty reply', 'ai_failed', 'ai_bad_reply');
    return { reply };
  }

  // Per part: the last 5 finished attempts (S8: newest first, ties by id).
  function readiness(): ReadinessView {
    const format = activeFormat();
    if (!format) return { formatId: '', formatName: '', parts: [] };
    const recent = db.prepare(
      `SELECT score, max_score, overtime_seconds FROM teil_attempts WHERE format_id = ? AND part_id = ? AND finished_at IS NOT NULL
       ORDER BY finished_at DESC, id DESC LIMIT ${READINESS_WINDOW}`
    );
    return {
      formatId: format.id,
      formatName: format.name,
      parts: format.parts.filter(hasRunner).map((part) => {
        const rows = recent.all(format.id, part.id) as { score: number; max_score: number; overtime_seconds: number | null }[];
        const mean = rows.length ? rows.reduce((s, r) => s + percent(r.score, r.max_score), 0) / rows.length : null;
        return {
          partId: part.id,
          title: part.title,
          averagePercent: mean === null ? null : Math.round(mean),
          attempts: rows.length,
          overtime: rows.some((r) => (r.overtime_seconds ?? 0) > 0),
        };
      }),
    };
  }

  return { overview, start, startMock, submit, explain, readiness };
}
