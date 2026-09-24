import type Database from 'better-sqlite3';
import type { ChatMessage } from '../providers/types';
import { getAdapter } from '../providers/registry';
import { createProviderService } from './providerService';
import { createUsageService } from './usageService';

export type AiResult = { ok: true; text: string } | { ok: false; error: string };

export interface AiRequest {
  systemPrompt: string;
  messages: ChatMessage[];
}

export async function generateWithActiveProvider(
  db: Database.Database,
  request: AiRequest,
  keyFilePath?: string
): Promise<AiResult> {
  const providers = createProviderService(db, keyFilePath);
  const active = providers.getActiveConnection();
  if (!active) return { ok: false, error: 'No AI provider is set up' };
  if (!active.selectedModel) return { ok: false, error: 'The active AI provider has no model selected' };

  let apiKey: string | undefined;
  try {
    apiKey = providers.getDecryptedApiKey(active.id) ?? undefined;
  } catch {
    return { ok: false, error: 'Stored credentials could not be decrypted' };
  }

  try {
    const result = await getAdapter(active.providerType).generateText(
      { apiKey, host: active.ollamaHost ?? undefined },
      { model: active.selectedModel, systemPrompt: request.systemPrompt, messages: request.messages }
    );
    createUsageService(db).recordUsage(active.id, 1, (result.inputTokens ?? 0) + (result.outputTokens ?? 0));
    providers.recordSuccess(active.id);
    return { ok: true, text: result.text };
  } catch (err) {
    const message = (err as Error).message;
    providers.recordFailure(active.id, message);
    return { ok: false, error: message };
  }
}
