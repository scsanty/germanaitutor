import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { PlacementPage } from '@/components/placement/PlacementPage';

export const dynamic = 'force-dynamic';

export default function Placement() {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect('/onboarding');
  }
  return <PlacementPage />;
}
