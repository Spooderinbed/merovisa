import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { caseWriteColumns } from "@/lib/cases/dual-write";
import { CaseReadError, isUniqueViolation } from "@/lib/cases/errors";

type DB = SupabaseClient<Database>;

export type ShortlistStatus = "shortlisted" | "applied" | "withdrawn";

export interface ShortlistEntry {
  programId: string;
  status: ShortlistStatus;
  notes: string | null;
}

/**
 * MV-157: these take an already-resolved, already-AUTHORIZED `caseId`. They
 * resolve no case and authorize nothing — `requireCasePermission` runs at the
 * entry point, once, before the first query.
 */
export async function upsertProgramState(
  db: DB,
  input: { caseId: string; programId: string; status: ShortlistStatus; notes?: string | null },
): Promise<boolean> {
  // MV-168 — INSERT, then UPDATE on a collision. NOT an `.upsert()`, and the
  // reason is the same one that governs `lib/profiles/repo.ts`:
  //
  //   * PostgREST compiles an upsert to `INSERT … ON CONFLICT DO UPDATE SET` and
  //     puts EVERY payload column in the SET list, checked at plan time. Stage 2
  //     grants `UPDATE (owner, program_id, status, notes)` here — no `case_id` —
  //     so a payload naming it is 42501 on the first call. `case_id` is in the
  //     INSERT grant, and a plain INSERT is only privilege-checked against that.
  //   * `UPDATE (case_id)` is forbidden by design (…20260802120000….sql:602-604):
  //     a client that can update it re-points a row into another case.
  //
  // SO THE INSERT NAMES `case_id` EXPLICITLY, and the UPDATE branch names neither
  // axis. MV-155 §H's definer trigger no longer overwrites a supplied value —
  // MV-159 qualified it `new.case_id is null and new.owner is not null`, so a
  // supplied `case_id` skips the derive entirely. That change is what makes an
  // owner-bearing row on an ORG case land where it was told to instead of on the
  // owner's personal case, and it is why this may move off `caseUpsertColumns`.
  //
  // `caseWriteColumns`, not `caseUpsertColumns`: the latter refuses any case with
  // no `student_user_id` outright, which is every consultancy case. `owner` is
  // still derived from the case rather than passed in — the dual-write guard is
  // unchanged, only the shape of what it returns.
  const ownership = await caseWriteColumns(db, input.caseId);
  if (ownership === null) return false;

  const mutable = { status: input.status, notes: input.notes ?? null };

  const { error: insertError } = await db
    .from("user_program_state")
    .insert({ ...ownership, program_id: input.programId, ...mutable } as never);
  if (!insertError) return true;
  // The row already exists on this case for this program — `user_program_state_
  // case_program_idx`. Any other unique violation is a real failure.
  if (!isUniqueViolation(insertError)) return false;

  const { error: updateError } = await db
    .from("user_program_state")
    .update(mutable as never)
    .eq("case_id", input.caseId)
    .eq("program_id", input.programId);
  return !updateError;
}

export async function deleteProgramState(
  db: DB,
  caseId: string,
  programId: string,
): Promise<boolean> {
  const { error } = await db
    .from("user_program_state")
    .delete()
    .eq("case_id", caseId)
    .eq("program_id", programId);
  return !error;
}

export async function listShortlistForCase(db: DB, caseId: string): Promise<ShortlistEntry[]> {
  const { data, error } = await db
    .from("user_program_state")
    .select("program_id, status, notes")
    .eq("case_id", caseId);
  // MV-133 on the case axis: an empty shortlist is a real state; a failed read
  // wearing it silently un-saves every program the student saved.
  if (error) throw new CaseReadError("user_program_state", error);
  return (data ?? []).map((r) => ({
    programId: r.program_id,
    status: r.status as ShortlistStatus,
    notes: r.notes,
  }));
}
