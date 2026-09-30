import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { PracticePoolList } from '@/components/admin/PracticePoolList';

export const dynamic = 'force-dynamic';

export default async function PracticeReviewPage() {
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  return (
    <div>
      <p>
        <a href="/admin/curriculum">Back to the curriculum</a>
      </p>
      <h1>Practice exercises to review</h1>
      <PracticePoolList status="unreviewed" showFilters />
    </div>
  );
}
