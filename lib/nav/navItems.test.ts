import { describe, it, expect } from 'vitest';
import { navFor } from './navItems';

describe('nav registry', () => {
  it('places each built item per the thumb-zone layout', () => {
    expect(navFor('top').map((i) => i.id)).toEqual(['settings']);
    expect(navFor('bottom').map((i) => i.id)).toEqual(['dashboard', 'profile']);
    expect(navFor('fab').map((i) => i.id)).toEqual(['freestyle', 'flashcards', 'review']);
    expect(navFor('sidebar').map((i) => i.id)).toEqual(['learn', 'dashboard', 'freestyle', 'flashcards', 'review', 'profile', 'settings']);
  });
});
