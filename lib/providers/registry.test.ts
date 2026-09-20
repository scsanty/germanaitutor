// lib/providers/registry.test.ts
import { describe, it, expect } from 'vitest';
import { getAdapter } from './registry';

describe('getAdapter', () => {
  it.each(['anthropic', 'openai', 'gemini', 'ollama'] as const)(
    'returns a full adapter for %s',
    (type) => {
      const adapter = getAdapter(type);
      expect(typeof adapter.testConnection).toBe('function');
      expect(typeof adapter.listModels).toBe('function');
      expect(typeof adapter.generateText).toBe('function');
    }
  );
});
