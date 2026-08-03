import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { AssessmentClaimError } from "./errors";

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
  // A DB/network error is NOT "no row matched" — surface it as a distinct, retryable
  // failure so the sign-in seam never tells a student their still-recoverable
  // assessment is gone. `!data` with no error means the conditional update matched
  // nothing (already claimed, expired, or purged): report that as a plain false.
  if (error) throw new AssessmentClaimError(error);
  if (!data) return false;
  return (data as unknown[]).length > 0;
}

/**
 * Why a conditional `claimAssessment` matched no row, read back for an HONEST
 * recovery message (MV-130). The bare boolean can't tell a student whose
 * assessment was purged ("expired and deleted") from one already bound to another
 * account ("sign in with that account") from a transient miss they should retry.
 *
 * Call with the SERVICE-ROLE admin client: it must see rows owned by ANOTHER user
 * to detect the "claimed elsewhere" case, which RLS would hide. Returns null when
 * the row no longer exists (purged by the MV-135 daily job, or never persisted).
 */
export interface AssessmentClaimState {
  owner: string | null;
  expired: boolean;
}

export async function getAssessmentClaimState(
  db: DB,
  id: string,
  nowIso: string,
): Promise<AssessmentClaimState | null> {
  const { data, error } = await db
    .from("assessments")
    .select("owner, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { owner: string | null; expires_at: string };
  return {
    owner: row.owner,
    expired: new Date(row.expires_at).getTime() <= new Date(nowIso).getTime(),
  };
}

/**
 * Read one assessment by its id. It asserts NOTHING about ownership — it never
 * did, which is why MV-157 renamed it off `getOwnedAssessment`: the old name
 * claimed a check the query does not perform, and a reader auditing the callers
 * would have taken it for the gate.
 *
 * The gate lives above it. `app/(focused)/assessment/[id]/page.tsx` reads the row
 * and then authorizes `case.read` against its `case_id` when the row is CLAIMED;
 * an unclaimed, case-less row keeps id-as-credential until MV-135's purge takes
 * it (MV-157 §D).
 */
export async function getAssessmentById(db: DB, id: string): Promise<AssessmentRow | null> {
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

/**
 * MV-157: the assessment READ side is keyed on `case_id`. The write side —
 * `createAnonymousAssessment` and `claimAssessment` above — is MV-158's, and its
 * `.is("owner", null)` predicates are the anonymous carve-out, not the
 * actor-equals-student predicate this card removes: an anonymous assessment is
 * DEFINED by `owner IS NULL` (spec §3), and MV-135's purge keys on exactly that.
 */
export async function getPrimaryAssessmentForCase(db: DB, caseId: string): Promise<AssessmentRow | null> {
  const { data, error } = await db
    .from("assessments")
    .select("*")
    .eq("case_id", caseId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as AssessmentRow;
}

export async function listAssessmentsForCase(db: DB, caseId: string): Promise<AssessmentRow[]> {
  const { data, error } = await db
    .from("assessments")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as AssessmentRow[];
}
