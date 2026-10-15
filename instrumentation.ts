// Next.js calls register() once per server process. The background worker runs only in the Node
// server: not in the edge runtime, not under Vitest, and (S3) not in `next build`, where getDb() throws.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.VITEST || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { getDb } = await import('./lib/db/client');
  const { startBackgroundWorker } = await import('./lib/background/worker');
  startBackgroundWorker(getDb);
}
