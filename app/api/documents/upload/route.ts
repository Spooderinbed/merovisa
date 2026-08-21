import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents/types";
import { resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
import { caseObjectPath } from "@/lib/documents/case-object-path";
import { getDocumentByKindForCase, upsertDocument } from "@/lib/documents/repo";
import { getFlagForKind } from "@/lib/documents/flags";
import { patchProfileSectionForCase } from "@/lib/profiles/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import { checkRateLimit } from "@/lib/rate-limit/upstash";
import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from "@/lib/documents/upload-limits";
import {
  sanitizeFilename,
  verifyFileMagic,
  extensionFor,
} from "@/lib/documents/upload-validation";

// Shared with the case-collaboration uploader (MV-186) so the two cannot drift apart.
const MAX_SIZE = MAX_UPLOAD_BYTES;
const ALLOWED_TYPES = ALLOWED_UPLOAD_TYPES;

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
    return NextResponse.json({ error: "File must be JPG, PNG, WebP, or PDF" }, { status: 422 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 422 });
  }

  const docKind = kind as DocumentKind;

  // Authorize the case through the AUTHENTICATED client BEFORE any Storage call.
  // Service-role stays here under the plan's sanctioned "storage administration"
  // category (the authenticated client cannot write the private bucket) and
  // because `documents` grants `authenticated` no INSERT — but the case check now
  // precedes it, which is what MV-157 §G requires of every retained entry.
  //
  // MV-190, spec F-8: the case is the one the caller NAMES when it names one, and
  // the signed-in student's own otherwise. MV-157 §G already case-scoped this
  // route; what it could not do was let a counsellor act on a STUDENT's case,
  // because `resolvePersonalCaseId` only ever answers with the actor's own.
  // `resolveTargetCase` AUTHORIZES a supplied id and never falls back to the
  // personal case when one is supplied — a fallback is exactly what would land a
  // mishandled id on the counsellor's own vault quietly.
  //
  // Read off the raw form rather than through a schema: this is multipart, so there
  // is no JSON body for `requestedCaseId` to read. A present-but-malformed value is
  // MALFORMED, not absent (400), for the reason `lib/cases/target-case.ts` gives.
  const requestedCase = formData.get("caseId");
  const target = await resolveTargetCase(userId, requestedCase ?? undefined, "case.update", supabase);
  if (!target.ok) return targetCaseResponse(target, "Upload failed");
  const { caseId } = target;

  // WHICH FOLDER THE OBJECT LANDS IN, and why it turns on this and nothing else.
  //
  // `requestedCase === null` means no case was named, which means `resolveTargetCase`
  // resolved the actor's own personal case. So an OWNER-KEYED object is, by
  // construction, always in the actor's own folder and always on the actor's own
  // case — today's invariant, preserved exactly, which is what keeps the student
  // upload/view/delete suite green without touching its assertions.
  //
  // A NAMED case takes the `case/` prefix instead. Without that split, a counsellor
  // uploading to a student's case would write the object into the COUNSELLOR's uid
  // folder, where the live `(storage.foldername(name))[1] = auth.uid()::text` policy
  // lets them read it DIRECTLY, forever, with no case check — outliving the
  // assignment that justified it. This slice is what makes a counsellor upload
  // possible at all, so this slice closes the hole it would otherwise open. A
  // `case/` object matches that policy for nobody (spec §6.1); both the student and
  // the counsellor reach it through the signed-URL path instead.
  const caseKeyed = requestedCase !== null;

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("Admin client creation failed:", e);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Look up the document this upload would replace, but DO NOT delete it yet.
  // The original must survive every failure path below (bad magic bytes, a failed
  // Storage upload, a failed row write) — it is only removed after the
  // replacement is validated, stored, and committed. Destroying it up front is
  // how a rejected re-upload silently erased a student's passport scan while the
  // card still read "Uploaded" (audit C-8).
  const existing = await getDocumentByKindForCase(admin, caseId, docKind);

  const buffer = Buffer.from(await file.arrayBuffer());

  // Magic-byte check — defense against MIME spoofing. Runs before anything is
  // written or removed, so a spoofed replacement leaves the original intact.
  if (!verifyFileMagic(buffer, file.type)) {
    return NextResponse.json(
      { error: "File contents do not match the declared file type" },
      { status: 422 },
    );
  }

  const safeOriginalName = sanitizeFilename(file.name);
  const storageName = `${crypto.randomUUID()}.${extensionFor(file.type)}`;
  const filePath = caseKeyed
    ? caseObjectPath(caseId, storageName)
    : `${userId}/${docKind}/${storageName}`;

  // Fresh UUID path, so the replacement never collides with the object it
  // supersedes — the original bytes stay readable until the row is swapped.
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(filePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[upload] storage upload failed:", uploadError.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Atomic replace on the unique (case_id, kind) index — no delete-then-insert
  // window. If this fails, the original row is untouched.
  const docId = await upsertDocument(admin, {
    caseId,
    kind: docKind,
    filePath,
    fileSize: file.size,
    originalName: safeOriginalName,
  });

  // The row write failed — roll back the bytes we just uploaded and surface the
  // failure. The original document (row + object) is still fully intact.
  if (!docId) {
    console.error("[documents/upload] upsertDocument failed", { caseId, docKind, filePath });
    await admin.storage.from("documents").remove([filePath]);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Replacement committed (its row overwrote the old one via the upsert above) —
  // only now is it safe to remove the superseded object. A failure here merely
  // leaks an orphaned object; the student's current document stays correct.
  if (existing && existing.file_path !== filePath) {
    await admin.storage.from("documents").remove([existing.file_path]);
  }

  // Auto-flip profile boolean flag if this kind drives one
  const flag = getFlagForKind(docKind);
  if (flag) {
    try {
      if (flag.section === "english") {
        await patchProfileSectionForCase(admin, caseId, "english", { reportUploaded: true });
      } else if (flag.section === "finance") {
        await patchProfileSectionForCase(admin, caseId, "finance", { proofUploaded: true });
      } else if (flag.section === "work") {
        await patchProfileSectionForCase(admin, caseId, "work", { docs: true });
      }
    } catch (err) {
      console.error("[documents/upload] patchProfileSectionForCase failed", err);
    }
    try {
      await invalidatePlan(admin, caseId);
    } catch (err) {
      console.error("[documents/upload] invalidatePlan failed", err);
    }
  }

  return NextResponse.json({ id: docId, status: "stored" });
}
