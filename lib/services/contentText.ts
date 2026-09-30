import type Database from 'better-sqlite3';
import { localized, pickText, type ContentLanguage } from '../i18n/localizedText';

// Resolves stored English/German titles to one language, for views without a toggle.
export function createContentText(db: Database.Database) {
  const lessonRow = db.prepare('SELECT title, title_de FROM lessons WHERE id = ?');
  const milestoneRow = db.prepare('SELECT title, title_de, description, description_de FROM milestones WHERE id = ?');
  return {
    lessonTitle(id: string, language: ContentLanguage): string {
      const row = lessonRow.get(id) as { title: string; title_de: string } | undefined;
      return row ? pickText(localized(row.title, row.title_de), language) : id;
    },
    milestoneTitle(id: string, language: ContentLanguage): string {
      const row = milestoneRow.get(id) as { title: string; title_de: string } | undefined;
      return row ? pickText(localized(row.title, row.title_de), language) : id;
    },
    milestoneDescription(id: string, language: ContentLanguage): string | null {
      const row = milestoneRow.get(id) as { description: string | null; description_de: string | null } | undefined;
      return row?.description ? pickText(localized(row.description, row.description_de), language) : null;
    },
  };
}
