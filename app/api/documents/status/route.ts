import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { DocumentStatusSchema } from "@/lib/validation/documents";
import { setObtained } from "@/lib/documents/status-repo";

// POST /api/documents/status — toggle a document kind's "obtained" state for the
// signed-in student's case (MV-53, global checklist). Independent of uploads.
//
// This route has always run on the AUTHENTICATED client, which is why the
// `document_status` upsert seam is the most load-bearing one in Stage 2: an
// unusable conflict arbiter or a `case_id` in the payload takes the live
// checklist down rather than failing some future flip (spec §4.6).
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

  const caseId = await resolvePersonalCaseId(data.user.id, supabase);
  if (caseId === null) {
    return NextResponse.json({ error: "no workspace for this account" }, { status: 500 });
  }
  const { decision } = await checkCasePermission(data.user.id, caseId, "case.update", supabase);
  if (!decision.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
