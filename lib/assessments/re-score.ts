import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { getProfileForCase } from "@/lib/profiles/repo";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import { assembleAssessment } from "@/lib/results/assemble";
import type { ProfileSections } from "@/lib/profiles/sections";

type DB = SupabaseClient<Database>;

/**
 * Recompute the user's primary assessment from their current profile sections.
 * Replaces the entire AssessmentPayload — matches, intake timing, and accuracy
 * are rebuilt alongside the verdict so /assessment/[id] reflects the latest
 * profile data, not a half-stale snapshot.
 */
export async function reScoreAssessment(db: DB, caseId: string): Promise<void> {
  const [profileRow, primaryRow, programs, universities] = await Promise.all([
    getProfileForCase(db, caseId),
    getPrimaryAssessmentForCase(db, caseId),
    listAllPrograms(db),
    listAllUniversities(db),
  ]);

  if (!profileRow || !primaryRow) return;

  const sections = (profileRow.sections as ProfileSections | undefined) ?? {};
  const studentProfile = sectionsToStudentProfile(sections);
  const freshPayload = assembleAssessment(studentProfile, programs, universities, new Date());

  await db
    .from("assessments")
    .update({ result: freshPayload as unknown as Json })
    .eq("id", primaryRow.id)
    .eq("case_id", caseId);
}
