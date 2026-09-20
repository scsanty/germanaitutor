import type Database from 'better-sqlite3';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createUsageService(db: Database.Database) {
  function recordUsage(
    connectionId: number,
    requestDelta: number,
    tokenDelta: number,
    date: string = todayISO()
  ): void {
    db.prepare(
      `INSERT INTO provider_usage (connection_id, date, request_count, token_count)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(connection_id, date) DO UPDATE SET
         request_count = request_count + excluded.request_count,
         token_count = token_count + excluded.token_count`
    ).run(connectionId, date, requestDelta, tokenDelta);
  }

  function getUsageForDate(
    connectionId: number,
    date: string = todayISO()
  ): { requestCount: number; tokenCount: number } {
    const row = db
      .prepare('SELECT request_count, token_count FROM provider_usage WHERE connection_id = ? AND date = ?')
      .get(connectionId, date) as { request_count: number; token_count: number } | undefined;
    return { requestCount: row?.request_count ?? 0, tokenCount: row?.token_count ?? 0 };
  }

  function getUsageHistory(
    connectionId: number,
    days: number
  ): { date: string; requestCount: number; tokenCount: number }[] {
    const rows = db
      .prepare(
        `SELECT date, request_count, token_count FROM provider_usage WHERE connection_id = ? ORDER BY date DESC LIMIT ?`
      )
      .all(connectionId, days) as { date: string; request_count: number; token_count: number }[];
    return rows.map((r) => ({ date: r.date, requestCount: r.request_count, tokenCount: r.token_count }));
  }

  return { recordUsage, getUsageForDate, getUsageHistory };
}

export type UsageService = ReturnType<typeof createUsageService>;
