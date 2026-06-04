import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents/types";
import { getDocumentByKind, insertDocument, deleteDocument } from "@/lib/documents/repo";
import { getFlagForKind } from "@/lib/documents/flags";
import { patchProfileSection } from "@/lib/profiles/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import { reScoreAssessment } from "@/lib/assessments/re-score";
import { checkRateLimit } from "@/lib/rate-limit/upstash";
import {
  sanitizeFilename,
  verifyImageMagic,
  extensionFor,
} from "@/lib/documents/upload-validation";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  if (!(await checkRateLimit("doc-upload", userId, 20, "1 m"))) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  }

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

  const buffer = Buffer.from(await file.arrayBuffer());

  // Magic-byte check — defense against MIME spoofing.
  if (!verifyImageMagic(buffer, file.type)) {
    return NextResponse.json(
      { error: "File contents do not match the declared image type" },
      { status: 422 },
    );
  }

  const safeOriginalName = sanitizeFilename(file.name);
  const storageName = `${crypto.randomUUID()}.${extensionFor(file.type)}`;
  const filePath = `${userId}/${docKind}/${storageName}`;

  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(filePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[upload] storage upload failed:", uploadError.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const docId = await insertDocument(admin, {
    owner: userId,
    kind: docKind,
    filePath,
    fileSize: file.size,
    originalName: safeOriginalName,
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
    } catch (err) {
      console.error("[documents/upload] patchProfileSection failed", err);
    }
    try {
      await reScoreAssessment(admin, userId);
    } catch (err) {
      console.error("[documents/upload] reScoreAssessment failed", err);
    }
    try {
      await invalidatePlan(admin, userId);
    } catch (err) {
      console.error("[documents/upload] invalidatePlan failed", err);
    }
  }

  return NextResponse.json({ id: docId, status: "stored" });
}
