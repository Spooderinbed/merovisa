import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getProfileForCase } from "@/lib/profiles/repo";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { listDocumentsForCase } from "@/lib/documents/repo";
import { caseWriteColumns } from "@/lib/cases/dual-write";
import { adoptOwnerKeyedResidue } from "@/lib/cases/residue";
import { CaseReadError, isUniqueViolation } from "@/lib/cases/errors";
import { computeMatches } from "@/lib/matches/compute";
import { hasSufficientInputs } from "@/lib/matches/sufficiency";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { generatePlan, MATCH_DRIVEN_KINDS } from "./generator";
import type { ProfileSections } from "@/lib/profiles/sections";

type DB = SupabaseClient<Database>;

/**
 * Reconcile a user's plan against a fresh generator run:
 *  - open todos whose triggering condition is now satisfied (the generator no
 *    longer emits that kind) are auto-closed to 'done';
 *  - newly-relevant kinds not already open are inserted as todos.
 * done/dismissed items are never touched — those are the user's decisions, and
 * the partial unique index keeps inserts deduped. MV-155 shipped the case-keyed
 * form `(case_id, kind) WHERE status = 'todo'` alongside the legacy
 * `(owner, kind)` one; both are live through Stage 2 and, for a personal case,
 * a violation of either is the same write.
 */
export async function invalidatePlan(adminDb: DB, caseId: string): Promise<void> {
  const [profileRow, primaryRow, programs, universities, docs] = await Promise.all([
    getProfileForCase(adminDb, caseId),
    getPrimaryAssessmentForCase(adminDb, caseId),
    listAllPrograms(adminDb),
    listAllUniversities(adminDb),
    listDocumentsForCase(adminDb, caseId),
  ]);
  const hasPassport = docs.some((d) => d.kind === "passport");

  const sections = (profileRow?.sections as ProfileSections | undefined) ?? {};
  const matchInputs = sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });
  // Unknown is not zero (audit C-4): a profile with no grade/English/budget would have
  // every input floored to 0 by computeMatches and every program called a reach, seeding
  // the plan with add-safer-options off a fabricated verdict. Abstain — skip the match-driven
  // items when there is nothing real to score — while the profile-completeness prompts still
  // generate. `abstained` is threaded into the auto-close below so this absence is never
  // mistaken for a satisfied condition.
  const abstained = !hasSufficientInputs(matchInputs);
  const matches = abstained ? [] : computeMatches(matchInputs, programs, universities);

  const items = generatePlan({
    sections,
    primaryDestinationId: primaryRow?.destination_id ?? null,
    matches,
    policy: { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL },
    hasPassport,
  });
  const generatedKinds = new Set(items.map((it) => it.kind));

  // Read the case's open todos once — used to detect satisfied items, to skip
  // re-inserting kinds that are already open, and to refresh drifted copy.
  const { data: existing, error: openError } = await adminDb
    .from("plan_items")
    .select("id, kind, impact, title, body, lift_estimate, time_estimate")
    .eq("case_id", caseId)
    .eq("status", "todo");
  // An unread open-plan list is NOT an empty one. Treating it as empty auto-closes
  // nothing (fine) but re-inserts every generated kind (not fine) — straight into
  // the partial unique index, as a batch, which fails the whole batch.
  if (openError) throw new CaseReadError("plan_items", openError);
  const open = existing ?? [];

  // Auto-close: an open todo whose kind the generator no longer emits means its
  // condition is now met. Mark it done so it leaves the open plan but stays in history.
  // EXCEPT match-driven kinds while abstaining (audit C-4): the matcher stayed silent
  // because there was nothing to score, not because the todo was completed — closing it
  // would fabricate a completion (Codex review, MV-143).
  const matchDriven = new Set<string>(MATCH_DRIVEN_KINDS);
  const satisfiedIds = open
    .filter((r) => !generatedKinds.has(r.kind))
    .filter((r) => !(abstained && matchDriven.has(r.kind)))
    .map((r) => r.id);
  if (satisfiedIds.length > 0) {
    const { error: closeError } = await adminDb
      .from("plan_items")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("case_id", caseId)
      .in("id", satisfiedIds);
    if (closeError) {
      console.error("[plan] auto-close failed", { caseId, count: satisfiedIds.length, error: closeError });
    }
  }

  // Insert newly-relevant kinds that aren't already open. `owner` is derived
  // from the case inside the dual-write helper, never threaded through from the
  // caller — see lib/cases/dual-write.ts.
  const ownership = await caseWriteColumns(adminDb, caseId);
  const seenKinds = new Set(open.map((r) => r.kind));
  const toInsert = ownership === null ? [] : items
    .filter((it) => !seenKinds.has(it.kind))
    .map((it) => ({
      ...ownership,
      kind: it.kind,
      impact: it.impact,
      title: it.title,
      body: it.body ?? null,
      lift_estimate: it.liftEstimate ?? null,
      time_estimate: it.timeEstimate ?? null,
      status: "todo" as const,
    }));

  // The batch insert discarded its error entirely — no destructure, no log — and
  // it is the residue path with the widest blast radius: `plan_items_kind_open_idx
  // (owner, kind) WHERE status = 'todo'` is still live, `open` above is
  // `case_id`-scoped and therefore cannot see a legacy open todo that never
  // received a `case_id`, so that kind is regenerated, collides, and — because
  // PostgREST sends the array as ONE statement — takes every OTHER new item down
  // with it. Silently: the student's plan simply stops gaining items.
  //
  // On a 23505 the case's owner-keyed, case-less plan rows are adopted and the
  // batch retried once. A retry after a successful adopt must also drop the kinds
  // that just became visible, or it collides again on the case-scoped index.
  if (toInsert.length > 0) {
    const { error: insertError } = await adminDb.from("plan_items").insert(toInsert);
    if (insertError && isUniqueViolation(insertError)) {
      const adopted = await adoptOwnerKeyedResidue(adminDb, "plan_items", caseId, [["status", "todo"]]);
      if (adopted > 0) {
        const { data: reread } = await adminDb
          .from("plan_items")
          .select("kind")
          .eq("case_id", caseId)
          .eq("status", "todo");
        const nowOpen = new Set((reread ?? []).map((r) => r.kind));
        const retry = toInsert.filter((it) => !nowOpen.has(it.kind));
        if (retry.length > 0) {
          const { error: retryError } = await adminDb.from("plan_items").insert(retry);
          if (retryError) {
            console.error("[plan] item insert failed after residue adopt", { caseId, error: retryError });
          }
        }
      } else {
        console.error("[plan] item insert failed", { caseId, error: insertError });
      }
    } else if (insertError) {
      console.error("[plan] item insert failed", { caseId, error: insertError });
    }
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
      const { error: copyError } = await adminDb
        .from("plan_items")
        .update(next)
        .eq("case_id", caseId)
        .eq("id", row.id);
      if (copyError) {
        console.error("[plan] copy refresh failed", { caseId, id: row.id, error: copyError });
      }
    }
  }
}
