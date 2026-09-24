import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
    expect(options).toEqual(['multiple_choice', 'fill_blank', 'free_text']);
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
});
