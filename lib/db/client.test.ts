// lib/db/client.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient, getDb, closeDb } from './client';
import { runMigrations } from './schema';

describe('createDbClient', () => {
  it('creates all four Core tables', () => {
    const db = createDbClient(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(['profile', 'provider_connections', 'provider_usage', 'memory_store'])
    );
    db.close();
  });

  it('runMigrations is idempotent', () => {
    const db = createDbClient(':memory:');
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });

  it('getDb reuses a singleton until closeDb is called', () => {
    process.env.GAIT_DB_PATH = ':memory:';
    const first = getDb();
    const second = getDb();
    expect(first).toBe(second);
    closeDb();
    const third = getDb();
    expect(third).not.toBe(first);
    closeDb();
    delete process.env.GAIT_DB_PATH;
  });
});
