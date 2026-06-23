import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;
export type AssessmentRow = Database["public"]["Tables"]["assessments"]["Row"];

export interface NewAssessment {
  profileSnapshot: Json;
  destinationId: string;
  result: Json;
  ruleVersion: string;
  expiresAt: string;
}

export async function createAnonymousAssessment(db: DB, input: NewAssessment): Promise<string | null> {
  const { data, error } = await db
    .from("assessments")
    .insert({
      owner: null,
      profile_snapshot: input.profileSnapshot,
      destination_id: input.destinationId,
      result: input.result,
      rule_version: input.ruleVersion,
      expires_at: input.expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export async function createLead(db: DB, input: { email: string; assessmentId: string }): Promise<void> {
  // PostgREST returns errors as a value, not a throw — surface them so the route
  // can report failure (e.g. an FK violation for a non-existent assessment id)
  // rather than silently returning success.
  const { error } = await db
    .from("leads")
    .upsert(
      { email: input.email, assessment_id: input.assessmentId },
      { onConflict: "assessment_id,email", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

export async function claimAssessment(
  db: DB,
  input: { id: string; userId: string; nowIso: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("assessments")
    .update({ owner: input.userId, claimed_at: new Date().toISOString() })
    .eq("id", input.id)
    .is("owner", null)
    .gt("expires_at", input.nowIso)
    .select("id");
  if (error || !data) return false;
  return (data as unknown[]).length > 0;
}

export async function getOwnedAssessment(db: DB, id: string): Promise<AssessmentRow | null> {
  const { data, error } = await db.from("assessments").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as AssessmentRow;
}

/**
 * MV-28(b): read a single assessment by its unguessable id for an ANONYMOUS visitor,
 * but only if it is still recoverable — unclaimed (owner is null) and unexpired. This
 * powers refresh/back/tab-restore on /assessment/[id] before sign-in.
 *
 * Call this with the SERVICE-ROLE admin client: anon has no table grant, and a
 * permissive anon RLS policy would let the public anon key enumerate every unclaimed
 * assessment via PostgREST (the predicate is row-content-based, not id-bound). The
 * admin client bypasses RLS, so the predicate below IS the gate — it lives in the
 * query, and the post-fetch guard re-verifies it as defense in depth so a future
 * query-filter regression can never leak a claimed or expired assessment's PII.
 */
export async function getRecoverableAssessment(
  db: DB,
  id: string,
  nowIso: string,
): Promise<AssessmentRow | null> {
  const { data, error } = await db
    .from("assessments")
    .select("*")
    .eq("id", id)
    .is("owner", null)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as AssessmentRow;
  if (row.owner !== null || new Date(row.expires_at).getTime() <= new Date(nowIso).getTime()) {
    // A row that exists but fails the predicate reaching here means the query filter
    // regressed — log it as a probe/regression canary, and fail closed.
    console.warn("[assessments] recoverable read rejected by guard", { id, claimed: row.owner !== null });
    return null;
  }
  return row;
}

export async function getPrimaryAssessmentForUser(db: DB, userId: string): Promise<AssessmentRow | null> {
  const { data, error } = await db
    .from("assessments")
    .select("*")
    .eq("owner", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as AssessmentRow;
}

export async function listAssessmentsForUser(db: DB, userId: string): Promise<AssessmentRow[]> {
  const { data, error } = await db
    .from("assessments")
    .select("*")
    .eq("owner", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as AssessmentRow[];
}
