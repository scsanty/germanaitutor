import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { createProfileService } from "@/lib/services/profileService";
import { FreestyleHub } from "@/components/freestyle/FreestyleHub";

export const dynamic = "force-dynamic";

export default function Freestyle() {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect("/onboarding");
  }
  return <FreestyleHub />;
}
