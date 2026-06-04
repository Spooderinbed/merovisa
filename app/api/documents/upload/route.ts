import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents/types";
import { getDocumentByKind, insertDocument, deleteDocument } from "@/lib/documents/repo";
import { getFlagForKind } from "@/lib/documents/flags";
import { patchProfileSection } from "@/lib/profiles/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import { reScoreAssessment } from "@/lib/assessments/re-score";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const kind = formData.get("kind") as string | null;

  if (!file || !kind) {
    return NextResponse.json({ error: "Missing file or kind" }, { status: 422 });
  }
  if (!DOCUMENT_KINDS.includes(kind as DocumentKind)) {
    return NextResponse.json({ error: "Invalid document kind" }, { status: 422 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File must be JPG, PNG, or WebP" }, { status: 422 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 422 });
  }

  const docKind = kind as DocumentKind;

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("Admin client creation failed:", e);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const existing = await getDocumentByKind(admin, userId, docKind);
  if (existing) {
    await admin.storage.from("documents").remove([existing.file_path]);
    await deleteDocument(admin, existing.id, userId);
  }

  const timestamp = Date.now();
  const filePath = `${userId}/${docKind}/${timestamp}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(filePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[upload] storage upload failed:", uploadError.message);
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const docId = await insertDocument(admin, {
    owner: userId,
    kind: docKind,
    filePath,
    fileSize: file.size,
    originalName: file.name,
  });

  // Auto-flip profile boolean flag if this kind drives one
  const flag = getFlagForKind(docKind);
  if (flag) {
    try {
      if (flag.section === "english") {
        await patchProfileSection(admin, userId, "english", { reportUploaded: true });
      } else if (flag.section === "finance") {
        await patchProfileSection(admin, userId, "finance", { proofUploaded: true });
      } else if (flag.section === "work") {
        await patchProfileSection(admin, userId, "work", { docs: true });
      }
      await reScoreAssessment(admin, userId);
      await invalidatePlan(admin, userId);
    } catch (e) {
      console.error("[upload] cascade error:", e);
    }
  }

  return NextResponse.json({ id: docId, status: "stored" });
}
