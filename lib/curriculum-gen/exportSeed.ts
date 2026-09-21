import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';

const TRACKS: Track[] = ['generic', 'telc', 'goethe'];
const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

interface LessonRow {
  id: string;
  source_level: CefrLevel;
  skill: string;
  title: string;
  explanation: string | null;
  examples: string | null;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  track: Track | null;
  type: string;
  content: string;
}

export function exportSeed(db: Database.Database, outDir: string, seedVersion: string): void {
  mkdirSync(outDir, { recursive: true });

  for (const track of TRACKS) {
    for (const level of LEVELS) {
      const milestoneRows = db
        .prepare('SELECT * FROM milestones WHERE track = ? AND level = ? ORDER BY order_index')
        .all(track, level) as { id: string; title: string; description: string | null; order_index: number }[];
      if (milestoneRows.length === 0) continue;

      const lessonIds = new Set<string>();
      const milestones = milestoneRows.map((milestoneRow) => {
        const sectionRows = db
          .prepare('SELECT * FROM sections WHERE milestone_id = ? ORDER BY order_index')
          .all(milestoneRow.id) as { id: string; title: string; description: string | null; order_index: number }[];
        const sections = sectionRows.map((sectionRow) => {
          const placementRows = db
            .prepare('SELECT lesson_id, order_index FROM lesson_placements WHERE section_id = ? ORDER BY order_index')
            .all(sectionRow.id) as { lesson_id: string; order_index: number }[];
          for (const p of placementRows) lessonIds.add(p.lesson_id);
          return {
            section: {
              id: sectionRow.id,
              milestoneId: milestoneRow.id,
              title: sectionRow.title,
              description: sectionRow.description,
              orderIndex: sectionRow.order_index,
            },
            lessonRefs: placementRows.map((p) => ({ lessonId: p.lesson_id, orderIndex: p.order_index })),
          };
        });
        return {
          milestone: {
            id: milestoneRow.id,
            track,
            level,
            title: milestoneRow.title,
            description: milestoneRow.description,
            orderIndex: milestoneRow.order_index,
          },
          sections,
        };
      });

      const lessonIdList = Array.from(lessonIds);

      const lessons = lessonIdList.map((id) => {
        const row = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as LessonRow;
        return {
          id: row.id,
          sourceLevel: row.source_level,
          skill: row.skill,
          title: row.title,
          explanation: row.explanation,
          examples: row.examples ? JSON.parse(row.examples) : null,
        };
      });

      const overrides = lessonIdList.flatMap((id) => {
        const row = db
          .prepare('SELECT explanation, examples FROM lesson_track_overrides WHERE lesson_id = ? AND track = ?')
          .get(id, track) as { explanation: string | null; examples: string | null } | undefined;
        if (!row || row.explanation === null) return [];
        return [
          {
            lessonId: id,
            track,
            explanation: row.explanation,
            examples: row.examples ? JSON.parse(row.examples) : null,
          },
        ];
      });

      const exercises = lessonIdList.flatMap((id) => {
        const rows = db
          .prepare('SELECT * FROM exercises WHERE lesson_id = ? AND (track IS NULL OR track = ?)')
          .all(id, track) as ExerciseRow[];
        return rows.map((row) => ({
          id: row.id,
          lessonId: row.lesson_id,
          track: row.track,
          type: row.type,
          content: JSON.parse(row.content),
        }));
      });

      const prerequisites = lessonIdList.flatMap((id) => {
        const rows = db
          .prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?')
          .all(id) as { lesson_id: string; prerequisite_lesson_id: string }[];
        return rows.map((r) => ({ lessonId: r.lesson_id, prerequisiteLessonId: r.prerequisite_lesson_id }));
      });

      const filePath = join(outDir, `${track}-${level.toLowerCase()}.json`);
      writeFileSync(
        filePath,
        JSON.stringify(
          { seedVersion, track, level, milestones, lessons, overrides, exercises, prerequisites },
          null,
          2
        )
      );
    }
  }
}
