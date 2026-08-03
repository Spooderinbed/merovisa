import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { caseUpsertColumns } from "@/lib/cases/dual-write";

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
  // THE CONFLICT TARGET AND THE PAYLOAD ARE GOVERNED BY OPPOSITE RULES, and they
  // look alike inside one `.upsert(payload, { onConflict })` call:
  //
  //   TARGET  — `case_id,program_id` names MV-155's `user_program_state_case_
  //             program_idx`. It is an index column list, not a write, so naming
  //             case_id is fine. That index is deliberately FULL, not partial:
  //             PostgREST emits a bare `on_conflict=` column list and Postgres
  //             infers a PARTIAL unique index only when the statement supplies
  //             the predicate, so a partial arbiter raises 42P10 (spec §4 rule 1).
  //
  //   PAYLOAD — must NOT contain case_id. PostgREST compiles this to
  //             `INSERT … ON CONFLICT DO UPDATE SET`, putting every payload
  //             column in the SET list, and the privilege check happens at plan
  //             time. Stage 2 grants `UPDATE (owner, program_id, status, notes)`
  //             on this table — no case_id — so naming it fails 42501 on the
  //             INSERT branch of the first call, with no row present and neither
  //             branch reachable. MV-155 §H's definer trigger, qualified
  //             `when (new.owner is not null)`, derives case_id from owner
  //             instead and overwrites any supplied value.
  const ownership = await caseUpsertColumns(db, input.caseId);
  if (ownership === null) return false;

  const { error } = await db
    .from("user_program_state")
    .upsert(
      {
        ...ownership,
        program_id: input.programId,
        status: input.status,
        notes: input.notes ?? null,
      },
      { onConflict: "case_id,program_id", ignoreDuplicates: false },
    );
  return !error;
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
  if (error || !data) return [];
  return data.map((r) => ({
    programId: r.program_id,
    status: r.status as ShortlistStatus,
    notes: r.notes,
  }));
}
