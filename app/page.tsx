import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { ActiveProviderBanner } from '@/components/ActiveProviderBanner';

export default function Home() {
  const profile = createProfileService(getDb()).getProfile();
  if (!profile.onboardingComplete) {
    redirect('/onboarding');
  }
  return (
    <div>
      <ActiveProviderBanner />
      <h1>German AI Tutor</h1>
      <p>Core platform is set up. Lesson content lands in later sub-projects.</p>
    </div>
  );
}
