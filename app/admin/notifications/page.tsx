import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { NotificationsAdmin } from '@/components/admin/NotificationsAdmin';
import { PAGE_TITLE } from '@/components/admin/adminStyles';

export const dynamic = 'force-dynamic';

export default async function NotificationsAdminPage() {
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  return (
    <div>
      <h1 className={PAGE_TITLE}>Notifications</h1>
      <NotificationsAdmin />
    </div>
  );
}
