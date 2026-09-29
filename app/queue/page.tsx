import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { QueuePage } from '@/components/tutoring/QueuePage';

export const dynamic = 'force-dynamic';

export default function Queue() {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect('/onboarding');
  }
  return <QueuePage />;
}
