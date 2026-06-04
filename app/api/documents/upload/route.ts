import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents/types";
import { getDocumentByKind, insertDocument, deleteDocument } from "@/lib/documents/repo";
import { recognizeText } from "@/lib/documents/ocr";
import { getParser } from "@/lib/documents/parsers/registry";
import { mapToProfilePatch } from "@/lib/documents/profile-mapping";
import { patchProfileSection } from "@/lib/profiles/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import { reScoreAssessment } from "@/lib/assessments/re-score";
import type { SectionKey } from "@/lib/profiles/sections";

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

  // Delete existing document for this kind (one per kind)
  console.log("[upload] checking existing doc for kind:", docKind);
  const existing = await getDocumentByKind(admin, userId, docKind);
  if (existing) {
    console.log("[upload] replacing existing doc:", existing.id);
    await admin.storage.from("documents").remove([existing.file_path]);
    await deleteDocument(admin, existing.id, userId);
  }

  // Upload to Storage
  const timestamp = Date.now();
  const filePath = `${userId}/${docKind}/${timestamp}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  console.log("[upload] uploading to storage:", filePath, "size:", buffer.length);

  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(filePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[upload] storage upload failed:", uploadError.message);
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }
  console.log("[upload] storage upload complete");

  // OCR + parse
  const parser = getParser(docKind);
  let extractedData: Record<string, unknown> | null = null;
  let status: "extracted" | "failed" | "stored" = "stored";
  let profileChanges: Record<string, unknown> | null = null;

  if (parser) {
    try {
      console.log("[upload] running OCR...");
      const rawText = await recognizeText(buffer);
      console.log("[upload] OCR complete, text length:", rawText.length);
      console.log("[upload] OCR raw text:\n---\n" + rawText + "\n---");
      extractedData = parser(rawText);
      status = extractedData ? "extracted" : "failed";
      console.log("[upload] parser result:", status);
    } catch (e) {
      console.error("[upload] OCR/parse error:", e);
      status = "failed";
    }
  }

  // Find profile section for this kind
  const profilePatch = extractedData ? mapToProfilePatch(docKind, extractedData) : null;
  const profileSection = profilePatch?.section ?? null;

  // Insert document row
  console.log("[upload] inserting document row...");
  const docId = await insertDocument(admin, {
    owner: userId,
    kind: docKind,
    filePath,
    fileSize: file.size,
    originalName: file.name,
    extractedData,
    profileSection,
    status,
  });
  console.log("[upload] document row inserted:", docId);

  // Patch profile + cascade
  if (profilePatch && extractedData) {
    try {
      console.log("[upload] patching profile section:", profilePatch.section);
      await patchProfileSection(
        admin,
        userId,
        profilePatch.section as SectionKey,
        profilePatch.patch as any,
      );
      profileChanges = profilePatch.patch;
      await reScoreAssessment(admin, userId);
      await invalidatePlan(admin, userId);
      console.log("[upload] cascade complete");
    } catch (e) {
      console.error("[upload] cascade error:", e);
    }
  }

  console.log("[upload] done, returning response");
  return NextResponse.json({
    id: docId,
    status,
    extracted_data: extractedData,
    profile_changes: profileChanges,
  });
}
