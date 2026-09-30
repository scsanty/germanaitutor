import type { CefrLevel, Track } from '../types';
import type { Skill } from '../curriculum/types';
import type { LessonStatus } from './completion';
import type { ExerciseView } from './exerciseView';
import type { MilestoneState } from './gating';
import type { TestOutStatus } from './testOutViews';

export interface TreeLesson {
  id: string;
  title: string;
  skill: Skill;
  status: LessonStatus;
  coveredVia: Track | null;
  locked: boolean;
  // prerequisites that sit in a lower-rank milestone: shown as "builds on" chips
  earlierPrerequisites: { id: string; title: string; done: boolean }[];
  branch: number;
  column: number;
  row: number;
}

export interface TreeMilestone {
  id: string;
  title: string;
  description: string | null;
  rank: number;
  state: MilestoneState;
  lessons: TreeLesson[];
  // prerequisite → dependent, inside this milestone
  edges: { from: string; to: string }[];
  testOut: TestOutStatus;
}

export interface CurriculumTree {
  track: Track;
  level: CefrLevel;
  milestones: TreeMilestone[];
}

export type LessonView =
  | { locked: 'level'; id: string; title: string; level: CefrLevel; unlocksAfter: CefrLevel }
  | {
      locked: 'lesson';
      id: string;
      title: string;
      level: CefrLevel;
      reason: 'milestone' | 'prerequisites';
      milestone: { id: string; title: string };
      missingPrerequisites: { id: string; title: string }[];
    }
  | {
      locked: false;
      id: string;
      title: string;
      track: Track;
      level: CefrLevel;
      skill: Skill;
      explanation: string | null;
      examples: string[] | null;
      exercises: ExerciseView[];
      passedExerciseIds: string[];
      completed: boolean;
      prerequisites: { id: string; title: string; done: boolean }[];
    };

export interface QueueItem {
  lessonId: string;
  lessonTitle: string;
  exercise: ExerciseView;
}

export interface DailyQueue {
  track: Track;
  level: CefrLevel;
  cap: number;
  answeredToday: number;
  items: QueueItem[];
  suggestedLesson: { id: string; title: string } | null;
}
