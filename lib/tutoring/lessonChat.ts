import type { CefrLevel } from '../types';
import type { ChatMessage } from '../providers/types';
import type { GradeResult } from './grading';

export const CHAT_HISTORY_LIMIT = 20;
export const CHAT_MESSAGE_MAX_LENGTH = 4000;

export interface ChatMessageView {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  exerciseId: string | null;
  createdAt: string;
}

export interface ChatExerciseContext {
  task: string;
  studentAnswer: string | null;
  result: GradeResult;
  correctAnswer: string | null;
  isFreeText: boolean;
  feedback: string | null;
}

export interface LessonChatPromptInput {
  lessonTitle: string;
  level: CefrLevel;
  explanation: string | null;
  examples: string[] | null;
  uiLanguage: 'en' | 'de';
  exercise: ChatExerciseContext | null;
}

// Spec: AI Behavior — each call sends the lesson's explanation and examples and the tagged
// exercise's context, if any.
export function buildLessonChatSystemPrompt(input: LessonChatPromptInput): string {
  const language = input.uiLanguage === 'de' ? 'German' : 'English';
  const lines = [
    `You are a friendly German tutor. The learner is at CEFR level ${input.level} and is working on the lesson "${input.lessonTitle}".`,
    `Answer in ${language}, and keep German words and example sentences in German.`,
    'Keep answers short and focused on what the learner asked. If they ask about something unrelated to learning German, steer back to the lesson.',
  ];
  if (input.explanation) lines.push('', 'Lesson explanation:', input.explanation);
  if (input.examples && input.examples.length > 0) {
    lines.push('', 'Lesson examples:', ...input.examples.map((example) => `- ${example}`));
  }
  if (input.exercise) {
    const e = input.exercise;
    lines.push(
      '',
      'The learner is asking about this exercise, which they have already answered:',
      `Task: ${e.task}`,
      `Learner's answer: ${e.studentAnswer ?? '(none)'}`,
      `Grade: ${e.result}`
    );
    if (e.correctAnswer) lines.push(`${e.isFreeText ? 'Model answer' : 'Correct answer'}: ${e.correctAnswer}`);
    if (e.feedback) lines.push(`Grader feedback: ${e.feedback}`);
  }
  return lines.join('\n');
}

// The last messages of the thread that fit in one call, starting with a learner message
// (some providers reject a conversation that opens with the assistant).
export function recentHistory(messages: ChatMessage[], limit = CHAT_HISTORY_LIMIT): ChatMessage[] {
  const recent = messages.slice(-limit);
  const firstUser = recent.findIndex((message) => message.role === 'user');
  return firstUser === -1 ? [] : recent.slice(firstUser);
}
