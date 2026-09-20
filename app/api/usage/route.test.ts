// app/api/usage/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { GET } from './route';

describe('/api/usage', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
    getDb().exec(`INSERT INTO provider_connections (id, provider_type) VALUES (1, 'anthropic')`);
    getDb().exec(
      `INSERT INTO provider_usage (connection_id, date, request_count, token_count) VALUES (1, '2026-09-20', 3, 500)`
    );
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns usage history for a connection', async () => {
    const res = await GET(new Request('http://localhost/api/usage?connectionId=1&days=30'));
    const body = await res.json();
    expect(body).toEqual([{ date: '2026-09-20', requestCount: 3, tokenCount: 500 }]);
  });
});
