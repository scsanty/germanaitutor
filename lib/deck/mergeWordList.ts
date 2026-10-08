// Builds one bundled word-list file from meaning-filled chunks (scripts/merge-wortlisten.ts).
// Pure, so it is tested here rather than through the script.
import type { CefrLevel } from '../types';
import { TRACKS } from '../tutoring/levels';
import { lemmaKey } from './lemmaKey';
import type { WordListEntry, WordListFile, WordListScope } from './wordLists';

const TRACK_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1'];
const SHARED_LEVELS: readonly CefrLevel[] = ['B2', 'C1'];
const FIELDS = ['lemma', 'partOfSpeech', 'plural', 'example', 'meaningEn', 'meaningDe'] as const;

export interface DroppedEntry { lemma: string; reason: 'duplicate' | 'lower level' }

// Alphabetical position: the lemma without its article ("der Hund" files under H).
export function sortKey(lemma: string): string {
  return lemma.normalize('NFC').trim().replace(/^(der|die|das)(\/(der|die|das))* /, '').toLowerCase();
}

export function sourceFor(scope: WordListScope): WordListFile['source'] {
  return scope === 'goethe' || scope === 'telc' ? 'official' : 'nadoch';
}

// The lists below `level` on this scope's chain, matching allWordListProblems: a track's own lower
// levels; for the shared B2/C1 lists, every track's A1–B1 plus the shared levels below.
export function lowerLevels(scope: WordListScope, level: CefrLevel): [WordListScope, CefrLevel][] {
  if (scope !== 'shared') return TRACK_LEVELS.slice(0, TRACK_LEVELS.indexOf(level)).map((l) => [scope, l]);
  const tracks = TRACKS.flatMap((t) => TRACK_LEVELS.map((l): [WordListScope, CefrLevel] => [t, l]));
  return [...tracks, ...SHARED_LEVELS.slice(0, SHARED_LEVELS.indexOf(level)).map((l): [WordListScope, CefrLevel] => ['shared', l])];
}

function normalized(e: WordListEntry): WordListEntry {
  const nfc = (s: string) => s.normalize('NFC').trim();
  return {
    lemma: nfc(e.lemma),
    partOfSpeech: nfc(e.partOfSpeech),
    plural: e.plural === null ? null : nfc(e.plural),
    example: nfc(e.example),
    meaningEn: nfc(e.meaningEn),
    meaningDe: nfc(e.meaningDe),
  };
}

// Chunks in order → one file: the first entry per lemmaKey wins, words already in `lowerKeys` are
// dropped, and the rest are sorted by lemma without its article.
export function mergeWordList(
  chunks: WordListEntry[][], scope: WordListScope, level: CefrLevel, lowerKeys: Set<string>,
): { file: WordListFile; dropped: DroppedEntry[] } {
  const seen = new Set<string>();
  const kept: WordListEntry[] = [];
  const dropped: DroppedEntry[] = [];
  for (const entry of chunks.flat()) {
    const e = normalized(entry);
    const key = lemmaKey(e.lemma);
    if (lowerKeys.has(key)) dropped.push({ lemma: e.lemma, reason: 'lower level' });
    else if (seen.has(key)) dropped.push({ lemma: e.lemma, reason: 'duplicate' });
    else {
      seen.add(key);
      kept.push(e);
    }
  }
  const collator = new Intl.Collator('de');
  kept.sort((a, b) => collator.compare(sortKey(a.lemma), sortKey(b.lemma)) || collator.compare(a.lemma, b.lemma));
  return { file: { level, scope, source: sourceFor(scope), entries: kept }, dropped };
}

// The bundled files' layout: one entry per line, fields in a fixed order.
export function formatWordListFile(file: WordListFile): string {
  const line = (e: WordListEntry) => `    { ${FIELDS.map((f) => `${JSON.stringify(f)}: ${JSON.stringify(e[f])}`).join(', ')} }`;
  return [
    '{',
    `  "level": ${JSON.stringify(file.level)},`,
    `  "scope": ${JSON.stringify(file.scope)},`,
    `  "source": ${JSON.stringify(file.source)},`,
    '  "entries": [',
    file.entries.map(line).join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}
