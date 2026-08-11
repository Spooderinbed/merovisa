import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { assignPrimaryCounsellor } from "@/lib/cases/write-repo";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { malformedPathId } from "@/lib/cases/path-ids";

/**
 * Access-matrix cell 9 — put one member into the case's single primary-counsellor
 * slot.
 *
 * **PUT, not POST, and that is the honest verb.** `case_assignments_primary_idx`
 * is `UNIQUE (case_id) WHERE assignment_role = 'primary_counsellor'`, so this
 * request sets the slot to a value rather than adding to a collection — the same
 * request twice is the same state, which is what PUT promises (spec §2.5).
 *
 * **F-1, decided by the founder on 2026-08-10: owner/admin only.**
 * `CASE_PERMISSION_MATRIX.counsellor["case.assign"]` stays `deny` and
 * `case_assignments_insert_admin` stays as it is. This route widens neither.
 *
 * **The body carries a membership id, never an Auth user id.** The picker that
 * calls it cannot show names (spec F-9), so it identifies members by their
 * membership row, and the repository resolves membership → user id on the server.
 * That keeps a raw Auth user id out of the markup, exactly as MV-170 kept
 * `student_user_id` out of the student list — and it keeps the resolution scoped
 * to the case's own organization.
 */

/**
 * `organization_memberships.id` is a `uuid` column, so a uuid is what this field
 * actually is — a non-empty string was as much validation as "any text at all",
 * and the repository would have spent a query discovering that.
 */
const BodySchema = z.object({ membershipId: z.uuid() }).strict();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await params;

  // FIRST, before a client exists and before any query. A malformed segment is not
  // an outage and not a permission answer — see `lib/cases/path-ids.ts`.
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

  const { decision } = await checkCasePermission(data.user.id, caseId, "case.assign", supabase);
  if (!decision.allowed) return caseDenialResponse(decision.reason);

  const result = await assignPrimaryCounsellor(caseId, parsed.data.membershipId, supabase);
  if (result.ok) return NextResponse.json({ ok: true, changed: result.changed });

  /**
   * `leftUnassigned` travels with EVERY failure, not with the ones that happen to
   * be able to set it.
   *
   * That distinction was the defect. The unique index forces delete-then-insert, so
   * "the previous counsellor was removed and the new one was not added" is a state
   * the case can genuinely be in — and the branch that reaches it is not only the
   * 500. `writeFailure()` maps a `42501` on the REPLACEMENT INSERT to `denied`, and
   * that insert runs *after* the delete has landed, so `denied` +
   * `leftUnassigned: true` is reachable. The 403 branch dropped the flag, which
   * meant the one state the flag exists to report was exactly the state that never
   * reached the caller: the case had no counsellor and the admin was told only
   * "not allowed".
   *
   * Uniform rather than case-by-case because `false` is a true answer to "did this
   * request leave the case unassigned?", and a flag present on some branches and
   * absent on others is one refactor away from going missing on the branch that
   * needed it.
   */
  const withUnassigned = (fields: Record<string, unknown>) => ({
    ...fields,
    leftUnassigned: result.leftUnassigned,
  });

  // Every reason gets its own status, because every one of them tells the person
  // something different about what to do next.
  switch (result.reason) {
    case "unknown-member":
      return NextResponse.json(
        withUnassigned({ error: "No such member in this organization", reason: "unknown-member" }),
        { status: 404 },
      );
    case "unknown-case":
      return NextResponse.json(withUnassigned({ error: "No such case", reason: "unknown-case" }), {
        status: 404,
      });
    case "member-inactive":
      return NextResponse.json(
        withUnassigned({
          error: "That person's access to this organization has been switched off",
          // Two conflicts share 409, so the REASON is what tells them apart. A
          // client that re-derived a sentence from the status alone would tell an
          // admin who lost a race to go and reactivate somebody who is active.
          reason: "member-inactive",
        }),
        { status: 409 },
      );
    case "reassignment-conflict":
      return NextResponse.json(
        withUnassigned({
          error: "Somebody else changed this student's counsellor",
          reason: "reassignment-conflict",
        }),
        { status: 409 },
      );
    case "not-an-org-case":
    case "invalid-input":
      return NextResponse.json(withUnassigned({ error: "Validation failed", reason: result.reason }), {
        status: 422,
      });
    case "denied":
      return NextResponse.json(withUnassigned({ error: "Forbidden", reason: "denied" }), { status: 403 });
    default:
      return NextResponse.json(
        withUnassigned({ error: "Could not save the assignment", reason: result.reason }),
        { status: 500 },
      );
  }
}
