import type Database from 'better-sqlite3';
import type { ChatMessage } from '../providers/types';
import { getAdapter } from '../providers/registry';
import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';
import { createProviderService } from './providerService';
import { createUsageService } from './usageService';

export type AiResult = { ok: true; text: string } | { ok: false; error: string; code?: ErrorCode; params?: ErrorParams };

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
  if (!active) return { ok: false, error: 'No AI provider is set up', code: 'no_provider' };
  if (!active.selectedModel) return { ok: false, error: 'The active AI provider has no model selected', code: 'no_model' };

  let apiKey: string | undefined;
  try {
    apiKey = providers.getDecryptedApiKey(active.id) ?? undefined;
  } catch {
    return { ok: false, error: 'Stored credentials could not be decrypted', code: 'credentials_unreadable' };
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
    return { ok: false, error: message, code: 'ai_failed', params: { detail: message } };
  }
}

// "A working provider" for the UI (chat, free text): an active connection with a model that has
// not been found invalid. `failing` still allows a try — it passed validation and later hit a
// runtime error. Reads the table directly so it never touches the key file.
export function isAiAvailable(db: Database.Database): boolean {
  const row = db
    .prepare('SELECT selected_model, last_validated_status FROM provider_connections WHERE is_active = 1')
    .get() as { selected_model: string | null; last_validated_status: string } | undefined;
  return !!row && !!row.selected_model && row.last_validated_status !== 'invalid';
}
