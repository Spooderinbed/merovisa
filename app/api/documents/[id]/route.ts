import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { listDocumentsByKindsForCase } from "@/lib/documents/repo";
import { getFlagForKind } from "@/lib/documents/flags";
import { patchProfileSectionForCase } from "@/lib/profiles/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import type { DocumentKind } from "@/lib/documents/types";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;

  // Authorize the case BEFORE reading the row, then scope the read by case_id.
  const caseId = await resolvePersonalCaseId(userId, supabase);
  if (caseId === null) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  const { decision } = await checkCasePermission(userId, caseId, "case.update", supabase);
  if (!decision.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("case_id", caseId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();

  const { error: storageErr } = await admin.storage.from("documents").remove([doc.file_path]);
  if (storageErr) {
    console.error("[documents/delete] storage remove failed", { id, caseId, err: storageErr });
    return NextResponse.json({ error: "Couldn't delete the file" }, { status: 500 });
  }
  const { error: deleteErr } = await admin
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("case_id", caseId);
  if (deleteErr) {
    console.error("[documents/delete] documents row delete failed", { id, caseId, err: deleteErr });
    return NextResponse.json({ error: "Couldn't delete the document" }, { status: 500 });
  }

  const docKind = doc.kind as DocumentKind;
  const flag = getFlagForKind(docKind);

  if (flag) {
    const remaining = await listDocumentsByKindsForCase(admin, caseId, flag.groupKinds);
    if (remaining.length === 0) {
      try {
        if (flag.section === "english") {
          await patchProfileSectionForCase(admin, caseId, "english", { reportUploaded: false });
        } else if (flag.section === "finance") {
          await patchProfileSectionForCase(admin, caseId, "finance", { proofUploaded: false });
        } else if (flag.section === "work") {
          await patchProfileSectionForCase(admin, caseId, "work", { docs: false });
        }
      } catch (err) {
        console.error("[documents/delete] patchProfileSectionForCase failed", err);
      }
      try {
        await invalidatePlan(admin, caseId);
      } catch (err) {
        console.error("[documents/delete] invalidatePlan failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
