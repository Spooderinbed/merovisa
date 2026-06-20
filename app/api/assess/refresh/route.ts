import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
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

  const primary = await getPrimaryAssessmentForUser(supabase, data.user.id);
  if (!primary) {
    // No primary to refresh (e.g. it was deleted, or this is a stale interstitial).
    // Don't 500 — point the client at the wizard to build one.
    return NextResponse.json({ redirect: "/assess?new=1" }, { status: 409 });
  }

  const admin = createSupabaseAdminClient();
  try {
    await reScoreAssessment(admin, data.user.id);
  } catch (err) {
    console.error("[/api/assess/refresh] reScoreAssessment failed", err);
    return NextResponse.json({ error: "Couldn't refresh your assessment" }, { status: 500 });
  }

  return NextResponse.json({ id: primary.id }, { status: 200 });
}
