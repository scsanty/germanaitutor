import type Database from 'better-sqlite3';

export interface MemoryEntity {
  entityType: string;
  entityKey: string;
  value: unknown;
  updatedByProvider: string | null;
  updatedAt: string;
}

interface Row {
  entity_type: string;
  entity_key: string;
  value: string;
  updated_by_provider: string | null;
  updated_at: string;
}

function rowToEntity(row: Row): MemoryEntity {
  return {
    entityType: row.entity_type,
    entityKey: row.entity_key,
    value: JSON.parse(row.value),
    updatedByProvider: row.updated_by_provider,
    updatedAt: row.updated_at,
  };
}

export function createMemoryStore(db: Database.Database) {
  function setEntity(entityType: string, entityKey: string, value: unknown, updatedByProvider?: string): void {
    db.prepare(
      `INSERT INTO memory_store (entity_type, entity_key, value, updated_by_provider, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(entity_type, entity_key) DO UPDATE SET
         value = excluded.value, updated_by_provider = excluded.updated_by_provider, updated_at = excluded.updated_at`
    ).run(entityType, entityKey, JSON.stringify(value), updatedByProvider ?? null);
  }

  function getEntity(entityType: string, entityKey: string): MemoryEntity | null {
    const row = db
      .prepare('SELECT * FROM memory_store WHERE entity_type = ? AND entity_key = ?')
      .get(entityType, entityKey) as Row | undefined;
    return row ? rowToEntity(row) : null;
  }

  function queryEntities(entityType: string): MemoryEntity[] {
    const rows = db
      .prepare('SELECT * FROM memory_store WHERE entity_type = ? ORDER BY updated_at DESC')
      .all(entityType) as Row[];
    return rows.map(rowToEntity);
  }

  function deleteEntity(entityType: string, entityKey: string): void {
    db.prepare('DELETE FROM memory_store WHERE entity_type = ? AND entity_key = ?').run(entityType, entityKey);
  }

  return { setEntity, getEntity, queryEntities, deleteEntity };
}

export type MemoryStore = ReturnType<typeof createMemoryStore>;
