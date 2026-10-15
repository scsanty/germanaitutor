import type Database from 'better-sqlite3';
import { lessonTextProblems, milestoneTextProblems } from '../curriculum/bilingualValidation';
import { instructionProblems } from '../curriculum/exerciseContentValidation';
import { getSetting, setSetting } from '../services/appSettings';
import { createCurriculumAuditService } from '../services/curriculumAuditService';
import { createNotificationService } from '../services/notificationService';

// Spec: content issues, a daily check. C7: flashcard-rule violations and missing translations (lesson
// and milestone texts, exercise instructions). An in-app info goes out only when an issue appears that
// the previous check didn't see, so a known backlog isn't repeated every day.

export const CONTENT_CHECK_INTERVAL_MS = 24 * 60 * 60_000;
const STATE_KEY = 'content_check';

interface CheckState {
  checkedAt: string;
  issues: string[];
}

export interface ContentCheckDeps {
  now?: () => Date;
  notify?: { info(kind: string, title: string, body: string): void | Promise<void> };
}

export interface ContentCheckResult {
  ran: boolean;
  flashcardViolations: number;
  missingTranslations: number;
  newIssues: number;
}

const parseList = (raw: string | null): string[] | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};

function readState(db: Database.Database): CheckState | null {
  try {
    const s = JSON.parse(getSetting(db, STATE_KEY) ?? 'null') as CheckState | null;
    return s && typeof s.checkedAt === 'string' && Array.isArray(s.issues) ? s : null;
  } catch {
    return null;
  }
}

export function contentIssues(db: Database.Database): { flashcard: string[]; translation: string[] } {
  const flashcard = createCurriculumAuditService(db)
    .listFlashcardViolations()
    .map((v) => `flashcard:${v.lessonId}`);

  const translation: string[] = [];
  const lessons = db
    .prepare('SELECT id, title, title_de, explanation, explanation_de, examples, examples_de FROM lessons ORDER BY id')
    .all() as { id: string; title: string; title_de: string; explanation: string | null; explanation_de: string | null; examples: string | null; examples_de: string | null }[];
  for (const l of lessons) {
    const problems = lessonTextProblems({
      title: l.title,
      titleDe: l.title_de,
      explanation: l.explanation,
      explanationDe: l.explanation_de,
      examples: parseList(l.examples),
      examplesDe: parseList(l.examples_de),
    });
    if (problems.length > 0) translation.push(`lesson:${l.id}`);
  }
  const milestones = db.prepare('SELECT id, title, title_de, description, description_de FROM milestones ORDER BY id').all() as {
    id: string;
    title: string;
    title_de: string;
    description: string | null;
    description_de: string | null;
  }[];
  for (const m of milestones) {
    const problems = milestoneTextProblems({ title: m.title, titleDe: m.title_de, description: m.description, descriptionDe: m.description_de });
    if (problems.length > 0) translation.push(`milestone:${m.id}`);
  }
  for (const e of db.prepare('SELECT id, type, content FROM exercises ORDER BY id').all() as { id: string; type: string; content: string }[]) {
    let content: unknown;
    try {
      content = JSON.parse(e.content);
    } catch {
      continue;
    }
    if (instructionProblems(e.type, content).length > 0) translation.push(`exercise:${e.id}`);
  }
  return { flashcard, translation };
}

// At most once per 24 h (the last run is stored, so a restart doesn't repeat it).
export async function runContentCheck(db: Database.Database, deps: ContentCheckDeps = {}): Promise<ContentCheckResult> {
  const now = (deps.now ?? (() => new Date()))();
  const previous = readState(db);
  if (previous && now.getTime() - Date.parse(previous.checkedAt) < CONTENT_CHECK_INTERVAL_MS) {
    return { ran: false, flashcardViolations: 0, missingTranslations: 0, newIssues: 0 };
  }

  const { flashcard, translation } = contentIssues(db);
  const issues = [...flashcard, ...translation];
  const known = new Set(previous?.issues ?? []);
  const fresh = issues.filter((i) => !known.has(i));
  setSetting(db, STATE_KEY, JSON.stringify({ checkedAt: now.toISOString(), issues } satisfies CheckState));

  if (fresh.length > 0) {
    const parts: string[] = [];
    if (flashcard.length > 0) parts.push(`${flashcard.length} lesson(s) break the flashcard rule (flashcards outside vocabulary lessons)`);
    if (translation.length > 0) parts.push(`${translation.length} item(s) are missing a translation (lesson, milestone or exercise instruction)`);
    const notify = deps.notify ?? createNotificationService(db);
    await notify.info('content_issues', 'Content issues', `${parts.join('. ')}. ${fresh.length} of them are new since the last check.`);
  }
  return { ran: true, flashcardViolations: flashcard.length, missingTranslations: translation.length, newIssues: fresh.length };
}
