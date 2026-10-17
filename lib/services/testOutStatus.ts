import type Database from 'better-sqlite3';
import type { ExerciseType } from '../curriculum/types';
import { cooldownEndsAt, drawTestOut, isTestOutEligibleType, TESTOUT_MIN_QUESTIONS, type TestOutCandidate } from '../tutoring/testOut';
import type { TestOutStatus } from '../tutoring/testOutViews';
import type { LevelGating } from './levelGating';
import { hasAudio } from '../audio/audioStore';
import { audioHashOf } from '../audio/audioAvailability';

// I15: a listening exercise is drawn only when its audio file is cached (not merely renderable).
function audioReady(type: ExerciseType, content: string, cached: (hash: string) => boolean): boolean {
  if (type !== 'audio_questions') return true;
  let hash: string | null = null;
  try {
    hash = audioHashOf(type, JSON.parse(content));
  } catch {
    return false;
  }
  return hash !== null && cached(hash);
}

// The milestone's not-done lessons with their eligible exercises, in authored order.
export function eligibleCandidates(
  db: Database.Database,
  gating: LevelGating,
  milestoneId: string,
  aiAvailable: boolean,
  cached: (hash: string) => boolean = hasAudio
): TestOutCandidate[] {
  const milestone = gating.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return [];
  const exercisesOf = db.prepare('SELECT id, type, content FROM exercises WHERE lesson_id = ? ORDER BY rowid');
  return milestone.lessonIds
    .filter((lessonId) => !gating.isDone(lessonId))
    .map((lessonId) => ({
      lessonId,
      exerciseIds: (exercisesOf.all(lessonId) as { id: string; type: ExerciseType; content: string }[])
        .filter((e) => isTestOutEligibleType(e.type, aiAvailable) && audioReady(e.type, e.content, cached))
        .map((e) => e.id),
    }));
}

// Spec: Test-out, Availability. Only a locked milestone at the next locked rank is offered.
export function testOutStatusFor(
  db: Database.Database,
  gating: LevelGating,
  milestoneId: string,
  opts: { now: Date; aiAvailable: boolean; audioCached?: (hash: string) => boolean }
): TestOutStatus {
  const milestone = gating.milestones.find((m) => m.id === milestoneId);
  if (!milestone || gating.states.get(milestoneId) !== 'locked' || milestone.rank !== gating.nextLockedRank) {
    return { status: 'none' };
  }
  const open = db
    .prepare("SELECT exercise_ids, answers FROM milestone_testouts WHERE milestone_id = ? AND status = 'in_progress'")
    .get(milestoneId) as { exercise_ids: string; answers: string } | undefined;
  if (open) {
    return { status: 'in_progress', answered: JSON.parse(open.answers).length, total: JSON.parse(open.exercise_ids).length };
  }
  const lastFail = db
    .prepare("SELECT finished_at FROM milestone_testouts WHERE milestone_id = ? AND status = 'failed' ORDER BY finished_at DESC LIMIT 1")
    .get(milestoneId) as { finished_at: string } | undefined;
  if (lastFail) {
    const retryAt = cooldownEndsAt(lastFail.finished_at);
    if (retryAt > opts.now.toISOString()) return { status: 'cooldown', retryAt };
  }
  // The draw's size doesn't depend on the random order.
  const size = drawTestOut(eligibleCandidates(db, gating, milestoneId, opts.aiAvailable, opts.audioCached), () => 0).length;
  return size < TESTOUT_MIN_QUESTIONS ? { status: 'too_few_questions' } : { status: 'available' };
}
