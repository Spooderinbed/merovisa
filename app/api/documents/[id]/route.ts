import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listDocumentsByKinds } from "@/lib/documents/repo";
import { getFlagForKind } from "@/lib/documents/flags";
import { patchProfileSection } from "@/lib/profiles/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import { reScoreAssessment } from "@/lib/assessments/re-score";
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

  await admin.storage.from("documents").remove([doc.file_path]);
  await admin.from("documents").delete().eq("id", id).eq("owner", userId);

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
        await reScoreAssessment(admin, userId);
        await invalidatePlan(admin, userId);
      } catch (e) {
        console.error("[delete] cascade error:", e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
