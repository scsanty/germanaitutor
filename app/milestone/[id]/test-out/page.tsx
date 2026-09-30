import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { TestOutPage } from '@/components/tutoring/TestOutPage';

export const dynamic = 'force-dynamic';

export default async function MilestoneTestOut(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!createProfileService(getDb()).getProfile().onboardingComplete) redirect('/onboarding');
  return <TestOutPage milestoneId={params.id} />;
}
