import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getCaseDocumentRequest } from "@/lib/cases/document-requests-repo";
import { createCaseDocumentVersion } from "@/lib/cases/document-collaboration-repo";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { malformedPathId } from "@/lib/cases/path-ids";
import { caseVersionObjectPath } from "@/lib/documents/case-object-path";
import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from "@/lib/documents/upload-limits";
import { sanitizeFilename, verifyFileMagic } from "@/lib/documents/upload-validation";
import { checkRateLimit } from "@/lib/rate-limit/upstash";

/**
 * MV-186 — a file ARRIVES against a request. The writer MV-190 deliberately stopped short of.
 *
 * **The gate is `case.documents.request`, and NOT `case.read`.** They answer differently for
 * the same person: the linked student holds `case.read` at `linked` and holds this claim not at
 * all, which is exactly `private.can_staff_case`, the predicate
 * `case_document_versions_insert_staff` uses at the database. A route that gated this write on
 * the read claim would ship the wrong 403/201 to every caller and lean on RLS to be correct.
 *
 * **The case comes from the PATH**, like MV-182's two sibling routes. Spec F-8: a case-scoped
 * write route that resolves the ACTOR's own case writes to the counsellor's file instead of the
 * student's, and RLS cannot catch it because the counsellor may legitimately reach both.
 *
 * ==================================================================================
 * THE ORDER IS THE DESIGN: UPLOAD THE BYTES, THEN INSERT THE ROW.
 * ==================================================================================
 *
 * Spec §6.2 (D5) weighed a `before insert` trigger that would compute `storage_path` from a
 * server-issued id, and rejected it on this exact point. A server-issued id forces
 * insert → upload, because that is the only way to learn the path — and a failed upload then
 * leaves a **version row pointing at an object that does not exist**, with **no DELETE grant to
 * retract it**. MV-185's derivation reads the newest version of a request, so that phantom row
 * would hold the request `outstanding` behind a file nobody can open, and the only repair would
 * be a service-role write to a tenant table.
 *
 * A CLIENT-GENERATED id inverts the sequence. A failed upload writes no row at all; a failed
 * insert leaves an orphaned object nothing references, which is the cheaper failure by a wide
 * margin — and the same trade `app/api/documents/upload/route.ts` already makes for the vault.
 * MV-190 granted `insert (id)` on `case_document_versions` for precisely this.
 *
 * **The row is written on the AUTHENTICATED client.** Service-role reaches Storage and nothing
 * else: the bucket's only INSERT policy is `service_role`-scoped, so the BYTES need it, while
 * the ROW must go through `case_document_versions_insert_staff` and its five conjuncts — which
 * is the whole reason MV-185 exists. Writing the row on the admin client would bypass every one
 * of them. See `lib/supabase/service-role-exceptions.ts` for this route's entry.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string; requestId: string }> },
): Promise<Response> {
  const { caseId, requestId } = await params;

  // FIRST, before a client exists and before any query — see `lib/cases/path-ids.ts`. BOTH
  // segments: a malformed request id would otherwise reach Postgres as a `22P02` inside the
  // read and be reported as an outage rather than as the malformed request it is.
  const malformedCase = malformedPathId(caseId);
  if (malformedCase) return malformedCase;
  const malformedRequest = malformedPathId(requestId);
  if (malformedRequest) return malformedRequest;

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actorUserId = userData.user.id;

  // Its own bucket, not the vault's: a counsellor working a case legitimately uploads more
  // often than a student filling their own vault, and sharing a limiter would make one
  // surface's normal use throttle the other's.
  if (!(await checkRateLimit("case-doc-version", actorUserId, 40, "1 m"))) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  }

  // AUTHORIZE FIRST — before the BODY is even read, let alone a repository or Storage.
  //
  // Two reasons, and the second is why the check sits above `formData()` rather than merely
  // above the first query. (a) `tests/api/case-denial.test.ts` sweeps `app/api` for every
  // case-gated route and requires each to answer 403 with ZERO queries and ZERO Storage calls
  // on a denial — a route that parsed the body first would answer 400 to a denied caller and
  // never reach its own gate. (b) The body here is an upload of up to 5MB: buffering it for
  // somebody who may not act on this case is work done on behalf of a request we are about to
  // refuse.
  const { decision } = await checkCasePermission(
    actorUserId,
    caseId,
    "case.documents.request",
    supabase,
  );
  if (!decision.allowed) return caseDenialResponse(decision.reason);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    // A body we could not read is a MALFORMED REQUEST, not a validation failure about a file we
    // did read and disliked, and not a 500 blaming our own side.
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 422 });
  }
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File must be JPG, PNG, WebP, or PDF" }, { status: 422 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 422 });
  }

  // The request must exist ON THIS CASE. The INSERT policy's third conjunct bounds parentage
  // independently, but a policy refusal arrives as `42501` — which reads to the user as "you
  // may not do this" when the truth is "there is no such request here".
  const parent = await getCaseDocumentRequest(requestId, caseId, supabase);
  if (!parent.ok) {
    return NextResponse.json({ error: "Could not load the request" }, { status: 500 });
  }
  if (parent.data === null) {
    return NextResponse.json({ error: "No such request on this case" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Magic-byte check — the defence against MIME spoofing, and it runs before anything is
  // written, so a spoofed file leaves no object behind.
  if (!verifyFileMagic(buffer, file.type)) {
    return NextResponse.json(
      { error: "File contents do not match the declared file type" },
      { status: 422 },
    );
  }

  // The id the ROW will carry and the id the OBJECT is named for, generated once so they cannot
  // disagree. `caseVersionObjectPath` canonicalises the case id to lowercase — `z.uuid()`
  // accepts uppercase and nothing upstream normalises, while Postgres stores `uuid` lowercase,
  // so a raw interpolation would write bytes under `case/<UPPER>/…` beside a row saying
  // `<lower>` and the two would never meet again.
  const versionId = crypto.randomUUID();
  const storagePath = caseVersionObjectPath(caseId, versionId);

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("[case-documents] admin client creation failed:", e);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // THE BYTES FIRST. `upsert: false` — the path contains a fresh uuid, so a collision is a bug
  // worth failing on rather than an overwrite worth performing silently.
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[case-documents] storage upload failed:", uploadError.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // THEN THE ROW, on the authenticated client, through the five conjuncts.
  const result = await createCaseDocumentVersion(
    actorUserId,
    caseId,
    {
      id: versionId,
      requestId,
      storagePath,
      fileSize: file.size,
      originalName: sanitizeFilename(file.name),
      contentType: file.type,
    },
    supabase,
  );

  if (result.ok) {
    // `case_document_requests.status` is NOT written here. `private.sync_document_request_status`
    // fired inside the insert above, and `guard_document_request_status` would refuse any
    // contradicting hand-written value with a `23514`. Derived, never a second source of truth.
    return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
  }

  // The row write failed, so the object it was named for now references nothing. Remove it —
  // an orphan is harmless but not free, and this is the cheap half of the trade the ordering
  // above chose deliberately. A failure to remove leaks one object and nothing more.
  await admin.storage.from("documents").remove([storagePath]);

  switch (result.reason) {
    case "unknown-case":
      return NextResponse.json({ error: "No such case", reason: result.reason }, { status: 404 });
    case "not-an-org-case":
    case "invalid-input":
      return NextResponse.json({ error: "Validation failed", reason: result.reason }, { status: 422 });
    case "denied":
      return NextResponse.json({ error: "Forbidden", reason: result.reason }, { status: 403 });
    default:
      return NextResponse.json(
        { error: "Could not record the upload", reason: result.reason },
        { status: 500 },
      );
  }
}
