import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { mintCaseScopedDownloadUrl } from "@/lib/documents/signed-download";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 422 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actorUserId = userData.user.id;

  // Authorize the CASE before reading anything, then scope the read by `case_id`
  // (MV-157 §C). MV-190 makes the case the one the caller NAMES when it names one:
  // a counsellor could not open a student's document before, because
  // `resolvePersonalCaseId` only ever answers with the actor's own case (spec F-8).
  //
  // A GET has no body, so the id rides the query string. That is not sensitive data
  // in a URL — a case id is an opaque uuid, and the app already carries it in the
  // path of every `/students/[caseId]` route — and an absent parameter still means
  // "my own case", which is what leaves the student's own viewer unchanged.
  const requestedCase = new URL(request.url).searchParams.get("caseId");
  const target = await resolveTargetCase(
    actorUserId,
    requestedCase ?? undefined,
    "case.read",
    supabase,
  );
  if (!target.ok) {
    // "No workspace for this account" is a 404 HERE and a 500 on the write routes,
    // and the difference is deliberate: this endpoint answers "is there a document
    // to look at", and for an account with no case the honest answer is no. The
    // other two outcomes — malformed (400) and denied (403/404/500) — are shared
    // and stay with `targetCaseResponse`.
    if (target.kind === "no-personal-case") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return targetCaseResponse(target, "Not found");
  }
  const { caseId, organizationId } = target;

  // User-scoped client respects RLS; the case_id filter is what selects the row.
  const { data: doc } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", id)
    .eq("case_id", caseId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // THE MINT AUTHORIZES AGAIN, and that is the design rather than an oversight.
  // A signed URL bypasses Storage RLS by design, so "the caller checked first" has
  // to hold by CONSTRUCTION and not by convention — `mintCaseScopedDownloadUrl`
  // takes no "already authorized" flag and no pre-made URL, so there is no ordering
  // for a future edit to get wrong. The second lookup costs one query on a download
  // path. It also bounds the PATH to this case, which the check above cannot do:
  // `checkCasePermission` answers about the case, and the signature is about the key.
  const admin = createSupabaseAdminClient();

  // MV-189 (spec §8.2, D12): THE AUDIT ROW LANDS BEFORE THE MINT, and the order is the
  // decision rather than a stylistic one. A signed URL is an unauthenticated bearer of
  // the bytes the instant it exists, so minting first and auditing after would mean that
  // on an audit failure the URL already exists and the bytes are already reachable —
  // the guarantee lost in exactly the case it was written for. Auditing first makes
  // "no unaudited URL is ever minted" true by construction.
  //
  // It is not caught. The plan requires that an authorized sensitive read and its audit
  // row "cannot be separated" (line 504), so a failure here is a 500 and no URL.
  // `writeAuditEvent` throws; the route-level handler turns that into the 500.
  try {
    await writeAuditEvent(admin, {
      actorUserId,
      organizationId,
      caseId,
      action: "document.viewed",
      entityType: "document",
      entityId: id,
      // D13: no `original_name`, no `file_path`. `entity_id` already carries the identity.
      metadata: { document_id: id },
    });
  } catch {
    console.error("[documents/view] audit write failed; refusing to mint", { id, caseId });
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  const signed = await mintCaseScopedDownloadUrl({
    actorUserId,
    caseId,
    storagePath: doc.file_path,
    db: supabase,
    storage: admin.storage,
  });

  if (!signed.ok) {
    if (signed.kind === "denied") return caseDenialResponse(signed.reason);
    // `path-outside-case` here means OUR OWN row handed back a key from another
    // case — a defect on our side, not an answer about the actor, so it is logged
    // rather than dressed up as a denial.
    if (signed.kind === "path-outside-case") {
      console.error("[documents/view] stored path is outside its case", { id, caseId });
    }
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.url });
}
