import { describe, it, expect } from 'vitest';
import { buildPracticeGenerationPrompt, contentKey, parseGeneratedExercises } from './practiceGeneration';

const ctx = {
  title: 'Saying hello',
  level: 'A1' as const,
  skill: 'vocabulary' as const,
  explanation: 'Say Hallo to greet someone.',
  examples: ['Hallo!'],
  authoredExercises: [{ type: 'multiple_choice' as const, content: { question: 'Hi?', options: ['Hallo', 'Nein'], correctIndex: 0 } }],
};

describe('buildPracticeGenerationPrompt', () => {
  it('names the lesson, the count, the allowed types and only their shapes', () => {
    const { systemPrompt, messages } = buildPracticeGenerationPrompt(ctx, ['multiple_choice', 'flashcard'], 3);
    expect(systemPrompt).toContain('"Saying hello" at CEFR level A1 (skill: vocabulary)');
    expect(systemPrompt).toContain('Write exactly 3 new exercises. Use only these types: multiple_choice, flashcard.');
    expect(systemPrompt).toContain('- multiple_choice: ');
    expect(systemPrompt).toContain('- flashcard: ');
    expect(systemPrompt).not.toContain('- free_text: ');
    expect(systemPrompt).toContain('Reply with only a JSON object');
    expect(systemPrompt).toContain('Write everything in German only, including every question, prompt and instruction: no English at all. Use only vocabulary and grammar appropriate for CEFR level A1.');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('Lesson explanation:\nSay Hallo to greet someone.');
    expect(messages[0].content).toContain('Lesson examples:\n- Hallo!');
    expect(messages[0].content).toContain('"question":"Hi?"');
  });

  it('includes at most 10 authored exercises as style examples', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      type: 'fill_blank' as const,
      content: { textWithBlank: `Satz ${i} ___`, correctAnswer: 'x' },
    }));
    const { messages } = buildPracticeGenerationPrompt({ ...ctx, authoredExercises: many }, ['fill_blank'], 5);
    expect(messages[0].content).toContain('Satz 9 ___');
    expect(messages[0].content).not.toContain('Satz 10 ___');
  });
});

describe('parseGeneratedExercises', () => {
  const allowed = ['multiple_choice', 'flashcard'] as const;

  it('keeps valid exercises of allowed types and drops the rest', () => {
    const reply = `Here you go: ${JSON.stringify({
      exercises: [
        { type: 'multiple_choice', content: { question: 'Bye?', options: ['Tschüss', 'Hallo'], correctIndex: 0 } },
        { type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'x' } },
        { type: 'multiple_choice', content: { question: 'Bad', options: ['only one'], correctIndex: 0 } },
        { type: 'flashcard', content: { front: 'die Katze', back: 'the cat' } },
        'nonsense',
      ],
    })}`;
    expect(parseGeneratedExercises(reply, [...allowed], 'vocabulary')).toEqual([
      { type: 'multiple_choice', content: { question: 'Bye?', options: ['Tschüss', 'Hallo'], correctIndex: 0 } },
      { type: 'flashcard', content: { front: 'die Katze', back: 'the cat' } },
    ]);
  });

  it('drops flashcards for a non-vocabulary lesson even if allowed was mis-set', () => {
    const reply = JSON.stringify({ exercises: [{ type: 'flashcard', content: { front: 'a', back: 'b' } }] });
    expect(parseGeneratedExercises(reply, ['flashcard'], 'grammar')).toEqual([]);
  });

  it('treats a reply without the expected JSON shape as malformed', () => {
    expect(parseGeneratedExercises('No exercises today.', ['multiple_choice'], 'grammar')).toBeNull();
    expect(parseGeneratedExercises('{"items": []}', ['multiple_choice'], 'grammar')).toBeNull();
    expect(parseGeneratedExercises('{broken', ['multiple_choice'], 'grammar')).toBeNull();
  });
});

describe('contentKey', () => {
  it('ignores case, surrounding spaces, and key order', () => {
    expect(contentKey('flashcard', { front: ' Die Katze ', back: 'the cat' })).toBe(
      contentKey('flashcard', { back: 'The Cat', front: 'die katze' })
    );
    expect(contentKey('flashcard', { front: 'a', back: 'b' })).not.toBe(contentKey('flashcard', { front: 'a', back: 'c' }));
    expect(contentKey('fill_blank', { textWithBlank: 'a', correctAnswer: 'b' })).not.toBe(
      contentKey('free_text', { textWithBlank: 'a', correctAnswer: 'b' })
    );
  });
});
