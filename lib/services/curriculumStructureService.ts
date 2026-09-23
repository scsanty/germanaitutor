import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Milestone, Section } from '../curriculum/types';
import { ensureUnsortedExists, unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';
import { randomSuffix } from '../curriculum-admin/randomId';

export interface DisplacedLesson {
  id: string;
  title: string;
}

export interface MilestoneDeletePreview {
  sections: { id: string; title: string; lessons: DisplacedLesson[] }[];
}

export interface SectionDeletePreview {
  lessons: DisplacedLesson[];
}

interface MilestoneRow {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  order_index: number;
}

interface SectionRow {
  id: string;
  milestone_id: string;
  title: string;
  description: string | null;
  order_index: number;
}

function rowToMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    track: row.track,
    level: row.level,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
  };
}

function rowToSection(row: SectionRow): Section {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
  };
}

function lessonsInSection(db: Database.Database, sectionId: string): DisplacedLesson[] {
  return db
    .prepare(
      `SELECT l.id, l.title FROM lesson_placements lp JOIN lessons l ON l.id = lp.lesson_id WHERE lp.section_id = ?`
    )
    .all(sectionId) as DisplacedLesson[];
}

function relocateSectionLessonsToUnsorted(db: Database.Database, sectionId: string, unsortedSectionId: string): void {
  const lessonIds = (
    db.prepare('SELECT lesson_id FROM lesson_placements WHERE section_id = ?').all(sectionId) as {
      lesson_id: string;
    }[]
  ).map((r) => r.lesson_id);
  for (const lessonId of lessonIds) {
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM lesson_placements WHERE section_id = ?')
      .get(unsortedSectionId) as { m: number };
    db.prepare('UPDATE lesson_placements SET section_id = ?, order_index = ? WHERE lesson_id = ?').run(
      unsortedSectionId,
      maxOrder.m + 1,
      lessonId
    );
  }
}

