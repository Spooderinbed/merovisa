import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestedCaseId, resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
import { upsertProgramState, deleteProgramState } from "@/lib/matches/repo";
import { captureApplication } from "@/lib/outcomes/on-apply";

/**
 * MV-157 §G: this route FLIPPED off the service-role client and left the
 * exception list. `user_program_state` already grants `authenticated` full CRUD
 * (`20260604002139` line 84, narrowed to a column list by MV-155 §H), so the
 * admin client here was never load-bearing — the authenticated client on the line
 * below was already doing the auth check while the write went out as service_role.
 *
 * It is the ONLY flip in this card. Every other `legacy-owner-scoped` path needs
 * a grant `authenticated` does not hold (`assessments` SELECT-only;
 * `profiles`/`plan_items`/`documents` no INSERT), and grants are reviewed once,
 * with the policies, in MV-159 — shipping a grant ahead of its policy is how a
 * table ends up briefly open.
 *
 * MV-172, spec F-8 (cell 21): the case is now the one the caller NAMES, when it
 * names one — `resolveTargetCase` authorizes it and never falls back to the
 * actor's own. Without that, the shortlist control rendered in a counsellor's
 * case route writes the student's choices onto the counsellor's personal case,
 * and RLS admits it because the counsellor may legitimately reach that case.
 */

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

  const target = await resolveTargetCase(
    data.user.id,
    requestedCaseId(body),
    "case.update",
    supabase,
  );
  if (!target.ok) return targetCaseResponse(target, "no workspace for this account");
  const { caseId } = target;

  if (parsed.data.status === null) {
    const ok = await deleteProgramState(supabase, caseId, parsed.data.programId);
    return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
  }
  const ok = await upsertProgramState(supabase, {
    caseId,
    programId: parsed.data.programId,
    status: parsed.data.status,
  });
  // MV-08: marking a program 'applied' freezes the prediction-of-record + opens an
  // attempt (the moat capture). Best-effort and idempotent — it must not fail the
  // shortlist write, and it already ran through the RLS-scoped client (S4).
  if (ok && parsed.data.status === "applied") {
    await captureApplication(supabase, caseId, parsed.data.programId);
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
