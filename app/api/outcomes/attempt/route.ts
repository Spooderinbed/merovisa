import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestedCaseId, resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
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
  // defect this ordering catches is "authorized after reading". MV-172, spec F-8
  // (cell 23): the case may be NAMED by the caller, and is authorized either way.
  const target = await resolveTargetCase(
    data.user.id,
    requestedCaseId(body),
    "case.update",
    supabase,
  );
  if (!target.ok) return targetCaseResponse(target, "no workspace for this account");
  const { caseId } = target;

  // Scoped to the case that was just authorized, not merely to whatever the
  // legacy owner policy happens to admit: the prediction id is client-supplied,
  // so the read must live inside the same boundary the check above established.
  const prediction = await getPredictionById(supabase, parsed.data.predictionId, caseId);
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
