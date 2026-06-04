import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { patchProfileSection } from "@/lib/profiles/repo";
import { ProfileSectionPatchBodySchema } from "@/lib/validation/profile-section";
import { invalidatePlan } from "@/lib/plan/invalidate";
import { reScoreAssessment } from "@/lib/assessments/re-score";

export async function PATCH(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ProfileSectionPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const admin = createSupabaseAdminClient();
  const result = await patchProfileSection(admin, data.user.id, parsed.data.section, parsed.data.patch);
  try {
    await invalidatePlan(admin, data.user.id);
  } catch (err) {
    console.error("[profile/section] invalidatePlan failed", err);
  }
  try {
    await reScoreAssessment(admin, data.user.id);
  } catch (err) {
    console.error("[profile/section] reScoreAssessment failed", err);
  }
  return NextResponse.json({ ok: true, completeness: result.completeness }, { status: 200 });
}
