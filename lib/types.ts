export type ProviderType = 'anthropic' | 'openai' | 'gemini' | 'ollama';
export type ConnectionStatus = 'valid' | 'invalid' | 'failing' | 'untested';
export type Track = 'generic' | 'telc' | 'goethe';
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export interface ProviderConnection {
  id: number;
  providerType: ProviderType;
  label: string | null;
  ollamaHost: string | null;
  selectedModel: string | null;
  isActive: boolean;
  lastValidatedStatus: ConnectionStatus;
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export type PlacementStatus = 'pending' | 'skipped' | 'taken';

export interface Profile {
  displayName: string;
  uiLanguage: 'en' | 'de';
  activeTrack: Track;
  activeLevel: CefrLevel;
  theme: 'dark' | 'light' | 'system';
  soundEnabled: boolean;
  onboardingComplete: boolean;
  highestUnlockedLevel: CefrLevel;
  placementStatus: PlacementStatus;
  unlockNoticeLevel: CefrLevel | null;
  onboardingChoicesSaved: boolean;
  dailyReviewCap: number;
  updatedAt: string;
}

export type Theme = Profile['theme'];
