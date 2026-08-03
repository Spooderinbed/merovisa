import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { claimAssessment, createLead, getAssessmentClaimState, healAssessmentCase } from "./repo";
import { isAssessmentClaimError } from "./errors";
import { ensurePersonalCase, type PersonalCaseSessionUser } from "@/lib/cases/personal-case";
import { getProfileForCase, upsertProfileForCase } from "@/lib/profiles/repo";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";

type DB = SupabaseClient<Database>;

export interface ClaimAndBootstrapInput {
  assessmentId: string;
  /**
   * The VERIFIED user from `supabase.auth.getUser()` on the server.
   *
   * It replaces the old `{ userId, googleName, email }` triple. Two reasons, both
   * load-bearing:
   *
   *  1. `ensurePersonalCase` writes `cases.display_name` and `cases.email`, and
   *     it can only promise "no client-supplied string reaches those columns" if
   *     there is no string parameter to supply. The type is the proof (MV-158 §A).
   *  2. `googleName` was a Google-only name on a parameter that THREE providers
   *     now use. MV-147's cost was paid to make Google, the emailed code and the
   *     emailed link converge on one seam; a provider-named parameter is how that
   *     convergence quietly rots.
   */
  user: PersonalCaseSessionUser;
}

/**
 * Why a claim did not succeed, so the sign-in seam can route each to an honest,
 * distinct recovery instead of one catch-all "expired" (MV-130 / audit C-9):
 * - `already-mine`: the row is already owned by THIS user — a re-claim, so it is a
 *   success at the seam (land them on it), not a failure.
 * - `claimed`: bound to ANOTHER account — recover by signing into that account.
 * - `expired`: purged, deleted, or past its 3-day life — nothing left to recover.
 * - `error`: a transient write failure, or a personal case that could not be
 *   resolved — the assessment is still there; retry.
 */
export type ClaimFailureReason = "already-mine" | "claimed" | "expired" | "error";

export interface ClaimAndBootstrapResult {
  claimed: boolean;
  reason?: ClaimFailureReason;
}

/** The display name the profile bootstrap seeds, read off the verified session. */
function sessionName(user: PersonalCaseSessionUser): string | undefined {
  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim().length > 0) return fullName.trim();
  const name = user.user_metadata?.name;
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  return undefined;
}

