import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { caseWriteColumns } from "@/lib/cases/dual-write";
import { CaseReadError, isUniqueViolation } from "@/lib/cases/errors";
import type { DocumentKind } from "./types";

type DB = SupabaseClient<Database>;

/**
 * The set of document kinds the case has explicitly marked "obtained" in the
 * global checklist (MV-53) — independent of whether a file was uploaded. Only
 * rows with obtained=true exist; absence means not obtained.
 *
 * MV-157: keyed on `case_id`, and on `case_id` ONLY. No residual owner predicate
 * — one would silently mask a wrong case filter for as long as the legacy
 * owner-scoped policy is still in force, i.e. until MV-159, in a different PR.
 */
export async function listObtainedKinds(db: DB, caseId: string): Promise<Set<DocumentKind>> {
  const { data, error } = await db
    .from("document_status")
    .select("kind")
    .eq("case_id", caseId)
    .eq("obtained", true);
  // MV-133 on the case axis: an empty set means "nothing ticked", which is the
  // checklist's own starting state. A failed read rendered as that empty set
  // un-ticks every box the student already ticked.
  if (error) throw new CaseReadError("document_status", error);
  return new Set(((data ?? []) as { kind: DocumentKind }[]).map((r) => r.kind));
}

/**
 * Toggle a kind's obtained state for the case. ON upserts the row; OFF deletes it
 * — we treat absence-of-row as not-obtained, so there is never a stale
 * obtained=false row to reconcile.
 *
 * Returns whether the write landed. It used to return `void`, which gave the
 * route no way to tell a stored tick from a dropped one — and MV-157 added a
 * SECOND way to drop one silently: `caseUpsertColumns` returns null for a case
 * with no `student_user_id`, the function returned early, and the route still
 * answered `200 {ok:true}`. The checklist then renders the box as ticked until
 * the next reload, when it is not. Both the refusal and a PostgREST error now
 * report `false` and the route surfaces it (audit C-8's "never report a success
 * you did not perform").
 */
export async function setObtained(
  db: DB,
  caseId: string,
  kind: DocumentKind,
  obtained: boolean,
): Promise<boolean> {
  if (obtained) {
    // MV-168 — INSERT, then UPDATE on a collision, for the reason spelled out in
    // `lib/matches/repo.ts`: an `.upsert()` puts every payload column in the
    // `ON CONFLICT DO UPDATE SET` list, `case_id` is in this table's INSERT grant
    // but not its UPDATE grant, and `UPDATE (case_id)` is forbidden by design. So
    // the INSERT names `case_id` and the UPDATE branch names neither ownership
    // column. This route runs on the AUTHENTICATED client, so getting it wrong
    // takes the live checklist down.
    //
    // `caseWriteColumns` rather than `caseUpsertColumns`: the latter refuses a
    // case with no `student_user_id`, which used to make this return `false` for
    // every consultancy case — the silent-drop this function's own doc comment
    // above was written about.
    const ownership = await caseWriteColumns(db, caseId);
    if (ownership === null) {
      console.error("[document_status] refused: case is unreadable", { caseId, kind });
      return false;
    }
    const { error: insertError } = await db
      .from("document_status")
      .insert({ ...ownership, kind, obtained: true } as never);
    if (!insertError) return true;
    // Already ticked — `document_status_case_kind_idx`. Anything else is a failure.
    if (!isUniqueViolation(insertError)) {
      console.error("[document_status] obtained insert failed", { caseId, kind, error: insertError });
      return false;
    }
    const { error: updateError } = await db
      .from("document_status")
      .update({ obtained: true } as never)
      .eq("case_id", caseId)
      .eq("kind", kind);
    if (updateError) {
      console.error("[document_status] obtained resolve failed", { caseId, kind, error: updateError });
      return false;
    }
    return true;
  }
  const { error } = await db
    .from("document_status")
    .delete()
    .eq("case_id", caseId)
    .eq("kind", kind);
  if (error) {
    console.error("[document_status] obtained delete failed", { caseId, kind, error });
    return false;
  }
  return true;
}
