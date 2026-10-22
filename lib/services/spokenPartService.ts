// Server-only. The spoken Teil runtime: the examiner's intro, the turn loop with the AI partner, and oral grading.
import type Database from 'better-sqlite3';
import type { PracticeResult, SpokenRunView, SpokenState, SpokenTurnView } from '../exam/practiceViews';
import type { TeilSetContent } from '../exam/teilSets';
import { readSpokenAnchors } from '../speaking/anchors';
import { pronunciationEstimate } from '../speaking/pronunciation';
import { buildPartnerPrompt, buildSpokenGradingPrompt, parsePartnerReply, parseSpokenGrade, type SpokenGrade } from '../speaking/spokenGrading';
import { nextTurnState } from '../speaking/turnLoop';
import { EXAMINER_VOICE, PARTNER_VOICES } from '../speaking/voices';
import { getSpeechProvider, type SpeechProvider } from '../speech/speechProvider';
import type { SpokenAnswer, SpokenPartContent } from '../tasks/spoken';
import { selectAnchors } from '../writing/anchors';
import { generateWithActiveProvider, type AiRequest, type AiResult } from './aiService';
import { recordMistakes } from './errorLogService';
import { generateParsed } from './freestyleAi';
import { createNotificationService } from './notificationService';
import { PracticeError } from './practiceError';
import { createSpeechClipService } from './speechClipService';
import { ABANDONED_MS, GRADING_LOCK_MS, isGrading, overtimeSecondsOf, partOf, requireAttempt, round2, setOf, takeGradingLock, type AttemptRow } from './teilAttempts';

// S19: the examiner's fixed closing line, spoken when the student's last turn is in or Finish is pressed.
export const CLOSING_LINE = "Vielen Dank, das war's.";
// I3: a partner turn is one to three sentences.
export const PARTNER_MAX_TOKENS = 300;
// S10: like letter grading, one reply carries every mark and both languages.
export const SPOKEN_GRADING_MAX_TOKENS = 8192;
export const SPOKEN_GRADING_TIMEOUT_MS = 90_000;
// B3: partner and examiner lines are rendered directly, never through the listening audio cache.
const RENDER = { filter: 'none' as const, pauseMs: 600 };

export interface SpokenPartDeps {
  generate?: (request: AiRequest) => Promise<AiResult>;
  now?: () => Date;
  provider?: SpeechProvider;
  // Where clip files go; defaults to <data dir>/speech-tmp.
  clipsDir?: string;
  // The anchor file reader (tests inject it).
  readAnchors?: typeof readSpokenAnchors;
}

// B2: what teil_attempts.result keeps of a spoken grade: no marks, no turns, no unclear words.
type StoredSpokenGrade = Omit<SpokenGrade, 'marks' | 'estimate'> & { estimate: { score: number } | null };

const scopeOf = (attemptId: number) => `teil:${attemptId}`;
const isStudent = (t: SpokenTurnView) => t.speaker === 'student';

// B2: a finished spoken attempt replays its stored grade without the conversation, which has been deleted.
export function spokenStoredResult(row: AttemptRow, set: TeilSetContent): PracticeResult {
  const stored = JSON.parse(row.result!) as StoredSpokenGrade;
  const grade: SpokenGrade = { ...stored, marks: [], estimate: stored.estimate ? { score: stored.estimate.score, unclear: [] } : null };
  return {
    attemptId: row.id,
    score: row.score!,
    maxScore: row.max_score!,
    overtimeSeconds: row.overtime_seconds ?? 0,
    review: [],
    tips: set.explanations,
    spoken: { grade, turns: [] },
  };
}

