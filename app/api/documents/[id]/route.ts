import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listDocumentsByKinds } from "@/lib/documents/repo";
import { getFlagForKind } from "@/lib/documents/flags";
import { patchProfileSection } from "@/lib/profiles/repo";
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

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("owner", userId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();

  const { error: storageErr } = await admin.storage.from("documents").remove([doc.file_path]);
  if (storageErr) {
    console.error("[documents/delete] storage remove failed", { id, userId, err: storageErr });
    return NextResponse.json({ error: "Couldn't delete the file" }, { status: 500 });
  }
  const { error: deleteErr } = await admin
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("owner", userId);
  if (deleteErr) {
    console.error("[documents/delete] documents row delete failed", { id, userId, err: deleteErr });
    return NextResponse.json({ error: "Couldn't delete the document" }, { status: 500 });
  }

  const docKind = doc.kind as DocumentKind;
  const flag = getFlagForKind(docKind);

  if (flag) {
    const remaining = await listDocumentsByKinds(admin, userId, flag.groupKinds);
    if (remaining.length === 0) {
      try {
        if (flag.section === "english") {
          await patchProfileSection(admin, userId, "english", { reportUploaded: false });
        } else if (flag.section === "finance") {
          await patchProfileSection(admin, userId, "finance", { proofUploaded: false });
        } else if (flag.section === "work") {
          await patchProfileSection(admin, userId, "work", { docs: false });
        }
      } catch (err) {
        console.error("[documents/delete] patchProfileSection failed", err);
      }
      try {
        await invalidatePlan(admin, userId);
      } catch (err) {
        console.error("[documents/delete] invalidatePlan failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
