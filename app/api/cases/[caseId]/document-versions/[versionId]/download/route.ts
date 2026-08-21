import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getCaseDocumentVersion } from "@/lib/cases/document-collaboration-repo";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { malformedPathId } from "@/lib/cases/path-ids";
import { mintCaseScopedDownloadUrl } from "@/lib/documents/signed-download";

/**
 * MV-186 — open one collaboration file (spec §7.4, D9).
 *
 * ## Why this route exists when MV-190 already shipped a signed-download helper
 *
 * `mintCaseScopedDownloadUrl` had exactly one caller, `app/api/documents/[id]/view`, and that
 * route resolves a **`documents`** row by its id. It cannot serve a `case_document_versions`
 * row — a different table, a different id, and a `storage_path` the vault has no column for. So
 * without this route the helper has no path to a collaboration object at all, and the review
 * verbs would be asking a counsellor to accept or reject a file they cannot open. That is not a
 * judgement; it is a coin toss with an audit trail.
 *
 * ## The gate is `case.read`, and here that IS the right claim
 *
 * Unlike the two write routes, reading a file rides the READ axis — which is exactly what lets
 * the LINKED STUDENT open the file that was uploaded on their case and the rejection note
 * attached to it. `case_document_versions_select_actor` rides `actor_case_ids()` for the same
 * reason, and spec §7.2 (D7) records it as the half of this model that is any use to them.
 *
 * ## Two gates, in this order, and the second is not a duplicate of the first
 *
 * 1. `checkCasePermission` here, before the row is read, so the read itself is authorized.
 * 2. `mintCaseScopedDownloadUrl` performs `checkCasePermission` **itself** before it reaches
 *    Storage. A signed URL bypasses Storage RLS by design and is an unauthenticated bearer of
 *    the bytes the instant it exists, so "the caller authorized first" has to hold by
 *    CONSTRUCTION rather than by convention. The helper takes no already-authorized flag and no
 *    pre-made URL, so there is no ordering a later edit can get wrong.
 *
 * The helper also bounds the PATH to this case, which neither check above can do: a permission
 * check answers a question about the CASE, and the signature is about the KEY. A
 * `path-outside-case` refusal here would mean OUR OWN row handed back a key from another case —
 * a defect on our side, not an answer about the actor, so it is logged rather than dressed up
 * as a denial.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string; versionId: string }> },
): Promise<Response> {
  const { caseId, versionId } = await params;

  const malformedCase = malformedPathId(caseId);
  if (malformedCase) return malformedCase;
  const malformedVersion = malformedPathId(versionId);
  if (malformedVersion) return malformedVersion;

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actorUserId = userData.user.id;

  const { decision } = await checkCasePermission(actorUserId, caseId, "case.read", supabase);
  if (!decision.allowed) return caseDenialResponse(decision.reason);

  // User-scoped client respects RLS; the `case_id` filter is what selects the row, and it is
  // what stops a version id from another case the actor happens to staff being resolved under
  // THIS case's authorization.
  const version = await getCaseDocumentVersion(versionId, caseId, supabase);
  if (!version.ok) {
    return NextResponse.json({ error: "Could not load the file" }, { status: 500 });
  }
  if (version.data === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Service-role reaches Storage and nothing else: a `case/` object matches the bucket's
  // `(storage.foldername(name))[1] = auth.uid()::text` policies for NOBODY (spec §6.1), so an
  // authenticated client cannot see the object it would be signing. Every case decision above
  // and inside the mint runs on the AUTHENTICATED client.
  const admin = createSupabaseAdminClient();
  const signed = await mintCaseScopedDownloadUrl({
    actorUserId,
    caseId,
    storagePath: version.data.storagePath,
    db: supabase,
    storage: admin.storage,
  });

  if (!signed.ok) {
    if (signed.kind === "denied") return caseDenialResponse(signed.reason);
    if (signed.kind === "path-outside-case") {
      console.error("[case-documents] stored version path is outside its case", {
        versionId,
        caseId,
      });
    }
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  // The URL, not a redirect. The client fetches it and follows it itself, the same contract
  // `app/api/documents/[id]/view` established — a redirect would put an unauthenticated bearer
  // of the bytes into the browser's history and the referrer chain.
  return NextResponse.json({ url: signed.url });
}
