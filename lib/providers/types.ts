export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export interface ProviderCredentials {
  apiKey?: string;
  host?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateTextParams {
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
}

export interface GenerateTextResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface TestConnectionOptions {
  /** The configured model. Adapters that support it also check this model answers, not only the key. */
  model?: string;
}

export interface ProviderAdapter {
  testConnection(creds: ProviderCredentials, options?: TestConnectionOptions): Promise<TestConnectionResult>;
  listModels(creds: ProviderCredentials): Promise<ModelInfo[]>;
  generateText(creds: ProviderCredentials, params: GenerateTextParams): Promise<GenerateTextResult>;
}
