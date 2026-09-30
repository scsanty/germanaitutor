import type Database from 'better-sqlite3';
import type { Exercise } from '../curriculum/types';
import type { GradeResult } from '../tutoring/grading';
import { correctAnswerFor, taskTextFor } from '../tutoring/lessonAnswers';
import {
  buildLessonChatSystemPrompt,
  CHAT_MESSAGE_MAX_LENGTH,
  recentHistory,
  type ChatExerciseContext,
  type ChatMessageView,
  type PracticeChatAbout,
} from '../tutoring/lessonChat';
import { errorBodyFor, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { generateWithActiveProvider, isAiAvailable, type AiRequest, type AiResult } from './aiService';
import { createCurriculumService } from './curriculumService';
import { createProfileService } from './profileService';
import { createUnlockService } from './unlockService';

export type ChatErrorKind = 'not_found' | 'locked' | 'bad_request' | 'ai_failed';

const DEFAULT_CODE: Record<ChatErrorKind, ErrorCode> = {
  not_found: 'not_found',
  locked: 'level_locked',
  bad_request: 'bad_request',
  ai_failed: 'ai_failed',
};

export class ChatError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: ChatErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

const STATUS_FOR: Record<ChatErrorKind, number> = { not_found: 404, locked: 403, bad_request: 400, ai_failed: 502 };

export function toChatErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof ChatError)) return null;
  return { status: STATUS_FOR[err.kind], body: errorBodyFor(err) };
}

export interface LessonChatDeps {
  generate?: (request: AiRequest) => Promise<AiResult>;
  now?: () => Date;
}

interface MessageRow {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  exercise_id: string | null;
  practice_exercise_id: string | null;
  created_at: string;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  track: Exercise['track'];
  type: Exercise['type'];
  content: string;
}

