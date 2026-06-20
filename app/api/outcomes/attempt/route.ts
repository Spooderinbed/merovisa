import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const prediction = await getPredictionById(supabase, parsed.data.predictionId);
  if (!prediction) return NextResponse.json({ error: "unknown prediction" }, { status: 404 });

  const attempt = await insertAttempt(supabase, {
    owner: data.user.id,
    predictionId: prediction.id,
    programId: prediction.programId,
    institutionId: parsed.data.institutionId,
    intake: parsed.data.intake,
    externalRef: parsed.data.externalRef,
  });
  if (!attempt) return NextResponse.json({ error: "could not open the attempt" }, { status: 500 });
  return NextResponse.json({ ok: true, attempt }, { status: 201 });
}
