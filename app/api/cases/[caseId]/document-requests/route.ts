import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { createCaseDocumentRequest } from "@/lib/cases/document-requests-repo";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { malformedPathId } from "@/lib/cases/path-ids";
import { DOCUMENT_KINDS } from "@/lib/documents/types";

/**
 * MV-182 — ask this case for one document.
 *
 * **The gate is `case.documents.request`, and NOT `case.read`.** They answer
 * differently for the same person: the linked student holds `case.read` at `linked`
 * and holds this claim not at all. A route that gated a consultancy write on the
 * read claim would let a student mint requests against their own case — the
 * database refuses independently (`can_staff_case`), but a route relying on that
 * has stopped authorizing and would ship the wrong 403/200 to every caller.
 *
 * **Authorize, then write.** Nothing here touches the repository before the
 * decision, which is the property `tests/api/document-request-routes.test.ts` pins
 * and which a "load it first, check it after" refactor breaks silently.
 *
 * **The case comes from the PATH.** Spec F-8: a case-scoped write route that
 * resolves the ACTOR's own case writes to the counsellor's file instead of the
 * student's, and RLS cannot catch it because the counsellor may legitimately reach
 * both.
 *
 * **`status`, `requestedBy` and `resolvedAt` are not fields this body has.** The
 * schema is `.strict()`, so sending one is a 422 rather than a silently ignored
 * key: a request is created outstanding, its provenance is the session, and its
 * resolution time is the database's. All three are refused again at the grant.
 */

const BodySchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    // The DB column is `text not null`; a title of spaces is not a title, and the
    // repository would refuse it after a round trip.
    title: z.string().trim().min(1).max(200),
    note: z.string().trim().max(2000).nullish(),
    // An ISO instant or nothing. A due date is optional — plenty of asks are "when
    // you can" — and an unparseable one is a bug, not a date.
    dueAt: z.iso.datetime().nullish(),
  })
  .strict();

export async function POST(
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

  const { decision } = await checkCasePermission(
    data.user.id,
    caseId,
    "case.documents.request",
    supabase,
  );
  if (!decision.allowed) return caseDenialResponse(decision.reason);

  const result = await createCaseDocumentRequest(
    data.user.id,
    caseId,
    {
      kind: parsed.data.kind,
      title: parsed.data.title,
      note: parsed.data.note ?? null,
      dueAt: parsed.data.dueAt ?? null,
    },
    supabase,
  );
  if (result.ok) return NextResponse.json({ ok: true, id: result.id }, { status: 201 });

  // Each reason tells the person something different about what to do next, so each
  // gets its own status. `denied` and `write-failed` must never collapse: one means
  // "ask someone", the other "try again".
  switch (result.reason) {
    case "unknown-case":
      return NextResponse.json({ error: "No such case", reason: result.reason }, { status: 404 });
    case "not-an-org-case":
    case "invalid-input":
      return NextResponse.json({ error: "Validation failed", reason: result.reason }, { status: 422 });
    case "denied":
      return NextResponse.json({ error: "Forbidden", reason: result.reason }, { status: 403 });
    default:
      return NextResponse.json(
        { error: "Could not save the request", reason: result.reason },
        { status: 500 },
      );
  }
}
