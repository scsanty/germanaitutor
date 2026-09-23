import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { TrackLevelStructure } from '@/components/admin/TrackLevelStructure';
import type { Track, CefrLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function AdminTrackLevelPage({ params }: { params: { track: string; level: string } }) {
  if (!isAdminSessionValid()) redirect('/admin/login');
  return <TrackLevelStructure track={params.track as Track} level={params.level as CefrLevel} />;
}
