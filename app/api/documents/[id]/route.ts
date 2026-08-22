import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
import { listDocumentsByKindsForCase } from "@/lib/documents/repo";
import { getFlagForKind } from "@/lib/documents/flags";
import { patchProfileSectionForCase } from "@/lib/profiles/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import type { DocumentKind } from "@/lib/documents/types";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

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
  //
  // MV-190, spec F-8: the case is the one the caller NAMES when it names one, and
  // the actor's own otherwise. A DELETE carries no body, so the id rides the query
  // string — the same transport `[id]/view` uses, for the same reason. A
  // present-but-malformed value is MALFORMED (400) and never a silent fallback to
  // the actor's own case: that fallback is how a mishandled id would delete the
  // COUNSELLOR's own document instead of refusing.
  const requestedCase = new URL(request.url).searchParams.get("caseId");
  const target = await resolveTargetCase(
    userId,
    requestedCase ?? undefined,
    "case.update",
    supabase,
  );
  if (!target.ok) {
    // An account with no case has no document to delete — 404, exactly as before.
    // Malformed and denied stay with the shared mapping.
    if (target.kind === "no-personal-case") {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    return targetCaseResponse(target, "Document not found");
  }
  const { caseId, organizationId } = target;

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

  // MV-189 (spec §8.2, D12): audit after the effect commits — the bytes and the row are
  // both gone by here, so this records a fact rather than an intention. A deletion is the
  // access event most worth keeping and the one least recoverable from the data itself:
  // once the row is gone, the `documents` table can no longer say who removed it.
  //
  // Fail-closed: a failure is a 500, so no caller is told the delete succeeded without an
  // audit row naming them.
  try {
    await writeAuditEvent(admin, {
      actorUserId: userId,
      organizationId,
      caseId,
      action: "document.deleted",
      entityType: "document",
      entityId: id,
      // D13: `doc` is in scope and carries `original_name` and `file_path`. Neither is
      // read here, and the sweep in tests/audit/audit-metadata-pii.test.ts is what keeps
      // that true after the next edit.
      metadata: { document_id: id, kind: docKind },
    });
  } catch {
    console.error("[documents/delete] audit write failed", { id, caseId });
    return NextResponse.json({ error: "Couldn't delete the document" }, { status: 500 });
  }

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
