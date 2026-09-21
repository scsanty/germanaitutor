import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import type { Track, CefrLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function AdminTrackLevelPage({ params }: { params: { track: string; level: string } }) {
  if (!isAdminSessionValid()) redirect('/admin/login');
  const structure = createCurriculumService(getDb()).getTrackStructure(
    params.track as Track,
    params.level as CefrLevel
  );
  return (
    <div>
      <h1>
        {params.track} — {params.level}
      </h1>
      {structure.map(({ milestone, sections }) => (
        <div key={milestone.id}>
          <h2>{milestone.title}</h2>
          {sections.map(({ section, lessons }) => (
            <div key={section.id}>
              <h3>{section.title}</h3>
              <ul>
                {lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <a href={`/admin/curriculum/lesson/${lesson.id}?track=${params.track}`}>{lesson.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
