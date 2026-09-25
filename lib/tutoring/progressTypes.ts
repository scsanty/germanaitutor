import type { CefrLevel, Track } from '../types';
import type { Skill } from '../curriculum/types';
import type { LessonStatus } from './completion';
import type { ExerciseView } from './exerciseView';

export interface TreeLesson {
  id: string;
  title: string;
  skill: Skill;
  status: LessonStatus;
  coveredVia: Track | null;
  missingPrerequisites: { id: string; title: string }[];
}

export interface TreeSection {
  id: string;
  title: string;
  lessons: TreeLesson[];
}

export interface TreeMilestone {
  id: string;
  title: string;
  sections: TreeSection[];
}

export interface CurriculumTree {
  track: Track;
  level: CefrLevel;
  milestones: TreeMilestone[];
}

export type LessonView =
  | { locked: true; id: string; title: string; level: CefrLevel; unlocksAfter: CefrLevel }
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
