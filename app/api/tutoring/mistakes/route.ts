import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createErrorLogService } from '@/lib/services/errorLogService';
import { createProfileService } from '@/lib/services/profileService';
import { createContentText } from '@/lib/services/contentText';
import type { LocalizedText } from '@/lib/i18n/localizedText';

export const dynamic = 'force-dynamic';

export interface TopMistakeItem {
  categoryId: string;
  label: LocalizedText;
  count: number;
  example: { wrong: string; right: string };
  lesson: { id: string; title: string } | null;
  // Set only when no lesson matches the active level: a grammar-drill topic for the Freestyle link.
  drillTopic: string | null;
}

// Top 5 error-log categories of the last 30 days, each with a matching grammar lesson in the active track and level.
export async function GET() {
  const db = getDb();
  const { activeTrack, activeLevel, uiLanguage } = createProfileService(db).getProfile();
  const log = createErrorLogService(db);
  const text = createContentText(db);
  const items: TopMistakeItem[] = log.topMistakes(5).map((m) => {
    const lesson = log.lessonFor(m.category.id, activeTrack, activeLevel);
    // A grammar lesson title from anywhere (the drill lists lesson titles), else the German label as a free topic.
    const drillTopic = lesson ? null : (() => {
      const any = log.anyLessonFor(m.category.id);
      return any ? text.lessonTitle(any.id, uiLanguage) : m.category.label.de;
    })();
    return {
      categoryId: m.category.id,
      label: m.category.label,
      count: m.count,
      example: m.example,
      drillTopic,
      lesson: lesson ? { id: lesson.id, title: text.lessonTitle(lesson.id, uiLanguage) } : null,
    };
  });
  return NextResponse.json({ items });
}
