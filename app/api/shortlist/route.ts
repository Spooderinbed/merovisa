import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { upsertProgramState, deleteProgramState } from "@/lib/matches/repo";
import { captureApplication } from "@/lib/outcomes/on-apply";

const BodySchema = z.object({
  programId: z.string().min(1),
  status: z.enum(["shortlisted", "applied", "withdrawn"]).nullable(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (parsed.data.status === null) {
    const ok = await deleteProgramState(admin, data.user.id, parsed.data.programId);
    return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
  }
  const ok = await upsertProgramState(admin, {
    owner: data.user.id,
    programId: parsed.data.programId,
    status: parsed.data.status,
  });
  // MV-08: marking a program 'applied' freezes the prediction-of-record + opens an
  // attempt (the moat capture). Best-effort and idempotent — it must not fail the
  // shortlist write, and it runs through the RLS-scoped client (S4), not admin.
  if (ok && parsed.data.status === "applied") {
    await captureApplication(supabase, data.user.id, parsed.data.programId);
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
