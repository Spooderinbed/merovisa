import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestedCaseId, resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
import { PredictionInputSchema } from "@/lib/validation/outcomes";
import { freezePredictionForProgram } from "@/lib/outcomes/freeze";

// POST /api/outcomes/prediction — freeze the per-program verdict (F16).
// Body names the program and, in a case route, the case (MV-172, spec F-8, cell
// 23 — authorized by `resolveTargetCase`, never trusted); the assessment and the
// verdict stay server-derived.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PredictionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = await resolveTargetCase(
    data.user.id,
    requestedCaseId(body),
    "case.update",
    supabase,
  );
  if (!target.ok) return targetCaseResponse(target, "no workspace for this account");

  const result = await freezePredictionForProgram(supabase, target.caseId, parsed.data.programId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(
    { ok: true, prediction: result.prediction },
    { status: result.created ? 201 : 200 },
  );
}
