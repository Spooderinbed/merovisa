import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { caseUpsertColumns } from "@/lib/cases/dual-write";
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
  const { data } = await db
    .from("document_status")
    .select("kind")
    .eq("case_id", caseId)
    .eq("obtained", true);
  return new Set(((data ?? []) as { kind: DocumentKind }[]).map((r) => r.kind));
}

/**
 * Toggle a kind's obtained state for the case. ON upserts the row; OFF deletes it
 * — we treat absence-of-row as not-obtained, so there is never a stale
 * obtained=false row to reconcile.
 */
export async function setObtained(
  db: DB,
  caseId: string,
  kind: DocumentKind,
  obtained: boolean,
): Promise<void> {
  if (obtained) {
    // THE CONFLICT TARGET AND THE PAYLOAD FOLLOW OPPOSITE RULES here (see the
    // same note in lib/matches/repo.ts):
    //
    //   TARGET  — `case_id,kind` names MV-155's `document_status_case_kind_idx`,
    //             which is FULL rather than partial precisely so PostgREST's bare
    //             `on_conflict=` can infer it (a partial arbiter → 42P10).
    //   PAYLOAD — carries `owner`, never `case_id`. Stage 2 grants
    //             `UPDATE (owner, kind, obtained)` on this table; PostgREST puts
    //             every payload column in the `ON CONFLICT DO UPDATE SET` list
    //             and checks privileges at plan time, so naming case_id is a
    //             42501 on the first call. MV-155 §H's definer trigger derives it
    //             from owner. This route runs on the AUTHENTICATED client today,
    //             so getting it wrong takes the live checklist down.
    const ownership = await caseUpsertColumns(db, caseId);
    if (ownership === null) return;
    await db
      .from("document_status")
      .upsert({ ...ownership, kind, obtained: true }, { onConflict: "case_id,kind" });
    return;
  }
  await db.from("document_status").delete().eq("case_id", caseId).eq("kind", kind);
}
