import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { LessonDetail } from '@/components/admin/CurriculumBrowser';

export default function AdminLessonPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { track?: string };
}) {
  if (!isAdminSessionValid()) redirect('/admin/login');
  return <LessonDetail lessonId={params.id} track={searchParams.track ?? 'generic'} />;
}
