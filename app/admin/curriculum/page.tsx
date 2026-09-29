import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';

export const dynamic = 'force-dynamic';

export default async function AdminCurriculumPage() {
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  const tracks = createCurriculumService(getDb()).listTracks();
  return (
    <div>
      <h1>Curriculum</h1>
      <p>
        <a href="/admin/curriculum/flashcard-violations">Flashcards outside vocabulary lessons</a>
        {' · '}
        <a href="/admin/placement-exam">Placement exam</a>
        {' · '}
        <a href="/api/admin/curriculum/export">Download all as seed files (zip)</a>
      </p>
      <ul>
        {tracks.map(({ track, levels }) => (
          <li key={track}>
            {track}:{' '}
            {levels.map((level) => (
              <span key={level}>
                <a href={`/admin/curriculum/${track}/${level}`}>{level}</a>{' '}
                <a href={`/api/admin/curriculum/export/${track}/${level}`}>(export)</a>{' '}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
