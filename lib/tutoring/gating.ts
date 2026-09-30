// Spec: Rules. Pure gating for one track+level: milestones are hard-gated by difficulty rank,
// and inside an open milestone a lesson waits for its prerequisites.

export type MilestoneState = 'locked' | 'open' | 'complete';

export interface RankedMilestone {
  id: string;
  rank: number;
  lessonIds: string[];
}

function isComplete(milestone: RankedMilestone, isDone: (lessonId: string) => boolean): boolean {
  return milestone.lessonIds.every(isDone);
}

// The lowest rank that still has an incomplete milestone; null when every milestone is complete.
export function openRank(milestones: RankedMilestone[], isDone: (lessonId: string) => boolean): number | null {
  const incomplete = milestones.filter((m) => !isComplete(m, isDone)).map((m) => m.rank);
  return incomplete.length === 0 ? null : Math.min(...incomplete);
}

// The lowest rank above the open rank: the only rank a test-out is offered for.
export function nextLockedRank(milestones: RankedMilestone[], isDone: (lessonId: string) => boolean): number | null {
  const open = openRank(milestones, isDone);
  if (open === null) return null;
  const above = milestones.map((m) => m.rank).filter((rank) => rank > open);
  return above.length === 0 ? null : Math.min(...above);
}

export function milestoneStates(
  milestones: RankedMilestone[],
  isDone: (lessonId: string) => boolean
): Map<string, MilestoneState> {
  const open = openRank(milestones, isDone);
  const states = new Map<string, MilestoneState>();
  for (const milestone of milestones) {
    if (isComplete(milestone, isDone)) states.set(milestone.id, 'complete');
    else states.set(milestone.id, open !== null && milestone.rank <= open ? 'open' : 'locked');
  }
  return states;
}

// A done lesson is never locked (spec: completed lessons stay open after admin edits).
// Prerequisites placed in Unsorted can't be done by a student, so they never lock anything.
export function isLessonLocked(
  input: { lessonId: string; milestoneState: MilestoneState; prerequisiteIds: string[]; unsortedIds: ReadonlySet<string> },
  isDone: (lessonId: string) => boolean
): boolean {
  if (isDone(input.lessonId)) return false;
  if (input.milestoneState === 'locked') return true;
  return input.prerequisiteIds.some((id) => !input.unsortedIds.has(id) && !isDone(id));
}

export interface PlacementInfo {
  milestoneId: string;
  // null for the Unsorted milestone
  rank: number | null;
}

export interface ScopeEdge {
  lessonId: string;
  prerequisiteId: string;
}

// Spec: Prerequisite scope. A prerequisite must sit in the same milestone or a strictly lower
// rank. Parallel milestones of equal rank don't count. Unsorted and unplaced lessons are exempt.
export function prerequisiteScopeViolations(
  edges: ScopeEdge[],
  placementOf: (lessonId: string) => PlacementInfo | undefined
): ScopeEdge[] {
  return edges.filter((edge) => {
    const lesson = placementOf(edge.lessonId);
    const prerequisite = placementOf(edge.prerequisiteId);
    if (!lesson || !prerequisite || lesson.rank === null || prerequisite.rank === null) return false;
    if (lesson.milestoneId === prerequisite.milestoneId) return false;
    return prerequisite.rank >= lesson.rank;
  });
}
