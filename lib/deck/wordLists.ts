import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CefrLevel, Track } from '../types';
import { LEVELS, TRACKS } from '../tutoring/levels';
import { lemmaKey, nounHasArticle } from './lemmaKey';

export interface WordListEntry {
  lemma: string;
  partOfSpeech: string;
  plural: string | null;
  example: string;
  meaningEn: string;
  meaningDe: string;
}

// Spec (amended 2026-10-08): A1–B1 lists belong to one track; B2 and C1 are one list for all.
export type WordListScope = Track | 'shared';

export interface WordListFile {
  level: CefrLevel;
  // Must match the folder the file sits in (checked by allWordListProblems).
  scope: WordListScope;
  source: 'official' | 'nadoch';
  entries: WordListEntry[];
}

export const WORD_LIST_DIR = join('data', 'wortlisten');

const TRACK_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1'];
const SHARED_LEVELS: readonly CefrLevel[] = LEVELS.filter((l) => !TRACK_LEVELS.includes(l));

export function wordListScope(track: Track, level: CefrLevel): WordListScope {
  return TRACK_LEVELS.includes(level) ? track : 'shared';
}

// `<dir>/<track>/<level>.json` for A1–B1, `<dir>/shared/<level>.json` for B2/C1. `dir` is relative
// to the working directory (or absolute); tests point it at fixtures.
export function wordListPath(track: Track, level: CefrLevel, dir: string = WORD_LIST_DIR): string {
  return join(dir, wordListScope(track, level), `${level.toLowerCase()}.json`);
}

export function readWordList(track: Track, level: CefrLevel, dir: string = WORD_LIST_DIR): WordListFile {
  return JSON.parse(readFileSync(resolve(process.cwd(), wordListPath(track, level, dir)), 'utf8')) as WordListFile;
}

// Spec: Content validation. Messages name the lemma so a content fix is easy to find.
export function wordListProblems(file: WordListFile, lowerKeys: Set<string>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of file.entries) {
    for (const field of ['lemma', 'partOfSpeech', 'example', 'meaningEn', 'meaningDe'] as const) {
      if (!e[field] || !e[field].trim()) problems.push(`${e.lemma}: ${field} is empty`);
    }
    if (e.partOfSpeech === 'noun' && !nounHasArticle(e.lemma)) problems.push(`${e.lemma}: a noun needs its article`);
    const key = lemmaKey(e.lemma);
    if (seen.has(key)) problems.push(`${e.lemma}: duplicate of an earlier entry`);
    else if (lowerKeys.has(key)) problems.push(`${e.lemma}: already in a lower level`);
    seen.add(key);
  }
  return problems;
}

// Validates every list: each file against its folder, and lower-level repeats along each track's
// chain (A1 → A2 → B1 of that track → shared B2 → shared C1). The shared lists therefore may not
// repeat a word from any track's A1–B1; the same word in two tracks' lists is fine.
export function allWordListProblems(load: (scope: WordListScope, level: CefrLevel) => WordListFile): string[] {
  const problems: string[] = [];
  const check = (scope: WordListScope, level: CefrLevel, lower: Set<string>) => {
    const file = load(scope, level);
    const where = `${scope}/${level}`;
    const source = scope === 'goethe' || scope === 'telc' ? 'official' : 'nadoch';
    if (file.level !== level) problems.push(`${where}: level is ${file.level}`);
    if (file.scope !== scope) problems.push(`${where}: scope is ${file.scope}`);
    if (file.source !== source) problems.push(`${where}: source is ${file.source}`);
    problems.push(...wordListProblems(file, lower).map((p) => `${where}: ${p}`));
    for (const e of file.entries) lower.add(lemmaKey(e.lemma));
  };
  const belowShared = new Set<string>();
  for (const track of TRACKS) {
    const chain = new Set<string>();
    for (const level of TRACK_LEVELS) check(track, level, chain);
    chain.forEach((k) => belowShared.add(k));
  }
  for (const level of SHARED_LEVELS) check('shared', level, belowShared);
  return problems;
}
