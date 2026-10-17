import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CefrLevel, Track } from '../types';
import type { LocalizedText } from '../i18n/localizedText';

export type TaskTypeId = 'passage_questions' | 'matching' | 'cloze' | 'audio_questions' | 'letter' | 'spoken';
const TASK_TYPES: TaskTypeId[] = ['passage_questions', 'matching', 'cloze', 'audio_questions', 'letter', 'spoken'];

// Types that have a runner. Writing and Speaking add theirs.
export const RUNTIME_TASK_TYPES = new Set<TaskTypeId>(['passage_questions', 'matching', 'cloze', 'audio_questions']);

export interface ExamPart {
  id: string;
  skill: 'reading' | 'sprachbausteine' | 'listening' | 'writing' | 'speaking';
  title: LocalizedText;
  taskType: TaskTypeId;
  items: number;
  points: number;
  minutes: number;
  instructions: string;
  replays?: number;
}

export interface ExamBlock {
  id: 'written' | 'oral';
  title: LocalizedText;
  minutes: number;
  partIds: string[];
  passRatio: number;
}

export interface ExamFormat {
  id: string;
  track: Track;
  level: CefrLevel;
  name: string;
  sources: string[];
  blocks: ExamBlock[];
  parts: ExamPart[];
}

// The path is built at runtime, so Turbopack can't scope it and would trace the whole project;
// the file calls below opt out (same as deckService).
const DIR = () => join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'exam-formats');

// Format ids can arrive from request bodies; only these shapes ever reach the filesystem.
const FORMAT_ID = /^(generic|goethe|telc)-(a1|a2|b1|b2|c1)$/;

export function formatId(track: Track, level: CefrLevel): string {
  return `${track}-${level.toLowerCase()}`;
}

export function readFormat(id: string): ExamFormat | null {
  if (!FORMAT_ID.test(id)) return null;
  const path = join(DIR(), `${id}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, 'utf8')) as ExamFormat) : null;
}

export function listFormats(): ExamFormat[] {
  const dir = DIR();
  return readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(/*turbopackIgnore: true*/ join(dir, f), 'utf8')) as ExamFormat);
}

const positiveInt = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0;

export function formatProblems(format: ExamFormat): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, ExamPart>();
  for (const part of format.parts) {
    if (seen.has(part.id)) problems.push(`part ${part.id}: duplicate id`);
    seen.add(part.id);
    byId.set(part.id, part);
    if (!positiveInt(part.items)) problems.push(`part ${part.id}: items must be a positive whole number`);
    if (!(part.points > 0)) problems.push(`part ${part.id}: points must be positive`);
    if (!(part.minutes > 0)) problems.push(`part ${part.id}: minutes must be positive`);
    if (!TASK_TYPES.includes(part.taskType)) problems.push(`part ${part.id}: unknown task type ${part.taskType}`);
  }
  for (const block of format.blocks) {
    const missing = block.partIds.filter((id) => !byId.has(id));
    for (const id of missing) problems.push(`block ${block.id}: unknown part ${id}`);
    if (missing.length === 0) {
      const sum = block.partIds.reduce((s, id) => s + byId.get(id)!.minutes, 0);
      if (Math.abs(sum - block.minutes) > 1) problems.push(`block ${block.id}: minutes ${block.minutes} differ from its parts (${sum})`);
    }
  }
  return problems;
}
