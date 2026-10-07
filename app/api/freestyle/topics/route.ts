import { getDb } from "@/lib/db/client";
import { createFreestyleService } from "@/lib/services/freestyleService";
import { respond } from "../respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const level = new URL(request.url).searchParams.get("level");
  return respond(() => ({
    grammarTopics: createFreestyleService(getDb()).grammarTopics(level),
  }));
}
