import { describe, it, expect } from 'vitest';
import { errorBody } from './errorCodes';

describe('errorBody', () => {
  it('includes params only when there are some', () => {
    expect(errorBody('Lesson not found', 'not_found')).toEqual({ error: 'Lesson not found', code: 'not_found' });
    expect(errorBody('Level B1 is locked', 'level_locked', { level: 'B1' })).toEqual({
      error: 'Level B1 is locked',
      code: 'level_locked',
      params: { level: 'B1' },
    });
  });
});
