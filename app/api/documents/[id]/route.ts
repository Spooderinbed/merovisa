import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { patchProfileSection } from "@/lib/profiles/repo";
import type { SectionKey } from "@/lib/profiles/sections";

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

  // Fetch the document to get file_path and kind
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

  // Delete from Storage
  await admin.storage.from("documents").remove([doc.file_path]);

  // Delete DB row
  await admin.from("documents").delete().eq("id", id).eq("owner", userId);

  // Reset boolean flags based on kind
  const flagResets: Record<string, { section: SectionKey; patch: Record<string, unknown> }> = {
    ielts:   { section: "english", patch: { reportUploaded: false } },
    pte:     { section: "english", patch: { reportUploaded: false } },
    toefl:   { section: "english", patch: { reportUploaded: false } },
    "bank-statement": { section: "finance", patch: { proofUploaded: false } },
    "employment-letter": { section: "work", patch: { docs: false } },
    "salary-slip": { section: "work", patch: { docs: false } },
  };

  const reset = flagResets[doc.kind];
  if (reset) {
    try {
      await patchProfileSection(admin, userId, reset.section, reset.patch as any);
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true });
}
