// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { getSetting } from './appSettings';
import { createMailService, readSmtpSettingsForDisplay, saveSmtpSettings, SmtpSettingsError } from './mailService';

const dirs: string[] = [];
function keyFile() {
  const dir = mkdtempSync(join(tmpdir(), 'gait-mail-'));
  dirs.push(dir);
  return join(dir, 'master.key');
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const input = { host: 'smtp.example.org', port: 465, secure: true, user: 'admin', password: 's3cret', from: 'nadoch@example.org', to: 'me@example.org' };

describe('mailService', () => {
  it('stores the password encrypted and never returns it; null keeps it', () => {
    const db = createDbClient(':memory:');
    const key = keyFile();
    const shown = saveSmtpSettings(db, input, key);
    expect(shown).toEqual({ host: 'smtp.example.org', port: 465, secure: true, user: 'admin', from: 'nadoch@example.org', to: 'me@example.org', hasPassword: true });
    expect(JSON.stringify(shown)).not.toContain('s3cret');
    expect(getSetting(db, 'smtp')).not.toContain('s3cret');

    saveSmtpSettings(db, { ...input, host: 'mail.example.org', password: null }, key);
    expect(readSmtpSettingsForDisplay(db)).toMatchObject({ host: 'mail.example.org', hasPassword: true });
    saveSmtpSettings(db, { ...input, password: '' }, key);
    expect(readSmtpSettingsForDisplay(db)?.hasPassword).toBe(false);
  });

  it('rejects invalid settings', () => {
    const db = createDbClient(':memory:');
    expect(() => saveSmtpSettings(db, { ...input, port: 0, host: ' ' }, keyFile())).toThrow(SmtpSettingsError);
    expect(readSmtpSettingsForDisplay(db)).toBeNull();
  });

  it('sends through the transport with the decrypted password and a tagged subject', async () => {
    const db = createDbClient(':memory:');
    const key = keyFile();
    saveSmtpSettings(db, input, key);
    const sendMail = vi.fn(async () => ({}));
    const createTransport = vi.fn(() => ({ sendMail }));
    await createMailService(db, { keyFilePath: key, createTransport: createTransport as never }).send('Speech service is down', 'body');
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.org', port: 465, secure: true, auth: { user: 'admin', pass: 's3cret' } }));
    expect(sendMail).toHaveBeenCalledWith({ from: 'nadoch@example.org', to: 'me@example.org', subject: '[NaDoch!] Speech service is down', text: 'body' });
  });

  it('throws a clear error when email is not set up', async () => {
    const db = createDbClient(':memory:');
    await expect(createMailService(db).send('s', 't')).rejects.toThrow('Email is not set up');
  });
});
