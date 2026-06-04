import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export type ShortlistStatus = "shortlisted" | "applied" | "withdrawn";

export interface ShortlistEntry {
  programId: string;
  status: ShortlistStatus;
  notes: string | null;
}

export async function upsertProgramState(
  db: DB,
  input: { owner: string; programId: string; status: ShortlistStatus; notes?: string | null },
): Promise<boolean> {
  const { error } = await db
    .from("user_program_state")
    .upsert(
      {
        owner: input.owner,
        program_id: input.programId,
        status: input.status,
        notes: input.notes ?? null,
      },
      { onConflict: "owner,program_id", ignoreDuplicates: false },
    );
  return !error;
}

export async function deleteProgramState(
  db: DB,
  owner: string,
  programId: string,
): Promise<boolean> {
  const { error } = await db
    .from("user_program_state")
    .delete()
    .eq("owner", owner)
    .eq("program_id", programId);
  return !error;
}

export async function listShortlistForUser(db: DB, owner: string): Promise<ShortlistEntry[]> {
  const { data, error } = await db
    .from("user_program_state")
    .select("program_id, status, notes")
    .eq("owner", owner);
  if (error || !data) return [];
  return data.map((r) => ({
    programId: r.program_id,
    status: r.status as ShortlistStatus,
    notes: r.notes,
  }));
}
