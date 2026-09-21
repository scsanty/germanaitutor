import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';

export const dynamic = 'force-dynamic';

export default function AdminCurriculumPage() {
  if (!isAdminSessionValid()) redirect('/admin/login');
  const tracks = createCurriculumService(getDb()).listTracks();
  return (
    <div>
      <h1>Curriculum</h1>
      <ul>
        {tracks.map(({ track, levels }) => (
          <li key={track}>
            {track}:{' '}
            {levels.map((level) => (
              <a key={level} href={`/admin/curriculum/${track}/${level}`}>
                {level}{' '}
              </a>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
