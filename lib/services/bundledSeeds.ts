import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { loadSeedIfNeeded } from './curriculumSeedLoader';
import { createPlacementService } from './placementService';

// Loads the bundled curriculum and placement exam into `db` when they are
// missing (a fresh DB, or one emptied by reset/backup-restore), and refreshes a
// bundled placement exam that a newer release changed (never an uploaded one).
// An invalid bundled placement exam still throws, same as before this was extracted.
export function loadBundledSeeds(db: Database.Database): void {
  loadSeedIfNeeded(db, join(process.cwd(), 'data', 'curriculum-seed'));
  createPlacementService(db).syncBundledExam(join(process.cwd(), 'data', 'placement-exam.json'));
}

let seeded = false;

// Request-time entry point: seeds once per server process, never at module scope, because
// Next evaluates the root layout during `next build` and that must not touch a real database.
export function ensureBundledSeeds(getDb: () => Database.Database): void {
  if (seeded) return;
  loadBundledSeeds(getDb());
  seeded = true;
}
