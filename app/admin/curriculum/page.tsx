import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import { TRACK_LABEL } from '@/lib/tutoring/levels';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LINK, PAGE_TITLE } from '@/components/admin/adminStyles';

export const dynamic = 'force-dynamic';

export default async function AdminCurriculumPage() {
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  const tracks = createCurriculumService(getDb()).listTracks();
  return (
    <div>
      <h1 className={PAGE_TITLE}>Curriculum</h1>
      <ul className="mb-4 flex flex-wrap gap-x-5">
        <li>
          <a href="/admin/curriculum/flashcard-violations" className={LINK}>Flashcards outside vocabulary lessons</a>
        </li>
        <li>
          <a href="/admin/placement-exam" className={LINK}>Placement exam</a>
        </li>
        <li>
          <a href="/admin/practice-review" className={LINK}>Practice exercises to review</a>
        </li>
        <li>
          <a href="/api/admin/curriculum/export" className={LINK}>
            <Download aria-hidden className="size-4" />
            Download all as seed files (zip)
          </a>
        </li>
      </ul>
      <div className="grid items-start gap-4 md:grid-cols-2">
        {tracks.map(({ track, levels }) => (
          <Card key={track} className="min-w-0 gap-3">
            <CardHeader>
              <h2 className="text-lg leading-tight">{TRACK_LABEL[track]}</h2>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {levels.map((level) => (
                  <li key={level} className="flex items-center justify-between gap-3">
                    <a href={`/admin/curriculum/${track}/${level}`} className={`${LINK} flex-1 font-medium`}>
                      {level}
                    </a>
                    <a href={`/api/admin/curriculum/export/${track}/${level}`} className={`${LINK} text-sm`}>
                      (export)
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
