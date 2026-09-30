import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { DashboardPage } from '@/components/dashboard/DashboardPage';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) redirect('/onboarding');
  return <DashboardPage />;
}
