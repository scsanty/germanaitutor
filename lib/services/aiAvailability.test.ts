import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { isAiAvailable } from './aiService';

function addConnection(db: ReturnType<typeof createDbClient>, values: { active: number; model: string | null; status: string }) {
  db.prepare(
    `INSERT INTO provider_connections (provider_type, selected_model, is_active, last_validated_status)
     VALUES ('ollama', ?, ?, ?)`
  ).run(values.model, values.active, values.status);
}

describe('isAiAvailable', () => {
  it('needs an active connection with a model that has not been found invalid', () => {
    const cases: [{ active: number; model: string | null; status: string } | null, boolean][] = [
      [null, false],
      [{ active: 0, model: 'm', status: 'valid' }, false],
      [{ active: 1, model: null, status: 'valid' }, false],
      [{ active: 1, model: 'm', status: 'invalid' }, false],
      [{ active: 1, model: 'm', status: 'valid' }, true],
      [{ active: 1, model: 'm', status: 'failing' }, true],
      [{ active: 1, model: 'm', status: 'untested' }, true],
    ];
    for (const [connection, expected] of cases) {
      const db = createDbClient(':memory:');
      if (connection) addConnection(db, connection);
      expect({ connection, available: isAiAvailable(db) }).toEqual({ connection, available: expected });
    }
  });
});
