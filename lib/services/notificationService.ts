import type Database from 'better-sqlite3';
import { createMailService } from './mailService';

// Spec: Admin notifications. Problems (speech_down, audio_failed, provider_errors) keep one open row
// per problem_key and email once when they start and once when they're resolved. Informational kinds
// (pool_items, content_issues) are in-app only. Nothing here ever throws into the caller (I7).

export interface Mailer {
  send(subject: string, text: string): Promise<void>;
}

export type NotificationKind = 'speech_down' | 'audio_failed' | 'pool_items' | 'provider_errors' | 'content_issues';

export interface AdminNotification {
  id: number;
  kind: string;
  problemKey: string | null;
  severity: 'problem' | 'info';
  title: string;
  body: string;
  createdAt: string;
  resolvedAt: string | null;
  readAt: string | null;
  emailError: string | null;
}

export interface NotificationFilter {
  openProblems?: boolean;
  unreadOnly?: boolean;
  limit?: number;
}

export interface NotificationDeps {
  mailer?: Mailer;
  now?: () => Date;
}

interface Row {
  id: number;
  kind: string;
  problem_key: string | null;
  severity: 'problem' | 'info';
  title: string;
  body: string;
  created_at: string;
  resolved_at: string | null;
  read_at: string | null;
  email_error: string | null;
}

// Kinds that are never emailed, even when raised with a problem key (the audio sweep's lost uploads).
const INFO_KINDS = new Set<string>(['pool_items', 'content_issues']);

const FOOTER = '\n\n--\nNaDoch! admin notifications. See /admin/notifications.';

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 1000);

const poolBody = (n: number) => `${n} new item${n === 1 ? '' : 's'} to review`;
const countIn = (body: string) => {
  const m = /^(\d+)/.exec(body);
  return m ? Number(m[1]) : 1;
};

function toNotification(r: Row): AdminNotification {
  return {
    id: r.id,
    kind: r.kind,
    problemKey: r.problem_key,
    severity: r.severity,
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    readAt: r.read_at,
    emailError: r.email_error,
  };
}

