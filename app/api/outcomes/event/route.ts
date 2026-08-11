import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestedCaseId, resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
import { EventInputSchema } from "@/lib/validation/outcomes";
import { eventDecisionAuthority, eventGate } from "@/lib/outcomes/events";
import { canRecordEvent } from "@/lib/outcomes/state-machine";
import { getAttemptById, insertEvent, listEventTypesForAttempt } from "@/lib/outcomes/repo";

// POST /api/outcomes/event — append a funnel event (append-only, B2/B3).
// gate, decision authority, and source are derived server-side; the legal-ordering
// guard (S7) rejects illegal transitions; self-reports are stamped self_reported.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = EventInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Authorize BEFORE the first query — a denial costs zero reads. MV-172, spec
  // F-8 (cell 23): the case may be NAMED by the caller, and is authorized either
  // way; a named one is never substituted by the actor's own.
  const target = await resolveTargetCase(
    data.user.id,
    requestedCaseId(body),
    "case.update",
    supabase,
  );
  if (!target.ok) return targetCaseResponse(target, "no workspace for this account");
  const { caseId } = target;

  // Both reads are scoped to the case authorized above. The attempt id is
  // client-supplied, and `prior` is what the state machine treats as "this has
  // not happened yet" — an unscoped empty answer re-files an event the student
  // already filed.
  const attempt = await getAttemptById(supabase, parsed.data.attemptId, caseId);
  if (!attempt) return NextResponse.json({ error: "unknown attempt" }, { status: 404 });

  const prior = await listEventTypesForAttempt(supabase, parsed.data.attemptId, caseId);
  const guard = canRecordEvent(prior, parsed.data.eventType);
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  const event = await insertEvent(supabase, {
    caseId,
    attemptId: parsed.data.attemptId,
    eventType: parsed.data.eventType,
    gate: eventGate(parsed.data.eventType),
    decisionAuthority: eventDecisionAuthority(parsed.data.eventType),
    source: "self_reported",
    reasonCode: parsed.data.reasonCode ?? null,
    occurredAt: parsed.data.occurredAt,
    occurredOn: parsed.data.occurredOn ?? null,
    detail: parsed.data.detail ?? {},
  });
  if (!event) return NextResponse.json({ error: "could not record the event" }, { status: 500 });
  return NextResponse.json({ ok: true, event }, { status: 201 });
}
