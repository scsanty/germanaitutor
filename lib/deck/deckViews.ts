import type { LocalizedText } from '../i18n/localizedText';

export interface DeckCard {
  itemId: number;
  lemma: string;
  plural: string | null;
  meaning: LocalizedText;
  example: string | null;
}

export interface DeckView {
  cards: DeckCard[];
  dueCount: number;
  answeredToday: number;
  newWordsPerDay: number;
  deckReviewCap: number;
  aiAvailable: boolean;
}
