import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;
export type AssessmentRow = Database["public"]["Tables"]["assessments"]["Row"];

export interface NewAssessment {
  profile: Json;
  result: Json;
  ruleVersion: string;
  expiresAt: string;
}

export async function createAnonymousAssessment(db: DB, input: NewAssessment): Promise<string | null> {
  const { data, error } = await db
    .from("assessments")
    .insert({
      owner: null,
      profile: input.profile,
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
