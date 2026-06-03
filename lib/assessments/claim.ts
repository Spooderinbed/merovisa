import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { claimAssessment } from "./repo";
import { getProfile, upsertProfile } from "@/lib/profiles/repo";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";

type DB = SupabaseClient<Database>;

export interface ClaimAndBootstrapInput {
  assessmentId: string;
  userId: string;
  googleName?: string;
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

  return { claimed: true };
}
