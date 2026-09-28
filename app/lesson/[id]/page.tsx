import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { LessonPage } from '@/components/tutoring/LessonPage';

export const dynamic = 'force-dynamic';

export default function Lesson({ params }: { params: { id: string } }) {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect('/onboarding');
  }
  return <LessonPage lessonId={params.id} />;
}
