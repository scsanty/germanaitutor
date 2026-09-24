import { describe, it, expect } from 'vitest';
import { parsePlacementAnswer } from './placementTypes';

describe('parsePlacementAnswer', () => {
  it('accepts each answer shape', () => {
    expect(parsePlacementAnswer({ type: 'multiple_choice', selectedIndex: 2 })).toEqual({ type: 'multiple_choice', selectedIndex: 2 });
    expect(parsePlacementAnswer({ type: 'fill_blank', text: 'ein' })).toEqual({ type: 'fill_blank', text: 'ein' });
    expect(parsePlacementAnswer({ type: 'free_text', text: 'Ich heiße Tom.' })).toEqual({ type: 'free_text', text: 'Ich heiße Tom.' });
  });

  it('rejects malformed answers', () => {
    expect(parsePlacementAnswer(null)).toBeNull();
    expect(parsePlacementAnswer({ type: 'multiple_choice', selectedIndex: 1.5 })).toBeNull();
    expect(parsePlacementAnswer({ type: 'fill_blank' })).toBeNull();
    expect(parsePlacementAnswer({ type: 'flashcard', text: 'x' })).toBeNull();
  });
});
