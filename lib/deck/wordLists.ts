import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CefrLevel } from '../types';
import { lemmaKey, nounHasArticle } from './lemmaKey';

export interface WordListEntry {
  lemma: string;
  partOfSpeech: string;
  plural: string | null;
  example: string;
  meaningEn: string;
  meaningDe: string;
}

export interface WordListFile {
  level: CefrLevel;
  source: 'official' | 'nadoch';
  entries: WordListEntry[];
}

export const WORD_LIST_DIR = join('data', 'wortlisten');

// `dir` is relative to the working directory (or absolute); tests point it at fixtures.
export function readWordList(level: CefrLevel, dir: string = WORD_LIST_DIR): WordListFile {
  return JSON.parse(readFileSync(resolve(process.cwd(), dir, `${level.toLowerCase()}.json`), 'utf8')) as WordListFile;
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