export async function claimAndBootstrapProfile(
  adminDb: DB,
  input: ClaimAndBootstrapInput,
): Promise<ClaimAndBootstrapResult> {
  const nowIso = new Date().toISOString();
  const userId = input.user.id;

  // STEP 1 — resolve the personal case, BEFORE anything touches the student's
  // row. The ordering is the whole reason the new failure leg is honest: nothing
  // has been written yet, so "try again" is TRUE. The reverse order produces a
  // bound-but-case-less row, which is the single state this card exists to make
  // unreachable.
  //
  // A personal case created here and then not used is explicitly NOT an orphan:
  // it is a per-user singleton the account needs anyway, and creating it is
  // idempotent. Compensating cleanup would add a delete path to the claim seam
  // for no benefit.
  const caseId = await ensurePersonalCase(input.user, adminDb);
  if (caseId === null) {
    console.error("[claim] personal case resolution failed", { userId });
    return { claimed: false, reason: "error" };
  }

  // STEP 2 — the atomic bind. `owner`, `case_id` and `claimed_at` in ONE
  // statement (see `claimAssessment`).
  let ok: boolean;
  try {
    ok = await claimAssessment(adminDb, { id: input.assessmentId, userId, caseId, nowIso });
  } catch (err) {
    // A transient write failure, NOT "no row matched": the assessment is still
    // recoverable, so tell the seam this is retryable rather than gone.
    if (isAssessmentClaimError(err)) return { claimed: false, reason: "error" };
    throw err;
  }
  if (!ok) {
    return { claimed: false, reason: await classifyMiss(adminDb, input.assessmentId, userId, caseId, nowIso) };
  }

  // Read the just-claimed row's snapshot
  const { data } = await adminDb
    .from("assessments")
    .select("profile_snapshot")
    .eq("id", input.assessmentId)
    .maybeSingle();
  const snapshot = (data?.profile_snapshot ?? {}) as Record<string, unknown>;

  // STEP 3 — profile bootstrap, asked PER CASE. A failure here does not fail the
  // claim: the row is already bound and the student is already converted, so
  // reporting failure would be a lie about what happened. It is logged, never
  // swallowed silently.
  //
  // During the dual-key window `profiles.owner` is still UNIQUE, so this must not
  // attempt a second profile row for the same Auth user — it stays a no-op when
  // the row exists, exactly as before.
  const existing = await getProfileForCase(adminDb, caseId);
  if (!existing) {
    const sections = profileSectionsFromAssessment(
      snapshot,
      { name: sessionName(input.user) },
      { nowYear: new Date().getUTCFullYear() },
    );
    const { pct } = computeCompleteness(sections);
    const bootstrapId = await upsertProfileForCase(adminDb, { caseId, sections, completeness: pct });
    if (bootstrapId === null) {
      console.error("[claim] profile bootstrap failed", { caseId, assessmentId: input.assessmentId });
    }
  }

  // STEP 4 — make the just-claimed assessment the primary one (newest-wins).
  //
  // THE DEMOTE MUST SATISFY BOTH LIVE PREDICATES, and it does so in one
  // statement. `assessments_primary_idx (owner) WHERE is_primary` and MV-155's
  // `(case_id) WHERE is_primary` are both live until MV-160 drops the legacy one.
  // Scoping the demote to `case_id` alone is the natural "case-model" rewrite and
  // it re-creates the MV-16 regression EXACTLY: a same-owner primary survives in
  // another case, the promote then trips the surviving owner-keyed index, the
  // error is logged rather than thrown, and the student's dashboard silently
  // keeps showing their first assessment forever.
  //
  // Demote-then-promote ordering is preserved: after the demote the key is free,
  // so the promote cannot collide. Both errors are logged with enough context to
  // say which one failed — a discarded error here is what MV-16 was.
  const { error: demoteError } = await adminDb
    .from("assessments")
    .update({ is_primary: false })
    .or(`owner.eq.${userId},case_id.eq.${caseId}`)
    .eq("is_primary", true);
  if (demoteError) {
    console.error("[claim] demote existing primary failed", { userId, caseId, error: demoteError });
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
  const email = input.user.email;
  if (typeof email === "string" && email.length > 0) {
    try {
      await createLead(adminDb, { email, assessmentId: input.assessmentId });
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
 *
 * It reads through the ADMIN client deliberately: RLS would hide a row owned by
 * another account, which would collapse `claimed` into `expired` and tell a
 * student their assessment was deleted when it is sitting in someone else's.
 */
async function classifyMiss(
  adminDb: DB,
  assessmentId: string,
  userId: string,
  caseId: string,
  nowIso: string,
): Promise<ClaimFailureReason> {
  const state = await getAssessmentClaimState(adminDb, assessmentId, nowIso);
  if (!state) return "expired"; // purged (MV-135) / deleted / never persisted
  if (state.owner === userId) {
    // F2 — the row is theirs but carries no case. HEAL it rather than merely
    // landing them on it: every case-scoped read filters on a column this row
    // does not have, so "success" would still render an empty dashboard. The
    // bulk remedy for any such residue is MV-160 §B's reconciliation sweep; this
    // is the one that fires while the student is standing there.
    if (state.caseId === null) {
      await healAssessmentCase(adminDb, { id: assessmentId, userId, caseId });
    }
    return "already-mine";
  }
  if (state.owner !== null) return "claimed"; // bound to another account
  if (state.expired) return "expired";
  return "error"; // unclaimed & unexpired but the write missed — retryable
}
