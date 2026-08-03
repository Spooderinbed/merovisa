import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getOutcomesForCase } from "@/lib/outcomes/repo";

// GET /api/outcomes — the case's full outcome history.
//
// MV-157: the actor comes from `supabase.auth.getUser()` on the server, the case
// is resolved from it, and `case.read` is authorized BEFORE the first query — not
// after it, and never from a body, query param, header, or prop.
export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const caseId = await resolvePersonalCaseId(data.user.id, supabase);
  // No personal case means no case-scoped rows exist to return, which is what a
  // brand-new account looks like too — so an empty history is the honest answer
  // rather than an error.
  if (caseId === null) {
    return NextResponse.json({ ok: true, predictions: [], attempts: [], events: [] }, { status: 200 });
  }
  const { decision } = await checkCasePermission(data.user.id, caseId, "case.read", supabase);
  if (!decision.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const outcomes = await getOutcomesForCase(supabase, caseId);
  return NextResponse.json({ ok: true, ...outcomes }, { status: 200 });
}
