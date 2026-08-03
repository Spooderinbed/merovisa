import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { patchProfileSectionForCase } from "@/lib/profiles/repo";
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

  // Resolve and authorize through the AUTHENTICATED client — the case check must
  // not be evaluated by a client that bypasses RLS. Only the write below uses
  // service-role, and only because `profiles` grants `authenticated` no INSERT
  // (spec §4.1); that flip waits for MV-159's grant review.
  //
  // `requireCasePermission` is not a field allowlist (MV-153 Finding 1): on a
  // personal case the actor IS the data subject, so the whole profile surface is
  // legitimately theirs, but the Zod payload validation above stays the guard on
  // WHICH fields move.
  const caseId = await resolvePersonalCaseId(data.user.id, supabase);
  if (caseId === null) {
    return NextResponse.json({ error: "Couldn't save your profile" }, { status: 500 });
  }
  const { decision } = await checkCasePermission(data.user.id, caseId, "case.update", supabase);
  if (!decision.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createSupabaseAdminClient();
  let result;
  try {
    result = await patchProfileSectionForCase(admin, caseId, parsed.data.section, parsed.data.patch);
  } catch (err) {
    console.error("[profile/section] patchProfileSectionForCase failed", { caseId, section: parsed.data.section, err });
    return NextResponse.json({ error: "Couldn't save your profile" }, { status: 500 });
  }
  try {
    await invalidatePlan(admin, caseId);
  } catch (err) {
    console.error("[profile/section] invalidatePlan failed", err);
  }
  try {
    await reScoreAssessment(admin, caseId);
  } catch (err) {
    console.error("[profile/section] reScoreAssessment failed", err);
  }
  return NextResponse.json({ ok: true, completeness: result.completeness }, { status: 200 });
}
