import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProfileService } from '@/lib/services/profileService';
import { createProviderService } from '@/lib/services/providerService';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  const db = getDb();
  const profile = createProfileService(db).getProfile();
  const active = createProviderService(db, defaultKeyFilePath()).getActiveConnection();
  const resumeAtPlacement = profile.onboardingChoicesSaved && active?.lastValidatedStatus === 'valid';
  return <OnboardingWizard initialStep={resumeAtPlacement ? 'placement' : 'welcome'} />;
}
