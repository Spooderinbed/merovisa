import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkCasePermission } from "@/lib/cases/require-permission";
import {
  createCaseDocumentReview,
  getCaseDocumentVersion,
  REVIEW_DECISIONS,
} from "@/lib/cases/document-collaboration-repo";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { malformedPathId } from "@/lib/cases/path-ids";

/**
 * MV-186 — judge one file. Accepted or rejected, with an optional reason.
 *
 * **The gate is `case.documents.request`.** THE CARD'S HEADLINE is that a linked student must
 * not review their own file, and `can_staff_case` is the predicate that says so at the
 * database (`case_document_reviews_insert_staff`, conjunct 1). This claim is its exact
 * counterpart in the permission matrix — `all-org` for owner/admin, `assigned` for a counsellor,
 * `deny` for the student — so gating on `case.read` here would admit the student at the route
 * and leave RLS as the only thing standing between them and reviewing their own passport.
 *
 * **Two values, and no `pending`.** A row exists because somebody decided; "nobody has decided
 * yet" is the ABSENCE of a row, which is a state the derivation already reads correctly. The
 * body is `.strict()`, so `decision: "pending"` is a 422 rather than a silently dropped key.
 *
 * **There is no way to EDIT a review, and that is not an omission.** MV-185 grants no UPDATE and
 * no DELETE on `case_document_reviews` and asserts both absences at apply time. A reviewer who
 * rejected in error corrects it by writing ANOTHER review — the newest one is the judgement,
 * which is what `private.document_request_derived_status` reads and what the UI derives. A PATCH
 * here could only ever raise `42501`.
 *
 * **`case_document_requests.status` is not written here either.** The `after insert` trigger
 * writes it in the same statement as the review, and `guard_document_request_status` refuses a
 * contradicting hand-written value. Accepting the newest version is how a request resolves.
 */

const BodySchema = z
  .object({
    decision: z.enum(REVIEW_DECISIONS),
    // The reason. Read by the linked STUDENT through `_select_actor`, which is the whole point
    // of storing it: "rejected" with no note is a wall. Nullable because an acceptance rarely
    // needs words.
    note: z.string().trim().max(2000).nullish(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string; versionId: string }> },
): Promise<Response> {
  const { caseId, versionId } = await params;

  // FIRST, before a client exists and before any query. BOTH segments.
  const malformedCase = malformedPathId(caseId);
  if (malformedCase) return malformedCase;
  const malformedVersion = malformedPathId(versionId);
  if (malformedVersion) return malformedVersion;

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
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actorUserId = userData.user.id;

  // AUTHORIZE, THEN WRITE. Nothing above touched the repository.
  const { decision } = await checkCasePermission(
    actorUserId,
    caseId,
    "case.documents.request",
    supabase,
  );
  if (!decision.allowed) return caseDenialResponse(decision.reason);

  // The version must exist ON THIS CASE. The INSERT policy's third conjunct
  // (`document_version_case_id(version_id) = case_id`) bounds this independently — without it a
  // review lands on another case's version and resolves another case's request — but its
  // refusal is a `42501` that reads as a permission answer. "No such version here" is a
  // different sentence and deserves its own status.
  const version = await getCaseDocumentVersion(versionId, caseId, supabase);
  if (!version.ok) {
    return NextResponse.json({ error: "Could not load the file" }, { status: 500 });
  }
  if (version.data === null) {
    return NextResponse.json({ error: "No such file on this case" }, { status: 404 });
  }

  const result = await createCaseDocumentReview(
    actorUserId,
    caseId,
    versionId,
    { decision: parsed.data.decision, note: parsed.data.note ?? null },
    supabase,
  );
  if (result.ok) return NextResponse.json({ ok: true, id: result.id }, { status: 201 });

  // Each reason tells the person something different about what to do next. `denied` and
  // `write-failed` must never collapse: one means "ask someone", the other "try again".
  switch (result.reason) {
    case "unknown-case":
      return NextResponse.json({ error: "No such case", reason: result.reason }, { status: 404 });
    case "not-an-org-case":
    case "invalid-input":
      return NextResponse.json({ error: "Validation failed", reason: result.reason }, { status: 422 });
    case "denied":
      // Also how RLS refuses a LINKED STUDENT who reached this route directly: they hold
      // `case.read`, so a route gated on that claim would arrive here and be stopped only by
      // `can_staff_case`. The claim above is what stops them first.
      return NextResponse.json({ error: "Forbidden", reason: result.reason }, { status: 403 });
    default:
      return NextResponse.json(
        { error: "Could not save the review", reason: result.reason },
        { status: 500 },
      );
  }
}
