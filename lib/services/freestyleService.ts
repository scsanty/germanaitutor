import type Database from 'better-sqlite3';
import type { CefrLevel } from '../types';
import { FREESTYLE_MODES, isModeEnabled, type FreestyleMode } from '../freestyle/modes';
import { SCENARIOS } from '../freestyle/scenarios';
import { buildArticlePrompt, buildConversationPrompt, buildDrillPrompt, buildSummaryPrompt, buildWritingPrompt } from '../freestyle/prompts';
import { parseArticleReply, parseConversationReply, parseDrillReply, parseSummaryReply, parseWritingReply } from '../freestyle/replies';
import type { SessionMessage, SessionSummary, SessionView } from '../freestyle/sessionViews';
import { errorBodyFor, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { isAtOrBelow, isCefrLevel, levelsUpTo } from '../tutoring/levels';
import { generateWithActiveProvider, isAiAvailable, type AiRequest, type AiResult } from './aiService';
import { generateParsed } from './freestyleAi';
import { createProfileService } from './profileService';
import { createContentText } from './contentText';
import { loadLevelGating } from './levelGating';

// Spec: Freestyle never writes to lesson attempts, completions, exercise reviews or anything the
// tree reads. It touches only freestyle_sessions and freestyle_messages; End deletes both, and the
// summary is returned once and never stored.

export type FreestyleErrorKind = 'not_found' | 'bad_request' | 'locked' | 'busy' | 'ai_failed';
const STATUS: Record<FreestyleErrorKind, number> = { not_found: 404, bad_request: 400, locked: 403, busy: 409, ai_failed: 502 };
// S10: `busy` means the session is ending: a second End, or a turn or new article while an End
// runs. It maps to session_ending.
const CODE: Record<FreestyleErrorKind, ErrorCode> = {
  not_found: 'not_found',
  bad_request: 'bad_request',
  locked: 'level_locked',
  busy: 'session_ending',
  ai_failed: 'ai_failed',
};

export class FreestyleError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, readonly kind: FreestyleErrorKind, code?: ErrorCode, readonly params?: ErrorParams) {
    super(message);
    this.code = code ?? CODE[kind];
  }
}

export function toFreestyleErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof FreestyleError)) return null;
  return { status: STATUS[err.kind], body: errorBodyFor(err) };
}

