import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { getSetting, setSetting } from '@/lib/services/appSettings';
import { DEFAULT_SPEECH_URL, normalizeSpeechUrl, SpeechUrlError } from '@/lib/speech/speechProvider';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn() }));
const send = vi.fn(async () => {});
vi.mock('@/lib/services/mailService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/mailService')>();
  return { ...actual, createMailService: vi.fn(() => ({ send })) };
});
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { GET as getSmtp, PUT as putSmtp } from './smtp/route';
import { POST as testSmtp } from './smtp/test/route';
import { GET as getSpeech, PUT as putSpeech } from './speech/route';

const SECRET = 'hunter2-very-secret';
const SMTP = { host: 'smtp.example.com', port: 587, secure: false, user: 'me', password: SECRET, from: 'NaDoch <me@example.com>', to: 'admin@example.com' };
const put = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) }));

describe('/api/admin/settings', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-settings-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    send.mockReset();
    send.mockResolvedValue(undefined);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
    vi.unstubAllGlobals();
  });

  it('returns 401 without an admin session', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await getSmtp()).status).toBe(401);
    expect((await put(putSmtp, SMTP)).status).toBe(401);
    expect((await testSmtp()).status).toBe(401);
    expect((await getSpeech(new Request('http://localhost/api/admin/settings/speech'))).status).toBe(401);
    expect((await put(putSpeech, { url: 'http://127.0.0.1:5002' })).status).toBe(401);
    expect(getSetting(getDb(), 'smtp')).toBeNull();
  });

  it('stores the SMTP password encrypted and never returns it', async () => {
    const saved = await put(putSmtp, SMTP);
    expect(saved.status).toBe(200);
    const raw = getSetting(getDb(), 'smtp')!;
    expect(raw).not.toContain(SECRET);
    expect(JSON.parse(raw).passwordEncrypted).toBeTruthy();

    const shown = await (await getSmtp()).text();
    expect(shown).not.toContain(SECRET);
    expect(shown).not.toContain('passwordEncrypted');
    expect(JSON.parse(shown).settings).toMatchObject({ host: 'smtp.example.com', port: 587, user: 'me', hasPassword: true });
  });

  it('keeps the stored password when the field is empty, and clears it on request', async () => {
    await put(putSmtp, SMTP);
    const before = JSON.parse(getSetting(getDb(), 'smtp')!).passwordEncrypted;
    await put(putSmtp, { ...SMTP, host: 'mail.example.com', password: '' });
    const kept = JSON.parse(getSetting(getDb(), 'smtp')!);
    expect(kept).toMatchObject({ host: 'mail.example.com', passwordEncrypted: before });

    const cleared = await (await put(putSmtp, { ...SMTP, password: '', clearPassword: true })).json();
    expect(cleared.settings.hasPassword).toBe(false);
  });

  it('refuses invalid SMTP settings with the problems', async () => {
    const res = await put(putSmtp, { ...SMTP, host: '', port: 0 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('host is required; port must be 1 to 65535');
  });

  it('sends a test email with the mailer and reports the SMTP error text', async () => {
    const ok = await testSmtp();
    expect(await ok.json()).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith('Test email', expect.any(String));

    send.mockRejectedValueOnce(new Error('Invalid login: 535 Authentication failed'));
    const failed = await testSmtp();
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ ok: false, error: 'Invalid login: 535 Authentication failed' });
  });

  it('saves the speech URL as its origin, and an empty URL goes back to the default', async () => {
    const saved = await (await put(putSpeech, { url: ' https://speech.local:8443/ ' })).json();
    expect(saved).toMatchObject({ url: 'https://speech.local:8443', isDefault: false });
    expect(getSetting(getDb(), 'speech_url')).toBe('https://speech.local:8443');

    const bad = await put(putSpeech, { url: 'http://speech.local/render' });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('The address must not have a path');
    expect(getSetting(getDb(), 'speech_url')).toBe('https://speech.local:8443');

    expect(await (await put(putSpeech, { url: '' })).json()).toMatchObject({ url: DEFAULT_SPEECH_URL, isDefault: true });
    expect(getSetting(getDb(), 'speech_url')).toBeNull();
  });

  it('checks the saved speech service with a mocked fetch', async () => {
    setSetting(getDb(), 'speech_url', 'http://speech.test:5002');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, voices: ['thorsten', 'kerstin'] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const plain = await (await getSpeech(new Request('http://localhost/api/admin/settings/speech'))).json();
    expect(plain).toEqual({ url: 'http://speech.test:5002', defaultUrl: DEFAULT_SPEECH_URL, isDefault: false });
    expect(fetchMock).not.toHaveBeenCalled();

    const checked = await (await getSpeech(new Request('http://localhost/api/admin/settings/speech?check=1'))).json();
    expect(checked.health).toEqual({ ok: true, voices: ['thorsten', 'kerstin'] });
    expect(fetchMock).toHaveBeenCalledWith('http://speech.test:5002/health', expect.anything());

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const down = await (await getSpeech(new Request('http://localhost/api/admin/settings/speech?check=1'))).json();
    expect(down.health).toEqual({ ok: false, voices: [] });
  });
});

describe('normalizeSpeechUrl', () => {
  const refused = (input: string) => {
    try {
      normalizeSpeechUrl(input);
    } catch (err) {
      expect(err).toBeInstanceOf(SpeechUrlError);
      return (err as Error).message;
    }
    throw new Error(`accepted ${input}`);
  };

  it('keeps http and https origins, normalised', () => {
    expect(normalizeSpeechUrl('http://127.0.0.1:5002')).toBe('http://127.0.0.1:5002');
    expect(normalizeSpeechUrl('  HTTP://Speech.Local:5002/  ')).toBe('http://speech.local:5002');
    expect(normalizeSpeechUrl('https://speech.example.com:443')).toBe('https://speech.example.com');
    expect(normalizeSpeechUrl('http://[::1]:5002')).toBe('http://[::1]:5002');
  });

  it('refuses other schemes and text that is not a URL', () => {
    expect(refused('ftp://speech.local')).toBe('The address must start with http:// or https://');
    expect(refused('file:///etc/passwd')).toBe('The address must start with http:// or https://');
    expect(refused('javascript:alert(1)')).toBe('The address must start with http:// or https://');
    expect(refused('localhost:5002')).toBe('The address must start with http:// or https://');
    expect(refused('not a url')).toBe('Enter a full address like http://127.0.0.1:5002');
  });

  it('refuses credentials', () => {
    expect(refused('http://user:pass@speech.local:5002')).toBe('The address must not contain a user name or password');
    expect(refused('http://user@speech.local:5002')).toBe('The address must not contain a user name or password');
  });

  it('refuses a path, a query or a fragment', () => {
    expect(refused('http://speech.local:5002/api')).toBe('The address must not have a path');
    expect(refused('http://speech.local:5002?x=1')).toBe('The address must not have a query or fragment');
    expect(refused('http://speech.local:5002/?')).toBe('The address must not have a query or fragment');
    expect(refused('http://speech.local:5002#top')).toBe('The address must not have a query or fragment');
    expect(refused('http://speech.local:5002/#')).toBe('The address must not have a query or fragment');
  });
});
