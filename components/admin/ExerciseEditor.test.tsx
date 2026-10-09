import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { ExerciseEditor, type ExerciseFormEntry } from './ExerciseEditor';

describe('ExerciseEditor', () => {
  it('renders zero exercises with an Add button', () => {
    render(<ExerciseEditor exercises={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Exercises (0)')).toBeInTheDocument();
    expect(screen.getByText('Add exercise')).toBeInTheDocument();
  });

  it('adds a new flashcard exercise', () => {
    const onChange = vi.fn();
    render(<ExerciseEditor exercises={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add exercise'));
    expect(onChange).toHaveBeenCalledWith([{ type: 'flashcard', content: { front: '', back: '' } }]);
  });

  it('edits a flashcard field without touching its id', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [{ id: 'ex1', type: 'flashcard', content: { front: '', back: '' } }];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 front'), { target: { value: 'Hund' } });
    expect(onChange).toHaveBeenCalledWith([{ id: 'ex1', type: 'flashcard', content: { front: 'Hund', back: '' } }]);
  });

  it('switching type resets content to that type\'s blank shape', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [{ id: 'ex1', type: 'flashcard', content: { front: 'x', back: 'y' } }];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 type'), { target: { value: 'fill_blank' } });
    expect(onChange).toHaveBeenCalledWith([
      { id: 'ex1', type: 'fill_blank', content: { textWithBlank: '', correctAnswer: '' } },
    ]);
  });

  it('adds and removes a multiple-choice option', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b'], correctIndex: 0 } },
    ];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add option'));
    expect(onChange).toHaveBeenCalledWith([
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b', ''], correctIndex: 0 } },
    ]);
  });

  it('removing an option before the correct one shifts correctIndex down by one', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b', 'c'], correctIndex: 2 } },
    ];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.click(screen.getAllByText('Remove option')[0]);
    expect(onChange).toHaveBeenCalledWith([
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['b', 'c'], correctIndex: 1 } },
    ]);
  });

  it('removing the correct option itself resets correctIndex to 0', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b', 'c'], correctIndex: 1 } },
    ];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.click(screen.getAllByText('Remove option')[1]);
    expect(onChange).toHaveBeenCalledWith([
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'c'], correctIndex: 0 } },
    ]);
  });

  it('removing an option after the correct one leaves correctIndex unchanged', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b', 'c'], correctIndex: 0 } },
    ];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.click(screen.getAllByText('Remove option')[2]);
    expect(onChange).toHaveBeenCalledWith([
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b'], correctIndex: 0 } },
    ]);
  });

  it('removes an exercise entirely', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [
      { id: 'ex1', type: 'flashcard', content: { front: 'a', back: 'b' } },
      { id: 'ex2', type: 'flashcard', content: { front: 'c', back: 'd' } },
    ];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.click(screen.getByText('Remove exercise 1'));
    expect(onChange).toHaveBeenCalledWith([{ id: 'ex2', type: 'flashcard', content: { front: 'c', back: 'd' } }]);
  });
});

