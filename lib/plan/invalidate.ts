import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getProfile } from "@/lib/profiles/repo";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { computeMatches } from "@/lib/matches/compute";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { generatePlan } from "./generator";
import type { ProfileSections } from "@/lib/profiles/sections";

type DB = SupabaseClient<Database>;

/**
 * Re-run the generator and insert any new (owner, kind) items.
 * Existing items with the same kind are left alone (the partial unique index
 * blocks duplicate todos; done/dismissed items don't conflict because the index
 * is partial on status='todo').
 */
export async function invalidatePlan(adminDb: DB, userId: string): Promise<void> {
  const [profileRow, primaryRow, programs, universities] = await Promise.all([
    getProfile(adminDb, userId),
    getPrimaryAssessmentForUser(adminDb, userId),
    listAllPrograms(adminDb),
    listAllUniversities(adminDb),
  ]);

  const sections = (profileRow?.sections as ProfileSections | undefined) ?? {};
  const matches = computeMatches(
    {
      userGradePercent: sections.academic?.gradePercent ?? null,
      userEnglishOverall: sections.english?.overall ?? null,
      userEnglishBand: sections.english?.overall ?? null,
      userBudgetAud: sections.finance?.total ?? null, // ignore currency for plan; rough enough
      userField: sections["intended-study"]?.field ?? null,
      policy: { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL },
    },
    programs,
    universities,
  );

  const items = generatePlan({
    sections,
    primaryDestinationId: primaryRow?.destination_id ?? null,
    matches,
    policy: { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL },
  });

  if (items.length === 0) return;

  // Use upsert with onConflict on (owner, kind) WHERE status='todo' — but PostgREST
  // doesn't support partial-index conflict targets directly. Instead: do an INSERT
  // ... ON CONFLICT DO NOTHING by inserting rows; the partial unique index causes
  // open-kind dupes to be ignored at the DB level. Supabase's `upsert({ ignoreDuplicates: true })`
  // accepts a non-partial conflict target; since plan_items has no full unique index,
  // we model "skip if open exists" by reading + filtering first.

  const { data: existing } = await adminDb
    .from("plan_items")
    .select("kind")
    .eq("owner", userId)
    .eq("status", "todo");
  const seenKinds = new Set((existing ?? []).map((r) => r.kind));

  const toInsert = items
    .filter((it) => !seenKinds.has(it.kind))
    .map((it) => ({
      owner: userId,
      kind: it.kind,
      impact: it.impact,
      title: it.title,
      body: it.body ?? null,
      lift_estimate: it.liftEstimate ?? null,
      time_estimate: it.timeEstimate ?? null,
      status: "todo" as const,
    }));

  if (toInsert.length === 0) return;
  await adminDb.from("plan_items").insert(toInsert);
}