interface SessionRow {
  id: number;
  mode: FreestyleMode;
  level: CefrLevel;
  setup: string;
  ending: number;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

// The setup keys each mode accepts (the brief's setup shapes); `article` is written by the server.
const SETUP_KEYS: Partial<Record<FreestyleMode, readonly string[]>> = {
  conversation: ['scenarioId', 'topic'],
  grammar_drill: ['topic'],
  free_reading: ['topic'],
  free_writing: ['prompt'],
};
export const MAX_SETUP_VALUE_LENGTH = 200;
// Including the current message, the history sent to the AI stays within the prompts' 20-message window.
const HISTORY_LIMIT = 19;

export function createFreestyleService(
  db: Database.Database,
  deps: { generate?: (request: AiRequest) => Promise<AiResult>; now?: () => Date } = {}
) {
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));
  const now = deps.now ?? (() => new Date());
  const profiles = createProfileService(db);

  function row(mode: FreestyleMode): SessionRow | undefined {
    return db.prepare('SELECT id, mode, level, setup, ending FROM freestyle_sessions WHERE mode = ?').get(mode) as SessionRow | undefined;
  }

  function messagesOf(sessionId: number): SessionMessage[] {
    return (
      db.prepare('SELECT id, role, content, extra FROM freestyle_messages WHERE session_id = ? ORDER BY id').all(sessionId) as {
        id: number;
        role: 'user' | 'assistant';
        content: string;
        extra: string | null;
      }[]
    ).map((m) => ({ ...m, extra: m.extra ? JSON.parse(m.extra) : null }));
  }

  function view(r: SessionRow): SessionView {
    return { mode: r.mode, level: r.level, setup: JSON.parse(r.setup), messages: messagesOf(r.id) };
  }

  function addMessage(sessionId: number, role: 'user' | 'assistant', content: string, extra: unknown = null): SessionMessage {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO freestyle_messages (session_id, role, content, extra, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, role, content, extra === null ? null : JSON.stringify(extra), now().toISOString());
    return { id: Number(lastInsertRowid), role, content, extra: extra as Record<string, unknown> | null };
  }

  async function ask<T>(request: AiRequest, parse: (text: string) => T | null): Promise<T> {
    const result = await generateParsed(generate, request, parse);
    if (!result.ok) throw new FreestyleError(result.error, 'ai_failed', result.code, result.params);
    return result.value;
  }

  function requireMode(mode: FreestyleMode): void {
    if (!isModeEnabled(mode)) throw new FreestyleError(`Unknown mode: ${mode}`, 'not_found');
  }

  function requireSession(mode: FreestyleMode): SessionRow {
    requireMode(mode);
    const r = row(mode);
    if (!r) throw new FreestyleError('No open session for this mode', 'not_found');
    return r;
  }

  // The session can be ended while an AI call is running; nothing is written to a session that is gone.
  function stillOpen(r: SessionRow): void {
    const current = row(r.mode);
    if (!current || current.id !== r.id) throw new FreestyleError('No open session for this mode', 'not_found');
    if (current.ending) throw new FreestyleError('This session is already ending', 'busy');
  }

  // Some providers reject a conversation that opens with the assistant. The opener or first drill
  // question carries context, so it stays, behind a synthetic learner turn. The window is trimmed
  // here so the prompts' own slice(-20) keeps that first learner turn.
  function history(sessionId: number): { role: 'user' | 'assistant'; content: string }[] {
    const recent = messagesOf(sessionId)
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content }));
    return recent[0]?.role === 'assistant' ? [{ role: 'user', content: 'Start.' }, ...recent] : recent;
  }

  function validateSetup(mode: FreestyleMode, level: CefrLevel, setup: unknown): Record<string, unknown> {
    if (!isPlainObject(setup)) throw new FreestyleError('setup must be an object', 'bad_request');
    const allowed = SETUP_KEYS[mode] ?? [];
    for (const [key, value] of Object.entries(setup)) {
      if (!allowed.includes(key)) throw new FreestyleError(`Unknown setup field: ${key}`, 'bad_request');
      if (typeof value !== 'string' || value.length > MAX_SETUP_VALUE_LENGTH) {
        throw new FreestyleError(`setup.${key} must be a string of at most ${MAX_SETUP_VALUE_LENGTH} characters`, 'bad_request');
      }
    }
    if (mode === 'conversation' && setup.scenarioId !== undefined) {
      const scenario = SCENARIOS.find((s) => s.id === setup.scenarioId);
      if (!scenario) throw new FreestyleError('Unknown scenario', 'bad_request');
      if (scenario.level !== level) throw new FreestyleError(`Scenario ${scenario.id} is not a ${level} scenario`, 'bad_request');
    }
    if ((mode === 'grammar_drill' || mode === 'free_reading') && !nonEmpty(setup.topic)) throw new FreestyleError('Choose a topic', 'bad_request');
    return { ...setup };
  }

  function overview() {
    return {
      modes: FREESTYLE_MODES.filter((m) => m.enabled).map((m) => ({ mode: m.mode, enabled: true, open: !!row(m.mode) })),
      aiAvailable: isAiAvailable(db),
      levels: levelsUpTo(profiles.getProfile().highestUnlockedLevel),
      // Spec: setup defaults to the active level.
      activeLevel: profiles.getProfile().activeLevel,
    };
  }

  function session(mode: FreestyleMode): SessionView | null {
    requireMode(mode);
    const r = row(mode);
    return r ? view(r) : null;
  }

  async function start(mode: FreestyleMode, input: { level: CefrLevel; setup: Record<string, unknown> }): Promise<SessionView> {
    requireMode(mode);
    // S27: a value that isn't a level is a bad request; a real level above the ceiling is locked.
    if (!isCefrLevel(input.level)) throw new FreestyleError(`Not a level: ${String(input.level)}`, 'bad_request');
    const setup = validateSetup(mode, input.level, input.setup);
    const open = row(mode);
    if (open) return view(open);
    if (!isAtOrBelow(input.level, profiles.getProfile().highestUnlockedLevel)) {
      throw new FreestyleError(`Level ${input.level} is locked`, 'locked', 'level_locked', { level: input.level });
    }
    let first: string | null = null;
    if (mode === 'conversation' && setup.scenarioId !== undefined) {
      first = SCENARIOS.find((s) => s.id === setup.scenarioId)!.opener;
    }
    if (mode === 'grammar_drill') {
      first = (await ask(buildDrillPrompt({ level: input.level, topic: String(setup.topic), history: [], answer: null }), parseDrillReply)).next;
    }
    if (mode === 'free_reading') {
      setup.article = await ask(buildArticlePrompt({ level: input.level, topic: String(setup.topic) }), parseArticleReply);
    }
    // A concurrent start may have opened the mode while the AI ran; that one wins and is resumed.
    const raced = row(mode);
    if (raced) return view(raced);
    const created = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO freestyle_sessions (mode, level, setup, started_at) VALUES (?, ?, ?, ?)')
        .run(mode, input.level, JSON.stringify(setup), now().toISOString());
      if (first) addMessage(Number(lastInsertRowid), 'assistant', first);
    });
    created();
    return view(row(mode)!);
  }

  // The student's message is stored only after the AI answered, so a failure leaves the thread clean.
  async function turn(mode: FreestyleMode, text: string): Promise<SessionMessage[]> {
    const r = requireSession(mode);
    if (!nonEmpty(text)) throw new FreestyleError('Write something first', 'bad_request');
    if (r.ending) throw new FreestyleError('This session is already ending', 'busy');
    const setup = JSON.parse(r.setup) as Record<string, unknown>;
    const save = (userExtra: unknown, reply: string, replyExtra: unknown = null): SessionMessage[] => {
      stillOpen(r);
      return db.transaction(() => [addMessage(r.id, 'user', text, userExtra), addMessage(r.id, 'assistant', reply, replyExtra)])();
    };
    if (mode === 'conversation') {
      const scenario = SCENARIOS.find((s) => s.id === setup.scenarioId);
      const topic = nonEmpty(setup.topic) ? setup.topic : null;
      const reply = await ask(
        buildConversationPrompt({ level: r.level, scenario: scenario?.title.de ?? null, topic, history: history(r.id), message: text }),
        parseConversationReply
      );
      return save({ corrections: reply.corrections }, reply.reply);
    }
    if (mode === 'grammar_drill') {
      const reply = await ask(buildDrillPrompt({ level: r.level, topic: String(setup.topic), history: history(r.id), answer: text }), parseDrillReply);
      return save(null, reply.next, { verdict: reply.verdict, explanation: reply.explanation });
    }
    if (mode === 'free_writing') {
      const prompt = nonEmpty(setup.prompt) ? setup.prompt : '';
      const reply = await ask(buildWritingPrompt({ level: r.level, prompt, text }), parseWritingReply);
      return save(null, reply.corrected, { corrections: reply.corrections, comment: reply.comment });
    }
    throw new FreestyleError('This mode has no turns', 'bad_request');
  }

  async function newArticle(): Promise<SessionView> {
    const r = requireSession('free_reading');
    if (r.ending) throw new FreestyleError('This session is already ending', 'busy');
    const setup = JSON.parse(r.setup) as Record<string, unknown>;
    setup.article = await ask(buildArticlePrompt({ level: r.level, topic: String(setup.topic) }), parseArticleReply);
    stillOpen(r);
    db.prepare('UPDATE freestyle_sessions SET setup = ? WHERE id = ?').run(JSON.stringify(setup), r.id);
    return view(row('free_reading')!);
  }

  // A reading session has no messages; its article is what the summary is about.
  function transcriptOf(r: SessionRow): string {
    const lines: string[] = [];
    const article = (JSON.parse(r.setup) as { article?: { title?: unknown; text?: unknown } }).article;
    if (r.mode === 'free_reading' && article && typeof article.title === 'string' && typeof article.text === 'string') {
      lines.push(`Article read by the learner: ${article.title}`, article.text);
    }
    lines.push(...messagesOf(r.id).map((m) => `${m.role}: ${m.content}`));
    return lines.join('\n') || '(no messages)';
  }

  async function end(mode: FreestyleMode, opts: { skipSummary?: boolean }): Promise<SessionSummary | null> {
    const r = requireSession(mode);
    // Review Focus 1: claim the End synchronously, before any await. A second End (with or
    // without a summary) while this one runs is refused, so there is one summary call and one delete.
    const claimed = db.prepare('UPDATE freestyle_sessions SET ending = 1 WHERE id = ? AND ending = 0').run(r.id).changes === 1;
    if (!claimed) throw new FreestyleError('This session is already ending', 'busy');
    // Messages go with the session (ON DELETE CASCADE, plus an explicit delete for safety).
    const remove = db.transaction(() => {
      db.prepare('DELETE FROM freestyle_messages WHERE session_id = ?').run(r.id);
      db.prepare('DELETE FROM freestyle_sessions WHERE id = ?').run(r.id);
    });
    if (opts.skipSummary) {
      remove();
      return null;
    }
    const transcript = transcriptOf(r);
    try {
      const summary = await ask(buildSummaryPrompt({ mode, level: r.level, transcript }), parseSummaryReply);
      remove();
      return summary;
    } catch (err) {
      // The summary failed: release the claim and keep the session so the student can retry.
      db.prepare('UPDATE freestyle_sessions SET ending = 0 WHERE id = ?').run(r.id);
      throw err;
    }
  }

  // S16: the active track's grammar lesson titles at an unlocked level, ranked milestones only, in tree order.
  function grammarTopics(level: unknown): string[] {
    if (!isCefrLevel(level)) throw new FreestyleError(`Not a level: ${String(level)}`, 'bad_request');
    const profile = profiles.getProfile();
    if (!isAtOrBelow(level, profile.highestUnlockedLevel)) {
      throw new FreestyleError(`Level ${level} is locked`, 'locked', 'level_locked', { level });
    }
    const isGrammar = db.prepare('SELECT 1 FROM lessons WHERE id = ? AND skill = ?');
    const text = createContentText(db);
    const titles = loadLevelGating(db, profile.activeTrack, level)
      .lessonsInTreeOrder()
      .filter((id) => isGrammar.get(id, 'grammar'))
      .map((id) => text.lessonTitle(id, profile.uiLanguage));
    return [...new Set(titles)];
  }

  return { overview, session, start, turn, newArticle, end, grammarTopics };
}
