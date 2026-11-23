import { describe, it, expect } from 'vitest';
import { parsePlacementAnswer } from './placementTypes';

describe('parsePlacementAnswer', () => {
  it('accepts each answer shape', () => {
    expect(parsePlacementAnswer({ type: 'multiple_choice', selectedIndex: 2 })).toEqual({ type: 'multiple_choice', selectedIndex: 2 });
    expect(parsePlacementAnswer({ type: 'fill_blank', text: 'ein' })).toEqual({ type: 'fill_blank', text: 'ein' });
    expect(parsePlacementAnswer({ type: 'free_text', text: 'Ich heiße Tom.' })).toEqual({ type: 'free_text', text: 'Ich heiße Tom.' });
    expect(parsePlacementAnswer({ type: 'spoken', clipId: 'c1' })).toEqual({ type: 'spoken', clipId: 'c1' });
    expect(parsePlacementAnswer({ type: 'spoken', skipped: true })).toEqual({ type: 'spoken', skipped: true });
  });

  it('rejects malformed answers', () => {
    expect(parsePlacementAnswer(null)).toBeNull();
    expect(parsePlacementAnswer({ type: 'multiple_choice', selectedIndex: 1.5 })).toBeNull();
    expect(parsePlacementAnswer({ type: 'fill_blank' })).toBeNull();
    expect(parsePlacementAnswer({ type: 'spoken' })).toBeNull();
    expect(parsePlacementAnswer({ type: 'spoken', clipId: '' })).toBeNull();
    expect(parsePlacementAnswer({ type: 'spoken', skipped: false })).toBeNull();
    expect(parsePlacementAnswer({ type: 'flashcard', text: 'x' })).toBeNull();
  });
});
