export function deckRemaining(cap: number, answeredToday: number): number {
  return Math.max(0, cap - answeredToday);
}

// Most overdue first; stable for equal dates.
export function selectDeckDue<T extends { nextDueAt: string; itemId: number }>(items: T[], today: string, remaining: number): T[] {
  if (remaining <= 0) return [];
  return items
    .filter((i) => i.nextDueAt <= today)
    .sort((a, b) => (a.nextDueAt < b.nextDueAt ? -1 : a.nextDueAt > b.nextDueAt ? 1 : 0))
    .slice(0, remaining);
}
