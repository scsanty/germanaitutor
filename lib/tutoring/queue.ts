export interface DueCandidate {
  exerciseId: string;
  nextDueAt: string;
}

// Most overdue first; Array.prototype.sort is stable, so ties keep the caller's order.
export function selectDueItems<T extends DueCandidate>(candidates: T[], today: string, remaining: number): T[] {
  if (remaining <= 0) return [];
  return candidates
    .filter((c) => c.nextDueAt <= today)
    .sort((a, b) => (a.nextDueAt < b.nextDueAt ? -1 : a.nextDueAt > b.nextDueAt ? 1 : 0))
    .slice(0, remaining);
}

export function remainingReviews(cap: number, answeredInQueueToday: number): number {
  return Math.max(0, cap - answeredInQueueToday);
}

export interface SuggestionCandidate {
  id: string;
  done: boolean;
  prerequisiteIds: string[];
}

// Spec: the first incomplete lesson in tree order whose prerequisites are all done, or the
// first incomplete lesson if none qualify.
export function suggestNextLesson(
  lessonsInTreeOrder: SuggestionCandidate[],
  doneIds: ReadonlySet<string>
): string | null {
  const incomplete = lessonsInTreeOrder.filter((lesson) => !lesson.done);
  const ready = incomplete.find((lesson) => lesson.prerequisiteIds.every((id) => doneIds.has(id)));
  return (ready ?? incomplete[0])?.id ?? null;
}
