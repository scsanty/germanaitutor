// Spec: Admin, validation on save; Seed Format v3. English is the authored text; German is required alongside it.

export interface LessonTexts {
  title: string;
  titleDe: string;
  explanation: string | null;
  explanationDe: string | null;
  examples: string[] | null;
  examplesDe: string[] | null;
}

export interface MilestoneTexts {
  title: string;
  titleDe: string;
  description: string | null;
  descriptionDe: string | null;
}

const filled = (value: string | null | undefined) => !!value && value.trim().length > 0;

export function lessonTextProblems(t: LessonTexts): string[] {
  const problems: string[] = [];
  if (!filled(t.titleDe)) problems.push('German title is required');
  if (filled(t.explanation) !== filled(t.explanationDe)) problems.push('The explanation needs both English and German');
  const en = t.examples ?? [];
  const de = t.examplesDe ?? [];
  if (en.length !== de.length || en.some((example, i) => !filled(example) || !filled(de[i]))) {
    problems.push('Every example needs both English and German');
  }
  return problems;
}

export function milestoneTextProblems(t: MilestoneTexts): string[] {
  const problems: string[] = [];
  if (!filled(t.titleDe)) problems.push('German title is required');
  if (filled(t.description) !== filled(t.descriptionDe)) problems.push('The description needs both English and German');
  return problems;
}