export function createLessonChatService(db: Database.Database, deps: LessonChatDeps = {}) {
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));
  const now = deps.now ?? (() => new Date());
  const curriculum = createCurriculumService(db);
  const profiles = createProfileService(db);
  const unlocks = createUnlockService(db);

  // Spec: Level Unlocking — chatting about a lesson in a locked level is rejected.
  function getUnlockedLesson(lessonId: string) {
    const lesson = curriculum.getLesson(lessonId, 'generic'); // getLesson ignores its track argument
    if (!lesson) throw new ChatError(`Lesson not found: ${lessonId}`, 'not_found');
    if (!unlocks.isLevelUnlocked(lesson.sourceLevel)) {
      throw new ChatError(`Level ${lesson.sourceLevel} is locked`, 'locked', 'level_locked', { level: lesson.sourceLevel });
    }
    return lesson;
  }

  function listMessages(lessonId: string): ChatMessageView[] {
    const rows = db
      .prepare(
        'SELECT id, role, content, exercise_id, practice_exercise_id, created_at FROM lesson_chat_messages WHERE lesson_id = ? ORDER BY id'
      )
      .all(lessonId) as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      exerciseId: row.exercise_id,
      practiceExerciseId: row.practice_exercise_id,
      createdAt: row.created_at,
    }));
  }

  function getThread(lessonId: string): { messages: ChatMessageView[]; aiAvailable: boolean } {
    const lesson = getUnlockedLesson(lessonId);
    return { messages: listMessages(lesson.id), aiAvailable: isAiAvailable(db) };
  }

  // "Ask AI" is offered only after answering, and never on flashcards (spec: AI Behavior).
  function exerciseContext(lessonId: string, exerciseId: string): ChatExerciseContext {
    const row = db.prepare('SELECT * FROM exercises WHERE id = ? AND lesson_id = ?').get(exerciseId, lessonId) as
      | ExerciseRow
      | undefined;
    if (!row) throw new ChatError('That exercise is not part of this lesson', 'bad_request');
    if (row.type === 'flashcard') throw new ChatError('Ask AI is not available for flashcards', 'bad_request');
    const attempt = db
      .prepare('SELECT result, answer_text, ai_feedback FROM lesson_attempts WHERE exercise_id = ? ORDER BY id DESC LIMIT 1')
      .get(exerciseId) as { result: GradeResult; answer_text: string | null; ai_feedback: string | null } | undefined;
    if (!attempt) throw new ChatError('Answer this exercise before asking about it', 'bad_request');
    const exercise: Exercise = {
      id: row.id,
      lessonId: row.lesson_id,
      track: row.track,
      type: row.type,
      content: JSON.parse(row.content),
    };
    return {
      task: taskTextFor(exercise),
      studentAnswer: attempt.answer_text,
      result: attempt.result,
      correctAnswer: correctAnswerFor(exercise),
      isFreeText: row.type === 'free_text',
      feedback: attempt.ai_feedback,
    };
  }

  function practiceContext(lessonId: string, about: PracticeChatAbout): ChatExerciseContext {
    const row = db
      .prepare('SELECT id, lesson_id, type, content FROM practice_exercises WHERE id = ? AND lesson_id = ?')
      .get(about.practiceExerciseId, lessonId) as { id: string; lesson_id: string; type: Exercise['type']; content: string } | undefined;
    if (!row) throw new ChatError('That practice exercise is not part of this lesson', 'bad_request');
    if (row.type === 'flashcard') throw new ChatError('Ask AI is not available for flashcards', 'bad_request');
    const exercise: Exercise = { id: row.id, lessonId: row.lesson_id, track: null, type: row.type, content: JSON.parse(row.content) };
    return {
      task: taskTextFor(exercise),
      studentAnswer: about.answerText,
      result: about.result,
      correctAnswer: correctAnswerFor(exercise),
      isFreeText: row.type === 'free_text',
      feedback: null,
    };
  }

  // Nothing is stored unless the AI answers, so a failed call leaves the thread unchanged and
  // the student's typed message stays in the input to retry.
  async function send(
    lessonId: string,
    message: string,
    exerciseId: string | null,
    practice: PracticeChatAbout | null = null
  ): Promise<{ messages: ChatMessageView[] }> {
    const content = message.trim();
    if (!content) throw new ChatError('Write a message first', 'bad_request');
    if (content.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new ChatError(`Messages can be at most ${CHAT_MESSAGE_MAX_LENGTH} characters`, 'bad_request');
    }
    if (exerciseId && practice) throw new ChatError('Ask about one exercise at a time', 'bad_request');
    const lesson = getUnlockedLesson(lessonId);
    const context = exerciseId
      ? exerciseContext(lesson.id, exerciseId)
      : practice
        ? practiceContext(lesson.id, practice)
        : null;
    const history = recentHistory([
      ...listMessages(lesson.id).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content },
    ]);
    const reply = await generate({
      systemPrompt: buildLessonChatSystemPrompt({
        lessonTitle: lesson.title,
        level: lesson.sourceLevel,
        explanation: lesson.explanation,
        examples: lesson.examples,
        uiLanguage: profiles.getProfile().uiLanguage,
        exercise: context,
      }),
      messages: history,
    });
    if (!reply.ok) throw new ChatError(reply.error, 'ai_failed', reply.code, reply.params);

    const at = now().toISOString();
    const insert = db.prepare(
      'INSERT INTO lesson_chat_messages (lesson_id, exercise_id, practice_exercise_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const practiceId = practice?.practiceExerciseId ?? null;
    const ids = db.transaction(() => [
      Number(insert.run(lesson.id, exerciseId, practiceId, 'user', content, at).lastInsertRowid),
      Number(insert.run(lesson.id, exerciseId, practiceId, 'assistant', reply.text, at).lastInsertRowid),
    ])();
    return { messages: listMessages(lesson.id).filter((m) => ids.includes(m.id)) };
  }

  return { getThread, send };
}

export type LessonChatService = ReturnType<typeof createLessonChatService>;
