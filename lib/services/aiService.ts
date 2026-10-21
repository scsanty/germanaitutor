import type Database from 'better-sqlite3';
import type { ChatMessage } from '../providers/types';
import { getAdapter } from '../providers/registry';
import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';
import { createProviderService } from './providerService';
import { createUsageService } from './usageService';
import { recordProviderFailure, recordProviderSuccess } from './notificationService';

export type AiResult = { ok: true; text: string } | { ok: false; error: string; code?: ErrorCode; params?: ErrorParams };

export interface AiRequest {
  systemPrompt: string;
  messages: ChatMessage[];
  // B1: an output cap above the adapter default (letter grading asks for 8192; only Anthropic applies it).
  maxTokens?: number;
  // S1: abort the provider call after this long; a timeout is ai_failed with detail "timed out".
  timeoutMs?: number;
}

// Listening (admin notifications): every failure except "no provider set up" counts toward the
// provider_errors problem (3 within 10 minutes); a success resolves it. Neither ever throws.
export async function generateWithActiveProvider(
  db: Database.Database,
  request: AiRequest,
  keyFilePath?: string
): Promise<AiResult> {
  const providers = createProviderService(db, keyFilePath);
  const active = providers.getActiveConnection();
  if (!active) return { ok: false, error: 'No AI provider is set up', code: 'no_provider' };
  if (!active.selectedModel) {
    void recordProviderFailure(db);
    return { ok: false, error: 'The active AI provider has no model selected', code: 'no_model' };
  }

  let apiKey: string | undefined;
  try {
    apiKey = providers.getDecryptedApiKey(active.id) ?? undefined;
  } catch {
    void recordProviderFailure(db);
    return { ok: false, error: 'Stored credentials could not be decrypted', code: 'credentials_unreadable' };
  }

  try {
    const result = await getAdapter(active.providerType).generateText(
      { apiKey, host: active.ollamaHost ?? undefined },
      {
        model: active.selectedModel,
        systemPrompt: request.systemPrompt,
        messages: request.messages,
        ...(request.maxTokens ? { maxTokens: request.maxTokens } : {}),
        ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
      }
    );
    createUsageService(db).recordUsage(active.id, 1, (result.inputTokens ?? 0) + (result.outputTokens ?? 0));
    providers.recordSuccess(active.id);
    void recordProviderSuccess(db);
    return { ok: true, text: result.text };
  } catch (err) {
    const message = (err as Error).name === 'TimeoutError' ? 'timed out' : (err as Error).message;
    providers.recordFailure(active.id, message);
    void recordProviderFailure(db);
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
