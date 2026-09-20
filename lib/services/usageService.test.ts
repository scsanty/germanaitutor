// lib/services/usageService.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createUsageService } from './usageService';

describe('usageService', () => {
  it('accumulates usage for the same connection and date', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO provider_connections (id, provider_type) VALUES (1, 'anthropic')`);
    const service = createUsageService(db);
    service.recordUsage(1, 1, 100, '2026-09-20');
    service.recordUsage(1, 1, 50, '2026-09-20');
    expect(service.getUsageForDate(1, '2026-09-20')).toEqual({ requestCount: 2, tokenCount: 150 });
  });

  it('keeps separate totals per date', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO provider_connections (id, provider_type) VALUES (1, 'anthropic')`);
    const service = createUsageService(db);
    service.recordUsage(1, 1, 10, '2026-09-19');
    service.recordUsage(1, 1, 20, '2026-09-20');
    expect(service.getUsageHistory(1, 30)).toHaveLength(2);
  });
});
