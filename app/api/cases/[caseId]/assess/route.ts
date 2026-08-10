import { NextResponse } from "next/server";
import { ProfileSchema } from "@/lib/validation/profile";
import { isDestinationSupported } from "@/lib/scoring/types";
import { assembleAssessment } from "@/lib/results/assemble";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import type { Program, University } from "@/lib/programs/types";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { caseWriteColumns } from "@/lib/cases/dual-write";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import type { Json } from "@/lib/supabase/types";

/**
 * The case-scoped scoring route — spec §6.2's **new** service-role entry, and the
 * reason Stage 3 ends at eight rather than seven.
 *
 * ## Why this is service-role BY DESIGN, and not a deferral
 *
 * A consultancy creates a case for a student who has no account, and that case
 * needs an assessment. Spec §6.1 **refuses `assessments` INSERT to
 * `authenticated` permanently**: `result` and `rule_version` are scoring outputs,
 * and a client that can write them mints its own verdict against the server-side
 * rule — the exact trust property this product sells. A column-scoped grant
 * excluding them does not rescue the verb either, because both are `NOT NULL`.
 *
 * So the write cannot move, and no later stage will move it. This route is
 * `sanctioned`, not `legacy-owner-scoped`: it is not waiting for a grant, it is
 * the shape the refusal requires. `20260808120000_stage3_consultancy_write_grants.sql:18-22`
 * records the same refusal in SQL.
 *
 * ## The ordering that makes it safe, and the assertion that keeps it
 *
 * **Authorize on the AUTHENTICATED client BEFORE constructing the admin one.** A
 * route that builds the service-role client first has already bypassed RLS by the
 * time it asks whether it was allowed to, and no assertion on its response body
 * would notice. `tests/api/case-routes.test.ts` pins it by asserting
 * `createSupabaseAdminClient` was never called on a denial.
 *
 * The primary-assessment read stays on the authenticated client too: staff reach
 * the case through `actor_case_ids()`, so there is nothing service-role is needed
 * for except the insert itself.
 *
 * ## The row shape
 *
 * Spec §6.3: a consultancy row is `owner IS NULL`, `case_id = <the case>`.
 * `caseWriteColumns` is the choke point that produces it. `caseBindColumns` —
 * which narrows `owner` to non-null — would refuse every consultancy case, which
 * is precisely why this route asks the other one.
 *
 * ## Not built here
 *
 * The intake surface that will call this is MV-172's case route. Shipping the
 * capability with its tests ahead of its caller is the same shape as MV-168
 * shipping grants ahead of theirs, and spec §6.2 asks Stage 3 for the route.
 */

/**
 * A consultancy case's assessment is a record of work, not an anonymous
 * three-day artefact, so it takes the same far-future expiry the signed-in path
 * uses (`app/api/assess/route.ts:25`). MV-135's purge keys on `owner IS NULL AND
 * expires_at`, and this row is deliberately `owner IS NULL` — the expiry is what
 * keeps it out of the purge's reach.
 */
const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Destination honesty: never silently assess an unsupported corridor as
  // Australia. "not-sure" is explicit delegation and passes through, exactly as
  // it does on the anonymous path.
  const destination = parsed.data.destination;
  if (!isDestinationSupported(destination) && destination !== "not-sure") {
    return NextResponse.json(
      { error: `Destination not supported yet: ${destination}` },
      { status: 422 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // BEFORE any service-role client exists. See the header.
  const { decision } = await checkCasePermission(
    userData.user.id,
    caseId,
    "case.update",
    supabase,
  );
  if (!decision.allowed) return caseDenialResponse(decision.reason);

  const adminDb = createSupabaseAdminClient();

  // A catalogue read that FAILS is not an empty catalogue (MV-133): scoring
  // against [] would hand the case a verdict with zero matches — "nothing fits
  // this student" — and persist that fabrication as their assessment of record.
  let programs: Program[];
  let universities: University[];
  try {
    [programs, universities] = await Promise.all([
      listAllPrograms(adminDb),
      listAllUniversities(adminDb),
    ]);
  } catch (err) {
    console.error("[/api/cases/[caseId]/assess] catalog fetch failed", err);
    return NextResponse.json(
      { error: "We couldn't load the program catalogue just now. Please try again." },
      { status: 503 },
    );
  }

  const payload = assembleAssessment(parsed.data, programs, universities);

  // `owner` is DERIVED from the case rather than taken from the session: the
  // actor here is a counsellor, and writing THEIR id as `owner` would attribute
  // the student's assessment to staff. For a consultancy case this correctly
  // returns `owner: null`.
  const ownership = await caseWriteColumns(adminDb, caseId);
  if (ownership === null) {
    console.error("[/api/cases/[caseId]/assess] could not derive ownership columns", { caseId });
    return NextResponse.json({ error: "Could not save the assessment" }, { status: 500 });
  }

  // `assessments_case_primary_idx` is UNIQUE (case_id) WHERE is_primary, so the
  // first assessment for a case leads and later ones do not. Read on the
  // AUTHENTICATED client — staff reach the case through `actor_case_ids()`, and
  // a read that throws must not be mistaken for "there is no primary yet".
  let existingPrimary: unknown;
  try {
    existingPrimary = await getPrimaryAssessmentForCase(supabase, caseId);
  } catch (err) {
    console.error("[/api/cases/[caseId]/assess] primary lookup failed", err);
    return NextResponse.json({ error: "Could not save the assessment" }, { status: 500 });
  }

  const { data, error } = await adminDb
    .from("assessments")
    .insert({
      ...ownership,
      profile_snapshot: parsed.data as unknown as Json,
      destination_id: destination,
      result: payload as unknown as Json,
      rule_version: payload.result.ruleVersion,
      expires_at: FAR_FUTURE,
      is_primary: !existingPrimary,
    })
    .select("id")
    .single();

  // PostgREST reports a failed write as a value, not a throw. Returning 200 with
  // `id: null` here would read to the caller as "saved".
  if (error || !data) {
    console.error("[/api/cases/[caseId]/assess] assessment insert failed", { caseId, err: error });
    return NextResponse.json({ error: "Could not save the assessment" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, payload });
}
