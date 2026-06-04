import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { getProfile } from "@/lib/profiles/repo";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import { runAssessment } from "@/lib/scoring/engine";
import type { ProfileSections } from "@/lib/profiles/sections";

type DB = SupabaseClient<Database>;

export async function reScoreAssessment(db: DB, userId: string): Promise<void> {
  const [profileRow, primaryRow] = await Promise.all([
    getProfile(db, userId),
    getPrimaryAssessmentForUser(db, userId),
  ]);

  if (!profileRow || !primaryRow) return;

  const sections = (profileRow.sections as ProfileSections | undefined) ?? {};
  const studentProfile = sectionsToStudentProfile(sections);
  const result = runAssessment(studentProfile);

  await db
    .from("assessments")
    .update({ result: result as unknown as Json })
    .eq("id", primaryRow.id)
    .eq("owner", userId);
}
