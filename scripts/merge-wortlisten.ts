// Merges meaning-filled chunk files into the bundled word lists.
// Chunks: .superpowers/sdd/2026-09-29-freestyle/wortlisten/chunks/<scope>-<level>-NN.json, each an
// array of full WordListEntry; <scope> is goethe, telc, generic or shared (B2/C1).
// Output: data/wortlisten/<scope>/<level>.json. Levels are merged low to high, so each list is
// checked against the lower lists of its chain as already written.
// Run: npx tsx scripts/merge-wortlisten.ts [goethe-a1 telc-b1 …]   (default: every scope-level with chunks)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CefrLevel } from '../lib/types';
import { lemmaKey } from '../lib/deck/lemmaKey';
import { formatWordListFile, lowerLevels, mergeWordList } from '../lib/deck/mergeWordList';
import { WORD_LIST_DIR, type WordListEntry, type WordListFile, type WordListScope } from '../lib/deck/wordLists';

const CHUNK_DIR = join('.superpowers', 'sdd', '2026-09-29-freestyle', 'wortlisten', 'chunks');
const ORDER: [WordListScope, CefrLevel][] = [
  ...(['goethe', 'telc', 'generic'] as const).flatMap((s) => (['A1', 'A2', 'B1'] as const).map((l): [WordListScope, CefrLevel] => [s, l])),
  ['shared', 'B2'],
  ['shared', 'C1'],
];

const fileFor = (scope: WordListScope, level: CefrLevel) => join(WORD_LIST_DIR, scope, `${level.toLowerCase()}.json`);

function chunksFor(scope: WordListScope, level: CefrLevel): string[] {
  if (!existsSync(CHUNK_DIR)) return [];
  const re = new RegExp(`^${scope}-${level.toLowerCase()}-\\d+\\.json$`);
  return readdirSync(CHUNK_DIR).filter((f) => re.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function main() {
  const wanted = process.argv.slice(2).map((a) => a.toLowerCase());
  for (const [scope, level] of ORDER) {
    const id = `${scope}-${level.toLowerCase()}`;
    if (wanted.length && !wanted.includes(id)) continue;
    const names = chunksFor(scope, level);
    if (!names.length) {
      if (wanted.length) console.log(`${id}: no chunks`);
      continue;
    }
    const chunks = names.map((n) => JSON.parse(readFileSync(join(CHUNK_DIR, n), 'utf8')) as WordListEntry[]);
    const lower = new Set<string>();
    for (const [s, l] of lowerLevels(scope, level)) {
      const path = fileFor(s, l);
      if (!existsSync(path)) throw new Error(`${id}: lower list ${path} is missing; merge it first`);
      for (const e of (JSON.parse(readFileSync(path, 'utf8')) as WordListFile).entries) lower.add(lemmaKey(e.lemma));
    }
    const { file, dropped } = mergeWordList(chunks, scope, level, lower);
    writeFileSync(fileFor(scope, level), formatWordListFile(file));
    const byReason = (r: string) => dropped.filter((d) => d.reason === r).length;
    console.log(`${id}: ${names.length} chunks → ${file.entries.length} entries `
      + `(dropped ${byReason('duplicate')} duplicates, ${byReason('lower level')} from lower levels)`);
  }
}

main();
