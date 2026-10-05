import { describe, it, expect } from 'vitest';
import { differsByLanguage, isLocalizedText, localized, pickText, readFeedback, storeFeedback } from './localizedText';

describe('localizedText', () => {
  it('picks the language and falls back to English when German is empty', () => {
    expect(pickText({ en: 'Hello', de: 'Hallo' }, 'de')).toBe('Hallo');
    expect(pickText({ en: 'Hello', de: '  ' }, 'de')).toBe('Hello');
    expect(pickText({ en: 'Hello', de: 'Hallo' }, 'en')).toBe('Hello');
  });

  it('builds from columns, treating a missing German value as empty', () => {
    expect(localized('Hello', null)).toEqual({ en: 'Hello', de: '' });
  });

  it('recognises the shape', () => {
    expect(isLocalizedText({ en: 'a', de: 'b' })).toBe(true);
    expect(isLocalizedText({ en: 'a' })).toBe(false);
    expect(isLocalizedText('a')).toBe(false);
  });

  it('stores feedback as JSON and reads legacy plain text as both languages', () => {
    expect(readFeedback(storeFeedback({ en: 'Good.', de: 'Gut.' }))).toEqual({ en: 'Good.', de: 'Gut.' });
    expect(readFeedback('Watch the article.')).toEqual({ en: 'Watch the article.', de: 'Watch the article.' });
    expect(readFeedback({ en: 'x', de: 'y' })).toEqual({ en: 'x', de: 'y' });
    expect(readFeedback(null)).toBeNull();
    expect(readFeedback('')).toBeNull();
  });
});

describe('differsByLanguage', () => {
  it('is true only when the German text exists and differs from the English', () => {
    expect(differsByLanguage({ en: 'Hi', de: 'Hallo' })).toBe(true);
    expect(differsByLanguage({ en: 'Hi', de: '' })).toBe(false);
    expect(differsByLanguage({ en: 'Hi', de: ' Hi ' })).toBe(false);
  });
});
