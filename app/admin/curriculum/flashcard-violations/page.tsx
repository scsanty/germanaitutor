import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumAuditService } from '@/lib/services/curriculumAuditService';
import { HINT, LINK, PAGE_TITLE, TABLE, TABLE_WRAP, TD, TH } from '@/components/admin/adminStyles';

export const dynamic = 'force-dynamic';

export default async function FlashcardViolationsPage() {
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  const violations = createCurriculumAuditService(getDb()).listFlashcardViolations();
  return (
    <div>
      <h1 className={PAGE_TITLE}>Flashcards outside vocabulary lessons</h1>
      <p className={`${HINT} mb-4 max-w-prose`}>
        Flashcards are only allowed in vocabulary lessons. Each lesson below must have its flashcards removed or changed
        to another exercise type before it can be saved again.
      </p>
      {violations.length === 0 ? (
        <p className="rounded-lg border bg-card p-4">None — every flashcard is in a vocabulary lesson.</p>
      ) : (
        <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th scope="col" className={TH}>Lesson</th>
              <th scope="col" className={TH}>Track</th>
              <th scope="col" className={TH}>Level</th>
              <th scope="col" className={TH}>Skill</th>
              <th scope="col" className={TH}>Flashcards</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => (
              <tr key={v.lessonId}>
                <td className={TD}>
                  <a href={`/admin/curriculum/lesson/${v.lessonId}/edit?track=${v.track}`} className={LINK}>{v.title}</a>
                </td>
                <td className={TD}>{v.track}</td>
                <td className={TD}>{v.level}</td>
                <td className={TD}>{v.skill}</td>
                <td className={TD}>{v.flashcardCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
