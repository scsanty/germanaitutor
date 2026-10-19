import { describe, it, expect, vi } from 'vitest';
import { runHealthCheck } from './healthCheck';

describe('runHealthCheck', () => {
  // Review Focus 1: repeated failed checks raise one problem.
  it('raises speech_down while unreachable and resolves it when back', async () => {
    const notifications = { raise: vi.fn(async () => {}), resolve: vi.fn(async () => {}) };
    const down = { health: vi.fn(async () => ({ ok: false, voices: [] })) };
    await runHealthCheck(down as never, notifications as never, 'http://localhost:5002');
    await runHealthCheck(down as never, notifications as never, 'http://localhost:5002');
    expect(notifications.raise).toHaveBeenCalledWith('speech_down', 'speech_down', 'Speech service is down', expect.stringContaining('http://localhost:5002'));
    const up = { health: vi.fn(async () => ({ ok: true, voices: ['thorsten'] })) };
    await runHealthCheck(up as never, notifications as never, 'http://localhost:5002');
    expect(notifications.resolve).toHaveBeenCalledWith('speech_down');
  });

  it('treats a health check that throws as down', async () => {
    const notifications = { raise: vi.fn(async () => {}), resolve: vi.fn(async () => {}) };
    const broken = { health: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) };
    await expect(runHealthCheck(broken as never, notifications as never, 'http://127.0.0.1:5002')).resolves.toBe(false);
    expect(notifications.raise).toHaveBeenCalledTimes(1);
    expect(notifications.resolve).not.toHaveBeenCalled();
  });
});
