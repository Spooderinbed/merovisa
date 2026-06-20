import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { claimAssessment, createLead } from "./repo";
import { getProfile, upsertProfile } from "@/lib/profiles/repo";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";

type DB = SupabaseClient<Database>;

export interface ClaimAndBootstrapInput {
  assessmentId: string;
  userId: string;
  googleName?: string;
  email?: string;
}

export interface ClaimAndBootstrapResult {
  claimed: boolean;
}

export async function claimAndBootstrapProfile(
  adminDb: DB,
  input: ClaimAndBootstrapInput,
): Promise<ClaimAndBootstrapResult> {
  const ok = await claimAssessment(adminDb, {
    id: input.assessmentId,
    userId: input.userId,
    nowIso: new Date().toISOString(),
  });
  if (!ok) return { claimed: false };

  // Read the just-claimed row's snapshot
  const { data } = await adminDb
    .from("assessments")
    .select("profile_snapshot")
    .eq("id", input.assessmentId)
    .maybeSingle();
  const snapshot = (data?.profile_snapshot ?? {}) as Record<string, unknown>;

  // Skip if profile already exists
  const existing = await getProfile(adminDb, input.userId);
  if (!existing) {
    const sections = profileSectionsFromAssessment(snapshot, { name: input.googleName }, { nowYear: new Date().getUTCFullYear() });
    const { pct } = computeCompleteness(sections);
    await upsertProfile(adminDb, { owner: input.userId, sections, completeness: pct });
  }

  // Mark is_primary unless the user already has one
  await adminDb
    .from("assessments")
    .update({ is_primary: true })
    .eq("id", input.assessmentId)
    .is("is_primary", false);

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
