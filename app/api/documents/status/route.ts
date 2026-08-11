import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestedCaseId, resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
import { DocumentStatusSchema } from "@/lib/validation/documents";
import { setObtained } from "@/lib/documents/status-repo";

// POST /api/documents/status — toggle a document kind's "obtained" state on a
// case (MV-53, global checklist). Independent of uploads.
//
// This route has always run on the AUTHENTICATED client, which is why the
// `document_status` upsert seam is the most load-bearing one in Stage 2: an
// unusable conflict arbiter or a `case_id` in the payload takes the live
// checklist down rather than failing some future flip (spec §4.6).
//
// MV-172, spec F-8 (cell 22): the case is the one the caller NAMES when it names
// one, authorized by `resolveTargetCase`, and the signed-in student's own
// otherwise. A counsellor ticking a box in a case route must not tick it on their
// own checklist — and RLS cannot tell the difference, because their own case is
// one they may legitimately reach.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = DocumentStatusSchema.safeParse(body);
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

  // `ok: true` must mean the tick was STORED. `setObtained` has two ways to
  // decline — a case with no `student_user_id`, and a PostgREST error — and both
  // used to return `void` into a 200, so the checklist rendered a tick that was
  // gone on the next reload.
  const stored = await setObtained(supabase, caseId, parsed.data.kind, parsed.data.obtained);
  if (!stored) {
    return NextResponse.json({ error: "Couldn't save your checklist" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