export function createSpokenPartService(db: Database.Database, deps: SpokenPartDeps = {}) {
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));
  const clock = deps.now ?? (() => new Date());
  const clips = createSpeechClipService(db, { provider: deps.provider, dir: deps.clipsDir, now: clock });
  const provider = () => deps.provider ?? getSpeechProvider(db);
  const readAnchors = deps.readAnchors ?? readSpokenAnchors;

  // B3: a line in the given voice, stored as a partner clip; a failed text-to-speech keeps the text only.
  async function speak(attemptId: number, text: string, voice: string): Promise<string> {
    let audio: Buffer | null = null;
    try {
      audio = await provider().render({ segments: [{ text, voice }], ...RENDER });
    } catch {
      audio = null;
    }
    return clips.savePartnerClip(scopeOf(attemptId), audio, text);
  }

  function answerOf(row: AttemptRow): SpokenAnswer {
    const parsed = row.answers ? (JSON.parse(row.answers) as Partial<SpokenAnswer>) : null;
    return parsed?.type === 'spoken' && Array.isArray(parsed.clipIds) ? { type: 'spoken', clipIds: parsed.clipIds } : { type: 'spoken', clipIds: [] };
  }

  // B2: the conversation lives only in its clips. The first line is the examiner's intro and the fixed closing
  // line is the examiner's; every other partner clip reads as the partner's (the attempt keeps clip ids only).
  function turnsOf(clipIds: string[]): SpokenTurnView[] {
    return clipIds.map((clipId, i) => {
      const clip = clips.getClip(clipId);
      if (!clip) throw new PracticeError('This conversation has expired', 'not_found');
      const text = clip.transcript ?? '';
      const speaker = clip.role === 'student' ? 'student' : i === 0 || text === CLOSING_LINE ? 'examiner' : 'partner';
      return { speaker, text, clipId, audio: clip.path !== null };
    });
  }

  // Review Focus 4 + S8: only the student's turn count decides; a reply's speaker never does.
  const closedAt = (turns: SpokenTurnView[], set: SpokenPartContent) => turns.filter(isStudent).length >= set.turns;
  const stateOf = (turns: SpokenTurnView[], set: SpokenPartContent): SpokenState => (closedAt(turns, set) ? 'closing' : 'student');

  function spokenAttempt(attemptId: number) {
    const row = requireAttempt(db, attemptId);
    const { format, part } = partOf(row.format_id, row.part_id);
    const teilSet = setOf(db, row.set_id);
    if (teilSet.taskType !== 'spoken') throw new PracticeError('This attempt is not a spoken part', 'bad_request');
    return { row, format, part, teilSet, set: teilSet.content as SpokenPartContent };
  }

  const expired = (row: AttemptRow, now: Date) => now.getTime() - Date.parse(row.started_at) > ABANDONED_MS;
  const gradingError = () => new PracticeError('This conversation is being graded', 'unavailable', 'spoken_grading');

  // B7: a write of the conversation, compare-and-set on the answers it was built from, and never while
  // another request holds a live grading lock.
  function writeAnswer(attemptId: number, before: string | null, answer: SpokenAnswer, allowLockedAt?: string): boolean {
    const staleBefore = new Date(clock().getTime() - GRADING_LOCK_MS).toISOString();
    const lockGuard = allowLockedAt ? 'grading_started_at = ?' : '(grading_started_at IS NULL OR grading_started_at < ?)';
    return (
      db
        .prepare(`UPDATE teil_attempts SET answers = ? WHERE id = ? AND finished_at IS NULL AND answers IS ? AND ${lockGuard}`)
        .run(JSON.stringify(answer), attemptId, before, allowLockedAt ?? staleBefore).changes > 0
    );
  }

  // The examiner's intro, as the conversation's first line (S18). Called right after the attempt is created.
  async function open(attemptId: number, set: SpokenPartContent): Promise<SpokenRunView> {
    const clipId = await speak(attemptId, set.examinerIntro, EXAMINER_VOICE);
    db.prepare('UPDATE teil_attempts SET answers = ? WHERE id = ?').run(JSON.stringify({ type: 'spoken', clipIds: [clipId] } satisfies SpokenAnswer), attemptId);
    return { set, turns: turnsOf([clipId]), state: 'student' };
  }

  // One student turn: their recording's transcript, then the partner's reply, or at the last turn the
  // examiner's closing line. A failed AI call appends nothing, so the same recording can be sent again.
  async function turn(attemptId: number, clipId: string): Promise<{ turns: SpokenTurnView[]; state: SpokenState }> {
    const now = clock();
    const { row, format, part, set } = spokenAttempt(attemptId);
    if (row.finished_at) throw new PracticeError('This conversation is finished', 'bad_request');
    if (expired(row, now)) throw new PracticeError('This attempt has expired', 'not_found');
    if (isGrading(row, now)) throw gradingError();

    const answer = answerOf(row);
    // B7 + S3: only the student's own new recording from this attempt.
    const clip = typeof clipId === 'string' ? clips.getClip(clipId) : null;
    if (!clip || clip.role !== 'student' || clip.scope !== scopeOf(row.id) || answer.clipIds.includes(clipId)) {
      throw new PracticeError('That recording does not belong to this conversation', 'bad_request');
    }
    const text = clip.transcript?.trim() ?? '';
    if (!text) throw new PracticeError('Nothing was recognised in that recording', 'bad_request');

    const turns = turnsOf(answer.clipIds);
    const studentTurns = turns.filter(isStudent).length + 1;
    const state = nextTurnState({ studentTurns, maxTurns: set.turns, finished: false, closed: closedAt(turns, set) });
    if (state === 'done') throw new PracticeError('This conversation is over', 'bad_request');

    let reply: { speaker: 'partner' | 'examiner'; text: string };
    if (state === 'closing') {
      reply = { speaker: 'examiner', text: CLOSING_LINE };
    } else {
      const withStudent: SpokenTurnView[] = [...turns, { speaker: 'student', text, clipId, audio: clip.path !== null }];
      const partnerReply = await generateParsed(
        generate,
        { ...buildPartnerPrompt({ level: format.level, part, set, turns: withStudent }), maxTokens: PARTNER_MAX_TOKENS },
        parsePartnerReply
      );
      if (!partnerReply.ok) throw new PracticeError(partnerReply.error, 'ai_failed', partnerReply.code, partnerReply.params);
      reply = partnerReply.value;
    }
    const replyId = await speak(row.id, reply.text, reply.speaker === 'examiner' ? EXAMINER_VOICE : PARTNER_VOICES[set.partner.gender]);

    const next: SpokenAnswer = { type: 'spoken', clipIds: [...answer.clipIds, clipId, replyId] };
    if (!writeAnswer(row.id, row.answers, next)) {
      // Another request changed the conversation first: this reply never happened.
      clips.deleteClip(replyId);
      const current = turnsOf(answerOf(requireAttempt(db, row.id)).clipIds);
      return { turns: current, state: stateOf(current, set) };
    }
    const out = turnsOf(next.clipIds);
    // The reply's own speaker (a mid-way examiner line plays as the examiner's).
    out[out.length - 1] = { ...out[out.length - 1], speaker: reply.speaker };
    return { turns: out, state };
  }

  // B7: graded once, under the grading lock. A failure releases the lock and leaves the attempt open.
  async function finish(attemptId: number): Promise<PracticeResult> {
    const now = clock();
    const { row, format, part, teilSet, set } = spokenAttempt(attemptId);
    if (row.finished_at) return spokenStoredResult(row, teilSet);
    if (expired(row, now)) throw new PracticeError('This attempt has expired', 'not_found');
    const rubric = part.rubric;
    if (!rubric) throw new PracticeError(`${part.id} has no rubric yet`, 'unavailable');
    if (!turnsOf(answerOf(row).clipIds).some(isStudent)) throw new PracticeError('Say something before you finish', 'bad_request');
    const overtimeSeconds = overtimeSecondsOf(db, row, part, format, now);

    const lockedAt = clock();
    const unlock = takeGradingLock(db, row.id, lockedAt);
    if (!unlock) {
      const current = requireAttempt(db, row.id);
      if (current.finished_at) return spokenStoredResult(current, teilSet);
      throw gradingError();
    }
    try {
      // Read again under the lock: a turn may have landed since.
      const locked = requireAttempt(db, row.id);
      let answer = answerOf(locked);
      let turns = turnsOf(answer.clipIds);
      // S19: an early Finish (or the last student turn without its reply) gets the examiner's closing line first.
      const last = turns.at(-1);
      if (!last || last.speaker === 'student' || last.text !== CLOSING_LINE) {
        const closingId = await speak(row.id, CLOSING_LINE, EXAMINER_VOICE);
        const closed: SpokenAnswer = { type: 'spoken', clipIds: [...answer.clipIds, closingId] };
        if (!writeAnswer(row.id, locked.answers, closed, lockedAt.toISOString())) {
          clips.deleteClip(closingId);
          throw gradingError();
        }
        answer = closed;
        turns = turnsOf(answer.clipIds);
      }

      const anchors = readAnchors(format.id, part.id);
      if (!anchors) {
        const key = `${format.id}/${part.id}`;
        await createNotificationService(db).raise(
          'content_issues',
          `speaking_anchors:${key}`,
          'Speaking anchors missing',
          `Grading ${key} used the rubric only: the anchor file is missing or invalid.`
        );
      }
      // The estimate covers every word the student said in the conversation.
      const words = turns.filter(isStudent).flatMap((t) => clips.getClip(t.clipId)?.words ?? []);
      const estimate = pronunciationEstimate(words);
      const prompt = buildSpokenGradingPrompt({
        level: format.level,
        formatName: format.name,
        part: { ...part, rubric },
        set,
        turns,
        anchors: anchors ? selectAnchors(anchors, rubric) : [],
        estimate,
      });
      const graded = await generateParsed(
        generate,
        { ...prompt, maxTokens: SPOKEN_GRADING_MAX_TOKENS, timeoutMs: SPOKEN_GRADING_TIMEOUT_MS },
        (reply) => parseSpokenGrade(reply, turns, rubric, estimate)
      );
      if (!graded.ok) throw new PracticeError(graded.error, graded.code === 'bad_request' ? 'bad_request' : 'ai_failed', graded.code, graded.params);
      const grade = graded.value;
      recordMistakes(db, 'speaking', grade.marks.map((m) => ({ category: m.category, wrong: m.original, right: m.correction })), { now: clock });

      // S15 as for letters: the score is the rubric points, out of the part's points (equal to the rubric's maximum).
      const score = round2(grade.points);
      const stored: StoredSpokenGrade = {
        criteria: grade.criteria,
        points: grade.points,
        maxPoints: grade.maxPoints,
        percent: grade.percent,
        pronunciation: grade.pronunciation,
        summary: grade.summary,
        estimate: grade.estimate ? { score: grade.estimate.score } : null,
      };
      const written = db
        .prepare(
          `UPDATE teil_attempts SET score = ?, max_score = ?, overtime_seconds = ?, finished_at = ?, answers = ?, result = ?, grading_started_at = NULL
           WHERE id = ? AND finished_at IS NULL`
        )
        .run(score, part.points, overtimeSeconds, now.toISOString(), JSON.stringify(answer), JSON.stringify(stored), row.id).changes;
      if (written === 0) return spokenStoredResult(requireAttempt(db, row.id), teilSet);
      return {
        attemptId: row.id,
        score,
        maxScore: part.points,
        overtimeSeconds,
        review: [],
        tips: teilSet.explanations,
        spoken: { grade, turns },
      };
    } finally {
      // A no-op once the attempt is finished; otherwise the attempt stays open for a retry.
      unlock();
    }
  }

  return { open, turn, finish };
}
