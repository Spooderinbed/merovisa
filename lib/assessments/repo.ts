import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { CaseReadError } from "@/lib/cases/errors";
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

/**
 * THE ONE `owner:` PAYLOAD KEY LEFT OUTSIDE `lib/cases/dual-write.ts`, and the
 * reason it is not a falsifier of that module's structural guarantee: it writes
 * the LITERAL `null` on a row that has no case at all. That is the anonymous
 * carve-out — spec §3, `owner IS NULL ⇒ case_id IS NULL` — the state MV-135's
 * purge keys on and the state a claim transitions a row out of. There is no case
 * id in scope to derive an owner from and therefore no pair that could disagree.
 * MV-160 §D's payload sweep should allow-list exactly this site, by this reason.
 */
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

/**
 * Bind an anonymous assessment to its claimer — `owner`, `case_id` and
 * `claimed_at` in ONE conditional UPDATE (MV-158 §B).
 *
 * THE SINGLE STATEMENT IS THE POINT, not an optimisation. Two sequential updates
 * would leave, on a crash between them, an OWNED-BUT-CASE-LESS row: no error is
 * raised, no test fails by default, the student signed in successfully — and
 * their assessment is simply not on the case-scoped dashboard they land on
 * seconds later. That silent-loss state is the whole reason this seam was carved
 * out of MV-157.
 *
 * The guard is unchanged in strength. `.is("owner", null)` and
 * `.gt("expires_at", now)` are not the actor-equals-student predicate MV-157
 * removed — they are the definition of "an anonymous row that is still
 * claimable", and on `/api/assess/claim` they ARE the authorization: that route
 * takes a caller-supplied id and verifies no token, so an already-claimed or
 * expired row matching nothing is what stops a caller stealing another account's
 * assessment.
 *
 * ## Why it takes `ownership` and no longer takes `userId` + `caseId`
 *
 * It used to take both, independently — which made it the ONE repository
 * signature able to write an `owner` that disagreed with its `case_id`, on the
 * table where that corruption is worst. `lib/cases/dual-write.ts` claims that "no
 * repository signature accepts both `owner` and `caseId`", MV-160 §D is being
 * designed around that claim, and this function falsified it. It now takes a
 * SINGLE value produced by `caseBindColumns`, which derives `owner` from
 * `cases.student_user_id`: the disagreement is unrepresentable rather than merely
 * untested, and the payload is still one statement.
 */
export async function claimAssessment(
  db: DB,
  input: { id: string; ownership: { case_id: string; owner: string }; nowIso: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("assessments")
    .update({
      ...input.ownership,
      claimed_at: new Date().toISOString(),
    })
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
  /** Null on an anonymous row (correct) OR on a claimed row that lost its case write (F2). */
  caseId: string | null;
  expired: boolean;
}

export async function getAssessmentClaimState(
  db: DB,
  id: string,
  nowIso: string,
): Promise<AssessmentClaimState | null> {
  const { data, error } = await db
    .from("assessments")
    .select("owner, case_id, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { owner: string | null; case_id: string | null; expires_at: string };
  return {
    owner: row.owner,
    caseId: row.case_id,
    expired: new Date(row.expires_at).getTime() <= new Date(nowIso).getTime(),
  };
}

/**
 * Repair an OWNED assessment that carries no `case_id` — MV-158 F2, the runtime
 * remedy for a row bound before the claim path learned about cases.
 *
 * Without it, a student in that state re-runs a claim that already "succeeded",
 * is told `already-mine`, lands on the assessment — and still sees nothing on the
 * dashboard, because every case-scoped read filters on a column their row does
 * not carry. The BULK remedy is MV-160 §B's reconciliation sweep; this is the
 * one that fires when the student is actually standing there.
 *
 * Scoped to `owner = caller AND case_id IS NULL`, so it can only ever repair a
 * row the caller already owns and can never re-point one that is already bound.
 * It never throws: a failed repair must not turn a successful `already-mine` into
 * an error the student sees.
 *
 * ## Three outcomes, not two
 *
 * It used to return `true` whenever PostgREST did not error — including when the
 * conditional update matched NO ROW, which is the case where nothing was
 * repaired. "Reported success having done nothing" is the same defect class as
 * the read errors above, and here it is worse than cosmetic: the caller decides
 * whether to run the follow-up promote off this answer, so a `true` that repaired
 * nothing suppresses the repair that would have fixed the row. The tri-state says
 * which of the three actually happened.
 */
export type CaseHealOutcome =
  /** The row carried no case and now carries this one. */
  | "repaired"
  /** The predicate matched nothing: already bound, or not this caller's row. */
  | "not-applicable"
  /** The write never landed. */
  | "failed";

export async function healAssessmentCase(
  db: DB,
  input: { id: string; userId: string; caseId: string },
): Promise<CaseHealOutcome> {
  const { data, error } = await db
    .from("assessments")
    .update({ case_id: input.caseId })
    .eq("id", input.id)
    .eq("owner", input.userId)
    .is("case_id", null)
    .select("id");
  if (error) {
    console.error("[assessments] case heal failed", { id: input.id, error });
    return "failed";
  }
  return (data ?? []).length > 0 ? "repaired" : "not-applicable";
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
  // MV-133 on the case axis. `null` here drives the whole "you have not assessed
  // yet" surface; a failed read wearing that answer tells a student who HAS
  // assessed to start over.
  if (error) throw new CaseReadError("assessments", error);
  if (!data) return null;
  return data as AssessmentRow;
}

export async function listAssessmentsForCase(db: DB, caseId: string): Promise<AssessmentRow[]> {
  const { data, error } = await db
    .from("assessments")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw new CaseReadError("assessments", error);
  return (data ?? []) as AssessmentRow[];
}
