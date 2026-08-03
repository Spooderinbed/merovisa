import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { reScoreAssessment } from "@/lib/assessments/re-score";

/**
 * MV-17: re-assess in place for signed-in users.
 *
 * A logged-in user who wants to re-check their chances should recompute their
 * EXISTING primary assessment from their current profile — not run the anonymous
 * wizard again, which mints a parallel `assessments` row (the duplicate-row
 * accretion this card fixes). This route re-scores the primary in place and
 * returns its id so the client can land on /assessment/{id}.
 *
 * Scoring stays server-side (F16): reScoreAssessment owns the recompute + write;
 * we never ship scoring rules or result internals to client JS.
 */
export async function POST(): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const caseId = await resolvePersonalCaseId(data.user.id, supabase);
  if (caseId === null) {
    return NextResponse.json({ redirect: "/assess?new=1" }, { status: 409 });
  }
  const { decision } = await checkCasePermission(data.user.id, caseId, "case.update", supabase);
  if (!decision.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const primary = await getPrimaryAssessmentForCase(supabase, caseId);
  if (!primary) {
    // No primary to refresh (e.g. it was deleted, or this is a stale interstitial).
    // Don't 500 — point the client at the wizard to build one.
    return NextResponse.json({ redirect: "/assess?new=1" }, { status: 409 });
  }

  const admin = createSupabaseAdminClient();
  try {
    await reScoreAssessment(admin, caseId);
  } catch (err) {
    console.error("[/api/assess/refresh] reScoreAssessment failed", err);
    return NextResponse.json({ error: "Couldn't refresh your assessment" }, { status: 500 });
  }

  return NextResponse.json({ id: primary.id }, { status: 200 });
}
