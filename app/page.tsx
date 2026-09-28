import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { ActiveProviderBanner } from '@/components/ActiveProviderBanner';
import { HomeIntro } from '@/components/home/HomeIntro';
import { HomeScreen } from '@/components/home/HomeScreen';

// Reads the DB on every request; without this Next would evaluate it at build
// time and freeze the onboarding gate into the static output.
export const dynamic = 'force-dynamic';

export default function Home() {
  const profile = createProfileService(getDb()).getProfile();
  if (!profile.onboardingComplete) {
    redirect('/onboarding');
  }
  return (
    <div>
      <ActiveProviderBanner />
      <HomeIntro />
      <HomeScreen />
    </div>
  );
}
