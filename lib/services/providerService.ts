import type Database from 'better-sqlite3';
import { encrypt, decrypt } from '../crypto/encrypt';
import { loadOrCreateMasterKey } from '../crypto/keyfile';
import { getAdapter } from '../providers/registry';
import type { ProviderConnection, ProviderType, ConnectionStatus } from '../types';

interface Row {
  id: number;
  provider_type: ProviderType;
  label: string | null;
  encrypted_api_key: string | null;
  ollama_host: string | null;
  selected_model: string | null;
  is_active: number;
  last_validated_status: ConnectionStatus;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
}

function rowToConnection(row: Row): ProviderConnection {
  return {
    id: row.id,
    providerType: row.provider_type,
    label: row.label,
    ollamaHost: row.ollama_host,
    selectedModel: row.selected_model,
    isActive: row.is_active === 1,
    lastValidatedStatus: row.last_validated_status,
    lastValidatedAt: row.last_validated_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

export function createProviderService(db: Database.Database, keyFilePath?: string) {
  const masterKey = loadOrCreateMasterKey(keyFilePath);

  function getRow(id: number): Row | undefined {
    return db.prepare('SELECT * FROM provider_connections WHERE id = ?').get(id) as Row | undefined;
  }

  function listConnections(): ProviderConnection[] {
    const rows = db.prepare('SELECT * FROM provider_connections ORDER BY created_at').all() as Row[];
    return rows.map(rowToConnection);
  }

  function getConnection(id: number): ProviderConnection | null {
    const row = getRow(id);
    return row ? rowToConnection(row) : null;
  }

  function createConnection(input: {
    providerType: ProviderType;
    label?: string;
    apiKey?: string;
    ollamaHost?: string;
    selectedModel?: string;
  }): ProviderConnection {
    const encryptedKey = input.apiKey ? encrypt(input.apiKey, masterKey) : null;
    const info = db
      .prepare(
        `INSERT INTO provider_connections (provider_type, label, encrypted_api_key, ollama_host, selected_model)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.providerType, input.label ?? null, encryptedKey, input.ollamaHost ?? null, input.selectedModel ?? null);
    return getConnection(Number(info.lastInsertRowid))!;
  }

  function updateConnection(
    id: number,
    input: Partial<{ label: string; apiKey: string; ollamaHost: string; selectedModel: string }>
  ): ProviderConnection | null {
    const existing = getRow(id);
    if (!existing) return null;
    const encryptedKey = input.apiKey !== undefined ? encrypt(input.apiKey, masterKey) : existing.encrypted_api_key;
    db.prepare(
      `UPDATE provider_connections SET label = ?, encrypted_api_key = ?, ollama_host = ?, selected_model = ? WHERE id = ?`
    ).run(
      input.label ?? existing.label,
      encryptedKey,
      input.ollamaHost ?? existing.ollama_host,
      input.selectedModel ?? existing.selected_model,
      id
    );
    return getConnection(id);
  }

  function deleteConnection(id: number): void {
    db.prepare('DELETE FROM provider_connections WHERE id = ?').run(id);
  }

  function setActiveConnection(id: number): void {
    db.prepare('UPDATE provider_connections SET is_active = 0').run();
    db.prepare('UPDATE provider_connections SET is_active = 1 WHERE id = ?').run(id);
  }

  function getActiveConnection(): ProviderConnection | null {
    const row = db.prepare('SELECT * FROM provider_connections WHERE is_active = 1').get() as Row | undefined;
    return row ? rowToConnection(row) : null;
  }

  async function testConnection(id: number): Promise<{ ok: boolean; error?: string }> {
    const row = getRow(id);
    if (!row) return { ok: false, error: 'Connection not found' };
    const adapter = getAdapter(row.provider_type);
    const creds = {
      apiKey: row.encrypted_api_key ? decrypt(row.encrypted_api_key, masterKey) : undefined,
      host: row.ollama_host ?? undefined,
    };
    const result = await adapter.testConnection(creds);
    db.prepare(
      `UPDATE provider_connections SET last_validated_status = ?, last_validated_at = datetime('now'), last_error = ? WHERE id = ?`
    ).run(result.ok ? 'valid' : 'invalid', result.error ?? null, id);
    return result;
  }

  function recordFailure(id: number, error: string): void {
    db.prepare(
      `UPDATE provider_connections SET last_validated_status = 'failing', last_error = ? WHERE id = ?`
    ).run(error, id);
  }

  function recordSuccess(id: number): void {
    db.prepare(
      `UPDATE provider_connections SET last_validated_status = 'valid', last_error = NULL WHERE id = ?`
    ).run(id);
  }

  function getDecryptedApiKey(id: number): string | null {
    const row = getRow(id);
    if (!row?.encrypted_api_key) return null;
    return decrypt(row.encrypted_api_key, masterKey);
  }

  return {
    listConnections,
    createConnection,
    getConnection,
    updateConnection,
    deleteConnection,
    setActiveConnection,
    getActiveConnection,
    testConnection,
    recordFailure,
    recordSuccess,
    getDecryptedApiKey,
  };
}

export type ProviderService = ReturnType<typeof createProviderService>;
