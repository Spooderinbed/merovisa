import { NextResponse } from "next/server";
import { ProfileSchema } from "@/lib/validation/profile";
import { assembleAssessment } from "@/lib/results/assemble";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAnonymousAssessment, getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { assessmentExpiry } from "@/lib/assessments/expiry";
import { getProfile, upsertProfile } from "@/lib/profiles/repo";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";
import type { Json } from "@/lib/supabase/types";

const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const payload = assembleAssessment(parsed.data);
  const adminDb = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  let id: string | null = null;
  try {
    if (user) {
      // Signed-in path
      const existingPrimary = await getPrimaryAssessmentForUser(supabase, user.id);
      const { data, error } = await adminDb
        .from("assessments")
        .insert({
          owner: user.id,
          profile_snapshot: parsed.data as unknown as Json,
          destination_id: parsed.data.destination,
          result: payload as unknown as Json,
          rule_version: payload.result.ruleVersion,
          expires_at: FAR_FUTURE,
          is_primary: !existingPrimary,
        })
        .select("id")
        .single();
      if (!error && data) id = data.id;

      const existingProfile = await getProfile(supabase, user.id);
      if (!existingProfile) {
        const googleName = user.user_metadata?.full_name as string | undefined;
        const sections = profileSectionsFromAssessment(parsed.data as unknown as Record<string, unknown>, { name: googleName }, { nowYear: new Date().getUTCFullYear() });
        const { pct } = computeCompleteness(sections);
        await upsertProfile(adminDb, { owner: user.id, sections, completeness: pct });
      }
    } else {
      // Anonymous path
      id = await createAnonymousAssessment(adminDb, {
        profileSnapshot: parsed.data as unknown as Json,
        destinationId: parsed.data.destination,
        result: payload as unknown as Json,
        ruleVersion: payload.result.ruleVersion,
        expiresAt: assessmentExpiry(),
      });
    }
  } catch {
    id = null;
  }

  return NextResponse.json({ id, payload }, { status: 200 });
}
