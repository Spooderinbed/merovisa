import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { claimAssessment, createLead, getAssessmentClaimState } from "./repo";
import { isAssessmentClaimError } from "./errors";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { getProfileForCase, upsertProfileForCase } from "@/lib/profiles/repo";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";

type DB = SupabaseClient<Database>;

export interface ClaimAndBootstrapInput {
  assessmentId: string;
  userId: string;
  googleName?: string;
  email?: string;
}

/**
 * Why a claim did not succeed, so the sign-in seam can route each to an honest,
 * distinct recovery instead of one catch-all "expired" (MV-130 / audit C-9):
 * - `already-mine`: the row is already owned by THIS user — a re-claim, so it is a
 *   success at the seam (land them on it), not a failure.
 * - `claimed`: bound to ANOTHER account — recover by signing into that account.
 * - `expired`: purged, deleted, or past its 3-day life — nothing left to recover.
 * - `error`: a transient write failure — the assessment is still there; retry.
 */
export type ClaimFailureReason = "already-mine" | "claimed" | "expired" | "error";

export interface ClaimAndBootstrapResult {
  claimed: boolean;
  reason?: ClaimFailureReason;
}

export async function claimAndBootstrapProfile(
  adminDb: DB,
  input: ClaimAndBootstrapInput,
): Promise<ClaimAndBootstrapResult> {
  const nowIso = new Date().toISOString();
  let ok: boolean;
  try {
    ok = await claimAssessment(adminDb, {
      id: input.assessmentId,
      userId: input.userId,
      nowIso,
    });
  } catch (err) {
    // A transient write failure, NOT "no row matched": the assessment is still
    // recoverable, so tell the seam this is retryable rather than gone.
    if (isAssessmentClaimError(err)) return { claimed: false, reason: "error" };
    throw err;
  }
  if (!ok) return { claimed: false, reason: await classifyMiss(adminDb, input, nowIso) };

  // Read the just-claimed row's snapshot
  const { data } = await adminDb
    .from("assessments")
    .select("profile_snapshot")
    .eq("id", input.assessmentId)
    .maybeSingle();
  const snapshot = (data?.profile_snapshot ?? {}) as Record<string, unknown>;

  // Skip if profile already exists. MV-157 touches this block ONLY to keep it
  // compiling against the case-aware profile repo; the claim's own semantics —
  // the atomic owner + case_id + claimed_at bind, the F1-F5 recovery legs, and
  // the demote that must satisfy BOTH live primary-assessment predicates — are
  // MV-158's commit on this same branch.
  const caseId = await resolvePersonalCaseId(input.userId, adminDb);
  if (caseId === null) {
    console.error("[claim] no personal case for claimer; profile bootstrap skipped", {
      userId: input.userId,
    });
  } else {
    const existing = await getProfileForCase(adminDb, caseId);
    if (!existing) {
      const sections = profileSectionsFromAssessment(snapshot, { name: input.googleName }, { nowYear: new Date().getUTCFullYear() });
      const { pct } = computeCompleteness(sections);
      await upsertProfileForCase(adminDb, { caseId, sections, completeness: pct });
    }
  }

  // Make the just-claimed assessment the primary one (newest-wins): demote any
  // existing primary for this owner, then promote this row. Two sequential
  // app-layer updates (business logic stays in Next.js, not a DB function); after
  // the demote the owner has no primary, so the promote cannot trip the
  // `assessments_primary_idx` partial-unique constraint. Errors are logged, never
  // swallowed — a discarded error here is why re-assessing used to leave the
  // dashboard pinned to the first assessment ever claimed.
  const { error: demoteError } = await adminDb
    .from("assessments")
    .update({ is_primary: false })
    .eq("owner", input.userId)
    .eq("is_primary", true);
  if (demoteError) {
    console.error("[claim] demote existing primary failed", { userId: input.userId, error: demoteError });
  }
  const { error: promoteError } = await adminDb
    .from("assessments")
    .update({ is_primary: true })
    .eq("id", input.assessmentId);
  if (promoteError) {
    console.error("[claim] promote new primary failed", { assessmentId: input.assessmentId, error: promoteError });
  }

  // Record the conversion as a lead — the funnel-bottom signal that an anonymous
  // assessment became an account. Best-effort: the user is already converted, so a
  // lead-write failure must never block their login/redirect. createLead upserts
  // idempotently on (assessment_id, email), so a re-claim never duplicates.
  if (input.email) {
    try {
      await createLead(adminDb, { email: input.email, assessmentId: input.assessmentId });
    } catch (err) {
      console.error("[claim] lead insert failed", { assessmentId: input.assessmentId, err });
    }
  }

  return { claimed: true };
}

/**
 * Read the row back to explain why a conditional claim matched nothing, so each
 * cause reaches its own honest recovery state (MV-130). Ordered most- to
 * least-specific; a row that is unclaimed AND unexpired here means the update lost
 * a race (or a filter regressed), which is retryable, so it falls through to `error`.
 */
async function classifyMiss(
  adminDb: DB,
  input: ClaimAndBootstrapInput,
  nowIso: string,
): Promise<ClaimFailureReason> {
  const state = await getAssessmentClaimState(adminDb, input.assessmentId, nowIso);
  if (!state) return "expired"; // purged (MV-135) / deleted / never persisted
  if (state.owner === input.userId) return "already-mine";
  if (state.owner !== null) return "claimed"; // bound to another account
  if (state.expired) return "expired";
  return "error"; // unclaimed & unexpired but the write missed — retryable
}
