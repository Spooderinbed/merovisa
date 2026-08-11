import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import { createOrgCase } from "@/lib/cases/write-repo";
import { malformedPathId } from "@/lib/cases/path-ids";

/**
 * Access-matrix cell 8 — create a case for a student who has no account.
 *
 * **`case.create` is ORG-scoped** (`lib/cases/permissions.ts:89-95`), and it has
 * to be: creation is the one verb that precedes the row it acts on, so there is
 * no case id to authorize against. `decideOrgPermission` re-checks that split at
 * runtime, so a case-scoped claim cast into this entry point denies rather than
 * borrowing an org membership to answer a question about one case.
 *
 * **F-1, decided by the founder on 2026-08-10: this is an owner/admin surface.**
 * `CASE_PERMISSION_MATRIX.counsellor["case.create"]` stays `deny` and
 * `cases_insert_admin` stays as MV-159 left it. This route widens neither; it is
 * the caller of a decision both layers already make.
 *
 * Gate order, and it is the property `tests/api/case-routes.test.ts` pins:
 * **validate, authenticate, authorize, then write.** Every denial asserts the
 * repository was never reached.
 */

/**
 * Exactly the two fields a staff-created case carries. `.strict()` is
 * load-bearing: a payload naming `studentUserId` or `operationalStatus` is
 * refused here rather than silently dropped, so a client cannot believe it set
 * something it did not. Linking a student is Stage 5's, and the status column
 * takes its `'new'` default.
 */
const BodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  const { organizationId } = await params;

  // FIRST, before a client exists and before any query — see `lib/cases/path-ids.ts`.
  const malformed = malformedPathId(organizationId);
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

  const { decision } = await checkOrgPermission(
    data.user.id,
    organizationId,
    "case.create",
    supabase,
  );
  if (!decision.allowed) {
    // "We could not tell" and "you may not" must not render the same.
    if (decision.reason === "lookup-failed") {
      return NextResponse.json({ error: "Could not check your access" }, { status: 500 });
    }
    return NextResponse.json({ error: "Forbidden", reason: decision.reason }, { status: 403 });
  }

  const result = await createOrgCase(
    data.user.id,
    organizationId,
    { displayName: parsed.data.displayName, email: parsed.data.email },
    supabase,
  );
  if (!result.ok) {
    if (result.reason === "denied") {
      return NextResponse.json({ error: "Forbidden", reason: "denied" }, { status: 403 });
    }
    if (result.reason === "invalid-input") {
      return NextResponse.json({ error: "Validation failed" }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not create the student" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, caseId: result.caseId });
}
