import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getSignedDocumentUrl } from "@/lib/documents/repo";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 422 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorize the CASE before minting anything. The mint itself and the at-mint
  // audit event stay Stage 4; what MV-157 §C requires here is that the signed URL
  // is never minted for a case the actor has no `case.read` on.
  const caseId = await resolvePersonalCaseId(userData.user.id, supabase);
  if (caseId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { decision } = await checkCasePermission(userData.user.id, caseId, "case.read", supabase);
  if (!decision.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // User-scoped client respects RLS; the case_id filter is what selects the row.
  const { data: doc } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", id)
    .eq("case_id", caseId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const url = await getSignedDocumentUrl(admin, doc.file_path, 60); // 60 seconds
  if (!url) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  return NextResponse.json({ url });
}
