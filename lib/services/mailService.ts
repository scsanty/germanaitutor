import type Database from 'better-sqlite3';
import nodemailer from 'nodemailer';
import { decrypt, encrypt } from '../crypto/encrypt';
import { loadOrCreateMasterKey } from '../crypto/keyfile';
import { deleteSetting, getSetting, setSetting } from './appSettings';
import type { Mailer } from './notificationService';

// Spec: SMTP settings in Content Admin, stored as JSON in app_settings.smtp. The password is encrypted
// with the master key and is never returned by any API.

const SMTP_KEY = 'smtp';

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passwordEncrypted: string;
  from: string;
  to: string;
}

// `password: null` keeps the stored password; a string (even '') replaces it.
export interface SmtpSettingsInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string | null;
  from: string;
  to: string;
}

export type SmtpSettingsDisplay = Omit<SmtpSettings, 'passwordEncrypted'> & { hasPassword: boolean };

export class SmtpSettingsError extends Error {}

export function readSmtpSettings(db: Database.Database): SmtpSettings | null {
  const raw = getSetting(db, SMTP_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<SmtpSettings>;
    if (typeof s.host !== 'string' || !s.host || typeof s.port !== 'number' || !s.from || !s.to) return null;
    return {
      host: s.host,
      port: s.port,
      secure: !!s.secure,
      user: s.user ?? '',
      passwordEncrypted: s.passwordEncrypted ?? '',
      from: s.from,
      to: s.to,
    };
  } catch {
    return null;
  }
}

export function readSmtpSettingsForDisplay(db: Database.Database): SmtpSettingsDisplay | null {
  const s = readSmtpSettings(db);
  if (!s) return null;
  const { passwordEncrypted, ...rest } = s;
  return { ...rest, hasPassword: passwordEncrypted !== '' };
}

// A simple address shape: `a@b.c`, or `Name <a@b.c>`. `to` may list several, separated by commas.
const ADDRESS = /^[^\s@<>,"]+@[^\s@<>,"]+\.[^\s@<>,"]+$/;
function isAddress(value: string): boolean {
  const v = value.trim();
  const named = /^[^<>]*<([^<>]+)>$/.exec(v);
  return ADDRESS.test(named ? named[1].trim() : v);
}

function smtpProblems(input: SmtpSettingsInput): string[] {
  const problems: string[] = [];
  const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  if (!text(input.host)) problems.push('host is required');
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) problems.push('port must be 1 to 65535');
  if (typeof input.secure !== 'boolean') problems.push('secure must be true or false');
  if (input.user !== undefined && typeof input.user !== 'string') problems.push('user must be text');
  if (input.password !== null && typeof input.password !== 'string') problems.push('password must be text or null');
  if (!text(input.from)) problems.push('from is required');
  else if (!isAddress(input.from)) problems.push('from must be an email address');
  if (!text(input.to)) problems.push('to is required');
  else if (!input.to.split(',').every(isAddress)) problems.push('to must be one or more email addresses, separated by commas');
  return problems;
}

export function saveSmtpSettings(db: Database.Database, input: SmtpSettingsInput, keyFilePath?: string): SmtpSettingsDisplay {
  const problems = smtpProblems(input);
  if (problems.length > 0) throw new SmtpSettingsError(problems.join('; '));
  const passwordEncrypted =
    input.password === null
      ? (readSmtpSettings(db)?.passwordEncrypted ?? '')
      : input.password === ''
        ? ''
        : encrypt(input.password, loadOrCreateMasterKey(keyFilePath));
  const settings: SmtpSettings = {
    host: input.host.trim(),
    port: input.port,
    secure: input.secure,
    user: (input.user ?? '').trim(),
    passwordEncrypted,
    from: input.from.trim(),
    to: input.to.trim(),
  };
  setSetting(db, SMTP_KEY, JSON.stringify(settings));
  return readSmtpSettingsForDisplay(db)!;
}

export function clearSmtpSettings(db: Database.Database): void {
  deleteSetting(db, SMTP_KEY);
}

export interface MailServiceDeps {
  keyFilePath?: string;
  // Tests inject a fake transport; nothing opens a network connection.
  createTransport?: typeof nodemailer.createTransport;
}

export const EMAIL_NOT_SET_UP = 'Email is not set up';

// Settings are read on every send, so a change in Content Admin applies straight away.
export function createMailService(db: Database.Database, deps: MailServiceDeps = {}): Mailer {
  return {
    async send(subject: string, text: string): Promise<void> {
      const s = readSmtpSettings(db);
      if (!s) throw new Error(EMAIL_NOT_SET_UP);
      let pass: string | undefined;
      if (s.passwordEncrypted) {
        try {
          pass = decrypt(s.passwordEncrypted, loadOrCreateMasterKey(deps.keyFilePath));
        } catch {
          throw new Error('The stored SMTP password could not be decrypted; enter it again');
        }
      }
      const transport = (deps.createTransport ?? nodemailer.createTransport)({
        host: s.host,
        port: s.port,
        secure: s.secure,
        // Without implicit TLS, STARTTLS is required, so the login never goes out unencrypted.
        requireTLS: !s.secure,
        auth: s.user ? { user: s.user, pass } : undefined,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      });
      await transport.sendMail({ from: s.from, to: s.to, subject: `[NaDoch!] ${subject}`, text });
    },
  };
}
