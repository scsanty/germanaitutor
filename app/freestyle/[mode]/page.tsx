import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { createProfileService } from "@/lib/services/profileService";
import { isFreestyleMode, isModeEnabled } from "@/lib/freestyle/modes";
import { FreestyleSession } from "@/components/freestyle/FreestyleSession";

export const dynamic = "force-dynamic";

// S14: the mode screen. Unknown or hidden modes are a 404.
export default async function FreestyleModePage(props: {
  params: Promise<{ mode: string }>;
}) {
  const { mode } = await props.params;
  if (!isFreestyleMode(mode) || !isModeEnabled(mode)) notFound();
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect("/onboarding");
  }
  return <FreestyleSession mode={mode} />;
}