export function createCurriculumStructureService(db: Database.Database) {
  function createMilestone(track: Track, level: CefrLevel, title: string, description: string | null): Milestone {
    const id = `${track}-${level.toLowerCase()}-${randomSuffix()}`;
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM milestones WHERE track = ? AND level = ?')
      .get(track, level) as { m: number };
    db.prepare(
      'INSERT INTO milestones (id, track, level, title, description, order_index) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, track, level, title, description, maxOrder.m + 1);
    return rowToMilestone(db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as MilestoneRow);
  }

  function renameMilestone(id: string, title: string, description: string | null): Milestone {
    const existing = db.prepare('SELECT 1 FROM milestones WHERE id = ?').get(id);
    if (!existing) throw new Error(`Milestone not found: ${id}`);
    db.prepare('UPDATE milestones SET title = ?, description = ? WHERE id = ?').run(title, description, id);
    return rowToMilestone(db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as MilestoneRow);
  }

  function previewMilestoneDelete(id: string): MilestoneDeletePreview {
    const sections = db.prepare('SELECT id, title FROM sections WHERE milestone_id = ?').all(id) as {
      id: string;
      title: string;
    }[];
    return { sections: sections.map((s) => ({ id: s.id, title: s.title, lessons: lessonsInSection(db, s.id) })) };
  }

  function deleteMilestone(id: string): void {
    const milestone = db.prepare('SELECT track, level FROM milestones WHERE id = ?').get(id) as
      | { track: Track; level: CefrLevel }
      | undefined;
    if (!milestone) throw new Error(`Milestone not found: ${id}`);
    if (id === unsortedMilestoneId(milestone.track, milestone.level)) {
      throw new Error('Cannot delete the Unsorted milestone');
    }

    const run = db.transaction(() => {
      const { sectionId: unsortedSectionId } = ensureUnsortedExists(db, milestone.track, milestone.level);
      const sectionIds = (db.prepare('SELECT id FROM sections WHERE milestone_id = ?').all(id) as { id: string }[]).map(
        (r) => r.id
      );
      for (const sectionId of sectionIds) {
        relocateSectionLessonsToUnsorted(db, sectionId, unsortedSectionId);
      }
      db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
    });
    run();
  }

  function reorderMilestones(track: Track, level: CefrLevel, orderedIds: string[]): void {
    const unsortedId = unsortedMilestoneId(track, level);
    if (orderedIds.includes(unsortedId)) {
      throw new Error('Cannot include Unsorted in a reorder');
    }
    const real = (
      db.prepare('SELECT id FROM milestones WHERE track = ? AND level = ? AND id != ?').all(track, level, unsortedId) as {
        id: string;
      }[]
    ).map((r) => r.id);
    const givenSet = new Set(orderedIds);
    const matches = real.length === orderedIds.length && real.every((id) => givenSet.has(id));
    if (!matches) {
      throw new Error('Reorder payload must include exactly the current set of milestones for this track+level');
    }

    const run = db.transaction(() => {
      orderedIds.forEach((id, index) => {
        db.prepare('UPDATE milestones SET order_index = ? WHERE id = ?').run(index, id);
      });
    });
    run();
  }

  function createSection(milestoneId: string, title: string, description: string | null): Section {
    const milestone = db.prepare('SELECT track, level FROM milestones WHERE id = ?').get(milestoneId) as
      | { track: Track; level: CefrLevel }
      | undefined;
    if (!milestone) throw new Error(`Milestone not found: ${milestoneId}`);
    if (milestoneId === unsortedMilestoneId(milestone.track, milestone.level)) {
      throw new Error('Cannot create a section under the Unsorted milestone');
    }
    const id = `${milestoneId}-${randomSuffix()}`;
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM sections WHERE milestone_id = ?')
      .get(milestoneId) as { m: number };
    db.prepare(
      'INSERT INTO sections (id, milestone_id, title, description, order_index) VALUES (?, ?, ?, ?, ?)'
    ).run(id, milestoneId, title, description, maxOrder.m + 1);
    return rowToSection(db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as SectionRow);
  }

  function renameSection(id: string, title: string, description: string | null): Section {
    const existing = db.prepare('SELECT 1 FROM sections WHERE id = ?').get(id);
    if (!existing) throw new Error(`Section not found: ${id}`);
    db.prepare('UPDATE sections SET title = ?, description = ? WHERE id = ?').run(title, description, id);
    return rowToSection(db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as SectionRow);
  }

  function previewSectionDelete(id: string): SectionDeletePreview {
    return { lessons: lessonsInSection(db, id) };
  }

  function deleteSection(id: string): void {
    const section = db.prepare('SELECT milestone_id FROM sections WHERE id = ?').get(id) as
      | { milestone_id: string }
      | undefined;
    if (!section) throw new Error(`Section not found: ${id}`);
    const milestone = db.prepare('SELECT track, level FROM milestones WHERE id = ?').get(section.milestone_id) as {
      track: Track;
      level: CefrLevel;
    };

    const run = db.transaction(() => {
      const { sectionId: unsortedSectionId } = ensureUnsortedExists(db, milestone.track, milestone.level);
      if (id === unsortedSectionId) throw new Error('Cannot delete the Unsorted section');
      relocateSectionLessonsToUnsorted(db, id, unsortedSectionId);
      db.prepare('DELETE FROM sections WHERE id = ?').run(id);
    });
    run();
  }

  function reorderSections(milestoneId: string, orderedIds: string[]): void {
    const milestone = db.prepare('SELECT track, level FROM milestones WHERE id = ?').get(milestoneId) as {
      track: Track;
      level: CefrLevel;
    };
    if (milestoneId === unsortedMilestoneId(milestone.track, milestone.level)) {
      throw new Error('Cannot reorder sections within the Unsorted milestone');
    }
    const real = (db.prepare('SELECT id FROM sections WHERE milestone_id = ?').all(milestoneId) as { id: string }[]).map(
      (r) => r.id
    );
    const givenSet = new Set(orderedIds);
    const matches = real.length === orderedIds.length && real.every((id) => givenSet.has(id));
    if (!matches) {
      throw new Error('Reorder payload must include exactly the current set of sections for this milestone');
    }

    const run = db.transaction(() => {
      orderedIds.forEach((id, index) => {
        db.prepare('UPDATE sections SET order_index = ? WHERE id = ?').run(index, id);
      });
    });
    run();
  }

  return {
    createMilestone,
    renameMilestone,
    previewMilestoneDelete,
    deleteMilestone,
    reorderMilestones,
    createSection,
    renameSection,
    previewSectionDelete,
    deleteSection,
    reorderSections,
  };
}

export type CurriculumStructureService = ReturnType<typeof createCurriculumStructureService>;
