import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { createProfileService } from "@/lib/services/profileService";
import { DeckPage } from "@/components/deck/DeckPage";

export const dynamic = "force-dynamic";

export default function Flashcards() {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect("/onboarding");
  }
  return <DeckPage />;
}
