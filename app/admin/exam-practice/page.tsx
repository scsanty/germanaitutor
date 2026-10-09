import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { listFormats } from '@/lib/exam/formats';
import { isSetTaskType } from '@/lib/tasks/taskTypes';
import { ExamPracticeAdmin, type ExamPracticeFormatOption } from '@/components/admin/ExamPracticeAdmin';
import { PAGE_TITLE } from '@/components/admin/adminStyles';

export const dynamic = 'force-dynamic';

// Only parts whose task type has Teil sets (passage, matching, cloze) are listed.
function formatOptions(): ExamPracticeFormatOption[] {
  return listFormats()
    .map((f) => ({
      id: f.id,
      name: f.name,
      parts: f.parts
        .filter((p) => isSetTaskType(p.taskType))
        .map((p) => ({ id: p.id, title: `${p.title.de} (${p.title.en})`, taskType: p.taskType, items: p.items })),
    }))
    .filter((f) => f.parts.length > 0);
}

export default async function ExamPracticeAdminPage() {
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  return (
    <div>
      <h1 className={PAGE_TITLE}>Exam practice sets</h1>
      <ExamPracticeAdmin formats={formatOptions()} />
    </div>
  );
}
