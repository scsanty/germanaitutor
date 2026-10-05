// Spec: Bilingual Content. The English text is authoritative; German falls back to it when empty.
export interface LocalizedText {
  en: string;
  de: string;
}

export type ContentLanguage = 'en' | 'de';

export function pickText(text: LocalizedText, language: ContentLanguage): string {
  return language === 'de' && text.de.trim() ? text.de : text.en;
}

// True when switching languages would show different text, so a toggle is worth showing.
export function differsByLanguage(text: LocalizedText): boolean {
  const de = text.de.trim();
  return de !== '' && de !== text.en.trim();
}

export function localized(en: string, de: string | null | undefined): LocalizedText {
  return { en, de: de ?? '' };
}

export function isLocalizedText(value: unknown): value is LocalizedText {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as LocalizedText).en === 'string' &&
    typeof (value as LocalizedText).de === 'string'
  );
}

export function storeFeedback(feedback: LocalizedText): string {
  return JSON.stringify({ en: feedback.en, de: feedback.de });
}

// Stored feedback is JSON {en, de}; rows written before this change hold plain text.
export function readFeedback(stored: unknown): LocalizedText | null {
  if (isLocalizedText(stored)) return stored;
  if (typeof stored !== 'string' || stored.trim() === '') return null;
  try {
    const parsed = JSON.parse(stored);
    if (isLocalizedText(parsed)) return parsed;
  } catch {
    // legacy plain text
  }
  return { en: stored, de: stored };
}
