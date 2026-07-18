import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getProfile } from "@/lib/profiles/repo";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { listDocumentsForUser } from "@/lib/documents/repo";
import { computeMatches } from "@/lib/matches/compute";
import { hasSufficientInputs } from "@/lib/matches/sufficiency";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { generatePlan } from "./generator";
import type { ProfileSections } from "@/lib/profiles/sections";

type DB = SupabaseClient<Database>;

/**
 * Reconcile a user's plan against a fresh generator run:
 *  - open todos whose triggering condition is now satisfied (the generator no
 *    longer emits that kind) are auto-closed to 'done';
 *  - newly-relevant kinds not already open are inserted as todos.
 * done/dismissed items are never touched — those are the user's decisions, and
 * the partial unique index (owner, kind) WHERE status='todo' keeps inserts deduped.
 */
export async function invalidatePlan(adminDb: DB, userId: string): Promise<void> {
  const [profileRow, primaryRow, programs, universities, docs] = await Promise.all([
    getProfile(adminDb, userId),
    getPrimaryAssessmentForUser(adminDb, userId),
    listAllPrograms(adminDb),
    listAllUniversities(adminDb),
    listDocumentsForUser(adminDb, userId),
  ]);
  const hasPassport = docs.some((d) => d.kind === "passport");

  const sections = (profileRow?.sections as ProfileSections | undefined) ?? {};
  const matchInputs = sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });
  // Unknown is not zero (audit C-4): a profile with no grade/English/budget would have
  // every input floored to 0 by computeMatches and every program called a reach, seeding
  // the plan with add-safer-options off a fabricated verdict. Skip the match-driven items
  // when there is nothing real to score — the profile-completeness prompts still generate.
  const matches = hasSufficientInputs(matchInputs)
    ? computeMatches(matchInputs, programs, universities)
    : [];

  const items = generatePlan({
    sections,
    primaryDestinationId: primaryRow?.destination_id ?? null,
    matches,
    policy: { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL },
    hasPassport,
  });
  const generatedKinds = new Set(items.map((it) => it.kind));

  // Read the user's open todos once — used to detect satisfied items, to skip
  // re-inserting kinds that are already open, and to refresh drifted copy.
  const { data: existing } = await adminDb
    .from("plan_items")
    .select("id, kind, impact, title, body, lift_estimate, time_estimate")
    .eq("owner", userId)
    .eq("status", "todo");
  const open = existing ?? [];

  // Auto-close: an open todo whose kind the generator no longer emits means its
  // condition is now met. Mark it done so it leaves the open plan but stays in history.
  const satisfiedIds = open.filter((r) => !generatedKinds.has(r.kind)).map((r) => r.id);
  if (satisfiedIds.length > 0) {
    await adminDb
      .from("plan_items")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("owner", userId)
      .in("id", satisfiedIds);
  }

  // Insert newly-relevant kinds that aren't already open.
  const seenKinds = new Set(open.map((r) => r.kind));
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

  if (toInsert.length > 0) {
    await adminDb.from("plan_items").insert(toInsert);
  }

  // Copy refresh: title/body/impact/estimates are generator-owned, so open rows
  // follow the current generator wording (e.g. honesty fixes reach existing
  // users, not just new inserts). User-owned state — status, started_at — is
  // never touched here.
  const itemByKind = new Map(items.map((it) => [it.kind, it]));
  for (const row of open) {
    const it = itemByKind.get(row.kind);
    if (!it) continue;
    const next = {
      impact: it.impact,
      title: it.title,
      body: it.body ?? null,
      lift_estimate: it.liftEstimate ?? null,
      time_estimate: it.timeEstimate ?? null,
    };
    const stale =
      row.impact !== next.impact ||
      row.title !== next.title ||
      row.body !== next.body ||
      row.lift_estimate !== next.lift_estimate ||
      row.time_estimate !== next.time_estimate;
    if (stale) {
      await adminDb.from("plan_items").update(next).eq("owner", userId).eq("id", row.id);
    }
  }
}