describe('ExerciseEditor flashcard rule', () => {
  it('adds a multiple-choice exercise by default when flashcards are not allowed', () => {
    const onChange = vi.fn();
    render(<ExerciseEditor exercises={[]} onChange={onChange} allowFlashcards={false} />);
    fireEvent.click(screen.getByText('Add exercise'));
    expect(onChange).toHaveBeenCalledWith([
      { type: 'multiple_choice', content: { question: '', options: ['', ''], correctIndex: 0 } },
    ]);
  });

  it('hides the flashcard type for a non-flashcard exercise when flashcards are not allowed', () => {
    render(
      <ExerciseEditor
        exercises={[{ type: 'fill_blank', content: { textWithBlank: 'a ___', correctAnswer: 'b' } }]}
        onChange={vi.fn()}
        allowFlashcards={false}
      />
    );
    const options = Array.from(screen.getByLabelText('Exercise 1 type').querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['multiple_choice', 'fill_blank', 'free_text', 'passage_questions', 'matching', 'cloze']);
  });

  it('still shows an existing flashcard as a flashcard so it can be changed', () => {
    render(
      <ExerciseEditor
        exercises={[{ type: 'flashcard', content: { front: 'x', back: 'y' } }]}
        onChange={vi.fn()}
        allowFlashcards={false}
      />
    );
    expect(screen.getByLabelText('Exercise 1 type')).toHaveValue('flashcard');
  });

  it('keeps adding flashcards by default in vocabulary lessons', () => {
    const onChange = vi.fn();
    render(<ExerciseEditor exercises={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add exercise'));
    expect(onChange).toHaveBeenCalledWith([{ type: 'flashcard', content: { front: '', back: '' } }]);
  });

  it('edits an instruction in both languages, and drops it when both fields are emptied', () => {
    const onChange = vi.fn();
    const exercise = { type: 'fill_blank' as const, content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', instruction: { en: 'Fill in.', de: 'Ergänze.' } } };
    render(<ExerciseEditor exercises={[exercise]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 instruction (German)'), { target: { value: 'Fülle aus.' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'fill_blank', content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', instruction: { en: 'Fill in.', de: 'Fülle aus.' } } },
    ]);
  });

  // Review Focus 4: clearing both fields removes the key entirely.
  it('removes the instruction key when both languages are empty', () => {
    const onChange = vi.fn();
    const exercise = { type: 'fill_blank' as const, content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', instruction: { en: 'Fill in.', de: '' } } };
    render(<ExerciseEditor exercises={[exercise]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 instruction (English)'), { target: { value: '' } });
    expect(onChange.mock.lastCall![0][0].content).not.toHaveProperty('instruction');
  });

  it('offers no instruction fields on a flashcard', () => {
    render(<ExerciseEditor exercises={[{ type: 'flashcard', content: { front: 'x', back: 'y' } }]} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Exercise 1 instruction (English)')).not.toBeInTheDocument();
  });
  // A stateful host, so a sequence of edits builds on the previous ones.
  function Host({ initial, onChange }: { initial: ExerciseFormEntry[]; onChange: (e: ExerciseFormEntry[]) => void }) {
    const [exercises, setExercises] = useState(initial);
    return (
      <ExerciseEditor
        exercises={exercises}
        onChange={(next) => {
          setExercises(next);
          onChange(next);
        }}
      />
    );
  }

  it('authors a cloze: text, then a select gap with two options and the second correct', () => {
    const onChange = vi.fn();
    render(<Host initial={[{ id: 'ex1', type: 'multiple_choice', content: { question: '', options: ['', ''], correctIndex: 0 } }]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 type'), { target: { value: 'cloze' } });
    const text = screen.getByLabelText('Text (use {{1}}, {{2}} … for gaps)');
    expect(text.tagName).toBe('TEXTAREA');
    fireEvent.change(text, { target: { value: 'Ich {{1}} hier.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add gap' }));
    fireEvent.change(screen.getByLabelText('Exercise 1 gap 1 mode'), { target: { value: 'select' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 gap 1 option 1'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 gap 1 option 2'), { target: { value: 'b' } });
    fireEvent.click(screen.getByLabelText('Exercise 1 gap 1 option 2 is correct'));
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'ex1', type: 'cloze', content: { text: 'Ich {{1}} hier.', gaps: [{ mode: 'select', options: ['a', 'b'], correctIndex: 1 }] } },
    ]);
  });

  it('authors typed and bank gaps: comma-separated variants, and a bank shown only while a gap uses it', () => {
    const onChange = vi.fn();
    render(<Host initial={[{ type: 'cloze', content: { text: '{{1}} {{2}}', gaps: [] } }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add gap' }));
    fireEvent.change(screen.getByLabelText('Exercise 1 gap 1 answer'), { target: { value: 'bin' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 gap 1 variants'), { target: { value: 'Bin, ' } });
    expect(screen.getByLabelText('Exercise 1 gap 1 variants')).toHaveValue('Bin, ');
    expect(screen.queryByText('Word bank', { selector: 'p' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add gap' }));
    fireEvent.change(screen.getByLabelText('Exercise 1 gap 2 mode'), { target: { value: 'bank' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 bank word a'), { target: { value: 'ist' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 bank word b'), { target: { value: 'sind' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 gap 2 bank word'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith([
      {
        type: 'cloze',
        content: { text: '{{1}} {{2}}', gaps: [{ mode: 'typed', answer: 'bin', variants: ['Bin'] }, { mode: 'bank', answer: 1 }], bank: ['ist', 'sind'] },
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove gap 2' }));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'cloze', content: { text: '{{1}} {{2}}', gaps: [{ mode: 'typed', answer: 'bin', variants: ['Bin'] }] } }]);
  });

  it('authors matching: per-item answers, with "x (none)" only while Allow none is ticked', () => {
    const onChange = vi.fn();
    render(<Host initial={[{ type: 'matching', content: { items: ['Text 1'], targets: ['A', 'B'], answers: [0], allowNone: false } }]} onChange={onChange} />);
    const answer = screen.getByLabelText('Exercise 1 item 1 answer');
    expect(screen.queryByRole('option', { name: 'x (none)' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Allow none (x)'));
    fireEvent.change(answer, { target: { value: 'x' } });
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'matching', content: { items: ['Text 1'], targets: ['A', 'B'], answers: [null], allowNone: true } }]);
    fireEvent.click(screen.getByLabelText('Allow none (x)'));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'matching', content: { items: ['Text 1'], targets: ['A', 'B'], answers: [0], allowNone: false } }]);
  });

  it('authors passage questions and opens an existing reading exercise with its type selected', () => {
    const onChange = vi.fn();
    render(<Host initial={[{ id: 'p1', type: 'passage_questions', content: { passage: 'P', questions: [{ question: 'Q', options: ['a', 'b'], correctIndex: 0 }] } }]} onChange={onChange} />);
    expect(screen.getByLabelText('Exercise 1 type')).toHaveValue('passage_questions');
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    fireEvent.change(screen.getByLabelText('Exercise 1 question 2'), { target: { value: 'Q2' } });
    fireEvent.click(screen.getByLabelText('Exercise 1 question 2 option 2 is correct'));
    expect(onChange).toHaveBeenLastCalledWith([
      {
        id: 'p1',
        type: 'passage_questions',
        content: { passage: 'P', questions: [{ question: 'Q', options: ['a', 'b'], correctIndex: 0 }, { question: 'Q2', options: ['', ''], correctIndex: 1 }] },
      },
    ]);
  });
});
