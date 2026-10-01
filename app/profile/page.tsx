import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { ProfilePage } from '@/components/profile/ProfilePage';

export const dynamic = 'force-dynamic';

export default function Profile() {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) redirect('/onboarding');
  return <ProfilePage />;
}
