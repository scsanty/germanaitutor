import type Database from 'better-sqlite3';
import type { Track } from '../types';
import { computeRepairPreview, applyRepairAndDelete, type RepairPreview } from '../curriculum-admin/dependencyRepair';
import { createConceptLinkService } from './conceptLinkService';

export interface LinkedLessonSummary {
  id: string;
  title: string;
  track: Track;
}

export interface DeletePreview {
  lessonId: string;
  repair: RepairPreview;
  linkedLessons: LinkedLessonSummary[];
}

export function createLessonDeleteService(db: Database.Database) {
  const conceptLinks = createConceptLinkService(db);

  function getDeletePreview(lessonId: string): DeletePreview {
    const lesson = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get(lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);

    const repair = computeRepairPreview(db, lessonId);

    const links = conceptLinks.getLinksForLesson(lessonId);
    const linkedLessons: LinkedLessonSummary[] = links.map((link) => {
      const otherId = link.lessonAId === lessonId ? link.lessonBId : link.lessonAId;
      const row = db.prepare('SELECT title, track FROM lessons WHERE id = ?').get(otherId) as {
        title: string;
        track: Track;
      };
      return { id: otherId, title: row.title, track: row.track };
    });

    return { lessonId, repair, linkedLessons };
  }

  function batchDelete(lessonIds: string[]): void {
    const run = db.transaction(() => {
      for (const lessonId of lessonIds) {
        const exists = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get(lessonId);
        if (!exists) throw new Error(`Lesson not found: ${lessonId}`);
      }
      for (const lessonId of lessonIds) {
        applyRepairAndDelete(db, lessonId);
      }
    });
    run();
  }

  return { getDeletePreview, batchDelete };
}

export type LessonDeleteService = ReturnType<typeof createLessonDeleteService>;
