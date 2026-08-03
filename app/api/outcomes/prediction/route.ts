import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { PredictionInputSchema } from "@/lib/validation/outcomes";
import { freezePredictionForProgram } from "@/lib/outcomes/freeze";

// POST /api/outcomes/prediction — freeze the per-program verdict (F16).
// Body names only the program; case + assessment + verdict are server-derived.
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

  const caseId = await resolvePersonalCaseId(data.user.id, supabase);
  if (caseId === null) {
    return NextResponse.json({ error: "no workspace for this account" }, { status: 500 });
  }
  const { decision } = await checkCasePermission(data.user.id, caseId, "case.update", supabase);
  if (!decision.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await freezePredictionForProgram(supabase, caseId, parsed.data.programId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(
    { ok: true, prediction: result.prediction },
    { status: result.created ? 201 : 200 },
  );
}
