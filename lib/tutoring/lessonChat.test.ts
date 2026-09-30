import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '../providers/types';
import { buildLessonChatSystemPrompt, recentHistory } from './lessonChat';

describe('buildLessonChatSystemPrompt', () => {
  const base = {
    lessonTitle: 'The verb sein',
    level: 'A1' as const,
    explanation: 'ich bin, du bist',
    examples: ['Ich bin müde.'],
    exercise: null,
  };

  it('describes the lesson and replies in the language of the latest message', () => {
    const prompt = buildLessonChatSystemPrompt(base);
    expect(prompt).toContain('CEFR level A1');
    expect(prompt).toContain('"The verb sein"');
    expect(prompt).toContain("Reply in the language of the learner's latest message (German or English).");
    expect(prompt).not.toMatch(/Answer in (English|German)/);
    expect(prompt).toContain('Lesson explanation:\nich bin, du bist');
    expect(prompt).toContain('Lesson examples:\n- Ich bin müde.');
    expect(prompt).not.toContain('asking about this exercise');
  });

  it('adds the exercise the learner is asking about', () => {
    const prompt = buildLessonChatSystemPrompt({
      ...base,
      exercise: {
        task: 'Ich ___ müde.',
        studentAnswer: 'bist',
        result: 'wrong',
        correctAnswer: 'bin',
        isFreeText: false,
        feedback: null,
      },
    });
    expect(prompt).toContain("Reply in the language of the learner's latest message (German or English).");
    expect(prompt).not.toMatch(/Answer in (English|German)/);
    expect(prompt).toContain('Task: Ich ___ müde.');
    expect(prompt).toContain("Learner's answer: bist");
    expect(prompt).toContain('Grade: wrong');
    expect(prompt).toContain('Correct answer: bin');
    expect(prompt).not.toContain('Grader feedback');
  });

  it('calls a free-text answer the model answer and includes the grader feedback', () => {
    const prompt = buildLessonChatSystemPrompt({
      ...base,
      exercise: {
        task: 'Say that you are tired.',
        studentAnswer: 'Ich bin mude.',
        result: 'almost',
        correctAnswer: 'Ich bin müde.',
        isFreeText: true,
        feedback: 'Umlaut.',
      },
    });
    expect(prompt).toContain('Model answer: Ich bin müde.');
    expect(prompt).toContain('Grader feedback: Umlaut.');
  });
});

describe('recentHistory', () => {
  const m = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content });

  it('keeps the last messages and starts with a learner message', () => {
    const messages = [m('user', '1'), m('assistant', '2'), m('user', '3'), m('assistant', '4'), m('user', '5')];
    expect(recentHistory(messages, 4)).toEqual([m('user', '3'), m('assistant', '4'), m('user', '5')]);
    expect(recentHistory(messages, 5)).toEqual(messages);
  });
});
