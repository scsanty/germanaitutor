import type { Skill } from '../curriculum/types';

export interface DashboardView {
  continueLesson: { id: string; title: string } | null;
  reviewsDue: number;
  skills: { skill: Skill; done: number; total: number }[];
  // ACTIVITY_DAYS local dates, oldest first; count = lesson answers + review answers that day
  activity: { date: string; count: number }[];
}
