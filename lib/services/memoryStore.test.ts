import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createMemoryStore } from './memoryStore';

describe('memoryStore', () => {
  it('round-trips arbitrary JSON values by type and key', () => {
    const db = createDbClient(':memory:');
    const store = createMemoryStore(db);
    store.setEntity('note', 'session-1', { summary: 'covered separable verbs' }, 'anthropic');
    const entity = store.getEntity('note', 'session-1');
    expect(entity?.value).toEqual({ summary: 'covered separable verbs' });
    expect(entity?.updatedByProvider).toBe('anthropic');
  });

  it('overwrites the value on a repeated key', () => {
    const db = createDbClient(':memory:');
    const store = createMemoryStore(db);
    store.setEntity('note', 'session-1', { summary: 'v1' });
    store.setEntity('note', 'session-1', { summary: 'v2' });
    expect(store.queryEntities('note')).toHaveLength(1);
    expect(store.getEntity('note', 'session-1')?.value).toEqual({ summary: 'v2' });
  });

  it('deletes an entity', () => {
    const db = createDbClient(':memory:');
    const store = createMemoryStore(db);
    store.setEntity('note', 'a', { x: 1 });
    store.deleteEntity('note', 'a');
    expect(store.getEntity('note', 'a')).toBeNull();
  });
});
