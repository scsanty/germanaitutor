import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { SystemSettingsAdmin } from '@/components/admin/SystemSettingsAdmin';
import { PAGE_TITLE } from '@/components/admin/adminStyles';

export const dynamic = 'force-dynamic';

export default async function SystemSettingsAdminPage() {
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  return (
    <div>
      <h1 className={PAGE_TITLE}>Settings</h1>
      <SystemSettingsAdmin />
    </div>
  );
}
