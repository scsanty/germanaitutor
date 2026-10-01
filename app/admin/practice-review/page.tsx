import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { PracticePoolList } from '@/components/admin/PracticePoolList';
import { PAGE_TITLE } from '@/components/admin/adminStyles';

export const dynamic = 'force-dynamic';

export default async function PracticeReviewPage() {
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  return (
    <div>
      <h1 className={PAGE_TITLE}>Practice exercises to review</h1>
      <PracticePoolList status="unreviewed" showFilters />
    </div>
  );
}
