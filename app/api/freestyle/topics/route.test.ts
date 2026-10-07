import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb, closeDb } from "@/lib/db/client";
import { createProfileService } from "@/lib/services/profileService";
import { seedTutoringCurriculum } from "@/test/tutoringFixtures";
import { GET } from "./route";

const get = (query: string) =>
  GET(new Request(`http://localhost/api/freestyle/topics${query}`));

describe("GET /api/freestyle/topics", () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), "gait-topics-"));
    getDb();
  });
  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it("returns the unlocked level’s grammar lesson titles in the UI language, without duplicates", async () => {
    const db = getDb();
    seedTutoringCurriculum(db);
    const track = createProfileService(db).getProfile().activeTrack;
    expect(track).toBe("generic");
    db.exec(`INSERT INTO lessons (id, track, source_level, skill, title, title_de) VALUES
      ('t-dupe', 'generic', 'A1', 'grammar', 'The verb sein', 'Das Verb sein');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('t-dupe', 'g-a1-m1');`);
    const res = await get("?level=A1");
    expect(res.status).toBe(200);
    const { grammarTopics } = (await res.json()) as { grammarTopics: string[] };
    // a1-greet is vocabulary, the goethe lesson is another track, a2-past is another level; the dupe collapses.
    expect(grammarTopics).toEqual(["The verb sein"]);
  });

  it("refuses a locked level with 403 level_locked, and a bad level with 400", async () => {
    const locked = await get("?level=B1");
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ code: "level_locked" });
    expect((await get("?level=Z9")).status).toBe(400);
    expect((await get("")).status).toBe(400);
  });
});
