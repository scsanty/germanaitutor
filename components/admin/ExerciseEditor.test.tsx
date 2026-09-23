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
