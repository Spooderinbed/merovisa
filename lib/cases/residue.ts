import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { caseWriteColumns } from "./dual-write";

type DB = SupabaseClient<Database>;

/**
 * MV-155 RESIDUE — an owner-keyed row that never received a `case_id`, and the
 * one shape for which Stage 2 does not degrade to an empty state but **fails**.
 *
 * ## The class, stated exactly, because the cards never named it
 *
 * MV-155's derive trigger is on **two** of the nine tables (`user_program_state`
 * and `document_status`, MV-155 §H). The other seven got `case_id` from the
 * ONE-SHOT backfill, so any row written to them between the backfill and this
 * deploy carries `owner` and no `case_id`. A user who has **no** personal case
 * degrades gracefully — every migrated read is `case_id`-scoped and returns
 * nothing, which is the same empty state a brand-new account sees. A user who
 * **has** a personal case but owns case-less rows does not:
 *
 *   - every new upsert conflict-targets `case_id`, and an existing row whose
 *     `case_id` is NULL is not a conflict on that arbiter, so the write takes the
 *     INSERT branch;
 *   - the LEGACY owner-keyed uniques are still live until MV-160 drops them —
 *     `profiles_owner_key`, `documents_owner_kind_key`, `assessments_primary_idx`,
 *     `plan_items_kind_open_idx`;
 *   - so the INSERT hits one of those and raises **23505**.
 *
 * Production residue measured 2026-08-03 is **zero on all nine tables**, and zero
 * users lack a personal case. This module is therefore defence in depth, not an
 * outage remedy — but the window between that measurement and the merge is open,
 * and criterion J now closes it by RE-RUNNING `private.mv155_backfill_personal_
 * cases()` as the last pre-merge step rather than merely counting.
 *
 * ## Why adopt-on-collision rather than adopt-always
 *
 * A pre-emptive `UPDATE … WHERE owner = … AND case_id IS NULL` on every write
 * would be an extra round trip on every write for every user, forever, to repair
 * a population that is currently empty. Running it only after a 23505 costs a
 * fully-backfilled user **exactly nothing**: the collision never happens, so this
 * code never executes. That is the property the review demands — residue
 * hardening must not change behaviour for a fully-backfilled user.
 *
 * ## Why this is service-role only
 *
 * The adopt is an `UPDATE (case_id)`. Stage 2 grants `authenticated` no such
 * column privilege on the two UPSERT-seam tables (spec §4.4/§4.6) and no UPDATE
 * at all on `profiles` / `documents` / `plan_items` (§4.1/§4.5), so an adopt
 * issued through the authenticated client raises `42501`. Every caller below is
 * already a service-role path. `user_program_state` and `document_status` are
 * deliberately NOT adoptable here: their routes run on the AUTHENTICATED client,
 * and they are also the only two tables carrying MV-155 §H's derive trigger, so
 * they are the two that cannot accumulate this residue in the first place.
 */

/** The tables whose owner-keyed residue a service-role write path may adopt. */
export type AdoptableTable = "profiles" | "documents" | "assessments" | "plan_items";

/**
 * Move this case's owner-keyed, case-less rows onto the case, and report how many
 * moved. Returns 0 when there is nothing to adopt — which is the normal, healthy
 * answer and the reason callers must treat 0 as "do not retry, surface the
 * original error".
 *
 * Scoped `owner = <the case's student_user_id> AND case_id IS NULL`, so it can
 * only ever claim rows that already belong to this case's student and can never
 * re-point a row that is already bound to some other case. `owner` is read from
 * `cases.student_user_id` through the dual-write choke point — it is never a
 * parameter here either.
 */
export async function adoptOwnerKeyedResidue(
  db: DB,
  table: AdoptableTable,
  caseId: string,
  extra: ReadonlyArray<readonly [column: string, value: string | boolean]> = [],
): Promise<number> {
  const ownership = await caseWriteColumns(db, caseId);
  // A consultancy case has no `student_user_id`, so it has no owner-keyed residue
  // by construction — there is no owner to have keyed it.
  if (ownership === null || ownership.owner === null) return 0;

  let query = db
    .from(table)
    .update({ case_id: caseId } as never)
    .eq("owner", ownership.owner)
    .is("case_id", null);
  for (const [column, value] of extra) {
    query = query.eq(column, value);
  }

  const { data, error } = await query.select("id");
  if (error) {
    console.error("[cases] residue adopt failed", { table, caseId, error });
    return 0;
  }
  const adopted = (data ?? []).length;
  if (adopted > 0) {
    // Loud on purpose. Every one of these is a row MV-155's backfill did not
    // reach, and the count is the only signal that criterion J's pre-merge
    // re-run either did not happen or ran too early.
    console.warn("[cases] adopted MV-155 residue into its case", { table, caseId, adopted });
  }
  return adopted;
}
