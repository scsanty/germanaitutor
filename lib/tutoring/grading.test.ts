import { describe, it, expect } from 'vitest';
import { gradeMultipleChoice, gradeFillBlank } from './grading';

describe('gradeMultipleChoice', () => {
  const content = { question: 'Q', options: ['a', 'b', 'c'], correctIndex: 1 };

  it('is correct only for the correct option', () => {
    expect(gradeMultipleChoice(content, 1)).toBe('correct');
    expect(gradeMultipleChoice(content, 0)).toBe('wrong');
    expect(gradeMultipleChoice(content, 7)).toBe('wrong');
  });
});

describe('gradeFillBlank', () => {
  const content = { textWithBlank: 'Das Problem, ___ wir sprachen', correctAnswer: 'über das', acceptableVariants: ['worüber'] };

  it('accepts the answer and its variants, ignoring outer and repeated spaces', () => {
    expect(gradeFillBlank(content, 'über das')).toBe('correct');
    expect(gradeFillBlank(content, '  über   das ')).toBe('correct');
    expect(gradeFillBlank(content, 'worüber')).toBe('correct');
  });

  it('is case-sensitive, since capitalisation is part of German spelling', () => {
    expect(gradeFillBlank({ textWithBlank: '___ ist groß.', correctAnswer: 'Der Hund' }, 'der hund')).toBe('wrong');
  });

  it('rejects anything else', () => {
    expect(gradeFillBlank(content, 'über dem')).toBe('wrong');
    expect(gradeFillBlank(content, '')).toBe('wrong');
  });
});
