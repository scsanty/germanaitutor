import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { TrackLevelStructure } from '@/components/admin/TrackLevelStructure';
import type { Track, CefrLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminTrackLevelPage(props: { params: Promise<{ track: string; level: string }> }) {
  const params = await props.params;
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  return <TrackLevelStructure track={params.track as Track} level={params.level as CefrLevel} />;
}