export function createNotificationService(db: Database.Database, deps: NotificationDeps = {}) {
  // With no SMTP set up, the default mailer's send fails with "Email is not set up", recorded on the row.
  const mailer = deps.mailer ?? createMailService(db);
  const now = () => (deps.now ?? (() => new Date()))().toISOString();

  // Sends and records the outcome on the row; never throws.
  async function email(id: number, subject: string, body: string): Promise<void> {
    let error: string | null = null;
    try {
      await mailer.send(subject, body + FOOTER);
    } catch (err) {
      error = messageOf(err);
    }
    try {
      db.prepare('UPDATE admin_notifications SET email_error = ? WHERE id = ?').run(error, id);
    } catch (err) {
      console.error('Recording the notification email result failed:', err);
    }
  }

  // Idempotent while open: a second raise with the same key does nothing.
  async function raise(kind: string, problemKey: string, title: string, body: string): Promise<void> {
    try {
      const severity = INFO_KINDS.has(kind) ? 'info' : 'problem';
      // The partial unique index keeps one open row per key, also against a concurrent raise.
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO admin_notifications (kind, problem_key, severity, title, body, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(kind, problemKey, severity, title, body, now());
      if (result.changes === 0 || severity !== 'problem') return;
      await email(Number(result.lastInsertRowid), title, body);
    } catch (err) {
      console.error('Raising an admin notification failed:', err);
    }
  }

  // Closes the open row for the key, if any, and emails "Resolved: <title>" only then.
  async function resolve(problemKey: string): Promise<void> {
    try {
      const open = db
        .prepare('SELECT * FROM admin_notifications WHERE problem_key = ? AND resolved_at IS NULL')
        .get(problemKey) as Row | undefined;
      if (!open) return;
      const closed = db
        .prepare('UPDATE admin_notifications SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL')
        .run(now(), open.id);
      if (closed.changes === 0 || open.severity !== 'problem') return;
      await email(open.id, `Resolved: ${open.title}`, `This problem is resolved.\n\n${open.title}: ${open.body}`);
    } catch (err) {
      console.error('Resolving an admin notification failed:', err);
    }
  }

  // In-app only. pool_items keeps one unread row per day whose count goes up in place.
  async function info(kind: string, title: string, body: string): Promise<void> {
    try {
      const at = now();
      if (kind === 'pool_items') {
        const today = db
          .prepare(
            `SELECT id, body FROM admin_notifications
             WHERE kind = 'pool_items' AND read_at IS NULL AND substr(created_at, 1, 10) = ?
             ORDER BY id DESC LIMIT 1`
          )
          .get(at.slice(0, 10)) as { id: number; body: string } | undefined;
        if (today) {
          db.prepare('UPDATE admin_notifications SET body = ?, title = ? WHERE id = ?').run(
            poolBody(countIn(today.body) + countIn(body)),
            title,
            today.id
          );
          return;
        }
        body = poolBody(countIn(body));
      }
      db.prepare(
        `INSERT INTO admin_notifications (kind, problem_key, severity, title, body, created_at) VALUES (?, NULL, 'info', ?, ?, ?)`
      ).run(kind, title, body, at);
    } catch (err) {
      console.error('Adding an admin notification failed:', err);
    }
  }

  // Newest first.
  function list(filter: NotificationFilter = {}): AdminNotification[] {
    const where: string[] = [];
    if (filter.openProblems) where.push("severity = 'problem' AND resolved_at IS NULL");
    if (filter.unreadOnly) where.push('read_at IS NULL');
    const limit = Math.max(1, Math.min(filter.limit ?? 200, 1000));
    const rows = db
      .prepare(
        `SELECT * FROM admin_notifications ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(limit) as Row[];
    return rows.map(toNotification);
  }

  function markAllRead(): number {
    return db.prepare('UPDATE admin_notifications SET read_at = ? WHERE read_at IS NULL').run(now()).changes;
  }

  function unreadCount(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM admin_notifications WHERE read_at IS NULL').get() as { n: number }).n;
  }

  return { raise, resolve, info, list, markAllRead, unreadCount };
}

export type NotificationService = ReturnType<typeof createNotificationService>;

// Spec: repeated AI provider errors, 3 failures within 10 minutes. Timestamps live in memory, per
// database handle. A success resolves the problem and clears the count, so an intermittent provider
// can't flap between raise and resolve (one email each time).
export const PROVIDER_FAILURE_LIMIT = 3;
export const PROVIDER_FAILURE_WINDOW_MS = 10 * 60_000;
const providerFailures = new WeakMap<Database.Database, number[]>();

export async function recordProviderFailure(db: Database.Database, deps: NotificationDeps = {}): Promise<void> {
  try {
    const at = (deps.now ?? (() => new Date()))().getTime();
    const recent = (providerFailures.get(db) ?? []).filter((t) => at - t < PROVIDER_FAILURE_WINDOW_MS);
    recent.push(at);
    providerFailures.set(db, recent);
    if (recent.length < PROVIDER_FAILURE_LIMIT) return;
    await createNotificationService(db, deps).raise(
      'provider_errors',
      'provider_errors',
      'AI provider errors',
      `The active AI provider failed ${recent.length} times within 10 minutes. Check the provider settings and its status.`
    );
  } catch (err) {
    console.error('Recording an AI provider failure failed:', err);
  }
}

export async function recordProviderSuccess(db: Database.Database, deps: NotificationDeps = {}): Promise<void> {
  try {
    providerFailures.delete(db);
    const open = db
      .prepare("SELECT 1 FROM admin_notifications WHERE problem_key = 'provider_errors' AND resolved_at IS NULL")
      .get();
    if (!open) return;
    await createNotificationService(db, deps).resolve('provider_errors');
  } catch (err) {
    console.error('Recording an AI provider success failed:', err);
  }
}
