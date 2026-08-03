import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { AttemptInputSchema } from "@/lib/validation/outcomes";
import { getPredictionById, insertAttempt } from "@/lib/outcomes/repo";

// POST /api/outcomes/attempt — open an application attempt against a frozen
// prediction. program_id is taken from the prediction (not the client) so the
// attempt can't drift from what was predicted.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = AttemptInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Authorize BEFORE the first query. A denial here must cost zero reads — the
  // defect this ordering catches is "authorized after reading".
  const caseId = await resolvePersonalCaseId(data.user.id, supabase);
  if (caseId === null) {
    return NextResponse.json({ error: "no workspace for this account" }, { status: 500 });
  }
  const { decision } = await checkCasePermission(data.user.id, caseId, "case.update", supabase);
  if (!decision.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const prediction = await getPredictionById(supabase, parsed.data.predictionId);
  if (!prediction) return NextResponse.json({ error: "unknown prediction" }, { status: 404 });

  const attempt = await insertAttempt(supabase, {
    caseId,
    predictionId: prediction.id,
    programId: prediction.programId,
    institutionId: parsed.data.institutionId,
    intake: parsed.data.intake,
    externalRef: parsed.data.externalRef,
  });
  if (!attempt) return NextResponse.json({ error: "could not open the attempt" }, { status: 500 });
  return NextResponse.json({ ok: true, attempt }, { status: 201 });
}
