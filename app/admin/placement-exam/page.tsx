import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { PlacementExamAdmin } from '@/components/admin/PlacementExamAdmin';

export const dynamic = 'force-dynamic';

export default function PlacementExamAdminPage() {
  if (!isAdminSessionValid()) redirect('/admin/login');
  return <PlacementExamAdmin questionCount={createPlacementService(getDb()).questionCount()} />;
}
