import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { setCaseOperationalStatus } from "@/lib/cases/write-repo";
import { OPERATIONAL_STATUSES } from "@/lib/cases/operational-status";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { malformedPathId } from "@/lib/cases/path-ids";

/**
 * Access-matrix cell 10 — move a case through its five operational statuses.
 *
 * **`case.update` is CASE-scoped.** Cell 10 gives an assigned counsellor this
 * verb, which is a fact about one case rather than about the organization, so the
 * org entry point would answer a different question.
 *
 * **The column is guarded by a TRIGGER, not by RLS.** `cases_update_accessor`
 * admits the linked student; `enforce_case_write_surface` is what refuses them
 * (`…20260730180000….sql:497-501`). This route's TypeScript check is defense in
 * depth on top of that, never a replacement for it.
 *
 * `archived_at` is the other column that trigger guards, and it is **not** here:
 * archiving is Stage 6. `.strict()` is what makes that refusal explicit rather
 * than incidental.
 */

const BodySchema = z.object({ operationalStatus: z.enum(OPERATIONAL_STATUSES) }).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await params;

  // FIRST, before a client exists and before any query — see `lib/cases/path-ids.ts`.
  const malformed = malformedPathId(caseId);
  if (malformed) return malformed;

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

  const { decision } = await checkCasePermission(data.user.id, caseId, "case.update", supabase);
  if (!decision.allowed) return caseDenialResponse(decision.reason);

  const result = await setCaseOperationalStatus(caseId, parsed.data.operationalStatus, supabase);
  if (!result.ok) {
    if (result.reason === "denied") {
      return NextResponse.json({ error: "Forbidden", reason: "denied" }, { status: 403 });
    }
    if (result.reason === "invalid-input") {
      return NextResponse.json({ error: "Validation failed" }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not save the status" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
