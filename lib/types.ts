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

export interface Profile {
  displayName: string;
  uiLanguage: 'en' | 'de';
  activeTrack: Track;
  activeLevel: CefrLevel;
  freestyleDefault: boolean;
  onboardingComplete: boolean;
  updatedAt: string;
}
