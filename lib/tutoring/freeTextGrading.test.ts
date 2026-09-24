import { describe, it, expect } from 'vitest';
import { buildFreeTextGradingPrompt, parseFreeTextGrade } from './freeTextGrading';

const input = {
  prompt: 'Introduce yourself.',
  modelAnswer: 'Ich heiße Anna.',
  studentAnswer: 'Ich heiße Tom.',
  level: 'A1' as const,
  uiLanguage: 'en' as const,
};

describe('buildFreeTextGradingPrompt', () => {
  it('names the level, the feedback language and the reply format', () => {
    const { systemPrompt } = buildFreeTextGradingPrompt(input);
    expect(systemPrompt).toContain('CEFR level A1');
    expect(systemPrompt).toContain('Write the feedback in English');
    expect(systemPrompt).toContain('{"result": "correct" | "almost" | "wrong", "feedback": "..."}');
  });

  it('asks for German feedback when the UI language is German', () => {
    expect(buildFreeTextGradingPrompt({ ...input, uiLanguage: 'de' }).systemPrompt).toContain('Write the feedback in German');
  });

  it('sends the task, model answer and student answer as the user message', () => {
    expect(buildFreeTextGradingPrompt(input).messages).toEqual([
      {
        role: 'user',
        content: 'Task: Introduce yourself.\nModel answer: Ich heiße Anna.\nStudent answer: Ich heiße Tom.',
      },
    ]);
  });
});

describe('parseFreeTextGrade', () => {
  it('parses a plain JSON reply', () => {
    expect(parseFreeTextGrade('{"result": "almost", "feedback": " Check the ending. "}')).toEqual({
      result: 'almost',
      feedback: 'Check the ending.',
    });
  });

  it('finds the JSON object inside a fenced reply', () => {
    expect(parseFreeTextGrade('Sure!\n```json\n{"result":"correct","feedback":"Well done."}\n```')).toEqual({
      result: 'correct',
      feedback: 'Well done.',
    });
  });

  it('returns null for anything else', () => {
    expect(parseFreeTextGrade('Correct!')).toBeNull();
    expect(parseFreeTextGrade('{"result": "great", "feedback": "x"}')).toBeNull();
    expect(parseFreeTextGrade('{"result": "wrong"}')).toBeNull();
    expect(parseFreeTextGrade('{not json}')).toBeNull();
  });
});
