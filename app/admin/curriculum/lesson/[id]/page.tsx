import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { LessonDetail } from '@/components/admin/CurriculumBrowser';

export const dynamic = 'force-dynamic';

export default async function AdminLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ track?: string }>;
}) {
  const { id } = await params;
  const { track } = await searchParams;
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  return <LessonDetail lessonId={id} track={track ?? 'generic'} />;
}
