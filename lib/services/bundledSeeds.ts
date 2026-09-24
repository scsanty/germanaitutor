import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { loadSeedIfNeeded } from './curriculumSeedLoader';
import { createPlacementService } from './placementService';

// Loads the bundled curriculum and placement exam into `db` when they are
// missing (a fresh DB, or one emptied by reset/backup-restore). An invalid
// bundled placement exam still throws, same as before this was extracted.
export function loadBundledSeeds(db: Database.Database): void {
  loadSeedIfNeeded(db, join(process.cwd(), 'data', 'curriculum-seed'));
  createPlacementService(db).loadSeedExamIfEmpty(join(process.cwd(), 'data', 'placement-exam.json'));
}
