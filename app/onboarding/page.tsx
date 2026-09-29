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
  // 'failing' means the connection was validated and later hit a runtime error
  // (aiService.recordFailure); resuming here is still correct, unlike 'invalid'
  // or 'untested', which mean it never worked.
  const resumeAtPlacement =
    profile.onboardingChoicesSaved &&
    (active?.lastValidatedStatus === 'valid' || active?.lastValidatedStatus === 'failing');
  return <OnboardingWizard initialStep={resumeAtPlacement ? 'placement' : 'welcome'} />;
}
