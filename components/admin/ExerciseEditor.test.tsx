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
    expect(options).toEqual(['multiple_choice', 'fill_blank', 'free_text', 'passage_questions', 'matching', 'cloze', 'audio_questions', 'letter']);
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
  it('shows the remaining gap\'s own variants after an earlier gap is removed (fix #1)', () => {
    const onChange = vi.fn();
    const content = {
      text: '{{1}} {{2}}',
      gaps: [{ mode: 'typed' as const, answer: 'a', variants: ['x'] }, { mode: 'typed' as const, answer: 'b', variants: ['y', 'z'] }],
    };
    render(<Host initial={[{ type: 'cloze', content }]} onChange={onChange} />);
    expect(screen.getByLabelText('Exercise 1 gap 1 variants')).toHaveValue('x');
    fireEvent.click(screen.getByRole('button', { name: 'Remove gap 1' }));
    expect(screen.getByLabelText('Exercise 1 gap 1 variants')).toHaveValue('y, z');
    fireEvent.change(screen.getByLabelText('Exercise 1 gap 1 variants'), { target: { value: 'y, z, w' } });
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'cloze', content: { text: '{{1}} {{2}}', gaps: [{ mode: 'typed', answer: 'b', variants: ['y', 'z', 'w'] }] } }]);
  });

  it('names the cloze text field with its exercise number as the description (fix #4)', () => {
    render(<Host initial={[{ type: 'cloze', content: { text: '', gaps: [] } }, { type: 'cloze', content: { text: '', gaps: [] } }]} onChange={vi.fn()} />);
    const fields = screen.getAllByLabelText('Text (use {{1}}, {{2}} … for gaps)');
    expect(fields[0]).toHaveAccessibleDescription('Exercise 1 cloze text');
    expect(fields[1]).toHaveAccessibleDescription('Exercise 2 cloze text');
  });
});

describe('ExerciseEditor listening exercises', () => {
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

  it('offers the listening type and authors a transcript, a question and its evidence', () => {
    const onChange = vi.fn();
    render(<Host initial={[{ type: 'multiple_choice', content: { question: '', options: ['', ''], correctIndex: 0 } }]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 type'), { target: { value: 'audio_questions' } });
    expect(screen.getByLabelText('Exercise 1 transcript')).toHaveAccessibleDescription(/\[Anna f\] Wann fährt der Zug\?/);
    fireEvent.change(screen.getByLabelText('Exercise 1 transcript'), { target: { value: '[Anna f] Der Zug fährt um neun.' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 question 1'), { target: { value: 'Wann?' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 question 1 option 1'), { target: { value: 'um acht' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 question 1 option 2'), { target: { value: 'um neun' } });
    fireEvent.click(screen.getByLabelText('Exercise 1 question 1 option 2 is correct'));
    fireEvent.change(screen.getByLabelText('Exercise 1 question 1 evidence'), { target: { value: 'um neun' } });
    expect(onChange).toHaveBeenLastCalledWith([
      {
        type: 'audio_questions',
        content: { transcript: '[Anna f] Der Zug fährt um neun.', questions: [{ question: 'Wann?', options: ['um acht', 'um neun'], correctIndex: 1, evidence: 'um neun' }] },
      },
    ]);
    expect(screen.queryByText('Fix before saving')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Exercise 1 question 1 evidence'), { target: { value: '' } });
    expect(onChange.mock.lastCall![0][0].content.questions[0]).not.toHaveProperty('evidence');
  });

  it('offers the letter task and authors a situation, Leitpunkte, register, word target, a Task B and the instruction (S19)', () => {
    const onChange = vi.fn();
    render(<Host initial={[{ type: 'multiple_choice', content: { question: '', options: ['', ''], correctIndex: 0 } }]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 type'), { target: { value: 'letter' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 task situation'), { target: { value: 'Ihre Freundin hat Sie eingeladen.' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 task Leitpunkt 1'), { target: { value: 'Dank' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 task Leitpunkt 2'), { target: { value: 'Absage' } });
    expect(screen.getByLabelText('Exercise 1 letter problems')).toHaveTextContent('task 1: leitpunkte must be 3 to 4 non-empty strings');
    fireEvent.change(screen.getByLabelText('Exercise 1 task Leitpunkt 3'), { target: { value: 'Vorschlag' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 task register'), { target: { value: 'formal' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 task maximum words'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 instruction (English)'), { target: { value: 'Write a reply.' } });
    fireEvent.change(screen.getByLabelText('Exercise 1 instruction (German)'), { target: { value: 'Schreib eine Antwort.' } });
    const task = { situation: 'Ihre Freundin hat Sie eingeladen.', leitpunkte: ['Dank', 'Absage', 'Vorschlag'], register: 'formal', wordTarget: { min: 30, max: 60 } };
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'letter', content: { tasks: [task], instruction: { en: 'Write a reply.', de: 'Schreib eine Antwort.' } } }]);
    expect(screen.queryByLabelText('Exercise 1 letter problems')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Task B' }));
    expect(screen.getByLabelText('Exercise 1 task b situation')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Task B' }));
    expect(onChange.mock.lastCall![0][0].content.tasks).toEqual([task]);
  });

  it('shows the validation problems of a transcript being written', () => {
    render(
      <Host
        initial={[{ type: 'audio_questions', content: { transcript: '', questions: [{ question: 'Q', options: ['a', 'b'], correctIndex: 0, evidence: 'Gleis 9' }] } }]}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('Fix before saving')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Exercise 1 transcript'), { target: { value: 'kein Tag' } });
    expect(screen.getByText('transcript: line 1 needs a speaker tag like [Name m]')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Exercise 1 transcript'), { target: { value: '[Ben m] Gleis 7.' } });
    expect(screen.getByText('question 1: evidence must appear in the transcript')).toBeInTheDocument();
  });
});
