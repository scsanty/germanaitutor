import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { LessonPage } from '@/components/tutoring/LessonPage';

export const dynamic = 'force-dynamic';

export default async function Lesson(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect('/onboarding');
  }
  return <LessonPage lessonId={params.id} />;
}
