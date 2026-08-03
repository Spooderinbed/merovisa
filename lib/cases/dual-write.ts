import "server-only";
import type { CaseAuthorizationClient } from "./context";

/**
 * The Stage 2 dual-write seam — the ONE place `owner` is written on a
 * case-scoped row (MV-157 §E).
 *
 * ## The rule
 *
 * `case_id` is written always; `owner` is written only when the case has a
 * `student_user_id`. Consultancy-created rows carry `case_id` with `owner` NULL,
 * which MV-156's `drop not null` is what made possible.
 *
 * ## Why `owner` is derived here and never passed in
 *
 * `owner` and `case_id` pointing at different people is the corruption this stage
 * can produce and the hardest to detect afterwards, and **there is exactly one
 * defence against it — this function.** MV-155 §F is explicit that the invariant
 * is cross-table and no `CHECK` can express it: what it ships is
 * `private.mv155_assert_case_backfill()`, an assertion FUNCTION the migration and
 * the tests call. It is a detector, not a lock — a mismatched write is not
 * rejected at write time, and nothing will reject one until MV-160 makes
 * `case_id` NOT NULL.
 *
 * So no repository signature accepts both `owner` and `caseId`: a caller is
 * structurally unable to make the two disagree, because it never supplies the
 * first. Every mutating integration test calls the detector at the end as the
 * compensating frequency.
 *
 * ## The `assessments` exception, stated precisely — it USED to falsify the above
 *
 * The paragraph above was written as a whole-codebase structural claim while four
 * `owner:` write payloads lived outside this module, all on `assessments`, and one
 * of them — `claimAssessment(db, { id, userId, caseId, … })` — took **both** axes
 * as independent parameters and was therefore able to make them disagree. A
 * guarantee MV-160 §D is being designed around cannot be approximately true, so
 * three of the four were routed through this module rather than the sentence
 * softened (`claimAssessment`, `/api/assess`'s signed-in insert, and the dev
 * sign-in harness now all take or spread a value **produced here**).
 *
 * **One remains, and it cannot make the two disagree.**
 * `createAnonymousAssessment` (`lib/assessments/repo.ts`) writes the literal
 * `owner: null` on a row that has **no case at all**. That is not a dual-write: it
 * is the anonymous carve-out — spec §3, `owner IS NULL ⇒ case_id IS NULL` — the
 * state MV-135's purge keys on and the state a claim transitions a row *out of*.
 * There is no case id in scope to derive an owner from, and no pair to diverge.
 * It is the ONLY `owner:` payload key in `lib/` or `app/` outside this file, and
 * MV-160 §D's sweep should allow-list exactly it, by that reason.
 *
 * ## Why MV-160's source sweep allowlists this file
 *
 * `tests/architecture/no-actor-equals-student.test.ts` (MV-160 §D) flags any
 * `owner:` key in an insert or upsert payload. This module derives one on every
 * personal-case row, deliberately, and is the **single** allowlisted DERIVING
 * path (with the anonymous literal above as the single non-deriving one). The
 * `owner` column is retained as the provenance link that
 * `app/api/account/delete/route.ts` and MV-135's `owner is null` purge predicate
 * both still read, so removing the dual-write is a **Stage 6** item sequenced
 * with dropping the `owner` columns — not a tightening step MV-160 performs.
 */

interface CaseOwnership {
  caseId: string;
  owner: string | null;
}

async function readCaseOwnership(
  db: CaseAuthorizationClient,
  caseId: string,
): Promise<CaseOwnership | null> {
  if (typeof caseId !== "string" || caseId.trim().length === 0) return null;
  try {
    const { data, error } = await db
      .from("cases")
      .select("id, student_user_id")
      .eq("id", caseId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { id: string; student_user_id: string | null };
    return { caseId: row.id, owner: row.student_user_id ?? null };
  } catch {
    return null;
  }
}

/**
 * The ownership columns for a plain INSERT/UPDATE payload on a case-scoped table.
 * Returns null when the case cannot be read — a caller must fail rather than
 * write a row with neither axis, which `_ownership_axis_present` would reject
 * with a `23514` that reads like a bug in the caller.
 */
export async function caseWriteColumns(
  db: CaseAuthorizationClient,
  caseId: string,
): Promise<{ case_id: string; owner: string | null } | null> {
  const ownership = await readCaseOwnership(db, caseId);
  if (ownership === null) return null;
  return { case_id: ownership.caseId, owner: ownership.owner };
}

/**
 * The ownership columns for a row being bound to a **student's** case, with
 * `owner` narrowed to non-null. A case with no `student_user_id` is refused.
 *
 * This exists so `claimAssessment` can stop taking `userId` and `caseId` as two
 * independent parameters. It took both, which made it the one repository
 * signature that could write an `owner` disagreeing with its `case_id` — on the
 * table where that corruption is worst, because `assessments.case_id` is the one
 * column that stays nullable at MV-160 and `owner IS NULL` is what the purge
 * keys on. Passing ONE value produced here makes the disagreement unrepresentable
 * rather than merely untested.
 *
 * The narrowing is load-bearing, not cosmetic: writing `owner: null` onto a
 * CLAIMED assessment would land it on the wrong side of the anonymous carve-out —
 * invisible to the student and eligible for MV-135's purge. `caseWriteColumns`
 * returns `owner: null` for a consultancy case quite legitimately; a claim must
 * never accept that value, so it asks a function that cannot return it.
 */
export async function caseBindColumns(
  db: CaseAuthorizationClient,
  caseId: string,
): Promise<{ case_id: string; owner: string } | null> {
  const ownership = await readCaseOwnership(db, caseId);
  if (ownership === null || ownership.owner === null) return null;
  return { case_id: ownership.caseId, owner: ownership.owner };
}

/**
 * The ownership column for an UPSERT payload on `user_program_state` or
 * `document_status` — **`owner` only, never `case_id`**.
 *
 * These two tables are the UPSERT seam. MV-155 §H puts a definer trigger on each,
 * qualified `when (new.owner is not null)`, which derives `case_id` from that
 * owner's personal case and overwrites any supplied value — precisely so the
 * client never names the column. It must not, either: PostgREST compiles an
 * upsert to `INSERT … ON CONFLICT DO UPDATE SET` and puts **every payload column
 * in the SET list**, the privilege check happens at plan time, and Stage 2 grants
 * `UPDATE (owner, program_id, status, notes)` / `UPDATE (owner, kind, obtained)`
 * — `case_id` is in neither. A payload carrying it therefore raises **42501 on
 * the INSERT branch of the very first call, with no row present and neither
 * branch reachable** (spec §4.4, §4.6).
 *
 * The conflict TARGET is a different thing under opposite rules: it is an index
 * column list rather than a write, so it MAY name `case_id`, and it does. The two
 * look alike inside one `.upsert(payload, { onConflict })` call.
 *
 * A case with no `student_user_id` is refused. With `owner IS NULL` the trigger
 * does not fire, nothing derives `case_id`, and supplying it needs the
 * `UPDATE(case_id)` grant Stage 2 withholds — the residual seam spec §4 rule 2
 * records as a Stage 3 input. No Stage 2 caller hits it; refusing loudly is
 * better than writing a row that trips `_ownership_axis_present`.
 */
export async function caseUpsertColumns(
  db: CaseAuthorizationClient,
  caseId: string,
): Promise<{ owner: string } | null> {
  const ownership = await readCaseOwnership(db, caseId);
  if (ownership === null || ownership.owner === null) return null;
  return { owner: ownership.owner };
}
