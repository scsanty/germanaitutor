import { describe, it, expect } from 'vitest';
import { buildFreeTextGradingPrompt, parseFreeTextGrade } from './freeTextGrading';

const input = {
  prompt: 'Introduce yourself.',
  modelAnswer: 'Ich heiße Anna.',
  studentAnswer: 'Ich heiße Tom.',
  level: 'A1' as const,
};

describe('buildFreeTextGradingPrompt', () => {
  it('names the level and the reply format', () => {
    const { systemPrompt } = buildFreeTextGradingPrompt(input);
    expect(systemPrompt).toContain('CEFR level A1');
    expect(systemPrompt).toContain('{"result": "correct" | "almost" | "wrong", "feedback_en": "...", "feedback_de": "...", "mistakes": [');
  });

  it('asks for each mistake with a category from the taxonomy, the exact wrong words and the correction', () => {
    const { systemPrompt } = buildFreeTextGradingPrompt(input);
    expect(systemPrompt).toContain(
      '"mistakes": [{ "category": one of articles_gender, case_prepositions'
    );
    expect(systemPrompt).toContain('"wrong": exact wrong words, "right": the correction }]');
  });

  it('asks for English and level-simplified German feedback', () => {
    const { systemPrompt } = buildFreeTextGradingPrompt({ prompt: 'Say hello.', modelAnswer: 'Hallo!', studentAnswer: 'Halo', level: 'A1' });
    expect(systemPrompt).toContain('"feedback_en"');
    expect(systemPrompt).toContain('"feedback_de"');
    expect(systemPrompt).toContain('simple enough for CEFR level A1');
  });

  it('returns null feedback when both languages are empty', () => {
    expect(parseFreeTextGrade('{"result":"correct","feedback_en":" ","feedback_de":""}')).toEqual({ result: 'correct', feedback: null, mistakes: [] });
  });

  it('requires feedback in both languages', () => {
    expect(parseFreeTextGrade('{"result":"almost","feedback_en":"Article."}')).toBeNull();
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
    expect(parseFreeTextGrade('{"result": "almost", "feedback_en": " Check the ending. ", "feedback_de": " Prüfe die Endung. "}')).toEqual({
      result: 'almost',
      feedback: { en: 'Check the ending.', de: 'Prüfe die Endung.' },
      mistakes: [],
    });
  });

  it('finds the JSON object inside a fenced reply', () => {
    expect(parseFreeTextGrade('Sure!\n```json\n{"result":"correct","feedback_en":"Well done.","feedback_de":"Gut gemacht."}\n```')).toEqual({
      result: 'correct',
      feedback: { en: 'Well done.', de: 'Gut gemacht.' },
      mistakes: [],
    });
  });

  it('returns null for anything else', () => {
    expect(parseFreeTextGrade('Correct!')).toBeNull();
    expect(parseFreeTextGrade('{"result": "great", "feedback_en": "x", "feedback_de": "y"}')).toBeNull();
    expect(parseFreeTextGrade('{"result": "wrong"}')).toBeNull();
    expect(parseFreeTextGrade('{not json}')).toBeNull();
  });

  it('keeps valid mistakes, maps an unknown category to other, and skips invalid entries', () => {
    const reply = JSON.stringify({
      result: 'almost',
      feedback_en: 'Ending.',
      feedback_de: 'Endung.',
      mistakes: [
        { category: 'adjective_endings', wrong: 'einen gute Freund', right: 'einen guten Freund' },
        { category: 'made_up', wrong: 'mude', right: 'müde' },
        { category: 'spelling', wrong: '   ', right: 'x' },
        { category: 'spelling', right: 'x' },
        { category: 'spelling', wrong: 'Haus', right: 7 },
        'nonsense',
        null,
      ],
    });
    expect(parseFreeTextGrade(reply)?.mistakes).toEqual([
      { category: 'adjective_endings', wrong: 'einen gute Freund', right: 'einen guten Freund' },
      { category: 'other', wrong: 'mude', right: 'müde' },
    ]);
  });

  it('treats a missing or non-list mistakes field as no mistakes', () => {
    expect(parseFreeTextGrade('{"result":"correct","feedback_en":"Ok.","feedback_de":"Ok.","mistakes":"none"}')?.mistakes).toEqual([]);
  });
});
