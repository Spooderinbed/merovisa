import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { resolveCaseDocumentRequest } from "@/lib/cases/document-requests-repo";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { malformedPathId } from "@/lib/cases/path-ids";

/**
 * MV-182 — mark one document request resolved.
 *
 * **BOTH ids are path segments, and both travel to the repository.** That is the
 * whole safety property of this route. `case_document_requests_update_staff` holds
 * the tenant boundary, but a counsellor staffs several cases legitimately — so a
 * request id from case B, submitted while the caller was authorized for case A, is
 * a row the policy happily admits. It returns 200 and moves the wrong student's
 * chase list, with no status anyone could assert on. The `case_id` filter in
 * `resolveCaseDocumentRequest` is what stops it, and spec F-8 is the finding that
 * names this class.
 *
 * **The body carries one transition, not a status field.** `{"status":"resolved"}`
 * is the only accepted value: re-opening is not a verb this slice ships, and a
 * route that forwarded an arbitrary status would be a general write surface onto a
 * column whose grant exists for exactly one purpose. The database would still
 * refuse anything outside the check constraint — but "the constraint caught it" is
 * not the same as "the route only ever offered what it meant to".
 */

const BodySchema = z.object({ status: z.literal("resolved") }).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseId: string; requestId: string }> },
): Promise<Response> {
  const { caseId, requestId } = await params;

  // FIRST, before a client exists and before any query. BOTH segments: a malformed
  // request id would otherwise reach Postgres as a `22P02` inside the update and be
  // reported as an outage rather than as the malformed request it is.
  const malformedCase = malformedPathId(caseId);
  if (malformedCase) return malformedCase;
  const malformedRequest = malformedPathId(requestId);
  if (malformedRequest) return malformedRequest;

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

  // The same claim the create route asks for, and for the same reason: resolving is
  // a consultancy act on a consultancy record. `case.read` would admit the student.
  const { decision } = await checkCasePermission(
    data.user.id,
    caseId,
    "case.documents.request",
    supabase,
  );
  if (!decision.allowed) return caseDenialResponse(decision.reason);

  const result = await resolveCaseDocumentRequest(requestId, caseId, supabase);
  if (result.ok) return NextResponse.json({ ok: true });

  switch (result.reason) {
    case "invalid-input":
      return NextResponse.json({ error: "Validation failed", reason: result.reason }, { status: 422 });
    case "denied":
      // Also how "no such request on THIS case" arrives: a policy refusal and a
      // failed `case_id` filter are both zero rows. Neither is a success, and
      // neither earns a sentence claiming the request exists somewhere else.
      return NextResponse.json({ error: "Forbidden", reason: result.reason }, { status: 403 });
    default:
      return NextResponse.json(
        { error: "Could not update the request", reason: result.reason },
        { status: 500 },
      );
  }
}
