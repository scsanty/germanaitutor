import { createDbClient } from '../lib/db/client';
import { createGenerationAiClient } from '../lib/curriculum-gen/aiClient';
import { runPhase1 } from '../lib/curriculum-gen/phase1MasterPool';
import { runPhase2 } from '../lib/curriculum-gen/phase2TrackStructure';
import { runPhase3 } from '../lib/curriculum-gen/phase3Content';
import { validateCurriculum } from '../lib/curriculum-gen/validate';
import { exportSeed } from '../lib/curriculum-gen/exportSeed';
import { join } from 'node:path';

async function main() {
  const dbPath = process.env.CURRICULUM_GEN_DB_PATH ?? join(process.cwd(), 'data', 'curriculum-gen.db');
  const outDir = process.env.CURRICULUM_GEN_OUT_DIR ?? join(process.cwd(), 'data', 'curriculum-seed');
  const seedVersion = process.env.CURRICULUM_GEN_SEED_VERSION ?? String(Date.now());

  const db = createDbClient(dbPath);
  const aiClient = createGenerationAiClient();

  console.log('Phase 1: master concept pool...');
  await runPhase1(db, aiClient);

  console.log('Phase 2: track structuring...');
  await runPhase2(db, aiClient);

  console.log('Phase 3: content generation...');
  await runPhase3(db, aiClient);

  console.log('Validating...');
  const report = validateCurriculum(db);
  console.log('Counts:', report.counts);
  if (report.issues.length > 0) {
    console.log(`${report.issues.length} issue(s) flagged for review:`);
    for (const issue of report.issues) console.log(`  - ${issue}`);
  }

  console.log(`Exporting seed data to ${outDir}...`);
  exportSeed(db, outDir, seedVersion);

  db.close();
  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
