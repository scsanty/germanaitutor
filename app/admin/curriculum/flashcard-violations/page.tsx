import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumAuditService } from '@/lib/services/curriculumAuditService';

export const dynamic = 'force-dynamic';

export default function FlashcardViolationsPage() {
  if (!isAdminSessionValid()) redirect('/admin/login');
  const violations = createCurriculumAuditService(getDb()).listFlashcardViolations();
  return (
    <div>
      <a href="/admin/curriculum">Back to curriculum</a>
      <h1>Flashcards outside vocabulary lessons</h1>
      <p>
        Flashcards are only allowed in vocabulary lessons. Each lesson below must have its flashcards removed or changed
        to another exercise type before it can be saved again.
      </p>
      {violations.length === 0 ? (
        <p>None — every flashcard is in a vocabulary lesson.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Lesson</th>
              <th>Track</th>
              <th>Level</th>
              <th>Skill</th>
              <th>Flashcards</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => (
              <tr key={v.lessonId}>
                <td>
                  <a href={`/admin/curriculum/lesson/${v.lessonId}/edit?track=${v.track}`}>{v.title}</a>
                </td>
                <td>{v.track}</td>
                <td>{v.level}</td>
                <td>{v.skill}</td>
                <td>{v.flashcardCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
