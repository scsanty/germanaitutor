import type { CefrLevel } from '../types';
import type { LocalizedText } from '../i18n/localizedText';
import type { FreestyleMode } from './modes';

export interface SessionMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  extra: Record<string, unknown> | null;
}

export interface SessionView {
  mode: FreestyleMode;
  level: CefrLevel;
  setup: Record<string, unknown>;
  messages: SessionMessage[];
}

export interface SessionSummary {
  wentWell: LocalizedText[];
  mistakes: LocalizedText[];
  words: { lemma: string; meaningEn: string }[];
}
