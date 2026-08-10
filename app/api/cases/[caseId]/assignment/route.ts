import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { assignPrimaryCounsellor } from "@/lib/cases/write-repo";
import { caseDenialResponse } from "@/lib/cases/route-denial";

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

const BodySchema = z.object({ membershipId: z.string().trim().min(1) }).strict();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await params;

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

  // Every reason gets its own status, because every one of them tells the person
  // something different about what to do next.
  switch (result.reason) {
    case "unknown-member":
      return NextResponse.json(
        { error: "No such member in this organization" },
        { status: 404 },
      );
    case "unknown-case":
      return NextResponse.json({ error: "No such case" }, { status: 404 });
    case "member-inactive":
      return NextResponse.json(
        { error: "That person's access to this organization has been switched off" },
        { status: 409 },
      );
    case "not-an-org-case":
    case "invalid-input":
      return NextResponse.json({ error: "Validation failed" }, { status: 422 });
    case "denied":
      return NextResponse.json({ error: "Forbidden", reason: "denied" }, { status: 403 });
    default:
      // `leftUnassigned` travels with the failure. The unique index forces
      // delete-then-insert, so "the previous counsellor was removed and the new
      // one was not added" is a state the case can genuinely be in — and an admin
      // who is told only "that didn't work" will not know to reassign.
      return NextResponse.json(
        { error: "Could not save the assignment", leftUnassigned: result.leftUnassigned },
        { status: 500 },
      );
  }
}
